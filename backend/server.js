// Load .env (local dev only) BEFORE anything reads process.env — production sets real env vars.
require('./lib/env').loadEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, initDatabase, resetDatabase, deleteTenantData, logActivity } = require('./db');
const webpush = require('web-push');
const { hashPassword, verifyPassword, signToken, verifyToken, generatePassword } = require('./lib/auth');
const { createTenantResolver, slugFromHost, errorPageHtml } = require('./lib/tenant');
const platformEvents = require('./lib/events');
const { OAuth2Client } = require('google-auth-library');
const createTenantProvisioner = require('./lib/tenantProvisioning');

// Generate or load VAPID keys
const vapidPath = path.join(__dirname, '..', 'data', 'vapid.json');
let vapidKeys;
if (fs.existsSync(vapidPath)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  } catch (e) {
    console.error('[SERVER] Failed to parse vapid.json, generating new keys:', e);
  }
}

if (!vapidKeys) {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2), 'utf8');
    console.log('[SERVER] Generated new VAPID keys and saved to data/vapid.json');
  } catch (err) {
    console.error('[SERVER] Failed to save VAPID keys:', err);
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || (vapidKeys && vapidKeys.publicKey);
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || (vapidKeys && vapidKeys.privateKey);

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:support@dayikatik.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.error('[SERVER] VAPID keys are missing! Web Push functionality will fail.');
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 17888;

// Enable CORS with robust origin support for Netlify subdomains, previews, and local development
const allowedOrigins = [
  'https://dayikatik.netlify.app',
  'https://hasacadesign.netlify.app',
  'https://dayikatikornek.netlify.app',
  'https://resonant-elf-d2b58b.netlify.app',
  'https://glittering-raindrop-435319.netlify.app',
  'http://localhost:17888',
  'http://127.0.0.1:17888',
  'http://localhost:12999',
  'http://127.0.0.1:12999',
  'http://localhost:12000',
  'http://127.0.0.1:12000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith('.netlify.app') || 
                      origin.endsWith('.netlify.com');
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cache-control middleware to prevent caching of dynamic and static data
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check endpoint for zero-downtime deployment monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: process.env.DATABASE_URL ? 'postgresql' : 'sqlite', version: '2026-07-28-tenant-fix' });
});


// Helper to build parameterized queries for both PG ($1) and SQLite (?)
const isPg = !!process.env.DATABASE_URL;

// Shared with Root's own manual "create tenant" form (routes/root.js) — one tested
// tenant-creation code path, used here by the Google Sign-In self-signup flow.
const { createTenantWithDemoContent, generateSlugCandidate, RESERVED_SLUGS, SLUG_RE } =
  createTenantProvisioner({ db, isPg, hashPassword, generatePassword });

// ── TENANT RESOLUTION (multi-tenant core) ──
// Attaches req.tenant / req.tenantId from the subdomain (or ?tenant= in local dev).
const { resolveTenant, invalidateTenantCache } = createTenantResolver(db, isPg);
app.use(resolveTenant);
function p(n) {
  // Returns $n for PostgreSQL or ? for SQLite
  return isPg ? `$${n}` : '?';
}
function params(...args) {
  return args;
}

// Helper: Map DB Product Row to JSON format expected by UI
function mapProductRow(row) {
  const totalMacros = (row.protein || 0) + (row.carbs || 0) + (row.fat || 0);
  const proteinPct = totalMacros > 0 ? Math.round(((row.protein || 0) / totalMacros) * 100) : 0;
  const carbsPct = totalMacros > 0 ? Math.round(((row.carbs || 0) / totalMacros) * 100) : 0;
  const fatPct = totalMacros > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

  let allergens = [];
  try {
    allergens = JSON.parse(row.allergens || '[]');
  } catch (e) {
    console.error(`[SERVER] Error parsing allergens for product ${row.id}:`, e);
  }

  return {
    id: row.id,
    name: row.name_tr,
    name_en: row.name_en,
    category: row.category,
    price: row.price,
    description: row.description_tr,
    description_en: row.description_en,
    image: row.image,
    besin_degerleri: {
      porsiyon: row.portion_tr,
      enerji: row.calories,
      yag: row.fat,
      doymus_yag: row.saturated_fat,
      karbonhidrat: row.carbs,
      sekerler: row.sugars,
      lif: row.fiber,
      protein: row.protein,
      tuz: row.salt
    },
    makrolar: {
      protein: { deger: row.protein, yuzde: proteinPct },
      karbonhidrat: { deger: row.carbs, yuzde: carbsPct },
      yag: { deger: row.fat, yuzde: fatPct }
    },
    alerjenler: allergens,
    icindekiler: row.ingredients_tr,
    ingredients_en: row.ingredients_en,
    portion_en: row.portion_en,
    katki_maddesi_icermez: row.katki_maddesi_icermez === 1
  };
}

// ==========================================
// PRODUCTS API
// ==========================================

// GET /api/products (tenant-scoped)
app.get('/api/products', async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC'
           : 'SELECT * FROM products WHERE tenant_id = ? ORDER BY created_at DESC',
      [req.tenantId]
    );
    const products = rows.map(mapProductRow);
    res.json(products);
  } catch (err) {
    console.error('[API ERROR] GET /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/reset (Admin Only, tenant-scoped)
app.post('/api/products/reset', adminAuth, async (req, res) => {
  try {
    await resetDatabase(req.tenantId);
    res.json({ success: true, message: 'Database reset successfully' });
  } catch (err) {
    console.error('[API ERROR] POST /api/products/reset:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products (Admin Only, tenant-scoped)
app.post('/api/products', adminAuth, async (req, res) => {
  try {
    const body = req.body;

    const name_tr = body.name_tr || body.name || '';
    const name_en = body.name_en || name_tr;
    const description_tr = body.description_tr || body.description || '';
    const description_en = body.description_en || description_tr;
    const portion_tr = body.portion_tr || (body.besin_degerleri && body.besin_degerleri.porsiyon) || '1 Porsiyon';
    const portion_en = body.portion_en || portion_tr;
    const ingredients_tr = body.ingredients_tr || body.icindekiler || '';
    const ingredients_en = body.ingredients_en || ingredients_tr;
    const calories = parseFloat(body.calories || (body.besin_degerleri && body.besin_degerleri.enerji) || 0);
    const protein = parseFloat(body.protein || (body.besin_degerleri && body.besin_degerleri.protein) || 0);
    const carbs = parseFloat(body.carbs || (body.besin_degerleri && body.besin_degerleri.karbonhidrat) || 0);
    const fat = parseFloat(body.fat || (body.besin_degerleri && body.besin_degerleri.yag) || 0);
    const saturated_fat = parseFloat(body.saturated_fat || (body.besin_degerleri && body.besin_degerleri.doymus_yag) || 0);
    const sugars = parseFloat(body.sugars || (body.besin_degerleri && body.besin_degerleri.sekerler) || 0);
    const fiber = parseFloat(body.fiber || (body.besin_degerleri && body.besin_degerleri.lif) || 0);
    const salt = parseFloat(body.salt || (body.besin_degerleri && body.besin_degerleri.tuz) || 0);

    const id = body.id || `prod-${Date.now()}`;
    const category = body.category || 'diger';
    const price = parseFloat(body.price || 0);
    const image = body.image || '';
    const allergens = JSON.stringify(body.allergens || body.alerjenler || []);
    const katki_maddesi_icermez = (body.katki_maddesi_icermez || body.katki_maddesi_icermez === 1) ? 1 : 0;

    const paramValues = [id, req.tenantId, name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez];

    if (isPg) {
      await db.run(`
        INSERT INTO products (
          id, tenant_id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, paramValues);
    } else {
      await db.run(`
        INSERT INTO products (
          id, tenant_id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, paramValues);
    }

    const newRow = await db.get(
      isPg ? 'SELECT * FROM products WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.status(201).json(mapProductRow(newRow));
  } catch (err) {
    console.error('[API ERROR] POST /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id (Admin Only, tenant-scoped)
app.put('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;

    const name_tr = body.name_tr || body.name || '';
    const name_en = body.name_en || name_tr;
    const description_tr = body.description_tr || body.description || '';
    const description_en = body.description_en || description_tr;
    const portion_tr = body.portion_tr || (body.besin_degerleri && body.besin_degerleri.porsiyon) || '1 Porsiyon';
    const portion_en = body.portion_en || portion_tr;
    const ingredients_tr = body.ingredients_tr || body.icindekiler || '';
    const ingredients_en = body.ingredients_en || ingredients_tr;
    const calories = parseFloat(body.calories || (body.besin_degerleri && body.besin_degerleri.enerji) || 0);
    const protein = parseFloat(body.protein || (body.besin_degerleri && body.besin_degerleri.protein) || 0);
    const carbs = parseFloat(body.carbs || (body.besin_degerleri && body.besin_degerleri.karbonhidrat) || 0);
    const fat = parseFloat(body.fat || (body.besin_degerleri && body.besin_degerleri.yag) || 0);
    const saturated_fat = parseFloat(body.saturated_fat || (body.besin_degerleri && body.besin_degerleri.doymus_yag) || 0);
    const sugars = parseFloat(body.sugars || (body.besin_degerleri && body.besin_degerleri.sekerler) || 0);
    const fiber = parseFloat(body.fiber || (body.besin_degerleri && body.besin_degerleri.lif) || 0);
    const salt = parseFloat(body.salt || (body.besin_degerleri && body.besin_degerleri.tuz) || 0);
    const category = body.category || 'diger';
    const price = parseFloat(body.price || 0);
    const image = body.image || '';
    const allergens = JSON.stringify(body.allergens || body.alerjenler || []);
    const katki_maddesi_icermez = (body.katki_maddesi_icermez || body.katki_maddesi_icermez === 1) ? 1 : 0;

    const paramValues = [name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, id, req.tenantId];

    let result;
    if (isPg) {
      result = await db.run(`
        UPDATE products SET
          name_tr=$1, name_en=$2, description_tr=$3, description_en=$4, category=$5,
          price=$6, image=$7, portion_tr=$8, portion_en=$9, ingredients_tr=$10, ingredients_en=$11,
          calories=$12, protein=$13, carbs=$14, fat=$15, saturated_fat=$16, sugars=$17, fiber=$18,
          salt=$19, allergens=$20, katki_maddesi_icermez=$21, updated_at=CURRENT_TIMESTAMP
        WHERE id=$22 AND tenant_id=$23
      `, paramValues);
    } else {
      result = await db.run(`
        UPDATE products SET
          name_tr=?, name_en=?, description_tr=?, description_en=?, category=?,
          price=?, image=?, portion_tr=?, portion_en=?, ingredients_tr=?, ingredients_en=?,
          calories=?, protein=?, carbs=?, fat=?, saturated_fat=?, sugars=?, fiber=?,
          salt=?, allergens=?, katki_maddesi_icermez=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND tenant_id=?
      `, paramValues);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedRow = await db.get(
      isPg ? 'SELECT * FROM products WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.json(mapProductRow(updatedRow));
  } catch (err) {
    console.error('[API ERROR] PUT /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id (Admin Only, tenant-scoped)
app.delete('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM products WHERE id = $1 AND tenant_id = $2' : 'DELETE FROM products WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/products:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// CATEGORIES API
// ==========================================

// GET /api/categories (tenant-scoped)
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM categories WHERE tenant_id = $1 ORDER BY sort_order ASC'
           : 'SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort_order ASC',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[API ERROR] GET /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories (Admin Only, tenant-scoped)
app.post('/api/categories', adminAuth, async (req, res) => {
  try {
    const { id, name_tr, name_en, sort_order, icon } = req.body;

    if (!id || !name_tr) {
      return res.status(400).json({ error: 'ID and name_tr are required' });
    }

    if (isPg) {
      await db.run(
        'INSERT INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, req.tenantId, name_tr, name_en || name_tr, sort_order || 0, icon || '']
      );
    } else {
      await db.run(
        'INSERT INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES (?, ?, ?, ?, ?, ?)',
        [id, req.tenantId, name_tr, name_en || name_tr, sort_order || 0, icon || '']
      );
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM categories WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error('[API ERROR] POST /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categories/:id (Admin Only, tenant-scoped)
app.put('/api/categories/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const { name_tr, name_en, sort_order, icon } = req.body;

    let result;
    if (isPg) {
      result = await db.run(
        'UPDATE categories SET name_tr=$1, name_en=$2, sort_order=$3, icon=$4 WHERE id=$5 AND tenant_id=$6',
        [name_tr, name_en, sort_order, icon, id, req.tenantId]
      );
    } else {
      result = await db.run(
        'UPDATE categories SET name_tr=?, name_en=?, sort_order=?, icon=? WHERE id=? AND tenant_id=?',
        [name_tr, name_en, sort_order, icon, id, req.tenantId]
      );
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM categories WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM categories WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.json(row);
  } catch (err) {
    console.error('[API ERROR] PUT /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categories/:id (Admin Only, tenant-scoped)
app.delete('/api/categories/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM categories WHERE id = $1 AND tenant_id = $2' : 'DELETE FROM categories WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/categories:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// RESERVATIONS API
// ==========================================

function mapReservationRow(row) {
  return {
    id: row.id,
    name: row.customer_name,
    phone: row.phone,
    date: row.date,
    time: row.time,
    pax: row.people,
    note: row.note,
    read: row.status === 'confirmed' || row.status === 'read',
    timestamp: row.created_at
  };
}

// GET /api/reservations (Admin Only, tenant-scoped — contains personal data)
app.get('/api/reservations', adminAuth, async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM reservations WHERE tenant_id = $1 ORDER BY created_at DESC'
           : 'SELECT * FROM reservations WHERE tenant_id = ? ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(rows.map(mapReservationRow));
  } catch (err) {
    console.error('[API ERROR] GET /api/reservations:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reservations
app.post('/api/reservations', async (req, res) => {
  try {
    // Tenant self-service "Geçici Kapat" (Phase D) — a NEW, separate flag from
    // tenants.status='disabled' (that one also blocks the tenant's own admin login; this one
    // never does — see settings.self_paused, toggled via PUT /api/admin/self-pause).
    if (req.tenant) {
      let s = {}; try { s = JSON.parse(req.tenant.settings || '{}') || {}; } catch (e) {}
      if (s.self_paused) return res.status(403).json({ error: 'restaurant_paused' });
    }
    const body = req.body;
    const id = body.id || `rez-${Date.now()}`;
    const customer_name = body.name || '';
    const phone = body.phone || '';
    const date = body.date || '';
    const time = body.time || '';
    const people = parseInt(body.pax || 1);
    const note = body.note || '';
    const status = (body.read === true || body.status === 'confirmed') ? 'confirmed' : 'pending';
    const timestamp = body.timestamp || Date.now();

    if (isPg) {
      await db.run(`
        INSERT INTO reservations (id, tenant_id, customer_name, phone, date, time, people, note, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [id, req.tenantId, customer_name, phone, date, time, people, note, status, timestamp, Date.now()]);
    } else {
      await db.run(`
        INSERT INTO reservations (id, tenant_id, customer_name, phone, date, time, people, note, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `, [id, req.tenantId, customer_name, phone, date, time, people, note, status, timestamp, Date.now()]);
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM reservations WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM reservations WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.status(201).json(mapReservationRow(row));
  } catch (err) {
    console.error('[API ERROR] POST /api/reservations:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/landing/contact — public lead capture from the HASACA marketing landing page.
// No auth (public form). Validated + length-capped; stored in landing_messages for the Root Panel.
app.post('/api/landing/contact', async (req, res) => {
  try {
    const b = req.body || {};
    const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const name = clip(b.name, 120);
    const restaurant = clip(b.restaurant, 160);
    const email = clip(b.email, 160);
    const phone = clip(b.phone, 60);
    const country = clip(b.country, 80);
    const message = clip(b.message, 4000);

    // Required: name, email, message. Email must look like an email.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || !message || !emailOk) {
      return res.status(400).json({ error: 'invalid_input', fields: { name: !!name, email: emailOk, message: !!message } });
    }

    const id = 'lm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const now = Date.now();
    await db.run(
      isPg
        ? 'INSERT INTO landing_messages (id, name, restaurant, email, phone, country, message, status, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'
        : 'INSERT INTO landing_messages (id, name, restaurant, email, phone, country, message, status, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, name, restaurant, email, phone, country, message, 'unread', ip, now]
    );
    logActivity({ tenantId: '', actor: email, role: 'lead', action: 'landing_message', target: restaurant || name, details: { name, email, phone, country }, ip });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[API ERROR] POST /api/landing/contact:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reservations/:id (Admin Only, tenant-scoped)
app.put('/api/reservations/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const status = (body.read === true || body.status === 'confirmed' || body.status === 'read') ? 'confirmed' : 'pending';

    let result;
    if (isPg) {
      result = await db.run('UPDATE reservations SET status=$1, updated_at=$2 WHERE id=$3 AND tenant_id=$4', [status, Date.now(), id, req.tenantId]);
    } else {
      result = await db.run('UPDATE reservations SET status=?, updated_at=? WHERE id=? AND tenant_id=?', [status, Date.now(), id, req.tenantId]);
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const row = await db.get(
      isPg ? 'SELECT * FROM reservations WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM reservations WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    res.json(mapReservationRow(row));
  } catch (err) {
    console.error('[API ERROR] PUT /api/reservations/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reservations/:id (Admin Only, tenant-scoped)
app.delete('/api/reservations/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM reservations WHERE id = $1 AND tenant_id = $2' : 'DELETE FROM reservations WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.json({ success: true, message: 'Reservation deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/reservations/:id:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// ORDERS API (food ordering system)
// ==========================================

// Tenant resolution now lives in lib/tenant.js (resolveTenant middleware sets req.tenantId).

function mapOrderItemRow(it) {
  return {
    id: it.id,
    product_id: it.product_id,
    name: it.product_name,
    unit_price: it.unit_price,
    quantity: it.quantity,
    line_total: it.line_total
  };
}

function mapOrderRow(row, items = []) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.customer_name,
    phone: row.phone,
    address: row.address,
    address_detail: row.address_detail,
    address_notes: row.address_notes,
    order_notes: row.order_notes,
    payment_method: row.payment_method,
    subtotal: row.subtotal,
    tax: row.tax,
    delivery_fee: row.delivery_fee,
    total: row.total,
    status: row.status,
    read: row.status === 'read',
    order_type: row.order_type || 'delivery',
    table_id: row.table_id || null,
    table_name: row.table_name || null,
    archived: row.archived === 1 || row.archived === true,
    archived_at: row.archived_at || null,
    items: items.map(mapOrderItemRow),
    created_at: row.created_at,
    timestamp: row.created_at
  };
}

// Dine-in order status workflow (in order). 'delivered' auto-archives.
const DINEIN_STATUSES = ['received', 'preparing', 'ready', 'serving', 'delivered'];

// POST /api/orders (public - customer places an order)
app.post('/api/orders', rateLimiter(30), async (req, res) => {
  try {
    // Tenant self-service "Geçici Kapat" (Phase D) — see the identical check + comment on
    // POST /api/reservations. Dine-in orders resolve their tenant from the table token further
    // down (req.tenant may not reflect the right tenant yet at this point for that path), so
    // this early check only covers the delivery/pickup case; the dine-in path re-checks below.
    if (req.tenant) {
      let s = {}; try { s = JSON.parse(req.tenant.settings || '{}') || {}; } catch (e) {}
      if (s.self_paused) return res.status(403).json({ error: 'restaurant_paused' });
    }
    const body = req.body || {};

    const customer_name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const address = String(body.address || '').trim();
    const address_detail = String(body.address_detail || '').trim();
    const address_notes = String(body.address_notes || '').trim();
    const order_notes = String(body.order_notes || '').trim();

    const allowedPayments = ['cash', 'card', 'online'];
    let payment_method = String(body.payment_method || 'cash').trim();
    if (!allowedPayments.includes(payment_method)) payment_method = 'cash';

    // ── Dine-in (QR table) vs delivery ──
    // A valid table_token turns this into a dine-in order: no address is required,
    // the table is resolved server-side, and the status uses the dine-in workflow.
    // IMPORTANT: On single-domain deployments (Netlify) req.tenantId may be 'default'.
    // For dine-in, we look up the table by token alone and derive the tenant from it.
    let orderType = 'delivery';
    let tableId = null;
    let tableName = null;
    let effectiveTenantId = req.tenantId;
    if (body.table_token) {
      // Look up by token only — the token itself is globally unique (10-char base62)
      const table = await db.get(
        isPg ? 'SELECT * FROM tables WHERE token = $1' : 'SELECT * FROM tables WHERE token = ?',
        [String(body.table_token)]
      );
      if (!table || !(table.active === 1 || table.active === true)) {
        return res.status(400).json({ error: 'Invalid table' });
      }
      orderType = 'dinein';
      tableId = table.id;
      tableName = table.name;
      effectiveTenantId = table.tenant_id; // always correct, regardless of host
      // Re-check self-pause against the TABLE's real tenant — the early check above used
      // req.tenant, which reflects the host, not necessarily the tenant that owns this table.
      const pausedCheck = await db.get(
        isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?',
        [effectiveTenantId]
      );
      let ps = {}; try { ps = JSON.parse((pausedCheck && pausedCheck.settings) || '{}') || {}; } catch (e) {}
      if (ps.self_paused) return res.status(403).json({ error: 'restaurant_paused' });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    // ── Validation (mirrors frontend, never trusts it) ──
    // Dine-in orders know the table from the QR, so they never need an address;
    // name/phone are optional for dine-in (the table identifies the customer).
    if (orderType === 'delivery') {
      if (!customer_name || !phone || !address) {
        return res.status(400).json({ error: 'Name, phone and address are required' });
      }
    }
    if (items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // ── Build order items with server-side prices (never trust client-sent totals) ──
    const resolvedItems = [];
    let subtotal = 0;
    for (const raw of items) {
      const productId = String((raw && (raw.product_id || raw.id)) || '').trim();
      let quantity = parseInt(raw && raw.quantity, 10);
      if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
      if (quantity > 99) quantity = 99;
      if (!productId) continue;

      const product = await db.get(
        isPg ? 'SELECT * FROM products WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
        [productId, effectiveTenantId]
      );
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${productId}` });
      }
      const unitPrice = parseFloat(product.price) || 0;
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      subtotal += lineTotal;
      resolvedItems.push({
        id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        product_id: productId,
        product_name: product.name_tr || product.name_en || productId,
        unit_price: unitPrice,
        quantity,
        line_total: lineTotal
      });
    }

    if (resolvedItems.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one valid item' });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    // Tax and delivery fee are per-tenant configurable in future; 0 until configured.
    const tax = 0;
    const delivery_fee = 0;
    const total = Math.round((subtotal + tax + delivery_fee) * 100) / 100;

    const id = `order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const initialStatus = orderType === 'dinein' ? 'received' : 'new';

    if (isPg) {
      await db.run(`
        INSERT INTO orders (id, tenant_id, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, status, order_type, table_id, table_name, archived, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18,$19)
      `, [id, effectiveTenantId, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, initialStatus, orderType, tableId, tableName, now, now]);
    } else {
      await db.run(`
        INSERT INTO orders (id, tenant_id, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, status, order_type, table_id, table_name, archived, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
      `, [id, effectiveTenantId, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, initialStatus, orderType, tableId, tableName, now, now]);
    }

    // Insert items; if any fail, roll back the just-created order to avoid an item-less order.
    try {
      for (const it of resolvedItems) {
        if (isPg) {
          await db.run(`
            INSERT INTO order_items (id, order_id, tenant_id, product_id, product_name, unit_price, quantity, line_total)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [it.id, id, effectiveTenantId, it.product_id, it.product_name, it.unit_price, it.quantity, it.line_total]);
        } else {
          await db.run(`
            INSERT INTO order_items (id, order_id, tenant_id, product_id, product_name, unit_price, quantity, line_total)
            VALUES (?,?,?,?,?,?,?,?)
          `, [it.id, id, effectiveTenantId, it.product_id, it.product_name, it.unit_price, it.quantity, it.line_total]);
        }
      }
    } catch (itemErr) {
      await db.run(isPg ? 'DELETE FROM order_items WHERE order_id = $1' : 'DELETE FROM order_items WHERE order_id = ?', [id]);
      await db.run(isPg ? 'DELETE FROM orders WHERE id = $1' : 'DELETE FROM orders WHERE id = ?', [id]);
      throw itemErr;
    }

    const orderRow = await db.get(isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?', [id]);
    const itemRows = await db.all(isPg ? 'SELECT * FROM order_items WHERE order_id = $1' : 'SELECT * FROM order_items WHERE order_id = ?', [id]);
    const mapped = mapOrderRow(orderRow, itemRows);
    // Notify the admin dashboard in real time (both delivery and dine-in).
    platformEvents.publishToAdmin(effectiveTenantId, 'order_new', mapped);
    res.status(201).json(mapped);
  } catch (err) {
    console.error('[API ERROR] POST /api/orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders (Admin Only) - tenant-scoped.
// ?type=delivery (default) | dinein ; ?archived=0|1 (dine-in only)
app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const type = req.query.type === 'dinein' ? 'dinein' : (req.query.type === 'all' ? 'all' : 'delivery');
    const archived = req.query.archived === '1' ? 1 : 0;

    let sql, params;
    if (type === 'all') {
      sql = isPg ? 'SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC'
                 : 'SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC';
      params = [tenantId];
    } else if (type === 'dinein') {
      sql = isPg ? "SELECT * FROM orders WHERE tenant_id = $1 AND order_type = 'dinein' AND archived = $2 ORDER BY created_at DESC"
                 : "SELECT * FROM orders WHERE tenant_id = ? AND order_type = 'dinein' AND archived = ? ORDER BY created_at DESC";
      params = [tenantId, archived];
    } else {
      // delivery: include legacy rows where order_type is NULL
      sql = isPg ? "SELECT * FROM orders WHERE tenant_id = $1 AND (order_type = 'delivery' OR order_type IS NULL) ORDER BY created_at DESC"
                 : "SELECT * FROM orders WHERE tenant_id = ? AND (order_type = 'delivery' OR order_type IS NULL) ORDER BY created_at DESC";
      params = [tenantId];
    }

    const orders = await db.all(sql, params);
    const items = await db.all(
      isPg ? 'SELECT * FROM order_items WHERE tenant_id = $1' : 'SELECT * FROM order_items WHERE tenant_id = ?',
      [tenantId]
    );
    const itemsByOrder = {};
    for (const it of items) {
      (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);
    }
    res.json(orders.map(o => mapOrderRow(o, itemsByOrder[o.id] || [])));
  } catch (err) {
    console.error('[API ERROR] GET /api/orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id/status (Admin Only) - dine-in workflow; 'delivered' auto-archives
app.put('/api/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const tenantId = req.tenantId;
    const status = String((req.body && req.body.status) || '');
    if (!DINEIN_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const order = await db.get(
      isPg ? 'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2' : 'SELECT * FROM orders WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const archived = status === 'delivered' ? 1 : 0;
    const archivedAt = status === 'delivered' ? Date.now() : null;
    await db.run(
      isPg ? 'UPDATE orders SET status = $1, archived = $2, archived_at = $3, updated_at = $4 WHERE id = $5 AND tenant_id = $6'
           : 'UPDATE orders SET status = ?, archived = ?, archived_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
      [status, archived, archivedAt, Date.now(), id, tenantId]
    );

    const orderRow = await db.get(isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?', [id]);
    const itemRows = await db.all(isPg ? 'SELECT * FROM order_items WHERE order_id = $1' : 'SELECT * FROM order_items WHERE order_id = ?', [id]);
    const mapped = mapOrderRow(orderRow, itemRows);
    // Push to both the admin dashboard and the customer's live tracking screen.
    platformEvents.publishToAdmin(tenantId, 'order_status', mapped);
    platformEvents.publishToOrder(id, 'order_status', { id, status, archived: archived === 1 });
    res.json(mapped);
  } catch (err) {
    console.error('[API ERROR] PUT /api/orders/:id/status:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id (Admin Only) - delivery read/unread toggle, tenant-scoped
app.put('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const tenantId = req.tenantId;
    const status = (req.body && (req.body.read === true || req.body.status === 'read')) ? 'read' : 'new';

    const result = await db.run(
      isPg ? 'UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4'
           : 'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
      [status, Date.now(), id, tenantId]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const orderRow = await db.get(isPg ? 'SELECT * FROM orders WHERE id = $1' : 'SELECT * FROM orders WHERE id = ?', [id]);
    const itemRows = await db.all(isPg ? 'SELECT * FROM order_items WHERE order_id = $1' : 'SELECT * FROM order_items WHERE order_id = ?', [id]);
    res.json(mapOrderRow(orderRow, itemRows));
  } catch (err) {
    console.error('[API ERROR] PUT /api/orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id (Admin Only) - tenant-scoped, removes items too
app.delete('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const tenantId = req.tenantId;
    const existing = await db.get(
      isPg ? 'SELECT id FROM orders WHERE id = $1 AND tenant_id = $2' : 'SELECT id FROM orders WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }
    await db.run(isPg ? 'DELETE FROM order_items WHERE order_id = $1' : 'DELETE FROM order_items WHERE order_id = ?', [id]);
    await db.run(isPg ? 'DELETE FROM orders WHERE id = $1' : 'DELETE FROM orders WHERE id = ?', [id]);
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/orders/:id:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// TRANSLATIONS API
// ==========================================

// GET /api/translations (public, tenant-scoped)
app.get('/api/translations', async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM translations WHERE tenant_id = $1' : 'SELECT * FROM translations WHERE tenant_id = ?',
      [req.tenantId]
    );
    const tr = {};
    const en = {};

    rows.forEach(row => {
      tr[row.key] = row.tr;
      en[row.key] = row.en;
    });

    res.json({ tr, en });
  } catch (err) {
    console.error('[API ERROR] GET /api/translations:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/translations (Admin Only, tenant-scoped, upsert)
app.post('/api/translations', adminAuth, async (req, res) => {
  try {
    const { key, tr, en } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });

    const id = `trans-${Date.now()}`;
    if (isPg) {
      await db.run(
        'INSERT INTO translations (id, tenant_id, key, tr, en) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, key) DO UPDATE SET tr = EXCLUDED.tr, en = EXCLUDED.en',
        [id, req.tenantId, key, tr || '', en || '']
      );
    } else {
      const existing = await db.get('SELECT id FROM translations WHERE tenant_id = ? AND key = ?', [req.tenantId, key]);
      if (existing) {
        await db.run('UPDATE translations SET tr = ?, en = ? WHERE id = ?', [tr || '', en || '', existing.id]);
      } else {
        await db.run('INSERT INTO translations (id, tenant_id, key, tr, en) VALUES (?,?,?,?,?)', [id, req.tenantId, key, tr || '', en || '']);
      }
    }
    res.status(201).json({ id, key, tr, en });
  } catch (err) {
    console.error('[API ERROR] POST /api/translations:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// SECURITY & HELPER MIDDLEWARES
// ==========================================
const ipCounts = {};
setInterval(() => {
  for (const ip in ipCounts) delete ipCounts[ip];
}, 60000);

function rateLimiter(limit = 60) {
  return (req, res, next) => {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = req.ip || xff || req.socket.remoteAddress || 'unknown';
    ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    if (ipCounts[ip] > limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Verifies the signed session token and enforces tenant isolation:
// a tenant admin's token is only valid for the tenant resolved from the request host;
// the root role may operate on any tenant (needed for support/impersonation).
function adminAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
  }
  if (payload.role !== 'root') {
    // On single-domain deployments (Netlify/Render) the host always resolves to 'default'.
    // If the JWT carries a specific tenant_id, trust it over the host-derived default.
    if (payload.tenant_id && (req.tenantId === 'default' || !req.tenantId)) {
      req.tenantId = payload.tenant_id;
    } else if (payload.tenant_id && payload.tenant_id !== req.tenantId) {
      return res.status(401).json({ error: 'Unauthorized: wrong tenant.' });
    }
  }
  req.auth = payload;
  next();
}

// Root-only guard (platform owner)
function rootAuth(req, res, next) {
  adminAuth(req, res, () => {
    if (!req.auth || req.auth.role !== 'root') {
      return res.status(403).json({ error: 'Forbidden: root access required.' });
    }
    next();
  });
}

// ==========================================
// AUTH API
// ==========================================

// POST /api/auth/login — username + password. The tenant comes from the request host;
// root matches regardless of tenant (logs in from the main domain).
app.post('/api/auth/login', rateLimiter(15), async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let user = await db.get(
      isPg
        ? "SELECT * FROM admin_users WHERE username = $1 AND (role = 'root' OR tenant_id = $2)"
        : "SELECT * FROM admin_users WHERE username = ? AND (role = 'root' OR tenant_id = ?)",
      [username, req.tenantId]
    );

    // Single-domain fallback (Netlify -> Render): every restaurant answers on the same
    // host, so req.tenantId is 'default' and the lookup above rejects a *correct*
    // password for any other tenant. When no tenant was requested explicitly, accept the
    // account only if exactly ONE account platform-wide carries this username; an
    // ambiguous username is refused so a login can never land in the wrong restaurant.
    // The password is still verified normally below, and the failure response is
    // identical either way so this leaks no information about which usernames exist.
    const explicitTenant = !!((req.query && req.query.tenant) || (req.headers && req.headers['x-tenant-id']));
    if (!user && !explicitTenant) {
      const matches = await db.all(
        isPg ? 'SELECT * FROM admin_users WHERE username = $1' : 'SELECT * FROM admin_users WHERE username = ?',
        [username]
      );
      if (matches.length === 1) user = matches[0];
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.run(
      isPg ? 'UPDATE admin_users SET last_login = $1 WHERE id = $2' : 'UPDATE admin_users SET last_login = ? WHERE id = ?',
      [Date.now(), user.id]
    );

    const token = signToken({ uid: user.id, tenant_id: user.tenant_id, role: user.role, username: user.username });
    logActivity({
      tenantId: user.role === 'root' ? '' : user.tenant_id, actor: user.username, role: user.role,
      action: 'login', target: user.username,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || ''
    });
    res.json({
      token,
      role: user.role,
      tenant_id: user.tenant_id,
      username: user.username,
      display_name: user.display_name || user.username
    });
  } catch (err) {
    console.error('[API ERROR] POST /api/auth/login:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — validates the stored token (used to restore sessions client-side).
// Re-reads the admin_users row (not just the token payload) so a changed display name/avatar
// shows up without forcing a re-login.
app.get('/api/auth/me', adminAuth, async (req, res) => {
  let profile = null;
  try {
    profile = await db.get(
      isPg ? 'SELECT display_name, email, avatar_url FROM admin_users WHERE id = $1' : 'SELECT display_name, email, avatar_url FROM admin_users WHERE id = ?',
      [req.auth.uid]
    );
  } catch (e) { /* fall through to token-only fields below */ }
  res.json({
    uid: req.auth.uid,
    role: req.auth.role,
    tenant_id: req.auth.tenant_id,
    username: req.auth.username,
    exp: req.auth.exp,
    display_name: (profile && profile.display_name) || req.auth.username,
    email: (profile && profile.email) || '',
    avatar_url: (profile && profile.avatar_url) || ''
  });
});

// POST /api/auth/google — { credential } is the Google ID token (a JWT) delivered by Google
// Identity Services' client-side button. Verified ONCE here against Google's own keys; every
// subsequent authenticated request on this platform still uses our own signToken()/verifyToken()
// HMAC session format (lib/auth.js), completely unchanged — Google's token is never stored or
// passed through as a session token.
app.post('/api/auth/google', rateLimiter(15), async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'google_signin_not_configured' });
    }
    const credential = String((req.body && req.body.credential) || '');
    if (!credential) return res.status(400).json({ error: 'credential_required' });

    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ error: 'invalid_google_token' });
    }
    if (!payload || !payload.email_verified) {
      return res.status(403).json({ error: 'google_email_unverified' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

    // "One Google account, one tenant, ever" — look up by google_sub (globally unique, not
    // scoped per tenant) ONLY. If found, log into their existing tenant; never create a second.
    let user = await db.get(
      isPg ? 'SELECT * FROM admin_users WHERE google_sub = $1' : 'SELECT * FROM admin_users WHERE google_sub = ?',
      [payload.sub]
    );

    let provisioned = false;
    if (!user) {
      // First-time Google sign-in: auto-provision a brand-new tenant, named from the person's
      // own Google account (per the platform owner's explicit choice) — no signup form.
      const firstName = payload.given_name || (payload.name ? payload.name.split(' ')[0] : '');
      const displayName = firstName ? `${firstName}'in Restoranı` : 'Yeni Restoran';
      const seed = firstName || (payload.email || '').split('@')[0];

      let slug = generateSlugCandidate(seed);
      let n = 2;
      for (;;) {
        const reserved = RESERVED_SLUGS.includes(slug);
        const exists = !reserved && await db.get(
          isPg ? 'SELECT id FROM tenants WHERE id = $1' : 'SELECT id FROM tenants WHERE id = ?', [slug]
        );
        if (!reserved && !exists) break;
        slug = `${generateSlugCandidate(seed)}-${n++}`.slice(0, 31);
        if (!SLUG_RE.test(slug)) { slug = `restoran-${Date.now()}`.slice(0, 31); break; }
      }

      try {
        await createTenantWithDemoContent({
          slug, name: displayName, display_name: displayName,
          body: { contact_email: payload.email },
          adminOverride: {
            username: slug,
            password_hash: hashPassword(crypto.randomBytes(32).toString('hex')), // unusable placeholder — Google-only account
            email: payload.email, google_sub: payload.sub, avatar_url: payload.picture || '',
            display_name: payload.name || displayName
          }
        });
        provisioned = true;
        invalidateTenantCache(slug);
        logActivity({ tenantId: slug, actor: slug, role: 'tenant_admin', action: 'tenant_self_signup', target: slug, details: payload.email, ip: clientIp });
      } catch (e) {
        // Concurrent first-time sign-in (e.g. two tabs) can lose a race on the unique google_sub
        // index — re-look-up and log into whichever request won, instead of surfacing a raw
        // DB error. A losing request may leave an orphaned demo tenant with no admin row; at this
        // platform's scale that is an acceptable, rare Root cleanup item, not a security issue.
        console.warn('[AUTH] Google provisioning conflict, re-checking existing account:', e.message);
      }
      user = await db.get(
        isPg ? 'SELECT * FROM admin_users WHERE google_sub = $1' : 'SELECT * FROM admin_users WHERE google_sub = ?',
        [payload.sub]
      );
      if (!user) return res.status(500).json({ error: 'provisioning_failed' });
    } else {
      // Returning Google user — keep their photo/name fresh without a re-login.
      await db.run(
        isPg ? 'UPDATE admin_users SET last_login = $1, avatar_url = $2, display_name = $3 WHERE id = $4'
             : 'UPDATE admin_users SET last_login = ?, avatar_url = ?, display_name = ? WHERE id = ?',
        [Date.now(), payload.picture || user.avatar_url || '', payload.name || user.display_name, user.id]
      );
    }

    const token = signToken({ uid: user.id, tenant_id: user.tenant_id, role: user.role, username: user.username });
    logActivity({
      tenantId: user.role === 'root' ? '' : user.tenant_id, actor: user.username, role: user.role,
      action: 'login_google', target: user.username, ip: clientIp
    });
    res.json({
      token,
      role: user.role,
      tenant_id: user.tenant_id,
      username: user.username,
      display_name: payload.name || user.display_name || user.username,
      provisioned
    });
  } catch (err) {
    console.error('[API ERROR] POST /api/auth/google:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROOT (SUPER ADMIN) PANEL & API
// ==========================================
const createRootRouter = require('./routes/root');
app.use('/api/root', rootAuth, createRootRouter({
  db, isPg, invalidateTenantCache, signToken, hashPassword, generatePassword,
  sendPush: sendPushNotificationInternal   // hoisted fn (defined below) — used by the Root Notification Center
}));

// Root panel page (served regardless of tenant host — guarded by root login client+server side)
app.get(['/root', '/root.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'root.html'));
});

// ==========================================
// QR TABLE ORDERING
// ==========================================
const createTablesRouter = require('./routes/tables');
app.use('/api', createTablesRouter({ db, isPg, events: platformEvents, adminAuth, rateLimiter }));

// Customer scans a QR -> /t/<token> serves the ordering page (tenant already resolved by host/override)
app.get('/t/:token', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

// SSE — admin dashboard live feed. EventSource cannot send headers, so the token
// is passed as a query param and verified here (same checks as adminAuth).
app.get('/api/events/admin', (req, res) => {
  const payload = verifyToken(String(req.query.token || ''));
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  // Trust the JWT's own tenant_id for a tenant admin — same trust model adminAuth already uses
  // elsewhere. Required because this SSE connection now bypasses the Netlify proxy and hits
  // Render directly (the proxy does not stream — see index.html/admin.html's SSE_BASE comment),
  // so host-based tenant resolution can't determine a slug here at all; the old strict
  // payload.tenant_id === req.tenantId check would 401 every real tenant admin. A root session
  // keeps its existing ability to view any tenant's feed via ?tenant=.
  const tenantId = payload.role === 'root' ? req.tenantId : payload.tenant_id;
  platformEvents.subscribeAdmin(tenantId, req, res);
});

// SSE — customer live order tracking (public; order id is unguessable)
app.get('/api/events/track/:orderId', (req, res) => {
  platformEvents.subscribeOrder(req.params.orderId, req, res);
});

// ==========================================
// PLATFORM CONFIG (public, global white-label branding — NO secrets)
// ==========================================
app.get('/api/platform-config', async (req, res) => {
  try {
    const row = await db.get(isPg ? 'SELECT settings FROM platform_settings WHERE id = $1' : 'SELECT settings FROM platform_settings WHERE id = ?', ['platform']);
    let s = {};
    try { s = JSON.parse((row && row.settings) || '{}') || {}; } catch (e) {}
    res.json({
      platform_name: s.platform_name || 'HASACA',
      logo_url: s.logo_url || '/icons/placeholder-logo.svg',
      favicon_url: s.favicon_url || '/favicon.ico',
      login_logo_url: s.login_logo_url || s.logo_url || '/icons/placeholder-logo.svg',
      landing_title: s.landing_title || s.platform_name || 'HASACA',
      landing_subtitle: s.landing_subtitle || '',
      footer_brand: s.footer_brand || s.platform_name || 'HASACA',
      ai_enabled: !!s.ai_enabled,
      // Client IDs are not secret (unlike API keys) — safe to expose publicly. Empty when unset
      // so the frontend can hide the Google button instead of showing a broken one.
      google_client_id: process.env.GOOGLE_CLIENT_ID || ''
    });
  } catch (err) {
    console.error('[API ERROR] GET /api/platform-config:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SITE CONFIG (public, tenant-scoped branding)
// ==========================================
app.get('/api/site-config', (req, res) => {
  const t = req.tenant;
  if (!t) return res.status(404).json({ error: 'Unknown restaurant' });
  let settings = {};
  try { settings = JSON.parse(t.settings || '{}') || {}; } catch (e) {}
  res.json({
    id: t.id,
    name: t.name,
    display_name: t.display_name,
    status: t.status,
    contact_phone: t.contact_phone,
    contact_email: t.contact_email,
    address: t.address,
    settings
  });
});

function validateImageFile(imageStr) {
  if (!imageStr) return true;
  if (imageStr.startsWith('http://') || imageStr.startsWith('https://')) {
    return true;
  }
  if (imageStr.startsWith('data:image/')) {
    const matches = imageStr.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) return false;
    const ext = matches[1].toLowerCase();
    const allowed = ['png', 'jpeg', 'jpg', 'webp'];
    if (!allowed.includes(ext)) return false;
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return false;
    return true;
  }
  return false;
}

// Helper: send Web Push payload to subscribers (scoped to the notification's tenant)
async function sendPushNotificationInternal(notif) {
  try {
    const notifTenant = notif.tenant_id || 'default';
    let sql = isPg
      ? 'SELECT * FROM subscriptions WHERE enabled = 1 AND tenant_id = $1'
      : 'SELECT * FROM subscriptions WHERE enabled = 1 AND tenant_id = ?';
    let params = [notifTenant];
    if (notif.target === 'test') {
      sql += " AND (user_id = 'test' OR device LIKE '%test%' OR id LIKE '%test%')";
    } else if (notif.target && notif.target !== 'all' && notif.target !== 'permitted') {
      sql += isPg ? ' AND platform = $2' : ' AND platform = ?';
      params.push(notif.target);
    }
    
    const subs = await db.all(sql, params);
    let success = 0;
    let failed = 0;
    
    const payload = JSON.stringify({
      id: notif.id,
      title: notif.title,
      body: notif.body,
      image: notif.image,
      icon: notif.icon,
      url: notif.url,
      tag: notif.tag,
      collapse_key: notif.collapse_key
    });
    
    const options = {
      TTL: (notif.ttl || 24) * 3600,
      urgency: notif.priority === 'critical' ? 'high' : (notif.priority || 'normal'),
      topic: notif.collapse_key || undefined
    };
    
    for (const sub of subs) {
      try {
        const subObj = JSON.parse(sub.token);
        await webpush.sendNotification(subObj, payload, options);
        success++;
      } catch (err) {
        failed++;
        console.error(`[PUSH ERROR] Failed to send to sub ${sub.id}:`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          const deleteSql = isPg 
            ? 'DELETE FROM subscriptions WHERE id = $1' 
            : 'DELETE FROM subscriptions WHERE id = ?';
          await db.run(deleteSql, [sub.id]);
          console.log(`[PUSH INFO] Cleaned up expired subscription: ${sub.id}`);
        }
      }
    }
    
    const updateSql = isPg
      ? 'UPDATE notifications SET status = $1, success_count = $2, failed_count = $3, sent_at = $4 WHERE id = $5'
      : 'UPDATE notifications SET status = ?, success_count = ?, failed_count = ?, sent_at = ? WHERE id = ?';
    
    await db.run(updateSql, [
      'sent',
      success,
      failed,
      new Date().toISOString(),
      notif.id
    ]);
    
    console.log(`[PUSH ENGINE] Notification ${notif.id} sent. Success: ${success}, Failed: ${failed}`);
  } catch (err) {
    console.error(`[PUSH ENGINE ERROR] Failed to send notification ${notif.id}:`, err);
    const updateSql = isPg
      ? "UPDATE notifications SET status = 'failed' WHERE id = $1"
      : "UPDATE notifications SET status = 'failed' WHERE id = ?";
    await db.run(updateSql, [notif.id]);
  }
}

// Background scheduler loop (every 30 seconds)
setInterval(async () => {
  try {
    const nowStr = new Date().toISOString();
    const sql = isPg 
      ? "SELECT * FROM notifications WHERE status = 'pending' AND scheduled_at <= $1" 
      : "SELECT * FROM notifications WHERE status = 'pending' AND scheduled_at <= ?";
    const pendingNotifications = await db.all(sql, [nowStr]);
    
    for (const notif of pendingNotifications) {
      const updateSql = isPg
        ? "UPDATE notifications SET status = 'sending' WHERE id = $1"
        : "UPDATE notifications SET status = 'sending' WHERE id = ?";
      await db.run(updateSql, [notif.id]);
      
      await sendPushNotificationInternal(notif);
    }
  } catch (err) {
    console.error('[SCHEDULER ERROR] Failed to process scheduled notifications:', err);
  }
}, 30000);

// ==========================================
// WEB PUSH NOTIFICATION APIs
// ==========================================

// GET /api/notifications/vapid-public-key
app.get('/api/notifications/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
});

// POST /api/subscriptions (Register / Update client token)
app.post('/api/subscriptions', rateLimiter(30), async (req, res) => {
  try {
    const { token, user_id, device, browser, platform, language } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const tokenStr = typeof token === 'object' ? JSON.stringify(token) : token;
    
    // Check if subscription already exists
    const existing = await db.get(
      isPg ? 'SELECT * FROM subscriptions WHERE token = $1' : 'SELECT * FROM subscriptions WHERE token = ?',
      [tokenStr]
    );
    
    const nowStr = new Date().toISOString();
    
    if (existing) {
      const updateSql = isPg
        ? 'UPDATE subscriptions SET last_seen = $1, enabled = 1, user_id = $2, device = $3, browser = $4, platform = $5, language = $6 WHERE id = $7'
        : 'UPDATE subscriptions SET last_seen = ?, enabled = 1, user_id = ?, device = ?, browser = ?, platform = ?, language = ? WHERE id = ?';
      await db.run(updateSql, [nowStr, user_id || existing.user_id, device || existing.device, browser || existing.browser, platform || existing.platform, language || existing.language, existing.id]);
      const updated = await db.get(
        isPg ? 'SELECT * FROM subscriptions WHERE id = $1' : 'SELECT * FROM subscriptions WHERE id = ?',
        [existing.id]
      );
      return res.json(updated);
    } else {
      const id = `sub-${Date.now()}`;
      const insertSql = isPg
        ? 'INSERT INTO subscriptions (id, tenant_id, user_id, token, device, browser, platform, language, created_at, last_seen, enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)'
        : 'INSERT INTO subscriptions (id, tenant_id, user_id, token, device, browser, platform, language, created_at, last_seen, enabled) VALUES (?,?,?,?,?,?,?,?,?,?,1)';
      await db.run(insertSql, [id, req.tenantId, user_id || '', tokenStr, device || '', browser || '', platform || '', language || '', nowStr, nowStr]);
      const inserted = await db.get(
        isPg ? 'SELECT * FROM subscriptions WHERE id = $1' : 'SELECT * FROM subscriptions WHERE id = ?',
        [id]
      );
      return res.status(201).json(inserted);
    }
  } catch (err) {
    console.error('[API ERROR] POST /api/subscriptions:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscriptions (Admin Only, tenant-scoped)
app.get('/api/subscriptions', adminAuth, async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC'
           : 'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[API ERROR] GET /api/subscriptions:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/subscriptions/:id (Admin Only, tenant-scoped)
app.delete('/api/subscriptions/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM subscriptions WHERE id = $1 AND tenant_id = $2' : 'DELETE FROM subscriptions WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/subscriptions/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notifications (Admin Only, tenant-scoped)
app.get('/api/notifications', adminAuth, async (req, res) => {
  try {
    const rows = await db.all(
      isPg ? 'SELECT * FROM notifications WHERE tenant_id = $1 ORDER BY created_at DESC'
           : 'SELECT * FROM notifications WHERE tenant_id = ? ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[API ERROR] GET /api/notifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id (Admin Only, tenant-scoped)
app.delete('/api/notifications/:id', adminAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run(
      isPg ? 'DELETE FROM notifications WHERE id = $1 AND tenant_id = $2' : 'DELETE FROM notifications WHERE id = ? AND tenant_id = ?',
      [id, req.tenantId]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/notifications/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/send (Admin Only - Send Immediately)
app.post('/api/notifications/send', adminAuth, rateLimiter(10), async (req, res) => {
  try {
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const id = `notif-${Date.now()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,0,0)'
      : 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';

    await db.run(insertSql, [
      id, req.tenantId, title, body, image || '', icon || '', url || '', target || 'all', nowStr, nowStr, 'sending',
      priority || 'normal', parseInt(ttl || 24), tag || '', collapse_key || '', created_by || 'admin'
    ]);
    
    const notif = await db.get(
      isPg ? 'SELECT * FROM notifications WHERE id = $1' : 'SELECT * FROM notifications WHERE id = ?',
      [id]
    );
    
    // Process send asynchronously so request completes fast
    sendPushNotificationInternal(notif);
    
    res.json({ success: true, message: 'Notification send initiated', id });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/send:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/schedule (Admin Only - Schedule for later)
app.post('/api/notifications/schedule', adminAuth, rateLimiter(15), async (req, res) => {
  try {
    const { title, body, image, icon, url, target, priority, ttl, tag, collapse_key, created_by, scheduled_at } = req.body;
    
    if (!title || !body || !scheduled_at) {
      return res.status(400).json({ error: 'Title, body, and scheduled_at are required' });
    }
    
    if (!validateImageFile(image)) {
      return res.status(400).json({ error: 'Invalid image format or size exceeds 5MB' });
    }
    
    const id = `notif-${Date.now()}`;
    const nowStr = new Date().toISOString();
    
    const insertSql = isPg
      ? 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,0,0)'
      : 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, scheduled_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)';

    await db.run(insertSql, [
      id, req.tenantId, title, body, image || '', icon || '', url || '', target || 'all', nowStr, scheduled_at, 'pending',
      priority || 'normal', parseInt(ttl || 24), tag || '', collapse_key || '', created_by || 'admin'
    ]);
    
    res.json({ success: true, message: 'Notification scheduled successfully', id });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/schedule:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/test (Admin Only - Send to single subscriber for testing)
app.post('/api/notifications/test', adminAuth, rateLimiter(20), async (req, res) => {
  try {
    const { token, title, body, image, url } = req.body;
    if (!token || !title || !body) {
      return res.status(400).json({ error: 'Token, title, and body are required' });
    }
    
    const payload = JSON.stringify({
      id: `test-${Date.now()}`,
      title,
      body,
      image: image || '',
      url: url || ''
    });
    
    const subObj = typeof token === 'string' ? JSON.parse(token) : token;
    await webpush.sendNotification(subObj, payload, { TTL: 60 });
    
    res.json({ success: true, message: 'Test notification sent successfully' });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/test:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/upload-image (Admin Only - store a push image on disk, return a small hosted URL)
// Push payloads have a ~4KB size limit, so raw base64 images can never be sent inline in the
// notification itself; the image must be hosted and referenced by URL instead.
app.post('/api/notifications/upload-image', adminAuth, rateLimiter(10), async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Valid base64 image data is required' });
    }
    const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image data format' });
    }
    const ext = matches[1].toLowerCase();
    const allowed = ['png', 'jpeg', 'jpg', 'webp'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported image format. Use PNG, JPG or WEBP.' });
    }
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds 5MB' });
    }

    const uploadsDir = path.join(rootDir, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext === 'jpeg' ? 'jpg' : ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const publicUrl = `${proto}://${req.get('host')}/uploads/${filename}`;
    res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/upload-image:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/upload-image (Admin only — store an uploaded image on disk, return a hosted URL)
// Used by the tenant admin for menu/product photos (and any other editable asset) so images are
// stored as files under /uploads and referenced by URL — never embedded as base64 in the DB.
// GET /api/admin/activity — the tenant's OWN audit trail (tenant-isolated; never shows other tenants).
app.get('/api/admin/activity', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const rows = await db.all(
      `SELECT id, actor, role, action, target, details, created_at FROM activity_log WHERE tenant_id = ${p(1)} ORDER BY created_at DESC LIMIT ${p(2)} OFFSET ${p(3)}`,
      [req.tenantId, limit, offset]
    );
    const totalRow = await db.get(`SELECT COUNT(*) c FROM activity_log WHERE tenant_id = ${p(1)}`, [req.tenantId]);
    res.json({ items: rows, total: totalRow ? Number(Object.values(totalRow)[0]) : 0, limit, offset });
  } catch (err) {
    console.error('[API ERROR] GET /api/admin/activity:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics?days=30 — the tenant's OWN analytics (tenant-isolated).
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = Date.now() - days * 86400000;
    const orders = await db.all(
      `SELECT total, created_at, order_type, status FROM orders WHERE tenant_id = ${p(1)} AND created_at >= ${p(2)}`,
      [req.tenantId, since]
    );
    let revenue = 0, delivery = 0, dinein = 0; const byDay = {}, statusB = {};
    for (const o of orders) {
      const t = Number(o.total) || 0; revenue += t;
      const isDinein = o.order_type === 'dinein';
      if (isDinein) dinein++; else delivery++;
      statusB[o.status || 'new'] = (statusB[o.status || 'new'] || 0) + 1;
      const key = new Date(Number(o.created_at)).toISOString().slice(0, 10);
      const day = (byDay[key] = byDay[key] || { date: key, orders: 0, revenue: 0, delivery: 0, dinein: 0 });
      day.orders++; day.revenue += t;
      if (isDinein) day.dinein++; else day.delivery++;
    }
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push(byDay[key] || { date: key, orders: 0, revenue: 0, delivery: 0, dinein: 0 });
    }
    const items = await db.all(
      `SELECT product_name, SUM(quantity) q FROM order_items WHERE tenant_id = ${p(1)} GROUP BY product_name ORDER BY q DESC LIMIT 8`,
      [req.tenantId]
    );
    const rez = await db.get(`SELECT COUNT(*) c FROM reservations WHERE tenant_id = ${p(1)}`, [req.tenantId]);
    res.json({
      days,
      summary: {
        orders: orders.length,
        revenue: +revenue.toFixed(2),
        avgOrderValue: orders.length ? +(revenue / orders.length).toFixed(2) : 0,
        reservations: rez ? Number(Object.values(rez)[0]) : 0
      },
      typeSplit: { delivery, dinein },
      statusBreakdown: statusB,
      ordersByDay: series,
      topProducts: items.map(i => ({ name: i.product_name, qty: Number(i.q) }))
    });
  } catch (err) {
    console.error('[API ERROR] GET /api/admin/analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- AI Assistant (Phase 27, provider swapped Phase 38) — tenant-scoped ----------
// Reuses the shared Groq key/model from platform_settings (Phase 26's /api/root/ai-settings).
// Swapped from Gemini to Groq (Phase 38): Gemini's real generateContent quota requires a billing
// account linked to the underlying Google Cloud project even to use the nominal "free tier" — a
// prepaid/no-card account can validate a key (cheap metadata call) but every real generation call
// 404s with "limit: 0". Groq's free tier needs no card, ever. Groq exposes an OpenAI-compatible
// REST API, so only the request/response shape changes — the systemPrompt/JSON-schema contract
// this file builds is provider-agnostic and untouched.
// The assistant only ever sets whitelisted fields on rows already scoped to req.tenantId — the
// exact same tenant_id-guarded UPDATE pattern as PUT /api/products/:id and /api/categories/:id
// above. Plans are held in-memory (never persisted) and are single-use + tenant-locked.
const aiPlanCache = new Map(); // planId -> { tenantId, actions, createdAt }
const AI_PLAN_TTL_MS = 10 * 60 * 1000;
const AI_FIELD_WHITELIST = {
  products: ['name_tr', 'name_en', 'description_tr', 'description_en', 'price', 'category'],
  categories: ['name_tr', 'name_en']
};

const DEFAULT_AI_MODEL = 'llama-3.3-70b-versatile';

// A value saved before the Phase 38 Groq swap ("gemini-...") is not a valid Groq model — treat it
// as unset so old installs fall through to the new default instead of sending a doomed request.
function cleanAiModel(m) { return (m && !/^gemini/i.test(m)) ? m : ''; }

async function getAiConfig() {
  const row = await db.get(isPg ? 'SELECT settings FROM platform_settings WHERE id = $1' : 'SELECT settings FROM platform_settings WHERE id = ?', ['platform']);
  let s = {}; try { s = JSON.parse((row && row.settings) || '{}') || {}; } catch (e) {}
  return { ai_enabled: !!s.ai_enabled, ai_model: cleanAiModel(s.ai_model) || DEFAULT_AI_MODEL, ai_key: s.ai_key || '' };
}

// Groq's chat completions endpoint is OpenAI-compatible: Bearer auth, messages array,
// response_format:{type:"json_object"} for JSON mode. The generated text lives at
// choices[0].message.content (a string) — parsed the same way the old Gemini path did.
async function callAiJSON(key, model, systemPrompt, userMessage) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    response_format: { type: 'json_object' }
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || ('http_' + r.status));
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('empty_response');
  return JSON.parse(text);
}

// POST /api/admin/ai-assistant/plan — { message } -> { planId, summary, actions, unsupported }
// Reads ONLY this tenant's own products/categories; proposes field-level changes; nothing is written.
app.post('/api/admin/ai-assistant/plan', adminAuth, async (req, res) => {
  try {
    const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'message_required' });

    const cfg = await getAiConfig();
    if (!cfg.ai_enabled || !cfg.ai_key) return res.status(400).json({ error: 'ai_not_configured' });

    const products = await db.all(
      isPg ? 'SELECT id, name_tr, name_en, description_tr, description_en, category, price FROM products WHERE tenant_id = $1'
           : 'SELECT id, name_tr, name_en, description_tr, description_en, category, price FROM products WHERE tenant_id = ?',
      [req.tenantId]
    );
    const categories = await db.all(
      isPg ? 'SELECT id, name_tr, name_en FROM categories WHERE tenant_id = $1' : 'SELECT id, name_tr, name_en FROM categories WHERE tenant_id = ?',
      [req.tenantId]
    );

    const systemPrompt = `Sen bir restoran yönetim panelinin asistanısın. Sana restoranın ürün ve kategori
verisi JSON olarak verilecek. Kullanıcının isteğini SADECE aşağıdaki JSON şemasıyla, SADECE verilen
id'leri kullanarak yanıtla. Hesaplama gerekiyorsa (yüzde artış, büyük harf, metin değişimi, çeviri vb.)
SONUCU SEN HESAPLA ve newValue alanına nihai değeri yaz — asla formül yazma.
Şema: {"summary": string, "actions": [{"type": string, "table": "products"|"categories",
"targetId": string, "field": string, "newValue": string}], "unsupported": [string]}
İzin verilen alanlar — products: name_tr, name_en, description_tr, description_en, price, category.
categories: name_tr, name_en. Sistemde OLMAYAN bir şey istenirse (örn. açılış saati, telefon numarası,
adres) onu "unsupported" listesine kısa bir açıklamayla ekle, ASLA action üretme. Fiyat (price) her
zaman sayı olarak string'e çevrilip yazılmalı (örn. "112.5").
Ürünler: ${JSON.stringify(products)}
Kategoriler: ${JSON.stringify(categories)}`;

    let plan;
    try {
      plan = await callAiJSON(cfg.ai_key, cfg.ai_model, systemPrompt, message);
    } catch (e) {
      return res.json({ planId: null, summary: '', actions: [], unsupported: [], error: e.message });
    }

    const productsById = Object.fromEntries(products.map(p => [p.id, p]));
    const categoriesById = Object.fromEntries(categories.map(c => [c.id, c]));
    const unsupported = Array.isArray(plan.unsupported) ? plan.unsupported.slice(0, 20) : [];
    const actions = [];
    for (const a of (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 50)) {
      const table = a.table === 'categories' ? 'categories' : (a.table === 'products' ? 'products' : null);
      if (!table || !AI_FIELD_WHITELIST[table].includes(a.field)) { unsupported.push(`Desteklenmeyen alan: ${a.field}`); continue; }
      const row = table === 'products' ? productsById[a.targetId] : categoriesById[a.targetId];
      if (!row) { unsupported.push(`Bulunamayan kayıt: ${a.targetId}`); continue; }
      actions.push({ type: String(a.type || 'update').slice(0, 40), table, targetId: a.targetId, field: a.field, oldValue: row[a.field], newValue: String(a.newValue ?? '').slice(0, 2000) });
    }

    if (!actions.length) return res.json({ planId: null, summary: plan.summary || '', actions: [], unsupported });

    const planId = 'aip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    aiPlanCache.set(planId, { tenantId: req.tenantId, actions, createdAt: Date.now() });
    res.json({ planId, summary: plan.summary || '', actions, unsupported });
  } catch (err) {
    console.error('[API ERROR] POST /api/admin/ai-assistant/plan:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/ai-assistant/execute — { planId } -> applies a previously-returned plan.
// Tenant isolation: a plan cached under tenant A is rejected outright for tenant B.
app.post('/api/admin/ai-assistant/execute', adminAuth, async (req, res) => {
  try {
    const planId = req.body && req.body.planId;
    const cached = planId && aiPlanCache.get(planId);
    if (!cached || cached.tenantId !== req.tenantId) return res.status(404).json({ error: 'plan_not_found' });
    aiPlanCache.delete(planId);
    if (Date.now() - cached.createdAt > AI_PLAN_TTL_MS) return res.status(410).json({ error: 'plan_expired' });

    const applied = [];
    for (const a of cached.actions) {
      // Re-verify the target still belongs to this tenant immediately before writing.
      const exists = await db.get(
        isPg ? `SELECT id FROM ${a.table} WHERE id = $1 AND tenant_id = $2` : `SELECT id FROM ${a.table} WHERE id = ? AND tenant_id = ?`,
        [a.targetId, req.tenantId]
      );
      if (!exists) continue;
      await db.run(
        isPg ? `UPDATE ${a.table} SET ${a.field} = $1 WHERE id = $2 AND tenant_id = $3` : `UPDATE ${a.table} SET ${a.field} = ? WHERE id = ? AND tenant_id = ?`,
        [a.newValue, a.targetId, req.tenantId]
      );
      applied.push(a);
    }

    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'ai_assistant_applied', target: `${applied.length} field(s)`, details: applied.map(a => `${a.table}.${a.field}`).join(','), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, applied, summary: `${applied.length} değişiklik uygulandı.` });
  } catch (err) {
    console.error('[API ERROR] POST /api/admin/ai-assistant/execute:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Widget Management (Phase 28) — tenant self-service on/off, root also controls these ----------
// Narrow by design: this endpoint ONLY ever touches settings.widgets, never branding/SEO/contact
// fields (those remain root-only), preserving the existing "no tenant self-service branding" boundary.
const WIDGET_KEYS = ['whatsapp', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'website', 'maps'];
app.put('/api/admin/site-widgets', adminAuth, async (req, res) => {
  try {
    const widgets = req.body && req.body.widgets;
    if (!widgets || typeof widgets !== 'object') return res.status(400).json({ error: 'widgets_required' });
    const row = await db.get(
      isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?',
      [req.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'tenant_not_found' });
    let settings = {}; try { settings = JSON.parse(row.settings || '{}') || {}; } catch (e) {}
    settings.widgets = { ...(settings.widgets || {}) };
    for (const key of WIDGET_KEYS) {
      if (Object.prototype.hasOwnProperty.call(widgets, key)) settings.widgets[key] = !!widgets[key];
    }
    await db.run(
      isPg ? 'UPDATE tenants SET settings = $1, updated_at = $2 WHERE id = $3' : 'UPDATE tenants SET settings = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(settings), Date.now(), req.tenantId]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'widgets_updated', target: req.tenantId, details: JSON.stringify(settings.widgets), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, widgets: settings.widgets });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/site-widgets:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- QR Designer (Phase 29) — tenant self-service QR appearance ----------
// Narrow by design, same shape as PUT /api/admin/site-widgets: only ever touches settings.qr_style.
const HEX_COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const ECC_LEVELS = ['L', 'M', 'Q', 'H'];
function normalizeHexColor(v) {
  const hex = String(v).trim();
  return hex.length === 7 ? hex + 'ff' : hex.toLowerCase();
}
app.put('/api/admin/qr-style', adminAuth, async (req, res) => {
  try {
    const body = (req.body && req.body.qr_style) || {};
    const patch = {};
    if (body.fg !== undefined) {
      if (!HEX_COLOR_RE.test(String(body.fg))) return res.status(400).json({ error: 'invalid_fg' });
      patch.fg = normalizeHexColor(body.fg);
    }
    if (body.bg !== undefined) {
      if (!HEX_COLOR_RE.test(String(body.bg))) return res.status(400).json({ error: 'invalid_bg' });
      patch.bg = normalizeHexColor(body.bg);
    }
    if (body.margin !== undefined) {
      const m = Number(body.margin);
      if (!Number.isInteger(m) || m < 0 || m > 10) return res.status(400).json({ error: 'invalid_margin' });
      patch.margin = m;
    }
    if (body.ecc !== undefined) {
      const e = String(body.ecc).toUpperCase();
      if (!ECC_LEVELS.includes(e)) return res.status(400).json({ error: 'invalid_ecc' });
      patch.ecc = e;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'qr_style_required' });

    const row = await db.get(
      isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?',
      [req.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'tenant_not_found' });
    let settings = {}; try { settings = JSON.parse(row.settings || '{}') || {}; } catch (e) {}
    settings.qr_style = { ...(settings.qr_style || {}), ...patch };
    await db.run(
      isPg ? 'UPDATE tenants SET settings = $1, updated_at = $2 WHERE id = $3' : 'UPDATE tenants SET settings = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(settings), Date.now(), req.tenantId]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'qr_style_updated', target: req.tenantId, details: JSON.stringify(settings.qr_style), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, qr_style: settings.qr_style });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/qr-style:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Website Editor (Phase 35) — hero images + plain-text hero title/subtitle ----------
// Same narrow shape as site-widgets/qr-style: reads settings, merges ONLY these keys, writes back.
// Images: same-origin paths only (what /api/admin/upload-image or the shipped defaults produce) —
// this endpoint never stores an arbitrary external URL. Text: HTML-stripped server-side so "the
// admin panel always saves clean plain text" holds even if something pastes formatted text in;
// the actual <br><em> formatting is generated at RENDER time in index.html (formatHeroTitle),
// never stored. Root's existing raw-HTML-capable branding endpoint (routes/root.js) is untouched.
const HERO_TEXT_KEYS = ['hero_title_tr', 'hero_title_en', 'hero_sub_tr', 'hero_sub_en'];
const MAX_HERO_IMAGES = 10;
function stripHtmlTags(v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim(); }
app.put('/api/admin/website-content', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.hero_images !== undefined) {
      if (!Array.isArray(body.hero_images)) return res.status(400).json({ error: 'invalid_hero_images' });
      if (body.hero_images.length > MAX_HERO_IMAGES) return res.status(400).json({ error: 'too_many_hero_images' });
      const images = [];
      for (const url of body.hero_images) {
        if (typeof url !== 'string' || !(url.startsWith('/uploads/') || url.startsWith('/icons/'))) {
          return res.status(400).json({ error: 'invalid_hero_image_url' });
        }
        images.push(url);
      }
      patch.hero_images = images;
    }
    for (const key of HERO_TEXT_KEYS) {
      if (body[key] !== undefined) patch[key] = stripHtmlTags(body[key]).slice(0, 200);
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'no_changes' });

    const row = await db.get(
      isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?',
      [req.tenantId]
    );
    if (!row) return res.status(404).json({ error: 'tenant_not_found' });
    let settings = {}; try { settings = JSON.parse(row.settings || '{}') || {}; } catch (e) {}
    Object.assign(settings, patch);
    await db.run(
      isPg ? 'UPDATE tenants SET settings = $1, updated_at = $2 WHERE id = $3' : 'UPDATE tenants SET settings = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(settings), Date.now(), req.tenantId]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'website_content_updated', target: req.tenantId, details: Object.keys(patch).join(','), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, ...patch });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/website-content:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Tenant self-service: Restoran Bilgileri (Phase C) ----------
// Mirrors Root's PUT /api/root/tenants/:id, but scoped to req.tenantId (never a client-supplied
// id) — a tenant admin can only ever edit their own restaurant's basic info.
app.put('/api/admin/restaurant-info', adminAuth, async (req, res) => {
  try {
    const t = await db.get(isPg ? 'SELECT * FROM tenants WHERE id = $1' : 'SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const b = req.body || {};
    if (b.contact_email !== undefined && b.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.contact_email).trim())) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    const newPhone = String(b.contact_phone ?? t.contact_phone ?? '').trim();
    const newEmail = String(b.contact_email ?? t.contact_email ?? '').trim();
    const newAddr = String(b.address ?? t.address ?? '').trim();
    // The branding endpoint keeps these SAME column values in sync FROM settings on every save
    // (matching Root's own two-modal design) — if we only wrote the columns here, an unrelated
    // branding save made afterward would silently revert this change back to whatever was still
    // cached in settings. Write both in the same request so neither endpoint can undo the other.
    let settings = {}; try { settings = JSON.parse(t.settings || '{}') || {}; } catch (e) {}
    settings.contact_phone = newPhone;
    settings.contact_email = newEmail;
    settings.address = newAddr;
    await db.run(
      isPg
        ? 'UPDATE tenants SET name = $1, display_name = $2, contact_phone = $3, contact_email = $4, address = $5, settings = $6, updated_at = $7 WHERE id = $8'
        : 'UPDATE tenants SET name = ?, display_name = ?, contact_phone = ?, contact_email = ?, address = ?, settings = ?, updated_at = ? WHERE id = ?',
      [
        String(b.name ?? t.name).trim() || t.name,
        String(b.display_name ?? t.display_name ?? '').trim() || t.display_name,
        newPhone, newEmail, newAddr,
        JSON.stringify(settings),
        Date.now(), req.tenantId
      ]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'restaurant_info_updated', target: req.tenantId, details: Object.keys(b).join(','), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    const updated = await db.get(isPg ? 'SELECT * FROM tenants WHERE id = $1' : 'SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    res.json({ ...updated, settings });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/restaurant-info:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Tenant self-service: Marka & Site (Phase C) ----------
// Mirrors Root's PUT /api/root/tenants/:id/branding field-for-field (same ALLOWED list, same URL/
// email validation) but scoped to req.tenantId. Widgets are deliberately EXCLUDED here — they
// already have their own dedicated screen (PUT /api/admin/site-widgets); merging the same JSON key
// from two different screens risks showing stale/conflicting state.
// Deliberate deviation from Root's own endpoint: every field is HTML-stripped before storing.
// Root's raw-HTML-capable path is fine for a trusted platform owner; this is a self-service
// endpoint with a much wider surface, so the safer default applies here.
const ADMIN_BRANDING_ALLOWED = ['logo_url', 'favicon_url', 'company_name', 'hero_title_tr', 'hero_title_en',
  'hero_sub_tr', 'hero_sub_en', 'banner_text_tr', 'banner_text_en', 'footer_text',
  'seo_title', 'seo_description', 'theme',
  'seo_keywords', 'og_image', 'seo_robots', 'seo_canonical',
  'contact_phone', 'whatsapp', 'contact_email', 'address', 'maps_embed', 'maps_link', 'website',
  'instagram', 'facebook', 'twitter', 'tiktok', 'youtube'];
const ADMIN_BRANDING_URL_FIELDS = ['maps_link', 'maps_embed', 'website', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'seo_canonical'];
function isBlankOrUrl(v) { return !v || /^https?:\/\/.+/i.test(v); }
function isBlankOrEmail(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
app.put('/api/admin/branding', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    for (const key of ADMIN_BRANDING_URL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, key) && !isBlankOrUrl(stripHtmlTags(body[key]))) {
        return res.status(400).json({ error: `Invalid URL for "${key}" — must start with http:// or https://` });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'contact_email') && !isBlankOrEmail(stripHtmlTags(body.contact_email))) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const row = await db.get(isPg ? 'SELECT * FROM tenants WHERE id = $1' : 'SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'tenant_not_found' });
    let settings = {}; try { settings = JSON.parse(row.settings || '{}') || {}; } catch (e) {}
    const changed = [];
    for (const key of ADMIN_BRANDING_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        settings[key] = stripHtmlTags(body[key]);
        changed.push(key);
      }
    }
    if (!changed.length) return res.status(400).json({ error: 'no_changes' });

    // Keep the legacy tenant columns in sync, same as Root's own endpoint.
    const phone = settings.contact_phone !== undefined ? settings.contact_phone : row.contact_phone;
    const email = settings.contact_email !== undefined ? settings.contact_email : row.contact_email;
    const addr  = settings.address       !== undefined ? settings.address       : row.address;
    await db.run(
      isPg
        ? 'UPDATE tenants SET settings = $1, contact_phone = $2, contact_email = $3, address = $4, updated_at = $5 WHERE id = $6'
        : 'UPDATE tenants SET settings = ?, contact_phone = ?, contact_email = ?, address = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(settings), phone, email, addr, Date.now(), req.tenantId]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'branding_self_updated', target: req.tenantId, details: changed.join(','), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, settings });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/branding:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Tenant self-service: Tehlikeli Bölge (Phase D) ----------
// "Geçici Kapat" — deliberately a NEW, separate flag (settings.self_paused) from Root's
// tenants.status='disabled'. That field blocks the tenant's OWN login too (see resolveTenant,
// lib/tenant.js) — Root confirmed the tenant admin should be able to reopen themselves without
// contacting Root, so this can never touch tenants.status. Enforced only in the actual
// order/reservation-creating routes (POST /api/orders, POST /api/reservations), not in shared
// middleware — admin login and every /api/admin|root/* route are completely unaffected.
app.put('/api/admin/self-pause', adminAuth, async (req, res) => {
  try {
    const paused = !!(req.body && req.body.paused);
    const row = await db.get(isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?', [req.tenantId]);
    if (!row) return res.status(404).json({ error: 'tenant_not_found' });
    let settings = {}; try { settings = JSON.parse(row.settings || '{}') || {}; } catch (e) {}
    settings.self_paused = paused;
    await db.run(
      isPg ? 'UPDATE tenants SET settings = $1, updated_at = $2 WHERE id = $3' : 'UPDATE tenants SET settings = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(settings), Date.now(), req.tenantId]
    );
    invalidateTenantCache(req.tenantId);
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: paused ? 'tenant_self_paused' : 'tenant_self_resumed', target: req.tenantId, ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, self_paused: paused });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/self-pause:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/self — irreversible, scoped strictly to req.tenantId (never a client-supplied
// id, unlike Root's :id-based DELETE — a tenant admin can only ever delete their OWN restaurant).
// Blocks tenant 'default' (the platform's own seed/demo tenant — RESERVED_SLUGS already prevents
// any real signup from ever owning this id, so the guard only ever protects platform seed data).
app.delete('/api/admin/self', adminAuth, async (req, res) => {
  try {
    if (req.tenantId === 'default') return res.status(400).json({ error: 'default_tenant_protected' });
    const t = await db.get(isPg ? 'SELECT id FROM tenants WHERE id = $1' : 'SELECT id FROM tenants WHERE id = ?', [req.tenantId]);
    if (!t) return res.status(404).json({ error: 'tenant_not_found' });
    const tenantId = req.tenantId;
    await deleteTenantData(tenantId);
    await db.run(isPg ? 'DELETE FROM tenants WHERE id = $1' : 'DELETE FROM tenants WHERE id = ?', [tenantId]);
    invalidateTenantCache(tenantId);
    logActivity({ tenantId: '', actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'tenant_self_deleted', target: tenantId, ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true });
  } catch (err) {
    console.error('[API ERROR] DELETE /api/admin/self:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/upload-image', adminAuth, rateLimiter(30), async (req, res) => {
  try {
    const image = req.body && req.body.image;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Valid image data is required' });
    }
    const matches = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image data format' });
    let ext = matches[1].toLowerCase().replace('svg+xml', 'svg').replace('jpeg', 'jpg');
    const allowed = ['png', 'jpg', 'webp', 'svg', 'gif'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported format. Use PNG, JPG, WEBP, GIF or SVG.' });
    }
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image exceeds 5MB' });

    const uploadsDir = path.join(rootDir, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const tid = (req.tenantId || 'default').replace(/[^a-z0-9_-]/gi, '');
    const filename = `${tid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    // Same-origin relative URL so it works across custom domains/subdomains without hardcoding host.
    res.json({ success: true, url: `/uploads/${filename}` });
  } catch (err) {
    console.error('[API ERROR] POST /api/admin/upload-image:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/click (Track clicks)
app.post('/api/notifications/click', rateLimiter(100), async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Notification ID is required' });
    
    const updateSql = isPg
      ? 'UPDATE notifications SET click_count = click_count + 1 WHERE id = $1'
      : 'UPDATE notifications SET click_count = click_count + 1 WHERE id = ?';
    
    await db.run(updateSql, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[API ERROR] POST /api/notifications/click:', err);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// RETRO COMPATIBILITY FOR PREVIOUS SAVE API
// ==========================================
app.post('/api/save-menu', (req, res) => {
  try {
    console.log('[SERVER API] Retro-compatibility endpoint /api/save-menu invoked.');
    res.json({ success: true, message: 'Deprecated. Database is now individual REST API.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// STATIC FRONTEND SERVING (for local dev)
// ==========================================
const rootDir = path.join(__dirname, '..');

// SECURITY: never serve private folders/files over HTTP.
// data/ contains VAPID private keys, the auth secret and root credentials;
// backend/ contains the server source and the SQLite database.
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p.startsWith('/data/') || p.startsWith('/backend/') || p.startsWith('/logs/') ||
    p.startsWith('/scratch/') || p.startsWith('/backup_before_push_notifications/') ||
    p.startsWith('/kaynaklar/') || p.startsWith('/.') ||
    p.endsWith('.db') || p.endsWith('.bat') || p.endsWith('.py') || p.endsWith('.yaml')
  ) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// Phase 31/36: "/" is host-aware, not tenant-aware. A real tenant subdomain (restaurant1.hasaca.com,
// restaurant1.localhost:17888), or an explicit ?tenant=/x-tenant-id, still resolves to that tenant's
// own site here, unchanged — resolveTenant() (mounted globally, runs before this handler) already
// read all of that and set req.tenantId accordingly. Only the genuine "nothing was specified at all"
// case changes: it used to silently render a real tenant's site (whichever one happened to own the
// host-fallback id); it now renders the HASACA landing page instead. req.tenantId === null is the
// single source of truth for that case — resolveTenant() only ever sets it to null when no tenant was
// specified by any means, so this replaces the old duplicate, dev-only-gated host re-derivation.
app.get('/', (req, res) => {
  if (req.tenantId === null) return res.sendFile(path.join(rootDir, 'landing.html'));
  res.sendFile(path.join(rootDir, 'index.html'));
});

// Phase 36: no tenant specified at all (bare host, no ?tenant=/x-tenant-id) must not silently expose
// any real restaurant's admin panel — show "no restaurant" instead. An explicit ?tenant=<slug>
// (including ?tenant=default) still works normally; only the implicit fallback is gone.
app.get(['/admin.html', '/admin'], (req, res) => {
  if (req.tenantId === null) {
    return res.status(404).send(errorPageHtml(
      'Restoran Bulunamadı', 'Restaurant Not Found',
      'Bu adres belirli bir restorana ait değil. Yönetim paneline erişmek için restoranınızın bağlantısını kullanın.',
      'This address is not tied to a specific restaurant. Use your restaurant\'s own link to reach the admin panel.'
    ));
  }
  res.sendFile(path.join(rootDir, 'admin.html'));
});

// HASACA public marketing landing page (platform site — distinct from a tenant's own restaurant site).
app.get(['/landing', '/hasaca'], (req, res) => {
  res.sendFile(path.join(rootDir, 'landing.html'));
});

// Path-based way to reach a specific tenant's site without needing subdomain DNS (local dev / internal
// preview). Redirects into the existing, already-working dev-only ?tenant= query override (lib/
// tenant.js resolveTenant + the __devTenant fetch interceptor already in index.html/admin.html) —
// no new tenant-resolution logic. Scoped the same as that override: local dev only.
app.get('/tenant/:slug', (req, res) => {
  res.redirect('/?tenant=' + encodeURIComponent(req.params.slug));
});

// ── HASACA marketing sub-pages (Phase 23) ──
// One shared shell (marketing.html) renders every page from marketing-data.js.
// Meta is injected server-side per slug so each URL is genuinely crawlable.
const MARKETING = require('../marketing-data.js');
const MARKETING_SLUGS = Object.keys(MARKETING.pages);
let marketingShell = null;
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get(MARKETING_SLUGS.map((s) => '/' + s), (req, res) => {
  try {
    if (!marketingShell || process.env.NODE_ENV !== 'production') {
      marketingShell = fs.readFileSync(path.join(rootDir, 'marketing.html'), 'utf8');
    }
    const slug = req.path.replace(/^\/+|\/+$/g, '');
    const page = MARKETING.pages[slug];
    if (!page) return res.status(404).sendFile(path.join(rootDir, 'marketing.html'));
    const title = page.title[0] + ' — HASACA';
    const desc = page.desc[0];
    const url = baseUrl(req) + '/' + slug;
    const head = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(desc)}">`,
      `<link rel="canonical" href="${esc(url)}">`,
      `<meta name="robots" content="index,follow">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="HASACA">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="/icons/placeholder-logo.svg">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="theme-color" content="#0a0a0b">`
    ].join('\n');
    res.type('html').send(marketingShell.replace('<!--HEAD-->', head));
  } catch (err) {
    console.error('[MARKETING] render:', err);
    res.status(500).send('Sayfa yüklenemedi.');
  }
});

// Auth entry points — one login page, tenant + root tabs. Auth logic itself is unchanged.
app.get(['/login', '/giris', '/yonetici-girisi', '/restoran-girisi', '/root-girisi'], (req, res) => {
  res.sendFile(path.join(rootDir, 'login.html'));
});

// ── Dynamic, per-tenant SEO: robots.txt + sitemap.xml (host-derived, no hardcoded domain) ──
// Defined BEFORE express.static so they take precedence over any static files.
function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto}://${req.headers.host}`;
}
app.get('/robots.txt', (req, res) => {
  let seoRobots = 'index';
  try { seoRobots = (JSON.parse((req.tenant && req.tenant.settings) || '{}').seo_robots) || 'index'; } catch (e) {}
  const rule = seoRobots === 'noindex' ? 'Disallow: /' : 'Allow: /';
  res.type('text/plain').send(`User-agent: *\n${rule}\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const url = baseUrl(req) + '/';
  let lastmod = new Date().toISOString().slice(0, 10);
  try { const u = req.tenant && req.tenant.updated_at; if (u) lastmod = new Date(Number(u)).toISOString().slice(0, 10); } catch (e) {}
  // Tenant homepage + every HASACA marketing page (all host-derived, no hardcoded domain).
  const entries = [`  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`];
  entries.push(`  <url>\n    <loc>${baseUrl(req)}/landing</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`);
  for (const slug of MARKETING_SLUGS) {
    entries.push(`  <url>\n    <loc>${baseUrl(req)}/${slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
  );
});

app.use(express.static(rootDir));

// Phase 36: same rule as bare '/' and '/admin' — an unmatched path with no tenant specified must
// not silently render any real restaurant's site. (The exact bare '/' path is handled separately,
// above, and shows the HASACA landing page for this same no-tenant case — this catch-all covers
// every other unmatched path, where landing.html would not make sense.)
app.get('*', (req, res) => {
  if (req.tenantId === null) {
    return res.status(404).send(errorPageHtml(
      'Restoran Bulunamadı', 'Restaurant Not Found',
      'Bu adres belirli bir restorana ait değil.',
      'This address is not tied to a specific restaurant.'
    ));
  }
  res.sendFile(path.join(rootDir, 'index.html'));
});


// ==========================================
// STARTUP: Init DB then start server
// ==========================================
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(` HASACA Platform Server is running!`);
    console.log(` Port: ${PORT}`);
    console.log(` Local:  http://localhost:${PORT}`);
    console.log(` Mode:   ${process.env.DATABASE_URL ? 'PRODUCTION (PostgreSQL)' : 'DEVELOPMENT (SQLite)'}`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('[FATAL] Failed to initialize database:', err);
  process.exit(1);
});
