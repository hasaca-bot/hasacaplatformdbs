// =============================================
// HASACA Platform — Root (Super Admin) API
// Tenant management: create / edit / disable / delete,
// automatic demo-content website generation, branding,
// impersonation, tenant inspection.
// Mounted at /api/root with rootAuth in server.js.
// =============================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tpl = require('../masterTemplate');

const RESERVED_SLUGS = ['www', 'api', 'root', 'admin', 'app', 'mail', 'ftp', 'static', 'cdn', 'localhost', 'default'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

// 10-char base62 token — permanent per table, never derived from the table number
function generateTableToken() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = function createRootRouter({ db, isPg, invalidateTenantCache, signToken, hashPassword, generatePassword }) {
  const router = express.Router();
  const P = (n) => (isPg ? `$${n}` : '?');

  // ---------- tenant CRUD ----------

  // GET /api/root/tenants — list with light counts
  router.get('/tenants', async (req, res) => {
    try {
      const tenants = await db.all('SELECT * FROM tenants ORDER BY created_at ASC');
      const productCounts = await db.all('SELECT tenant_id, COUNT(*) as c FROM products GROUP BY tenant_id');
      const tableCounts = await db.all('SELECT tenant_id, COUNT(*) as c FROM tables GROUP BY tenant_id');
      const orderCounts = await db.all('SELECT tenant_id, COUNT(*) as c FROM orders GROUP BY tenant_id');
      const cmap = (rows) => Object.fromEntries(rows.map(r => [r.tenant_id, parseInt(r.c)]));
      const pc = cmap(productCounts), tc = cmap(tableCounts), oc = cmap(orderCounts);
      res.json(tenants.map(t => ({
        ...t,
        settings: safeParse(t.settings),
        product_count: pc[t.id] || 0,
        table_count: tc[t.id] || 0,
        order_count: oc[t.id] || 0
      })));
    } catch (err) {
      console.error('[ROOT API] GET /tenants:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/root/tenants/:id — detail incl. admin users (without hashes)
  router.get('/tenants/:id', async (req, res) => {
    try {
      const t = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [req.params.id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });
      const admins = await db.all(
        `SELECT id, username, role, display_name, created_at, last_login FROM admin_users WHERE tenant_id = ${P(1)}`,
        [t.id]
      );
      res.json({ ...t, settings: safeParse(t.settings), admins });
    } catch (err) {
      console.error('[ROOT API] GET /tenants/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/root/tenants — create tenant + generate the full demo website
  router.post('/tenants', async (req, res) => {
    try {
      const body = req.body || {};
      const slug = String(body.slug || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const display_name = String(body.display_name || name).trim();

      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'Invalid slug: use 2-31 chars, lowercase letters/digits/hyphen' });
      }
      if (RESERVED_SLUGS.includes(slug)) {
        return res.status(400).json({ error: 'This slug is reserved' });
      }
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const existing = await db.get(`SELECT id FROM tenants WHERE id = ${P(1)}`, [slug]);
      if (existing) return res.status(409).json({ error: 'A tenant with this slug already exists' });

      const result = await createTenantWithDemoContent({ slug, name, display_name, body });
      invalidateTenantCache(slug);
      res.status(201).json(result);
    } catch (err) {
      console.error('[ROOT API] POST /tenants:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/root/tenants/:id — edit basic info
  router.put('/tenants/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const b = req.body || {};
      const t = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });

      await db.run(
        `UPDATE tenants SET name = ${P(1)}, display_name = ${P(2)}, contact_phone = ${P(3)}, contact_email = ${P(4)}, address = ${P(5)}, updated_at = ${P(6)} WHERE id = ${P(7)}`,
        [b.name || t.name, b.display_name || t.display_name, b.contact_phone ?? t.contact_phone,
         b.contact_email ?? t.contact_email, b.address ?? t.address, Date.now(), id]
      );
      invalidateTenantCache(id);
      const updated = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [id]);
      res.json({ ...updated, settings: safeParse(updated.settings) });
    } catch (err) {
      console.error('[ROOT API] PUT /tenants/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/root/tenants/:id/status — enable / disable
  router.put('/tenants/:id/status', async (req, res) => {
    try {
      const id = req.params.id;
      const status = req.body && req.body.status === 'disabled' ? 'disabled' : 'active';
      if (id === 'default' && status === 'disabled') {
        return res.status(400).json({ error: 'The default tenant cannot be disabled' });
      }
      const result = await db.run(
        `UPDATE tenants SET status = ${P(1)}, updated_at = ${P(2)} WHERE id = ${P(3)}`,
        [status, Date.now(), id]
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Tenant not found' });
      invalidateTenantCache(id);
      res.json({ success: true, status });
    } catch (err) {
      console.error('[ROOT API] PUT /tenants/:id/status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/root/tenants/:id/branding — root-controlled branding assets (merged into settings)
  router.put('/tenants/:id/branding', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });

      const ALLOWED = ['logo_url', 'favicon_url', 'company_name', 'hero_title_tr', 'hero_title_en',
        'hero_sub_tr', 'hero_sub_en', 'banner_text_tr', 'banner_text_en', 'footer_text',
        'seo_title', 'seo_description'];
      const settings = safeParse(t.settings);
      for (const key of ALLOWED) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
          settings[key] = String(req.body[key] ?? '');
        }
      }
      await db.run(
        `UPDATE tenants SET settings = ${P(1)}, updated_at = ${P(2)} WHERE id = ${P(3)}`,
        [JSON.stringify(settings), Date.now(), id]
      );
      invalidateTenantCache(id);
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[ROOT API] PUT /tenants/:id/branding:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/root/tenants/:id — remove the tenant and ALL of its data
  router.delete('/tenants/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (id === 'default') return res.status(400).json({ error: 'The default tenant cannot be deleted' });
      const t = await db.get(`SELECT id FROM tenants WHERE id = ${P(1)}`, [id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });

      // order_items has no tenant_id-independent path — delete via parent orders first
      await db.run(
        isPg ? 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)'
             : 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)',
        [id]
      );
      for (const table of ['orders', 'products', 'categories', 'translations', 'reservations',
                           'subscriptions', 'notifications', 'tables', 'service_requests', 'admin_users']) {
        await db.run(`DELETE FROM ${table} WHERE tenant_id = ${P(1)}`, [id]);
      }
      await db.run(`DELETE FROM tenants WHERE id = ${P(1)}`, [id]);
      invalidateTenantCache(id);
      res.json({ success: true, message: 'Tenant and all its data deleted' });
    } catch (err) {
      console.error('[ROOT API] DELETE /tenants/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- support tools ----------

  // POST /api/root/tenants/:id/impersonate — login as tenant without knowing the password
  router.post('/tenants/:id/impersonate', async (req, res) => {
    try {
      const t = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [req.params.id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });
      const token = signToken(
        { uid: 'root-impersonation', tenant_id: t.id, role: 'tenant_admin', username: 'root (support)' },
        4 * 60 * 60 * 1000 // 4h — shorter than a normal session
      );
      res.json({ token, tenant_id: t.id });
    } catch (err) {
      console.error('[ROOT API] POST /tenants/:id/impersonate:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/root/tenants/:id/tables — inspect any tenant's tables/QR tokens (support)
  router.get('/tenants/:id/tables', async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT * FROM tables WHERE tenant_id = ${P(1)} ORDER BY sort_order ASC, created_at ASC`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      console.error('[ROOT API] GET /tenants/:id/tables:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/root/tenants/:id/reset-admin-password — regenerate the tenant admin password
  router.post('/tenants/:id/reset-admin-password', async (req, res) => {
    try {
      const id = req.params.id;
      const admin = await db.get(
        `SELECT * FROM admin_users WHERE tenant_id = ${P(1)} AND role = 'tenant_admin' ORDER BY created_at ASC LIMIT 1`,
        [id]
      );
      if (!admin) return res.status(404).json({ error: 'Tenant admin not found' });
      const newPassword = generatePassword();
      await db.run(
        `UPDATE admin_users SET password_hash = ${P(1)} WHERE id = ${P(2)}`,
        [hashPassword(newPassword), admin.id]
      );
      res.json({ success: true, username: admin.username, password: newPassword });
    } catch (err) {
      console.error('[ROOT API] POST /tenants/:id/reset-admin-password:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- platform-level branding (root-controlled, no code changes) ----------

  const ALLOWED_PLATFORM_KEYS = ['platform_name', 'logo_url', 'favicon_url', 'login_logo_url',
    'landing_title', 'landing_subtitle', 'footer_brand'];

  async function getPlatform() {
    const row = await db.get(`SELECT settings FROM platform_settings WHERE id = ${P(1)}`, ['platform']);
    return row ? safeParse(row.settings) : {};
  }
  async function savePlatform(obj) {
    await db.run(
      `UPDATE platform_settings SET settings = ${P(1)}, updated_at = ${P(2)} WHERE id = ${P(3)}`,
      [JSON.stringify(obj), Date.now(), 'platform']
    );
  }

  // GET /api/root/platform-settings — full platform config (rootAuth)
  router.get('/platform-settings', async (req, res) => {
    try {
      const p = await getPlatform();
      // never leak the AI key here
      if (p.ai_key) delete p.ai_key;
      res.json(p);
    } catch (err) {
      console.error('[ROOT API] GET /platform-settings:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/root/platform-settings — update branding fields
  router.put('/platform-settings', async (req, res) => {
    try {
      const p = await getPlatform();
      for (const key of ALLOWED_PLATFORM_KEYS) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
          p[key] = String(req.body[key] ?? '');
        }
      }
      await savePlatform(p);
      res.json({ success: true, settings: p });
    } catch (err) {
      console.error('[ROOT API] PUT /platform-settings:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/root/upload-asset — base64 image -> /uploads/<file>, returns the hosted URL
  router.post('/upload-asset', async (req, res) => {
    try {
      const image = req.body && req.body.image;
      if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Valid base64 image data is required' });
      }
      const m = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'Invalid image data format' });
      const ext = m[1].toLowerCase().replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      const allowed = ['png', 'jpg', 'webp', 'svg', 'x-icon', 'vnd.microsoft.icon', 'ico'];
      if (!allowed.includes(ext)) return res.status(400).json({ error: 'Unsupported image format' });
      const buffer = Buffer.from(m[2], 'base64');
      if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image exceeds 5MB' });

      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const safeExt = ext === 'x-icon' || ext === 'vnd.microsoft.icon' ? 'ico' : ext;
      const filename = `platform-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      res.json({ success: true, url: `/uploads/${filename}` });
    } catch (err) {
      console.error('[ROOT API] POST /upload-asset:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- tenant generation service ----------

  // Every new tenant is a CLONE of the `default` master template — its categories,
  // products, translations and settings — so the template is the single source of truth
  // and any edits the owner makes to `default` flow into future tenants.
  async function createTenantWithDemoContent({ slug, name, display_name, body }) {
    const now = Date.now();
    const settings = tpl.defaultSettings(display_name || name);

    await db.run(
      `INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at)
       VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)})`,
      [slug, name, display_name, 'active',
       body.contact_phone || '123456789',
       body.contact_email || 'example@email.com',
       body.address || 'Example Address',
       JSON.stringify(settings), now, now]
    );

    // 1) Clone UI translations from the default template
    const baseTranslations = await db.all(
      `SELECT key, tr, en FROM translations WHERE tenant_id = ${P(1)}`, ['default']
    );
    let i = 1;
    for (const row of baseTranslations) {
      await db.run(
        `INSERT INTO translations (id, tenant_id, key, tr, en) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)})`,
        [`trans-${slug}-${i++}`, slug, row.key, row.tr, row.en]
      );
    }

    // 2) Clone categories (ids remapped per-tenant)
    const baseCats = await db.all(
      `SELECT * FROM categories WHERE tenant_id = ${P(1)} ORDER BY sort_order ASC`, ['default']
    );
    const catIdMap = {};
    let sort = 1;
    for (const c of baseCats) {
      const newId = `${c.id}-${slug}`;
      catIdMap[c.id] = newId;
      await db.run(
        `INSERT INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)})`,
        [newId, slug, c.name_tr, c.name_en, sort++, c.icon || '']
      );
    }

    // 3) Clone products (ids + category remapped; images/prices/nutrition preserved)
    const baseProducts = await db.all(
      `SELECT * FROM products WHERE tenant_id = ${P(1)}`, ['default']
    );
    for (const pr of baseProducts) {
      const newId = `${pr.id}-${slug}`;
      const category = catIdMap[pr.category] || pr.category;
      await db.run(
        `INSERT INTO products (id, tenant_id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)},${P(13)},${P(14)},${P(15)},${P(16)},${P(17)},${P(18)},${P(19)},${P(20)},${P(21)},${P(22)},${P(23)})`,
        [newId, slug, pr.name_tr, pr.name_en, pr.description_tr, pr.description_en, category, pr.price, pr.image,
         pr.portion_tr, pr.portion_en, pr.ingredients_tr, pr.ingredients_en, pr.calories, pr.protein, pr.carbs, pr.fat,
         pr.saturated_fat, pr.sugars, pr.fiber, pr.salt, pr.allergens || '[]', pr.katki_maddesi_icermez || 0]
      );
    }

    // 4) Starter tables with permanent QR tokens (QR Table Ordering ready out of the box)
    const tables = [];
    for (let t = 1; t <= 3; t++) {
      const tableId = `table-${slug}-${now}-${t}`;
      const token = generateTableToken();
      await db.run(
        `INSERT INTO tables (id, tenant_id, token, name, description, sort_order, active, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},1,${P(7)})`,
        [tableId, slug, token, `Masa ${t}`, '', t, now]
      );
      tables.push({ id: tableId, token, name: `Masa ${t}` });
    }

    // 5) Tenant admin account — password returned ONCE in this response
    const adminPassword = generatePassword();
    await db.run(
      `INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at)
       VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)})`,
      [`user-${slug}-${now}`, slug, slug, hashPassword(adminPassword), 'tenant_admin', display_name + ' Admin', now]
    );

    const tenant = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [slug]);
    return {
      tenant: { ...tenant, settings: safeParse(tenant.settings) },
      admin: { username: slug, password: adminPassword },
      tables,
      seeded: {
        translations: baseTranslations.length,
        categories: baseCats.length,
        products: baseProducts.length,
        tables: tables.length
      }
    };
  }

  return router;
};

function safeParse(json) {
  try { return JSON.parse(json || '{}') || {}; } catch (e) { return {}; }
}

module.exports.generateTableToken = generateTableToken;
