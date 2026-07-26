// Load .env (local dev only) BEFORE anything reads process.env — production sets real env vars.
require('./lib/env').loadEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, initDatabase, resetDatabase } = require('./db');
const webpush = require('web-push');
const { hashPassword, verifyPassword, signToken, verifyToken, generatePassword } = require('./lib/auth');
const { createTenantResolver } = require('./lib/tenant');
const platformEvents = require('./lib/events');

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
const PORT = process.env.PORT || 12999;

// Enable CORS with robust origin support for Netlify subdomains, previews, and local development
const allowedOrigins = [
  'https://dayikatik.netlify.app',
  'https://hasacadesign.netlify.app',
  'https://dayikatikornek.netlify.app',
  'https://resonant-elf-d2b58b.netlify.app',
  'https://glittering-raindrop-435319.netlify.app',
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

// Helper to build parameterized queries for both PG ($1) and SQLite (?)
const isPg = !!process.env.DATABASE_URL;

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
    const body = req.body || {};
    const tenantId = req.tenantId;

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
    let orderType = 'delivery';
    let tableId = null;
    let tableName = null;
    if (body.table_token) {
      const table = await db.get(
        isPg ? 'SELECT * FROM tables WHERE token = $1 AND tenant_id = $2' : 'SELECT * FROM tables WHERE token = ? AND tenant_id = ?',
        [String(body.table_token), tenantId]
      );
      if (!table || !(table.active === 1 || table.active === true)) {
        return res.status(400).json({ error: 'Invalid table' });
      }
      orderType = 'dinein';
      tableId = table.id;
      tableName = table.name;
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
        isPg ? 'SELECT * FROM products WHERE id = $1' : 'SELECT * FROM products WHERE id = ?',
        [productId]
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
      `, [id, tenantId, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, initialStatus, orderType, tableId, tableName, now, now]);
    } else {
      await db.run(`
        INSERT INTO orders (id, tenant_id, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, status, order_type, table_id, table_name, archived, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
      `, [id, tenantId, customer_name, phone, address, address_detail, address_notes, order_notes, payment_method, subtotal, tax, delivery_fee, total, initialStatus, orderType, tableId, tableName, now, now]);
    }

    // Insert items; if any fail, roll back the just-created order to avoid an item-less order.
    try {
      for (const it of resolvedItems) {
        if (isPg) {
          await db.run(`
            INSERT INTO order_items (id, order_id, tenant_id, product_id, product_name, unit_price, quantity, line_total)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [it.id, id, tenantId, it.product_id, it.product_name, it.unit_price, it.quantity, it.line_total]);
        } else {
          await db.run(`
            INSERT INTO order_items (id, order_id, tenant_id, product_id, product_name, unit_price, quantity, line_total)
            VALUES (?,?,?,?,?,?,?,?)
          `, [it.id, id, tenantId, it.product_id, it.product_name, it.unit_price, it.quantity, it.line_total]);
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
    platformEvents.publishToAdmin(tenantId, 'order_new', mapped);
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
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
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
  if (payload.role !== 'root' && payload.tenant_id !== req.tenantId) {
    return res.status(401).json({ error: 'Unauthorized: wrong tenant.' });
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

    const user = await db.get(
      isPg
        ? "SELECT * FROM admin_users WHERE username = $1 AND (role = 'root' OR tenant_id = $2)"
        : "SELECT * FROM admin_users WHERE username = ? AND (role = 'root' OR tenant_id = ?)",
      [username, req.tenantId]
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.run(
      isPg ? 'UPDATE admin_users SET last_login = $1 WHERE id = $2' : 'UPDATE admin_users SET last_login = ? WHERE id = ?',
      [Date.now(), user.id]
    );

    const token = signToken({ uid: user.id, tenant_id: user.tenant_id, role: user.role, username: user.username });
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

// GET /api/auth/me — validates the stored token (used to restore sessions client-side)
app.get('/api/auth/me', adminAuth, (req, res) => {
  res.json({
    uid: req.auth.uid,
    role: req.auth.role,
    tenant_id: req.auth.tenant_id,
    username: req.auth.username,
    exp: req.auth.exp
  });
});

// ==========================================
// ROOT (SUPER ADMIN) PANEL & API
// ==========================================
const createRootRouter = require('./routes/root');
app.use('/api/root', rootAuth, createRootRouter({
  db, isPg, invalidateTenantCache, signToken, hashPassword, generatePassword
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
  if (!payload || (payload.role !== 'root' && payload.tenant_id !== req.tenantId)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  platformEvents.subscribeAdmin(req.tenantId, req, res);
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
      ai_enabled: !!s.ai_enabled
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

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'admin.html'));
});

app.use(express.static(rootDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});


// ==========================================
// STARTUP: Init DB then start server
// ==========================================
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(` Dayı Katık Web App Server is running!`);
    console.log(` Port: ${PORT}`);
    console.log(` Local:  http://localhost:${PORT}`);
    console.log(` Mode:   ${process.env.DATABASE_URL ? 'PRODUCTION (PostgreSQL)' : 'DEVELOPMENT (SQLite)'}`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('[FATAL] Failed to initialize database:', err);
  process.exit(1);
});
