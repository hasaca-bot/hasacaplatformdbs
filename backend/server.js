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
// Built once at startup, not per-request — verifyIdToken() caches Google's public certs on the
// instance itself, so a fresh instance per call (the original approach) meant that cache never
// actually helped across requests. GOOGLE_CLIENT_ID may be unset at boot (feature disabled); the
// route below already checks for that before ever calling verifyIdToken().
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || undefined);
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
  'https://hasaca-api.onrender.com',
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

// Menu-content languages beyond tr/en (see backend/db.js for the matching schema migration).
// Products get all 4 field types per language; categories (no description field at all, even
// for tr/en) get only name. Every CRUD path below derives its column lists from these arrays
// instead of hand-typing the same 30 field names in multiple places — a single missed spot
// would be a silent data-loss bug, not a crash.
const CONTENT_LANGS = ['zh', 'ja', 'de', 'fr', 'es', 'ko'];
const PRODUCT_LANG_FIELD_TYPES = ['name', 'description', 'portion', 'ingredients'];
const CATEGORY_LANG_FIELD_TYPES = ['name'];
const PRODUCT_LANG_COLUMNS = CONTENT_LANGS.flatMap(lang => PRODUCT_LANG_FIELD_TYPES.map(f => `${f}_${lang}`));
const CATEGORY_LANG_COLUMNS = CONTENT_LANGS.flatMap(lang => CATEGORY_LANG_FIELD_TYPES.map(f => `${f}_${lang}`));

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

  const mapped = {
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
  // zh/ja/de/fr/es/ko name/description/portion/ingredients — raw pass-through, same as name_en etc.
  for (const col of PRODUCT_LANG_COLUMNS) mapped[col] = row[col];
  return mapped;
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

// Shared insert used by BOTH the real REST endpoint below AND the AI assistant's "create product"
// action (POST /api/admin/ai-assistant/execute) — one tested INSERT shape, not two.
async function createProductRow(tenantId, body) {
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

  // zh/ja/de/fr/es/ko: left empty when not supplied — deliberately NOT falling back to the
  // Turkish value (unlike name_en/description_en above), so the AI's bulk-translate feature can
  // tell "not yet translated" apart from "translated, and happens to match the Turkish text".
  const langValues = PRODUCT_LANG_COLUMNS.map(col => body[col] || '');

  const baseColumns = ['id', 'tenant_id', 'name_tr', 'name_en', 'description_tr', 'description_en', 'category', 'price', 'image',
    'portion_tr', 'portion_en', 'ingredients_tr', 'ingredients_en', 'calories', 'protein', 'carbs', 'fat',
    'saturated_fat', 'sugars', 'fiber', 'salt', 'allergens', 'katki_maddesi_icermez'];
  const allColumns = [...baseColumns, ...PRODUCT_LANG_COLUMNS];
  const paramValues = [id, tenantId, name_tr, name_en, description_tr, description_en, category, price, image,
    portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
    saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, ...langValues];

  const placeholders = isPg ? allColumns.map((_, i) => `$${i + 1}`).join(',') : allColumns.map(() => '?').join(',');
  await db.run(`
    INSERT INTO products (${allColumns.join(', ')}, created_at, updated_at)
    VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, paramValues);
  return id;
}

// Standalone (not shared with POST /api/categories below, which expects the CALLER to supply an
// id — a different contract) — the AI assistant always invents its own id here since the model
// only ever proposes a human-meaningless tempId, never a real one.
async function createCategoryRow(tenantId, fields) {
  const { name_tr, name_en, sort_order, icon } = fields;
  const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // zh/ja/de/fr/es/ko: left empty when not supplied, no fallback to Turkish (see createProductRow).
  const langValues = CATEGORY_LANG_COLUMNS.map(col => fields[col] || '');
  const baseColumns = ['id', 'tenant_id', 'name_tr', 'name_en', 'sort_order', 'icon'];
  const allColumns = [...baseColumns, ...CATEGORY_LANG_COLUMNS];
  const paramValues = [id, tenantId, name_tr, name_en || name_tr, sort_order || 0, icon || '', ...langValues];
  const placeholders = isPg ? allColumns.map((_, i) => `$${i + 1}`).join(',') : allColumns.map(() => '?').join(',');
  await db.run(`INSERT INTO categories (${allColumns.join(', ')}) VALUES (${placeholders})`, paramValues);
  return id;
}

// POST /api/products (Admin Only, tenant-scoped)
app.post('/api/products', adminAuth, async (req, res) => {
  try {
    const id = await createProductRow(req.tenantId, req.body);
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

    // zh/ja/de/fr/es/ko: left empty when not supplied, no fallback to Turkish (see createProductRow).
    const langValues = PRODUCT_LANG_COLUMNS.map(col => body[col] || '');
    const baseColumns = ['name_tr', 'name_en', 'description_tr', 'description_en', 'category', 'price', 'image',
      'portion_tr', 'portion_en', 'ingredients_tr', 'ingredients_en', 'calories', 'protein', 'carbs', 'fat',
      'saturated_fat', 'sugars', 'fiber', 'salt', 'allergens', 'katki_maddesi_icermez'];
    const allColumns = [...baseColumns, ...PRODUCT_LANG_COLUMNS];
    const paramValues = [name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez, ...langValues, id, req.tenantId];

    const setClause = isPg
      ? allColumns.map((col, i) => `${col}=$${i + 1}`).join(', ')
      : allColumns.map(col => `${col}=?`).join(', ');
    const whereClause = isPg ? `WHERE id=$${allColumns.length + 1} AND tenant_id=$${allColumns.length + 2}` : 'WHERE id=? AND tenant_id=?';
    const result = await db.run(`UPDATE products SET ${setClause}, updated_at=CURRENT_TIMESTAMP ${whereClause}`, paramValues);

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

    // zh/ja/de/fr/es/ko: left empty when not supplied, no fallback to Turkish (see createProductRow).
    const langValues = CATEGORY_LANG_COLUMNS.map(col => req.body[col] || '');
    const baseColumns = ['id', 'tenant_id', 'name_tr', 'name_en', 'sort_order', 'icon'];
    const allColumns = [...baseColumns, ...CATEGORY_LANG_COLUMNS];
    const paramValues = [id, req.tenantId, name_tr, name_en || name_tr, sort_order || 0, icon || '', ...langValues];
    const placeholders = isPg ? allColumns.map((_, i) => `$${i + 1}`).join(',') : allColumns.map(() => '?').join(',');
    await db.run(`INSERT INTO categories (${allColumns.join(', ')}) VALUES (${placeholders})`, paramValues);

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

    // zh/ja/de/fr/es/ko: left empty when not supplied, no fallback to Turkish (see createProductRow).
    const langValues = CATEGORY_LANG_COLUMNS.map(col => req.body[col] || '');
    const baseColumns = ['name_tr', 'name_en', 'sort_order', 'icon'];
    const allColumns = [...baseColumns, ...CATEGORY_LANG_COLUMNS];
    const paramValues = [name_tr, name_en, sort_order, icon, ...langValues, id, req.tenantId];
    const setClause = isPg
      ? allColumns.map((col, i) => `${col}=$${i + 1}`).join(', ')
      : allColumns.map(col => `${col}=?`).join(', ');
    const whereClause = isPg ? `WHERE id=$${allColumns.length + 1} AND tenant_id=$${allColumns.length + 2}` : 'WHERE id=? AND tenant_id=?';
    const result = await db.run(`UPDATE categories SET ${setClause} ${whereClause}`, paramValues);

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

// POST /api/landing/contact — public lead capture from the tada marketing landing page.
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

// Free-trial AI message allowance for self-serve (Google sign-up) tenants — see
// provisionTenantForGoogleAccount() below and the quota gate in POST /api/admin/ai-assistant/plan.
// No payment system exists yet, so this is a soft cap, not a real billing mechanism.
const AI_ONBOARDING_QUOTA_LIMIT = 30;

// POST /api/auth/google — { credential } is the Google ID token (a JWT) delivered by Google
// Identity Services' client-side button. Verified ONCE here against Google's own keys; every
// subsequent authenticated request on this platform still uses our own signToken()/verifyToken()
// HMAC session format (lib/auth.js), completely unchanged — Google's token is never stored or
// passed through as a session token.
// Auto-provisions a brand-new tenant for a Google account (same demo-content clone every tenant
// gets), linking it via adminOverride so the account can log into it with no password. Shared by
// the first-time sign-in path below and POST /api/auth/create-restaurant (an already-registered
// Google account adding a SECOND restaurant). nameOverride lets the caller supply a real name
// instead of the generic "X'in Restoranı" default (used by create-restaurant only).
async function provisionTenantForGoogleAccount(payload, clientIp, nameOverride) {
  const firstName = payload.given_name || (payload.name ? payload.name.split(' ')[0] : '');
  const displayName = nameOverride || (firstName ? `${firstName}'in Restoranı` : 'Yeni Restoran');
  const seed = nameOverride || firstName || (payload.email || '').split('@')[0];

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

  const provisioned = await createTenantWithDemoContent({
    slug, name: displayName, display_name: displayName,
    body: { contact_email: payload.email },
    adminOverride: {
      username: slug,
      password_hash: hashPassword(crypto.randomBytes(32).toString('hex')), // unusable placeholder — Google-only account
      email: payload.email, google_sub: payload.sub, avatar_url: payload.picture || '',
      display_name: payload.name || displayName
    }
  });
  // Free trial quota on the AI Assistant's Groq calls — self-serve tenants only. Root's manual
  // "create tenant" form never sets this, so those tenants have no `ai_quota` key at all and stay
  // unlimited (see the quota check in POST /api/admin/ai-assistant/plan, which treats a missing
  // key as "no limit"). Piggybacks on the existing `settings` JSON blob — no migration needed.
  const settingsWithQuota = { ...(provisioned.tenant.settings || {}), ai_quota: { limit: AI_ONBOARDING_QUOTA_LIMIT, used: 0 } };
  await db.run(
    isPg ? 'UPDATE tenants SET settings = $1 WHERE id = $2' : 'UPDATE tenants SET settings = ? WHERE id = ?',
    [JSON.stringify(settingsWithQuota), slug]
  );
  invalidateTenantCache(slug);
  logActivity({ tenantId: slug, actor: slug, role: 'tenant_admin', action: 'tenant_self_signup', target: slug, details: payload.email, ip: clientIp });
  return slug;
}

app.post('/api/auth/google', rateLimiter(15), async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'google_signin_not_configured' });
    }
    const credential = String((req.body && req.body.credential) || '');
    if (!credential) return res.status(400).json({ error: 'credential_required' });

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

    // A Google account can now be linked to more than one tenant (self-service multi-restaurant
    // ownership, one admin_users row per tenant) — look up EVERY row sharing this google_sub.
    let users = await db.all(
      isPg ? 'SELECT * FROM admin_users WHERE google_sub = $1' : 'SELECT * FROM admin_users WHERE google_sub = ?',
      [payload.sub]
    );

    let provisioned = false;
    if (!users.length) {
      // First-time Google sign-in: auto-provision a brand-new tenant, named from the person's
      // own Google account (per the platform owner's explicit choice) — no signup form.
      try {
        await provisionTenantForGoogleAccount(payload, clientIp);
        provisioned = true;
      } catch (e) {
        // Concurrent first-time sign-in (e.g. two tabs) can lose a race — re-look-up and log into
        // whichever request won, instead of surfacing a raw DB error. A losing request may leave an
        // orphaned demo tenant with no admin row; at this platform's scale that is an acceptable,
        // rare Root cleanup item, not a security issue.
        console.warn('[AUTH] Google provisioning conflict, re-checking existing account:', e.message);
      }
      users = await db.all(
        isPg ? 'SELECT * FROM admin_users WHERE google_sub = $1' : 'SELECT * FROM admin_users WHERE google_sub = ?',
        [payload.sub]
      );
      if (!users.length) return res.status(500).json({ error: 'provisioning_failed' });
    } else {
      // Returning Google user — keep their photo/name fresh across every linked tenant row.
      await db.run(
        isPg ? 'UPDATE admin_users SET last_login = $1, avatar_url = $2, display_name = $3 WHERE google_sub = $4'
             : 'UPDATE admin_users SET last_login = ?, avatar_url = ?, display_name = ? WHERE google_sub = ?',
        [Date.now(), payload.picture || users[0].avatar_url || '', payload.name || users[0].display_name, payload.sub]
      );
      users = users.map(u => ({ ...u, avatar_url: payload.picture || u.avatar_url, display_name: payload.name || u.display_name }));
    }

    if (users.length === 1) {
      const user = users[0];
      const token = signToken({ uid: user.id, tenant_id: user.tenant_id, role: user.role, username: user.username });
      logActivity({
        tenantId: user.role === 'root' ? '' : user.tenant_id, actor: user.username, role: user.role,
        action: 'login_google', target: user.username, ip: clientIp
      });
      return res.json({
        token, role: user.role, tenant_id: user.tenant_id, username: user.username,
        display_name: payload.name || user.display_name || user.username, provisioned
      });
    }

    // Multiple tenants linked to this Google account — issue an identity-only token (no tenant_id,
    // can't call any tenant-scoped API) and let the client show a restaurant picker. It's exchanged
    // for a normal per-tenant session token via POST /api/auth/select-tenant once a choice is made.
    const identityToken = signToken({ google_sub: payload.sub, email: payload.email, kind: 'identity' });
    logActivity({ tenantId: '', actor: payload.email, role: 'tenant_admin', action: 'login_google_multi', target: payload.email, ip: clientIp });
    res.json({ multi: true, identityToken, display_name: payload.name || '', provisioned });
  } catch (err) {
    console.error('[API ERROR] POST /api/auth/google:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/select-tenant — exchanges an identity-only token (from a multi-restaurant Google
// account) for a normal per-tenant session token, once the "Restoranlarım" hub picker has a choice.
app.post('/api/auth/select-tenant', rateLimiter(30), async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const idPayload = verifyToken(idToken);
    if (!idPayload || idPayload.kind !== 'identity' || !idPayload.google_sub) {
      return res.status(401).json({ error: 'invalid_identity_token' });
    }
    const tenantId = String((req.body && req.body.tenant_id) || '');
    if (!tenantId) return res.status(400).json({ error: 'tenant_id_required' });

    const user = await db.get(
      isPg ? 'SELECT * FROM admin_users WHERE google_sub = $1 AND tenant_id = $2' : 'SELECT * FROM admin_users WHERE google_sub = ? AND tenant_id = ?',
      [idPayload.google_sub, tenantId]
    );
    if (!user) return res.status(403).json({ error: 'not_your_restaurant' });

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const token = signToken({ uid: user.id, tenant_id: user.tenant_id, role: user.role, username: user.username });
    logActivity({ tenantId: user.tenant_id, actor: user.username, role: user.role, action: 'login_google_select', target: user.username, ip: clientIp });
    res.json({ token, role: user.role, tenant_id: user.tenant_id, username: user.username, display_name: user.display_name || user.username });
  } catch (err) {
    console.error('[API ERROR] POST /api/auth/select-tenant:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/my-restaurants — every tenant this Google account is linked to (accepts either the
// identity token or a normal per-tenant token, so it also works from inside an open admin panel),
// plus real aggregate totals across all of them for the hub's "toplam istatistikler" cards.
app.get('/api/auth/my-restaurants', rateLimiter(30), async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'unauthorized' });

    let googleSub = payload.google_sub || null;
    if (!googleSub && payload.uid) {
      const self = await db.get(
        isPg ? 'SELECT google_sub FROM admin_users WHERE id = $1' : 'SELECT google_sub FROM admin_users WHERE id = ?',
        [payload.uid]
      );
      googleSub = self && self.google_sub;
    }
    if (!googleSub) return res.status(400).json({ error: 'no_google_account' });

    const rows = await db.all(
      isPg
        ? 'SELECT au.tenant_id, au.display_name AS admin_name, t.name, t.display_name, t.settings FROM admin_users au JOIN tenants t ON t.id = au.tenant_id WHERE au.google_sub = $1 ORDER BY t.created_at ASC'
        : 'SELECT au.tenant_id, au.display_name AS admin_name, t.name, t.display_name, t.settings FROM admin_users au JOIN tenants t ON t.id = au.tenant_id WHERE au.google_sub = ? ORDER BY t.created_at ASC',
      [googleSub]
    );

    const tenants = rows.map(r => {
      let logo = '';
      try { logo = (JSON.parse(r.settings || '{}') || {}).logo_url || ''; } catch (e) {}
      return { id: r.tenant_id, name: r.name, display_name: r.display_name, logo_url: logo };
    });

    const ids = tenants.map(t => t.id);
    let orders = 0, revenue = 0;
    // Per-tenant chart data for the hub's own restaurant cards (Phase 50 follow-up) — same
    // day-bucketed shape buildOrdersAnalytics() already produces for the single-tenant dashboard
    // chart, just computed once per linked tenant instead of once for req.tenantId.
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = Date.now() - days * 86400000;
    const byTenant = {};
    if (ids.length) {
      const placeholders = ids.map((_, i) => (isPg ? `$${i + 1}` : '?')).join(',');
      const agg = await db.get(`SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev FROM orders WHERE tenant_id IN (${placeholders})`, ids);
      orders = Number(agg && agg.cnt) || 0;
      revenue = Number(agg && agg.rev) || 0;

      const periodOrders = await db.all(
        `SELECT tenant_id, total, created_at, order_type FROM orders WHERE tenant_id IN (${placeholders}) AND created_at >= ${isPg ? `$${ids.length + 1}` : '?'}`,
        [...ids, since]
      );
      for (const id of ids) byTenant[id] = [];
      for (const o of periodOrders) { if (byTenant[o.tenant_id]) byTenant[o.tenant_id].push(o); }
    }
    for (const t of tenants) {
      const a = buildOrdersAnalytics(byTenant[t.id] || [], days);
      t.summary = a.summary;
      t.ordersByDay = a.ordersByDay;
    }

    const latest = await db.get(
      isPg ? 'SELECT display_name FROM admin_users WHERE google_sub = $1 ORDER BY created_at DESC LIMIT 1' : 'SELECT display_name FROM admin_users WHERE google_sub = ? ORDER BY created_at DESC LIMIT 1',
      [googleSub]
    );

    res.json({
      tenants,
      totals: { restaurants: tenants.length, orders, revenue },
      display_name: (latest && latest.display_name) || '',
      days
    });
  } catch (err) {
    console.error('[API ERROR] GET /api/auth/my-restaurants:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/create-restaurant — an already-registered Google account (identity token only)
// self-provisions ANOTHER tenant, linked with a new admin_users row under the same google_sub.
app.post('/api/auth/create-restaurant', rateLimiter(5), async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const idPayload = verifyToken(idToken);
    if (!idPayload || idPayload.kind !== 'identity' || !idPayload.google_sub) {
      return res.status(401).json({ error: 'invalid_identity_token' });
    }
    const name = stripHtmlTags(String((req.body && req.body.name) || '').trim()).slice(0, 80);
    if (!name) return res.status(400).json({ error: 'name_required' });

    const existing = await db.get(
      isPg ? 'SELECT display_name, avatar_url FROM admin_users WHERE google_sub = $1 LIMIT 1' : 'SELECT display_name, avatar_url FROM admin_users WHERE google_sub = ? LIMIT 1',
      [idPayload.google_sub]
    );
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const fakePayload = {
      sub: idPayload.google_sub, email: idPayload.email, given_name: '',
      name: (existing && existing.display_name) || '', picture: (existing && existing.avatar_url) || ''
    };
    const slug = await provisionTenantForGoogleAccount(fakePayload, clientIp, name);
    res.json({ tenant_id: slug });
  } catch (err) {
    console.error('[API ERROR] POST /api/auth/create-restaurant:', err);
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

// NFC + QR masa kartı tasarımı ve fiziksel kart siparişi (tenant tarafı).
// Masaları/QR'ı yeniden üretmez — yukarıdaki masa sistemini okur.
const createCardsRouter = require('./routes/cards');
app.use('/api', createCardsRouter({ db, isPg, adminAuth, rateLimiter }));

// Customer scans a QR -> /t/<token> serves the ordering page (tenant already resolved by host/override)
app.get('/t/:token', (req, res) => {
  sendTenantIndex(req, res);
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
      platform_name: s.platform_name || 'tada',
      logo_url: s.logo_url || '/icons/placeholder-logo.svg',
      favicon_url: s.favicon_url || '/icons/favicon.svg',
      login_logo_url: s.login_logo_url || s.logo_url || '/icons/placeholder-logo.svg',
      landing_title: s.landing_title || s.platform_name || 'tada',
      landing_subtitle: s.landing_subtitle || '',
      footer_brand: s.footer_brand || s.platform_name || 'tada',
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
// Shared by GET /api/admin/analytics (one tenant, adminAuth) and GET /api/auth/my-restaurants
// (many tenants at once, hub cards) — same day-bucketed orders summary + Masa/Paket split either
// way, so the hub's per-restaurant chart is pixel-for-pixel the same data shape the existing
// dashboard chart already renders (renderDashAreaChart in admin.html is reused verbatim for both).
function buildOrdersAnalytics(orders, days) {
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
  return {
    summary: {
      orders: orders.length,
      revenue: +revenue.toFixed(2),
      avgOrderValue: orders.length ? +(revenue / orders.length).toFixed(2) : 0
    },
    typeSplit: { delivery, dinein },
    statusBreakdown: statusB,
    ordersByDay: series
  };
}

app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = Date.now() - days * 86400000;
    const orders = await db.all(
      `SELECT total, created_at, order_type, status FROM orders WHERE tenant_id = ${p(1)} AND created_at >= ${p(2)}`,
      [req.tenantId, since]
    );
    const analytics = buildOrdersAnalytics(orders, days);
    const items = await db.all(
      `SELECT product_name, SUM(quantity) q FROM order_items WHERE tenant_id = ${p(1)} GROUP BY product_name ORDER BY q DESC LIMIT 8`,
      [req.tenantId]
    );
    const rez = await db.get(`SELECT COUNT(*) c FROM reservations WHERE tenant_id = ${p(1)}`, [req.tenantId]);
    res.json({
      days,
      summary: { ...analytics.summary, reservations: rez ? Number(Object.values(rez)[0]) : 0 },
      typeSplit: analytics.typeSplit,
      statusBreakdown: analytics.statusBreakdown,
      ordersByDay: analytics.ordersByDay,
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
// Note: portion_tr/en and ingredients_tr/en are NOT whitelisted (the AI has never been able to
// touch those, even before the 6-language expansion below) — only the 6 new languages' versions
// of those fields are added here, deliberately not retroactively expanding tr/en capability.
const AI_FIELD_WHITELIST = {
  products: ['name_tr', 'name_en', 'description_tr', 'description_en', 'price', 'category', ...PRODUCT_LANG_COLUMNS],
  categories: ['name_tr', 'name_en', ...CATEGORY_LANG_COLUMNS]
};

// AI asistanının düzenleyebileceği RESTORAN AYARLARI (tenants.settings JSON'unda saklanır) —
// yalnızca güvenli metin alanları + tema. Bilerek DIŞARIDA bırakılanlar: logo/favicon (dosya
// yükleme gerekir), sosyal/URL alanları (AI'ın URL uydurması riskli), ve hiçbir güvenlik/ödeme/
// müşteri/API alanı yok. Küçük veri seti olduğundan prompt'a kompakt biçimde her mesajda eklenir
// (TPM maliyeti minimal). Mevcut ADMIN_BRANDING_ALLOWED altyapısıyla aynı depolamayı kullanır.
const AI_SETTING_WHITELIST = ['company_name', 'contact_phone', 'contact_email', 'address', 'whatsapp',
  'hero_title_tr', 'hero_title_en', 'hero_sub_tr', 'hero_sub_en',
  'banner_text_tr', 'banner_text_en', 'footer_text', 'theme',
  'seo_title', 'seo_description', 'seo_keywords'];
// Kullanıcı dostu Türkçe etiketler (prompt'ta AI'ya alanların ne olduğunu anlatmak için).
const AI_SETTING_LABELS = {
  company_name: 'restoran adı', contact_phone: 'telefon', contact_email: 'e-posta', address: 'adres',
  whatsapp: 'whatsapp numarası', hero_title_tr: 'ana başlık (TR)', hero_title_en: 'ana başlık (EN)',
  hero_sub_tr: 'alt başlık (TR)', hero_sub_en: 'alt başlık (EN)', banner_text_tr: 'duyuru bandı (TR)',
  banner_text_en: 'duyuru bandı (EN)', footer_text: 'alt bilgi metni',
  theme: 'site teması (değerler: dark=koyu, light=açık, bw=siyah-beyaz)',
  seo_title: 'SEO başlığı', seo_description: 'SEO açıklaması', seo_keywords: 'SEO anahtar kelimeleri' };

const DEFAULT_AI_MODEL = 'openai/gpt-oss-120b';

// Groq retired llama-3.3-70b-versatile and llama-3.1-8b-instant on 2026-08-16 — every request
// using either now 400s with "model does not exist". A value saved before that (or before the
// earlier Phase 38 Gemini->Groq swap, "gemini-...") is mapped to a live model instead of being
// sent straight to a doomed request — this fixes every existing install without a manual DB edit.
const DEPRECATED_AI_MODELS = { 'llama-3.3-70b-versatile': 'openai/gpt-oss-120b', 'llama-3.1-8b-instant': 'openai/gpt-oss-20b' };
function cleanAiModel(m) {
  if (!m) return '';
  return DEPRECATED_AI_MODELS[m] || m;
}

// Sağlayıcı, model adından belirlenir: "gemini*" → Google'ın OpenAI-uyumlu ucu (ücretsiz katmanda
// çok daha yüksek TPM, ~250K/dk); aksi halde Groq. İkisi de aynı OpenAI-uyumlu şemayı (Bearer +
// messages + response_format + max_tokens) konuştuğu için tek callAiJSON kod yolu ikisine de gider;
// yalnızca istek URL'i değişir. Anahtar da (ai_key) hangi sağlayıcı seçiliyse ona ait olmalı.
function aiIsGemini(model) { return /^gemini/i.test(String(model || '')); }
function aiChatUrl(model) {
  return aiIsGemini(model)
    ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
}
// Toleranslı JSON ayrıştırma — response_format'ı tam uygulamayan bir sağlayıcı yanıtı ```json```
// bloğu içinde veya çevresinde açıklama metniyle döndürebilir. Önce düz JSON, sonra çit-soyulmuş,
// sonra ilk {..son} bloğu denenir; hiçbiri tutmazsa 'bad_json' fırlatılır (üstte ai_error olur).
function parseAiJSON(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('bad_json');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (_) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  throw new Error('bad_json');
}

async function getAiConfig() {
  const row = await db.get(isPg ? 'SELECT settings FROM platform_settings WHERE id = $1' : 'SELECT settings FROM platform_settings WHERE id = ?', ['platform']);
  let s = {}; try { s = JSON.parse((row && row.settings) || '{}') || {}; } catch (e) {}
  return { ai_enabled: !!s.ai_enabled, ai_model: cleanAiModel(s.ai_model) || DEFAULT_AI_MODEL, ai_key: s.ai_key || '', hf_key: s.hf_key || '' };
}

// Hugging Face Inference API (text-to-image) — the AI Assistant's "generate an image" capability.
// Hugging Face retired the old api-inference.huggingface.co host in favor of a unified router
// (huggingface_hub's own JS/Python clients point here too) — the old host no longer resolves.
// Individual models on the free hf-inference provider get deprecated/swapped out over time, so this
// tries a short list in order and only surfaces an error once all of them have failed — found live
// while testing: FLUX.1-schnell came back "deprecated and no longer supported by provider
// hf-inference", so a same-provider fallback chain is worth more than hardcoding one model id.
const HF_IMAGE_MODELS = [
  'stabilityai/stable-diffusion-3-medium-diffusers',
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'stabilityai/stable-diffusion-2-1'
];
// Appended to EVERY image request regardless of what the model wrote — deterministic, not left to
// the LLM to remember every time. Positive quality descriptors (some SD pipelines ignore
// negative_prompt) + an explicit negative_prompt for pipelines that do support it.
// "text" alone in the negative prompt wasn't enough — live testing showed the model still baking
// words/labels into the image (a known diffusion-model failure mode: modern SD checkpoints render
// legible text quite readily once anything prompt-adjacent to a menu/label concept is present). Both
// a strong negative list AND a same-message positive counter-instruction ("no text ... photograph
// only") since some pipelines on the free hf-inference tier under-weight negative_prompt.
const HF_IMAGE_QUALITY_SUFFIX = ', professional white studio food photography, bright even studio lighting, sharp focus throughout, high resolution, crisp fine detail, appetizing, realistic texture, plain photograph only, no text, no writing, no words, no letters, no labels, no captions, no menu card, no signage';
const HF_IMAGE_NEGATIVE_PROMPT = 'text, words, letters, writing, typography, font, caption, label, title, menu card, signage, sign, watermark, logo, subtitle, blurry, out of focus, bokeh, shallow depth of field, plastic-looking food, fake food, deformed, mutated, disfigured, low resolution, low quality, artifacts, cartoon, illustration, painting';
async function generateImageHF(hfKey, prompt) {
  const fullPrompt = prompt + HF_IMAGE_QUALITY_SUFFIX;
  let lastErr = null;
  for (const model of HF_IMAGE_MODELS) {
    try {
      const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + hfKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: fullPrompt, parameters: { negative_prompt: HF_IMAGE_NEGATIVE_PROMPT } })
      });
      if (!r.ok) {
        let errMsg = 'http_' + r.status;
        try { const j = await r.json(); errMsg = j.error || errMsg; } catch (e) {}
        throw new Error(errMsg);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch (e) {
      lastErr = e;
      // "deprecated"/"not supported" means this model id is dead — worth trying the next one.
      // Any other error (bad key, cold-start 503, etc.) would fail identically for every model in
      // the list, so stop immediately instead of wasting time/quota on doomed retries.
      if (!/deprecated|not supported|not found/i.test(e.message)) break;
    }
  }
  throw lastErr;
}

// Persists an AI-generated image (base64 data URI) the same way POST /api/admin/upload-image does
// — a file under /uploads, referenced by URL — so it can be (a) shown in chat via a small hosted
// URL instead of a multi-hundred-KB JSON payload, and (b) later applied to a product's `image`
// column, which per that route's own convention never stores base64 directly.
function saveGeneratedImageFile(dataUri, tenantId) {
  const matches = dataUri.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) return null;
  let ext = matches[1].toLowerCase().replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  if (!['png', 'jpg', 'webp', 'gif'].includes(ext)) ext = 'jpg';
  const buffer = Buffer.from(matches[2], 'base64');
  const uploadsDir = path.join(rootDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const tid = (tenantId || 'default').replace(/[^a-z0-9_-]/gi, '');
  const filename = `${tid}-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

// Sağlayıcı (Groq) ham hata metnini/HTTP kodunu kullanıcıya GÖSTERİLMEYECEK kararlı bir koda
// çevirir — model adı, TPM sayıları, "does not exist" gibi teknik/korkutucu ayrıntılar sızmasın.
// Frontend bu kodu yerelleştirilmiş nazik metne çevirir (admin.html adminAiErrorText / root.html).
function classifyAiError(status, msg) {
  const m = String(msg || '').toLowerCase();
  if (status === 429 || /rate limit|tokens per minute|\btpm\b|too many requests|quota/.test(m)) return 'ai_rate_limited';
  if (status === 401 || status === 403 || status === 404 ||
      /does not exist|no access|invalid api key|invalid_api_key|model_not_found|model_decommissioned|unauthorized|permission|authentication/.test(m)) return 'ai_provider_error';
  if (/tim(e|ed) ?out|network|fetch failed|econn|socket|aborted|dns|getaddrinfo/.test(m)) return 'ai_timeout';
  return 'ai_error';
}

// Groq's chat completions endpoint is OpenAI-compatible: Bearer auth, messages array,
// response_format:{type:"json_object"} for JSON mode. The generated text lives at
// choices[0].message.content (a string) — parsed the same way the old Gemini path did.
// opts.maxTokens: TPM optimizasyonu — Groq TPM muhasebesinde prompt+max_tokens sayılır, bu yüzden
// rezerv isteğin gerçekten ne kadar çıktı ürettiğine göre ölçeklenir (sohbet ~1024, toplu ~4000).
// Fırlatılan Error'a .aiCode (kararlı kod) ve varsa .retryAfter iliştirilir; 429'da bir kez sınırlı
// bekleyip sessizce tekrar dener (anlık TPM tıkanması kullanıcıyı hataya düşürmeden toparlansın).
async function callAiJSON(key, model, systemPrompt, userMessage, history, opts) {
  opts = opts || {};
  const url = aiChatUrl(model);
  // Konuşma geçmişi (varsa) sistem promptu ile güncel mesaj arasına eklenir — AI önceki turları
  // hatırlasın (bağlam kopukluğu düzeltmesi). Güvenlik/TPM için: yalnızca user/assistant rolleri,
  // kısaltılmış içerik, en fazla son 6 mesaj.
  const priorMsgs = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map(m => ({ role: m.role, content: m.content.slice(0, 400) }));
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...priorMsgs,
      { role: 'user', content: userMessage }
    ],
    response_format: { type: 'json_object' },
    max_tokens: Math.max(256, Math.min(6000, opts.maxTokens || 1024))
  };
  let attempt = 0;
  while (true) {
    let r, data;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body) });
    } catch (netErr) {
      const err = new Error('network_error'); err.aiCode = 'ai_timeout'; throw err;
    }
    try { data = await r.json(); } catch (_) { data = {}; }
    if (r.ok) {
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) { const err = new Error('empty_response'); err.aiCode = 'ai_error'; throw err; }
      try { return parseAiJSON(text); }
      catch (_) { const err = new Error('bad_json'); err.aiCode = 'ai_error'; throw err; }
    }
    const rawMsg = (data.error && data.error.message) || ('http_' + r.status);
    const code = classifyAiError(r.status, rawMsg);
    const retryHdr = parseFloat(r.headers.get('retry-after'));
    const retryFromMsg = parseFloat((rawMsg.match(/try again in ([\d.]+)s/i) || [])[1]);
    // 429: anlık TPM tıkanması — bir kez, kısa ve üst-sınırlı bekleyip sessizce yeniden dene.
    if (code === 'ai_rate_limited' && attempt === 0) {
      let waitMs = (Number.isFinite(retryHdr) ? retryHdr : (Number.isFinite(retryFromMsg) ? retryFromMsg : 2)) * 1000;
      waitMs = Math.min(Math.max(waitMs, 500), 3000);
      attempt++;
      await new Promise(res => setTimeout(res, waitMs));
      continue;
    }
    // Ham metin YALNIZCA sunucu log'una (teşhis) — istemciye kararlı kod gider.
    console.error('[AI] Groq error', r.status, rawMsg);
    const err = new Error(rawMsg);
    err.aiCode = code;
    err.retryAfter = code === 'ai_rate_limited' ? (Number.isFinite(retryHdr) ? retryHdr : (Number.isFinite(retryFromMsg) ? retryFromMsg : null)) : null;
    throw err;
  }
}

// TPM optimizasyonu — isteğin niyetini mesaj metninden hafifçe tespit eder. Tek kaynak: sunucu
// (mesaj zaten buraya geliyor), frontend'e kopyalanmaz. İki karar üretir:
//  - bulk: büyük JSON çıktısı beklenir mi (toplu çeviri / menüyü baştan kur / tüm fiyatlar) →
//    max_tokens tavanı yükseltilir; aksi halde sohbet/tekil düzenleme için düşük tavan.
//  - translation: çeviri isteği mi → yalnızca bu durumda ek dil sütunları (name_de, ...) prompt'a
//    eklenir (aksi halde saf token israfı; çeviri yapmış bir tenant her mesajda 6 dili gönderiyordu).
function aiClassifyIntent(msg) {
  const m = String(msg || '').toLowerCase();
  const translation = /çevir|cevir|çeviri|ceviri|translate|translation|almanca|i̇ngilizce|ingilizce|fransızca|fransizca|ispanyolca|italyanca|japonca|korece|çince|cince|rusça|rusca|arapça|arapca|german|deutsch|french|spanish|japanese|korean|chinese/.test(m);
  const allWords = /tüm|tum|bütün|butun|hepsi|hepsini|tamamı|tamami|komple|toplu|baştan|bastan|sıfırdan|sifirdan|\ball\b|entire|whole/.test(m);
  const rebuild = /(menü|menu)[^.!?]{0,40}(kur|oluştur|olustur|yeniden|sıfırdan|sifirdan)|(kur|oluştur|olustur)[^.!?]{0,40}(menü|menu)/.test(m);
  const bulkPrice = allWords && /fiyat|price|zam|indirim|%|yüzde|yuzde/.test(m);
  const bulkCatalog = allWords && /ürün|urun|product|kategori|category|menü|menu/.test(m);
  return { bulk: translation || rebuild || bulkPrice || bulkCatalog, translation };
}

// POST /api/admin/ai-assistant/plan — { message } -> { planId, summary, actions, unsupported }
// Reads ONLY this tenant's own products/categories; proposes field-level changes; nothing is written.
app.post('/api/admin/ai-assistant/plan', adminAuth, async (req, res) => {
  try {
    const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'message_required' });
    const history = (req.body && Array.isArray(req.body.history)) ? req.body.history : [];
    // TPM: isteğin niyeti (toplu çıktı mı / çeviri mi) — max_tokens tavanı ve ek-dil sütunlarının
    // prompt'a girip girmeyeceği buna göre belirlenir (aşağıda).
    const intent = aiClassifyIntent(message);

    const cfg = await getAiConfig();
    if (!cfg.ai_enabled || !cfg.ai_key) return res.status(400).json({ error: 'ai_not_configured' });

    // Free-trial quota gate — only tenants with an `ai_quota` key (self-serve signups, see
    // provisionTenantForGoogleAccount) are limited; a missing key means unlimited (every existing
    // tenant, and every tenant Root creates manually, behaves exactly as before this change).
    const tenantRow = await db.get(
      isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?', [req.tenantId]
    );
    let tenantSettings = {};
    try { tenantSettings = JSON.parse((tenantRow && tenantRow.settings) || '{}') || {}; } catch (e) {}
    const quota = tenantSettings.ai_quota || null;
    if (quota && (quota.used || 0) >= quota.limit) {
      return res.status(429).json({ error: 'ai_quota_exceeded', quota });
    }

    // portion_tr/ingredients_tr are fetched (so the model has source text to translate from) but
    // stay OUT of AI_FIELD_WHITELIST — the model can see them, never write them (same
    // defense-in-depth pattern as everywhere else: the whitelist is the real security gate,
    // regardless of what the system prompt below says or what the model can see).
    const productColumns = ['id', 'name_tr', 'name_en', 'description_tr', 'description_en', 'portion_tr', 'ingredients_tr', 'category', 'price', ...PRODUCT_LANG_COLUMNS];
    const categoryColumns = ['id', 'name_tr', 'name_en', ...CATEGORY_LANG_COLUMNS];
    const products = await db.all(
      isPg ? `SELECT ${productColumns.join(', ')} FROM products WHERE tenant_id = $1` : `SELECT ${productColumns.join(', ')} FROM products WHERE tenant_id = ?`,
      [req.tenantId]
    );
    const categories = await db.all(
      isPg ? `SELECT ${categoryColumns.join(', ')} FROM categories WHERE tenant_id = $1` : `SELECT ${categoryColumns.join(', ')} FROM categories WHERE tenant_id = ?`,
      [req.tenantId]
    );

    // Prompt'a giden kopyayı incelt (TPM): (1) boş (henüz çevrilmemiş) alanları at; (2) ÇEVİRİ
    // isteği DEĞİLSE ek dil sütunlarını (name_de, description_fr … × 6 dil) tamamen çıkar — bunlar
    // yalnızca çeviri isteğinde işe yarar, çeviri yapmış bir tenant için aksi halde her mesajda
    // (ör. "merhaba") saf token israfıdır. Yalnızca prompt kopyasını etkiler — action doğrulaması
    // hâlâ orijinal, TAM sütunlu products/categories'i kullanır (aşağıda productsById).
    const langCols = new Set([...PRODUCT_LANG_COLUMNS, ...CATEGORY_LANG_COLUMNS]);
    const stripForPrompt = row => Object.fromEntries(
      Object.entries(row).filter(([k, v]) => v !== '' && v !== null && (intent.translation || !langCols.has(k)))
    );
    const productsForPrompt = products.map(stripForPrompt);
    const categoriesForPrompt = categories.map(stripForPrompt);

    // Restoran ayarlarını (küçük veri) yükle — AI restoran bilgisi/hero/tema düzenleyebilsin.
    // Yalnızca AI-whitelist alanları, dolu olanlar prompt'a girer (TPM için kompakt).
    let tenantSettingsForPrompt = {};
    try {
      const tRow = await db.get(isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?', [req.tenantId]);
      const tSet = JSON.parse((tRow && tRow.settings) || '{}') || {};
      for (const k of AI_SETTING_WHITELIST) {
        if (tSet[k] !== undefined && tSet[k] !== '' && tSet[k] !== null) tenantSettingsForPrompt[k] = tSet[k];
      }
    } catch (e) {}

    // NOT: Sistem promptu, TPM'in HER mesajda ödenen sabit maliyetidir — önceki (çok uzun/tekrarlı)
    // sürüm basit bir "merhaba"da bile ~2000 token yükü getiriyordu. Aşağıdaki sürüm TÜM kuralları
    // korur ama söz dizimini belirgin biçimde sıkıştırır (TPM optimizasyonu).
    const systemPrompt = `Restoran yönetim panelinin AI asistanısın; muhatabın restoran sahibi/yöneticisi. Menü düzenlemenin yanında serbestçe sohbet/tavsiye/görsel-oluşturma da yaparsın. YANITINI SADECE şu JSON ile ver, başka metin yazma:
{"summary":string,"actions":[{"type":"update","table":"products"|"categories","targetId":string,"field":string,"newValue":string},{"type":"create","table":"products"|"categories","tempId":string,"fields":object},{"type":"delete","table":"products"|"categories","targetId":string},{"type":"setting","field":string,"newValue":string}],"unsupported":[string],"image_prompt":string|null,"image_target_product_id":string|null,"image_target_candidates":[string]|null}

Dil kodları (çok dilli alanlarda SADECE bunlar): tr,en,de,fr,es,ja,ko,zh. "tr" ana dildir: çeviride *_tr alanlarına ASLA dokunma, yalnızca hedef dilin alanlarını (name_de vb.) yaz.

Action tipleri:
- update: var olan kaydı düzenler. SADECE verilen GERÇEK id + izinli alanlar. Hesabı (yüzde/çeviri) SEN yap, newValue'ya NİHAİ değeri yaz (formül yazma). price daima sayı string'i ("112.5"). TOPLU ÇEVİRİ (ör. "menüyü Almanca'ya çevir") create DEĞİL, update'tir: her ürün için ilgili alanları (name_XX, description_XX; ilgili *_tr doluysa portion_XX/ingredients_XX da) ayrı update olarak GERÇEK targetId ile öner; her kategori için name_XX. İlgili tr alanı boşsa o alanı atla. "sadece eksikleri çevir" denmedikçe hedefte değer olsa bile yeniden çevir.
- create: YENİ ürün/kategori (ör. "menüme X ekle", "Y kategorisi aç"). tempId = plan-içi referans için uydurduğun kısa metin ("new-1"); gerçek id'yi SUNUCU üretir. Aynı planda yeni kategoriye ürün atarken ürünün fields.category alanına o kategorinin tempId'sini yaz (sunucu eşler). products.fields:{name_tr(zorunlu),name_en,description_tr,description_en,price,category(GERÇEK id veya plan-içi tempId)} + istenirse diğer dil alanları. categories.fields:{name_tr(zorunlu),name_en,+opsiyonel diğer diller}. Büyük istekte ("menümü baştan kur") çok create üret (önce kategoriler, sonra ürünler).
- delete: SADECE kullanıcı açıkça "sil/kaldır" derse; targetId GERÇEK id. Kategori silmek ürünlerini silmez; "ürünleriyle sil" denirse ürünler için de delete ekle.
- setting: RESTORAN AYARLARINI düzenler (restoran adı, iletişim, ana sayfa hero metni, tema vb. — ürün/kategori DEĞİL). "field" aşağıdaki izinli ayar alanlarından biri olmalı, "newValue" nihai değer. Ör. "restoran adını X yap" → {"type":"setting","field":"company_name","newValue":"X"}; "temayı koyu yap" → {"type":"setting","field":"theme","newValue":"dark"}; "ana başlığı ... yap" → hero_title_tr. Sadece kullanıcının açıkça istediği alan(lar)ı değiştir.
İzinli ayar alanları (setting): ${AI_SETTING_WHITELIST.map(k => `${k} (${AI_SETTING_LABELS[k] || k})`).join('; ')}.
Bu listede OLMAYAN bir ayar (çalışma saati, ödeme, güvenlik vb.) istenirse action üretme, "unsupported"a kısa not ekle.

Görsel isteğinde: image_prompt = SADECE yemeğin İngilizce tanımı (malzeme/sunum), stüdyo/ışık/kalite YAZMA (otomatik eklenir). summary'ye kısa not, actions boş. İstek belirli bir ürüne atıfsa o ürünün GERÇEK ad/açıklamasından tanım çıkar (uydurma); açıklama yoksa isimden makul tanım. Ürüne aitse image_target_product_id = o ürünün GERÇEK id'si; değilse null. İsim birden çok ürüne uyuyorsa (belirsiz) product_id null, image_target_candidates'e ≥2 GERÇEK id yaz; belirsiz değilse candidates null.

Diğer tüm soru/sohbet/tavsiyede: doğal ve samimi cevabı summary'ye yaz, actions boş/null.
SADECE aşağıdaki ürün/kategori verisine ve izinli restoran ayarlarına erişimin var; sipariş, müşteri kişisel verisi, ödeme/finans, başka restoran, sistem/güvenlik, API anahtarı vb. verin YOK ve düzenleyemezsin — istenirse summary'de nazikçe belirt, veri uydurma.
İzinli alanlar — products: ${AI_FIELD_WHITELIST.products.join(', ')}. categories: ${AI_FIELD_WHITELIST.categories.join(', ')}.
Ürünler: ${JSON.stringify(productsForPrompt)}
Kategoriler: ${JSON.stringify(categoriesForPrompt)}
Mevcut restoran ayarları (setting action için): ${JSON.stringify(tenantSettingsForPrompt)}`;

    // TPM: Groq muhasebesinde prompt+max_tokens sayılır. Sohbet/tekil düzenleme küçük bir yanıt
    // üretir → düşük tavan (bütçenin çoğu boşuna rezerve edilmesin). Yalnızca gerçekten büyük JSON
    // üreten toplu istekler (çeviri / menüyü baştan kur / tüm fiyatlar) yüksek tavan alır.
    const maxTokens = intent.bulk ? 4000 : 1024;

    let plan;
    try {
      plan = await callAiJSON(cfg.ai_key, cfg.ai_model, systemPrompt, message, history, { maxTokens });
    } catch (e) {
      // Ham sağlayıcı metni istemciye ASLA gitmez — kararlı kod + (varsa) retryAfter döner.
      return res.json({ planId: null, summary: '', actions: [], unsupported: [], error: e.aiCode || 'ai_error', retryAfter: e.retryAfter || null });
    }

    // Counts against quota once the Groq call actually succeeds — a real API call was spent
    // either way, but only a successful one produced anything the tenant can act on.
    if (quota) {
      quota.used = (quota.used || 0) + 1;
      tenantSettings.ai_quota = quota;
      await db.run(
        isPg ? 'UPDATE tenants SET settings = $1 WHERE id = $2' : 'UPDATE tenants SET settings = ? WHERE id = ?',
        [JSON.stringify(tenantSettings), req.tenantId]
      );
    }
    const quotaInfo = quota ? { limit: quota.limit, used: quota.used, remaining: Math.max(0, quota.limit - quota.used) } : null;

    const productsById = Object.fromEntries(products.map(p => [p.id, p]));
    const categoriesById = Object.fromEntries(categories.map(c => [c.id, c]));

    let imageUrl = null;
    let imageError = null;
    let imageProductId = null;
    let imageProductName = null;
    let imageCandidates = null;
    if (plan.image_prompt && String(plan.image_prompt).trim()) {
      // Ambiguous name (matches 2+ real products, per the model) — validate each candidate id is
      // actually one of this tenant's own products (same trust boundary as everything else here),
      // then ask the user to pick BEFORE spending an image-generation call on a guess.
      const rawCandidates = Array.isArray(plan.image_target_candidates) ? plan.image_target_candidates : [];
      const validCandidates = rawCandidates.filter(id => productsById[id]).slice(0, 8);
      if (!plan.image_target_product_id && validCandidates.length >= 2) {
        imageCandidates = validCandidates.map(id => ({ id, name: productsById[id].name_tr }));
      } else if (!cfg.hf_key) {
        imageError = 'hf_not_configured';
      } else {
        try {
          const dataUri = await generateImageHF(cfg.hf_key, String(plan.image_prompt).trim().slice(0, 500));
          imageUrl = saveGeneratedImageFile(dataUri, req.tenantId);
          // Only trust a target-product id that's actually one of THIS tenant's real products —
          // same validate-against-the-real-row pattern as the actions loop below.
          if (plan.image_target_product_id && productsById[plan.image_target_product_id]) {
            imageProductId = plan.image_target_product_id;
            imageProductName = productsById[imageProductId].name_tr;
          }
        } catch (e) { imageError = e.message; }
      }
    }

    const unsupported = Array.isArray(plan.unsupported) ? plan.unsupported.slice(0, 20) : [];
    const actions = [];
    const productLabel = t => t === 'products' ? 'ürün' : 'kategori';
    // 600 (was 50): a full-menu translate-to-one-language request produces roughly
    // products × 2-4 fields + categories × 1 field — comfortably covers 100+ product menus.
    // Extremely large menus (200+ products) could still exceed this; a real fix there would be
    // multi-round/chunked translation, out of scope for now.
    for (const a of (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 600)) {
      // Ayar (restoran bilgisi/hero/tema) action'ı — ürün/kategori tablosundan bağımsız.
      if (a.type === 'setting') {
        if (!AI_SETTING_WHITELIST.includes(a.field)) { unsupported.push(`Desteklenmeyen ayar: ${a.field}`); continue; }
        let v = String(a.newValue ?? '').slice(0, 2000);
        if (a.field === 'theme') { const tv = v.toLowerCase().trim(); v = ['dark','light','bw'].includes(tv) ? tv : (tv === 'koyu' ? 'dark' : tv === 'açık' || tv === 'acik' ? 'light' : (tv === 'siyah-beyaz' || tv === 'mono' ? 'bw' : '')); if (!v) { unsupported.push('Geçersiz tema değeri'); continue; } }
        actions.push({ type: 'setting', field: a.field, oldValue: tenantSettingsForPrompt[a.field] ?? '', newValue: v, label: AI_SETTING_LABELS[a.field] || a.field });
        continue;
      }
      const table = a.table === 'categories' ? 'categories' : (a.table === 'products' ? 'products' : null);
      if (!table) { unsupported.push(`Desteklenmeyen tablo: ${a.table}`); continue; }
      const type = a.type === 'create' ? 'create' : (a.type === 'delete' ? 'delete' : 'update');

      if (type === 'update') {
        if (!AI_FIELD_WHITELIST[table].includes(a.field)) { unsupported.push(`Desteklenmeyen alan: ${a.field}`); continue; }
        const row = table === 'products' ? productsById[a.targetId] : categoriesById[a.targetId];
        if (!row) { unsupported.push(`Bulunamayan kayıt: ${a.targetId}`); continue; }
        actions.push({ type: 'update', table, targetId: a.targetId, field: a.field, oldValue: row[a.field], newValue: String(a.newValue ?? '').slice(0, 2000) });
      } else if (type === 'delete') {
        const row = table === 'products' ? productsById[a.targetId] : categoriesById[a.targetId];
        if (!row) { unsupported.push(`Bulunamayan kayıt: ${a.targetId}`); continue; }
        actions.push({ type: 'delete', table, targetId: a.targetId, label: row.name_tr || a.targetId });
      } else {
        // create — targetId doesn't exist yet, so there's nothing to validate ownership against;
        // the model's own tempId is only meaningful WITHIN this plan (see execute below), never a
        // real database id.
        const fields = (a.fields && typeof a.fields === 'object') ? a.fields : {};
        const name_tr = String(fields.name_tr || '').trim().slice(0, 200);
        if (!name_tr) { unsupported.push(`Ad belirtilmeden yeni ${productLabel(table)} oluşturulamaz`); continue; }
        const tempId = String(a.tempId || '').trim().slice(0, 60) || `temp-${actions.length}`;
        // zh/ja/de/fr/es/ko: not covered by AI_FIELD_WHITELIST (that only gates "update") — sent
        // as-is if the model provided them, empty string otherwise, NO fallback to Turkish (same
        // rule as createProductRow/createCategoryRow — lets "not yet translated" stay distinguishable).
        if (table === 'categories') {
          const langFields = Object.fromEntries(CATEGORY_LANG_COLUMNS.map(col => [col, String(fields[col] || '').trim().slice(0, 200)]));
          actions.push({ type: 'create', table, tempId, fields: { name_tr, name_en: String(fields.name_en || name_tr).trim().slice(0, 200), ...langFields } });
        } else {
          const category = String(fields.category || '').trim();
          const referencesTempCategory = actions.some(x => x.type === 'create' && x.table === 'categories' && x.tempId === category);
          if (!category || (!categoriesById[category] && !referencesTempCategory)) {
            unsupported.push(`"${name_tr}" için geçerli bir kategori belirtilmedi`); continue;
          }
          const langFields = Object.fromEntries(PRODUCT_LANG_COLUMNS.map(col => {
            const maxLen = col.startsWith('name_') ? 200 : 2000;
            return [col, String(fields[col] || '').trim().slice(0, maxLen)];
          }));
          actions.push({
            type: 'create', table, tempId,
            fields: {
              name_tr, name_en: String(fields.name_en || name_tr).trim().slice(0, 200),
              description_tr: String(fields.description_tr || '').slice(0, 2000),
              description_en: String(fields.description_en || fields.description_tr || '').slice(0, 2000),
              price: String(parseFloat(fields.price) || 0), category,
              ...langFields
            }
          });
        }
      }
    }

    if (!actions.length) return res.json({ planId: null, summary: plan.summary || '', actions: [], unsupported, imageUrl, imageError, imageProductId, imageProductName, imageCandidates, quota: quotaInfo });

    const planId = 'aip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    aiPlanCache.set(planId, { tenantId: req.tenantId, actions, createdAt: Date.now() });
    res.json({ planId, summary: plan.summary || '', actions, unsupported, imageUrl, imageError, imageProductId, imageProductName, imageCandidates, quota: quotaInfo });
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
    // tempId -> real generated id, so a same-plan product create can reference a category also
    // being created in this plan. Categories are created FIRST for exactly this reason.
    const tempIdToRealId = {};

    for (const a of cached.actions) {
      if (a.type === 'create' && a.table === 'categories') {
        const maxSortRow = await db.get(
          isPg ? 'SELECT COALESCE(MAX(sort_order),0) AS m FROM categories WHERE tenant_id = $1' : 'SELECT COALESCE(MAX(sort_order),0) AS m FROM categories WHERE tenant_id = ?',
          [req.tenantId]
        );
        const id = await createCategoryRow(req.tenantId, { ...a.fields, sort_order: (maxSortRow && maxSortRow.m || 0) + 1 });
        tempIdToRealId[a.tempId] = id;
        applied.push({ ...a, realId: id });
      }
    }
    for (const a of cached.actions) {
      if (a.type === 'update') {
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
      } else if (a.type === 'delete') {
        const result = await db.run(
          isPg ? `DELETE FROM ${a.table} WHERE id = $1 AND tenant_id = $2` : `DELETE FROM ${a.table} WHERE id = ? AND tenant_id = ?`,
          [a.targetId, req.tenantId]
        );
        if (result.changes) applied.push(a);
      } else if (a.type === 'setting') {
        // Restoran ayarı — tenants.settings JSON'una yazılır (branding endpoint'iyle aynı depolama).
        // Yalnızca AI_SETTING_WHITELIST alanları (planlamada zaten doğrulandı, burada bir kez daha).
        if (!AI_SETTING_WHITELIST.includes(a.field)) continue;
        const tRow = await db.get(isPg ? 'SELECT settings FROM tenants WHERE id = $1' : 'SELECT settings FROM tenants WHERE id = ?', [req.tenantId]);
        if (!tRow) continue;
        let settings = {}; try { settings = JSON.parse(tRow.settings || '{}') || {}; } catch (e) {}
        settings[a.field] = stripHtmlTags(String(a.newValue ?? ''));
        // Legacy tenant kolonlarını (iletişim/adres) senkron tut — branding endpoint'iyle aynı davranış.
        const legacyCols = { contact_phone: 'contact_phone', contact_email: 'contact_email', address: 'address' };
        if (legacyCols[a.field]) {
          await db.run(
            isPg ? `UPDATE tenants SET settings = $1, ${legacyCols[a.field]} = $2, updated_at = $3 WHERE id = $4`
                 : `UPDATE tenants SET settings = ?, ${legacyCols[a.field]} = ?, updated_at = ? WHERE id = ?`,
            [JSON.stringify(settings), settings[a.field], Date.now(), req.tenantId]
          );
        } else {
          await db.run(
            isPg ? 'UPDATE tenants SET settings = $1, updated_at = $2 WHERE id = $3' : 'UPDATE tenants SET settings = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(settings), Date.now(), req.tenantId]
          );
        }
        applied.push(a);
      } else if (a.type === 'create' && a.table === 'products') {
        let category = a.fields.category;
        if (tempIdToRealId[category]) category = tempIdToRealId[category];
        // Final ownership check — the category must now be real AND belong to this tenant,
        // whether it pre-existed or was just created above in this same plan.
        const catRow = await db.get(
          isPg ? 'SELECT id FROM categories WHERE id = $1 AND tenant_id = $2' : 'SELECT id FROM categories WHERE id = ? AND tenant_id = ?',
          [category, req.tenantId]
        );
        if (!catRow) continue;
        const id = await createProductRow(req.tenantId, { ...a.fields, category });
        applied.push({ ...a, realId: id });
      }
    }

    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'ai_assistant_applied', target: `${applied.length} change(s)`, details: applied.map(a => `${a.type}:${a.table}${a.field ? '.' + a.field : ''}`).join(','), ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true, applied, summary: `${applied.length} değişiklik uygulandı.` });
  } catch (err) {
    console.error('[API ERROR] POST /api/admin/ai-assistant/execute:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/ai-assistant/apply-image — { productId, imageUrl } -> sets ONLY that product's
// `image` column. Deliberately narrow (not the general PUT /api/products/:id, which is a full-row
// replace and would wipe name/price/etc. if called with just an image field from a possibly-stale
// frontend cache) — this touches exactly one column. Only accepts a URL this same server hosted
// under /uploads (the AI's own generated-image output), never an arbitrary external URL.
app.put('/api/admin/ai-assistant/apply-image', adminAuth, async (req, res) => {
  try {
    const productId = req.body && req.body.productId;
    const imageUrl = req.body && req.body.imageUrl;
    if (!productId || !imageUrl || typeof imageUrl !== 'string' || !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(imageUrl)) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const result = await db.run(
      isPg ? 'UPDATE products SET image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3'
           : 'UPDATE products SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [imageUrl, productId, req.tenantId]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'product_not_found' });
    logActivity({ tenantId: req.tenantId, actor: (req.auth && req.auth.username) || 'admin', role: 'tenant_admin', action: 'ai_assistant_image_applied', target: productId, details: imageUrl, ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' });
    res.json({ success: true });
  } catch (err) {
    console.error('[API ERROR] PUT /api/admin/ai-assistant/apply-image:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/ai-assistant/missing-images — this tenant's own products with no image set yet.
// Powers "Menüyü Tamamla" (bulk-generate for whatever's missing) — deterministic DB query, not left
// to the model to enumerate (same "don't trust the LLM with data it wasn't given exactly" posture
// as the rest of this feature).
app.get('/api/admin/ai-assistant/missing-images', adminAuth, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, name_tr, name_en, description_tr, description_en FROM products WHERE tenant_id = ${p(1)} AND (image IS NULL OR image = '')`,
      [req.tenantId]
    );
    res.json({ products: rows });
  } catch (err) {
    console.error('[API ERROR] GET /api/admin/ai-assistant/missing-images:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/ai-assistant/bulk-generate-images — { productIds: string[] } -> generates (but
// does NOT apply — same "never change the real image without explicit confirmation" rule as the
// single-image flow) one image per product. Prompt is built directly from name+description
// (deterministic string template, no per-item Groq call) rather than reusing the chat's
// LLM-authored-prompt path: a bulk run can cover many products at once, and skipping the extra
// model round trip per item keeps it fast and avoids hammering the free Groq rate limit. Quality
// suffix + negative_prompt (Phase 71) still apply identically inside generateImageHF().
app.post('/api/admin/ai-assistant/bulk-generate-images', adminAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.productIds) ? req.body.productIds.filter(x => typeof x === 'string').slice(0, 20) : [];
    if (!ids.length) return res.status(400).json({ error: 'no_products' });
    const cfg = await getAiConfig();
    if (!cfg.hf_key) return res.status(400).json({ error: 'hf_not_configured' });

    // NOTE: SQLite's `?` binds purely by textual position (unlike Postgres' numbered $N), so the
    // params array order below MUST match the order placeholders appear in the SQL text — tenant_id
    // first, then the IN-list — not the "logical" grouping.
    const placeholders = ids.map((_, i) => p(i + 2)).join(',');
    const rows = await db.all(
      `SELECT id, name_tr, name_en, description_tr, description_en FROM products WHERE tenant_id = ${p(1)} AND id IN (${placeholders})`,
      [req.tenantId, ...ids]
    );

    const results = [];
    for (const row of rows) {
      const name = row.name_en || row.name_tr || '';
      const desc = row.description_en || row.description_tr || '';
      const promptText = name + (desc ? ', ' + desc : '');
      try {
        const dataUri = await generateImageHF(cfg.hf_key, promptText);
        const url = saveGeneratedImageFile(dataUri, req.tenantId);
        results.push({ productId: row.id, productName: row.name_tr, imageUrl: url, error: null });
      } catch (e) {
        results.push({ productId: row.id, productName: row.name_tr, imageUrl: null, error: e.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('[API ERROR] POST /api/admin/ai-assistant/bulk-generate-images:', err);
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
// host-fallback id); it now renders the tada landing page instead. req.tenantId === null is the
// single source of truth for that case — resolveTenant() only ever sets it to null when no tenant was
// specified by any means, so this replaces the old duplicate, dev-only-gated host re-derivation.
// Real per-tenant SEO in index.html's raw HTML, not just client-side (applySiteConfig() still
// runs on top, unchanged) — see backend/lib/tenantSeo.js for why this existed only in JS before
// and what still needs a real custom domain (pointed at Render, not Netlify) to reach real
// visitors/crawlers in production.
const { buildTenantHead } = require('./lib/tenantSeo');
let indexShell = null;
function sendTenantIndex(req, res) {
  try {
    if (!indexShell || process.env.NODE_ENV !== 'production') {
      indexShell = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    }
    const tenant = req.tenant;
    if (!tenant) return res.sendFile(path.join(rootDir, 'index.html'));
    let settings = {};
    try { settings = JSON.parse(tenant.settings || '{}') || {}; } catch (e) {}
    const head = buildTenantHead(tenant, settings, baseUrl(req) + '/');
    res.type('html').send(indexShell.replace('<!--HEAD-->', head));
  } catch (err) {
    console.error('[TENANT INDEX] render:', err);
    res.sendFile(path.join(rootDir, 'index.html'));
  }
}

app.get('/', (req, res) => {
  if (req.tenantId === null) return res.sendFile(path.join(rootDir, 'landing.html'));
  sendTenantIndex(req, res);
});

// Phase 36: no tenant specified at all (bare host, no ?tenant=/x-tenant-id) must not silently expose
// any real restaurant's admin panel — show "no restaurant" instead. An explicit ?tenant=<slug>
// (including ?tenant=default) still works normally; only the implicit fallback is gone.
// Always serve admin.html regardless of host-resolved tenant — its own client-side auth gate
// (openAdminLogin) already handles every case correctly: a valid per-tenant session opens that
// restaurant's panel, a multi-restaurant Google identity with no tenant chosen yet shows the
// "Restoranlarım" hub (Phase 50), and no session at all shows the login modal. A server-side
// "no tenant resolved -> 404" guard used to sit here; it actively broke the hub, since a
// multi-restaurant Google account is redirected to bare /admin (deliberately, there IS no single
// tenant to encode in the URL until a restaurant is picked) — removed, not narrowed, because
// every case it existed to catch already degrades gracefully client-side.
app.get(['/admin.html', '/admin'], (req, res) => {
  res.sendFile(path.join(rootDir, 'admin.html'));
});

// tada public marketing landing page (platform site — distinct from a tenant's own restaurant site).
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

// Render-only hosting (no Netlify _redirects layer anymore): /menu and /menu/* used to be
// mapped straight to index.html by _redirects. Mirrored here so the pretty URL keeps working
// when this app is the sole host. Falls through to the same per-tenant head injection as '/'.
app.get(['/menu', '/menu/*'], (req, res) => {
  sendTenantIndex(req, res);
});

// Legacy alias URLs (not real marketing-data.js slugs, existed only as _redirects entries) —
// point at their real counterpart's dynamic marketing route.
app.get('/gizlilik-politikasi', (req, res) => res.redirect(301, '/gizlilik'));
app.get('/kvkk-aydinlatma-metni', (req, res) => res.redirect(301, '/kvkk'));

// ── tada marketing sub-pages (Phase 23) ──
// One shared shell (marketing.html) renders every page from marketing-data.js.
// Meta is injected server-side per slug so each URL is genuinely crawlable — this
// route matters for local dev and any direct-Render request, but in PRODUCTION
// Netlify's _redirects serves these URLs as static pre-rendered files instead
// (see scripts/prerender-marketing.js) since routing all marketing traffic through
// Render's free-tier cold start would hurt real visitors and crawl budget alike.
// Both places build the head from the exact same buildMarketingHead() so they can
// never drift apart.
const MARKETING = require('../marketing-data.js');
const MARKETING_SLUGS = Object.keys(MARKETING.pages);
const { buildMarketingHead } = require('./lib/marketingSeo');
let marketingShell = null;

app.get(MARKETING_SLUGS.map((s) => '/' + s), (req, res) => {
  try {
    if (!marketingShell || process.env.NODE_ENV !== 'production') {
      marketingShell = fs.readFileSync(path.join(rootDir, 'marketing.html'), 'utf8');
    }
    const slug = req.path.replace(/^\/+|\/+$/g, '');
    const page = MARKETING.pages[slug];
    if (!page) return res.status(404).sendFile(path.join(rootDir, 'marketing.html'));
    const head = buildMarketingHead(slug, page, baseUrl(req));
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

// AI-driven self-service signup — same "explicit local-dev route mirroring the Netlify
// _redirects entry" pattern as /login above (production traffic hits _redirects directly and
// never reaches Render for this, but local dev and any direct Render request still need it).
app.get(['/restoran-olustur', '/ai-ile-baslayin'], (req, res) => {
  res.sendFile(path.join(rootDir, 'restoran-olustur.html'));
});

// ── Dynamic, per-tenant SEO: robots.txt + sitemap.xml (host-derived, no hardcoded domain) ──
// Defined BEFORE express.static so they take precedence over any static files.
// /robots.txt and /sitemap.xml are always reached via Netlify's _redirects proxy in production (a
// rewrite straight to this Render URL, not a real subdomain visit). Confirmed live: neither
// req.headers.host NOR x-forwarded-host carries the original platformhasaca/hasacaplatform.
// netlify.app host through this specific kind of proxy — both show Render's own hostname — so
// every sitemap URL silently pointed at hasaca-api.onrender.com and Search Console rejected all of
// them (not part of the verified property). PUBLIC_SITE_URL is the one place to update this by
// hand if the canonical domain ever changes again (matches landing.html's own hardcoded-domain
// comment) — an env var overrides it without a code change/redeploy if ever needed.
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || 'https://hasaca-api.onrender.com';

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host && /(^|\.)onrender\.com$/i.test(host)) return PUBLIC_SITE_URL.replace(/\/+$/, '');
  return `${proto}://${host}`;
}
app.get('/robots.txt', (req, res) => {
  let seoRobots = 'index';
  try { seoRobots = (JSON.parse((req.tenant && req.tenant.settings) || '{}').seo_robots) || 'index'; } catch (e) {}
  const rule = seoRobots === 'noindex' ? 'Disallow: /' : 'Allow: /';
  res.type('text/plain').send(`User-agent: *\n${rule}\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const url = baseUrl(req) + '/';
  const today = new Date().toISOString().slice(0, 10);
  // The tenant homepage's own lastmod reflects that tenant's real last edit; tada-owned pages
  // (landing + every marketing page) must NOT borrow whichever tenant happened to resolve the
  // request — they used to, which made /landing's lastmod flip depending on which restaurant's
  // host served the sitemap. They get today's date instead (no real per-marketing-page edit
  // timestamp is tracked, so "checked today" is the honest value, not a fabricated old date).
  let tenantLastmod = today;
  try { const u = req.tenant && req.tenant.updated_at; if (u) tenantLastmod = new Date(Number(u)).toISOString().slice(0, 10); } catch (e) {}
  const entries = [`  <url>\n    <loc>${url}</loc>\n    <lastmod>${tenantLastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`];
  entries.push(`  <url>\n    <loc>${baseUrl(req)}/landing</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`);
  for (const slug of MARKETING_SLUGS) {
    entries.push(`  <url>\n    <loc>${baseUrl(req)}/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
  );
});

app.use(express.static(rootDir));

// Phase 36: same rule as bare '/' and '/admin' — an unmatched path with no tenant specified must
// not silently render any real restaurant's site. (The exact bare '/' path is handled separately,
// above, and shows the tada landing page for this same no-tenant case — this catch-all covers
// every other unmatched path, where landing.html would not make sense.)
app.get('*', (req, res) => {
  if (req.tenantId === null) {
    return res.status(404).send(errorPageHtml(
      'Restoran Bulunamadı', 'Restaurant Not Found',
      'Bu adres belirli bir restorana ait değil.',
      'This address is not tied to a specific restaurant.'
    ));
  }
  sendTenantIndex(req, res);
});


// ==========================================
// STARTUP: Init DB then start server
// ==========================================
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(` tada Server is running!`);
    console.log(` Port: ${PORT}`);
    console.log(` Local:  http://localhost:${PORT}`);
    console.log(` Mode:   ${process.env.DATABASE_URL ? 'PRODUCTION (PostgreSQL)' : 'DEVELOPMENT (SQLite)'}`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('[FATAL] Failed to initialize database:', err);
  process.exit(1);
});
