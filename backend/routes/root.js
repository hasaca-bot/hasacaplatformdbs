// =============================================
// HASACA Platform — Root (Super Admin) API
// Tenant management: create / edit / disable / delete,
// automatic demo-content website generation, branding,
// impersonation, tenant inspection.
// Mounted at /api/root with rootAuth in server.js.
// =============================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { regenerateDefaultTenant, deleteTenantData, logActivity } = require('../db');
const createTenantProvisioner = require('../lib/tenantProvisioning');
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

module.exports = function createRootRouter({ db, isPg, invalidateTenantCache, signToken, hashPassword, generatePassword, sendPush }) {
  const router = express.Router();
  const P = (n) => (isPg ? `$${n}` : '?');
  // Shared with the Google Sign-In self-signup flow (server.js) — one tested tenant-creation
  // code path, not two. See backend/lib/tenantProvisioning.js.
  const { createTenantWithDemoContent, RESERVED_SLUGS, SLUG_RE } = createTenantProvisioner({ db, isPg, hashPassword, generatePassword });

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
      logActivity({ tenantId: slug, actor: 'root', role: 'root', action: 'tenant_created', target: slug,
        details: display_name, ip: clientIp(req) });
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
  // Phase 28: per-tenant customer-site widget on/off flags, stored at settings.widgets.
  // Missing key/entry defaults to enabled (index.html's applySiteConfig treats undefined as true).
  const WIDGET_KEYS = ['whatsapp', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'website', 'maps'];

  router.put('/tenants/:id/branding', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });

      const ALLOWED = ['logo_url', 'favicon_url', 'company_name', 'hero_title_tr', 'hero_title_en',
        'hero_sub_tr', 'hero_sub_en', 'banner_text_tr', 'banner_text_en', 'footer_text',
        'seo_title', 'seo_description', 'theme',
        // SEO Center (per-tenant meta/robots)
        'seo_keywords', 'og_image', 'seo_robots', 'seo_canonical',
        // Contact & Social (root-controlled, used dynamically across the public site)
        'contact_phone', 'whatsapp', 'contact_email', 'address', 'maps_embed', 'maps_link', 'website',
        'instagram', 'facebook', 'twitter', 'tiktok', 'youtube'];
      // URL fields must be blank or an http(s) URL (blocks javascript:/data: and typos)
      const URL_FIELDS = ['maps_link', 'maps_embed', 'website', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'seo_canonical'];
      const isBlankOrUrl = (v) => !v || /^https?:\/\/.+/i.test(v);
      const isBlankOrEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      for (const key of URL_FIELDS) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, key) && !isBlankOrUrl(String(req.body[key] ?? '').trim())) {
          return res.status(400).json({ error: `Invalid URL for "${key}" — must start with http:// or https://` });
        }
      }
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'contact_email') && !isBlankOrEmail(String(req.body.contact_email ?? '').trim())) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      const settings = safeParse(t.settings);
      for (const key of ALLOWED) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
          settings[key] = String(req.body[key] ?? '').trim();
        }
      }
      // Widgets (Phase 28): a nested on/off map, not a flat string field — merge key-by-key so a
      // partial toggle never wipes the other widget flags. Unknown keys are ignored.
      if (req.body && req.body.widgets && typeof req.body.widgets === 'object') {
        settings.widgets = { ...(settings.widgets || {}) };
        for (const key of WIDGET_KEYS) {
          if (Object.prototype.hasOwnProperty.call(req.body.widgets, key)) {
            settings.widgets[key] = !!req.body.widgets[key];
          }
        }
      }
      // Keep the legacy tenant columns in sync so /api/site-config's top-level fields stay correct.
      const phone = settings.contact_phone !== undefined ? settings.contact_phone : t.contact_phone;
      const email = settings.contact_email !== undefined ? settings.contact_email : t.contact_email;
      const addr  = settings.address       !== undefined ? settings.address       : t.address;
      await db.run(
        `UPDATE tenants SET settings = ${P(1)}, contact_phone = ${P(2)}, contact_email = ${P(3)}, address = ${P(4)}, updated_at = ${P(5)} WHERE id = ${P(6)}`,
        [JSON.stringify(settings), phone, email, addr, Date.now(), id]
      );
      invalidateTenantCache(id);
      logActivity({ tenantId: id, actor: 'root', role: 'root', action: 'branding_updated', target: id,
        details: Object.keys(req.body || {}).join(','), ip: clientIp(req) });
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[ROOT API] PUT /tenants/:id/branding:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/root/tenants/:id — remove the tenant and ALL of its data
  // DELETE /api/root/tenants/:id — permanently delete ANY tenant (including `default`).
  // The platform is never left empty: if the deleted tenant was `default`, or no tenants remain
  // afterwards, a fresh `default` tenant is auto-regenerated from the master template.
  router.delete('/tenants/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await db.get(`SELECT id FROM tenants WHERE id = ${P(1)}`, [id]);
      if (!t) return res.status(404).json({ error: 'Tenant not found' });

      // Shared with regenerateDefaultTenant() and the tenant self-service DELETE — one table
      // list, see backend/db.js's deleteTenantData().
      await deleteTenantData(id);
      await db.run(`DELETE FROM tenants WHERE id = ${P(1)}`, [id]);
      invalidateTenantCache(id);

      // Never leave the platform with zero tenants at all (an empty table breaks tenant
      // resolution for the whole platform). 'default' is no longer treated as special here —
      // Phase 36: deleting it behaves exactly like deleting any other tenant, and it is only
      // regenerated if it happened to be the very last tenant remaining, same as any other id
      // would trigger this same recovery.
      const cntRow = await db.get(isPg ? 'SELECT COUNT(*)::int AS c FROM tenants' : 'SELECT COUNT(*) AS c FROM tenants');
      const remaining = cntRow ? Number(cntRow.c) : 0;
      let regeneratedDefault = false;
      if (remaining === 0) {
        await regenerateDefaultTenant();
        invalidateTenantCache('default');
        regeneratedDefault = true;
      }

      logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'tenant_deleted', target: id,
        details: regeneratedDefault ? 'default regenerated' : '', ip: clientIp(req) });
      res.json({
        success: true,
        message: regeneratedDefault
          ? 'Tenant deleted; a fresh default tenant was regenerated so the platform is never empty.'
          : 'Tenant and all its data deleted',
        regeneratedDefault
      });
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

  // GET /api/root/health — cloud-safe platform health. Uses ONLY information the running app can
  // read (process + DB query + its own files) — no provider-specific APIs — so it works on Render,
  // Railway, Fly.io, Docker, a VPS, etc. Provider metrics can be layered on later via adapters.
  router.get('/health', async (req, res) => {
    const started = Date.now();
    const health = { status: 'ok', timestamp: new Date().toISOString() };
    // Database status + response time
    try {
      const t0 = Date.now();
      await db.get('SELECT 1 AS ok');
      health.db = { status: 'ok', responseMs: Date.now() - t0, engine: isPg ? 'PostgreSQL' : 'SQLite' };
    } catch (e) {
      health.status = 'degraded';
      health.db = { status: 'error', error: e.message, engine: isPg ? 'PostgreSQL' : 'SQLite' };
    }
    // Business metrics (best-effort; a failing count returns null, not a 500)
    const count = async (sql, args = []) => { try { const r = await db.get(sql, args); return r ? Number(Object.values(r)[0]) : 0; } catch (e) { return null; } };
    const dayAgo = Date.now() - 86400000;
    const monthAgo = Date.now() - 30 * 86400000;
    health.metrics = {
      tenants: await count('SELECT COUNT(*) c FROM tenants'),
      products: await count('SELECT COUNT(*) c FROM products'),
      ordersTotal: await count('SELECT COUNT(*) c FROM orders'),
      ordersToday: await count(`SELECT COUNT(*) c FROM orders WHERE created_at >= ${P(1)}`, [dayAgo]),
      ordersMonth: await count(`SELECT COUNT(*) c FROM orders WHERE created_at >= ${P(1)}`, [monthAgo]),
      reservations: await count('SELECT COUNT(*) c FROM reservations'),
      pushSubscriptions: await count('SELECT COUNT(*) c FROM subscriptions'),
      qrTables: await count('SELECT COUNT(*) c FROM tables')
    };
    // Runtime (from the running process only — host-agnostic)
    const mem = process.memoryUsage();
    health.runtime = {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: isPg ? 'production (PostgreSQL)' : 'development (SQLite)',
      platform: process.platform,
      memoryMB: { rss: +(mem.rss / 1048576).toFixed(1), heapUsed: +(mem.heapUsed / 1048576).toFixed(1) }
    };
    // Storage (app's own files only)
    try {
      const storage = {};
      if (!isPg) {
        const dbFile = path.join(__dirname, '..', 'dayikatik.db');
        if (fs.existsSync(dbFile)) storage.databaseMB = +(fs.statSync(dbFile).size / 1048576).toFixed(2);
      }
      const upDir = path.join(__dirname, '..', '..', 'uploads');
      if (fs.existsSync(upDir)) {
        let total = 0, n = 0;
        for (const f of fs.readdirSync(upDir)) { try { total += fs.statSync(path.join(upDir, f)).size; n++; } catch (e) {} }
        storage.uploads = { files: n, sizeMB: +(total / 1048576).toFixed(2) };
      }
      health.storage = storage;
    } catch (e) { health.storage = { error: e.message }; }
    // Version (proxy for deployment version)
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      health.version = pkg.version || 'n/a';
    } catch (e) { health.version = 'n/a'; }
    health.checkMs = Date.now() - started;
    res.json(health);
  });

  // GET /api/root/activity — audit trail across ALL tenants (root-only).
  // Filters: ?tenant=<slug> ?action=<name> ?limit=<n> ?offset=<n>.
  router.get('/activity', async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const where = []; const args = [];
      if (req.query.tenant) { where.push(`tenant_id = ${P(args.length + 1)}`); args.push(req.query.tenant); }
      if (req.query.action) { where.push(`action = ${P(args.length + 1)}`); args.push(req.query.action); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = await db.all(
        `SELECT * FROM activity_log ${whereSql} ORDER BY created_at DESC LIMIT ${P(args.length + 1)} OFFSET ${P(args.length + 2)}`,
        [...args, limit, offset]
      );
      const totalRow = await db.get(`SELECT COUNT(*) c FROM activity_log ${whereSql}`, args);
      res.json({ items: rows, total: totalRow ? Number(Object.values(totalRow)[0]) : 0, limit, offset });
    } catch (err) {
      console.error('[ROOT API] GET /activity:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Landing / marketing-site contact inbox (root-only) ----------

  // Build the WHERE clause + args shared by list, count and CSV export.
  function landingFilter(query) {
    const where = []; const args = [];
    const status = query.status;
    if (status && ['unread', 'read', 'archived'].includes(status)) {
      where.push(`status = ${P(args.length + 1)}`); args.push(status);
    }
    const q = (query.q || '').trim();
    if (q) {
      const like = `%${q}%`;
      where.push(`(name LIKE ${P(args.length + 1)} OR restaurant LIKE ${P(args.length + 2)} OR email LIKE ${P(args.length + 3)})`);
      args.push(like, like, like);
    }
    return { whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
  }

  // GET /api/root/landing-messages?status=&q=&limit=&offset= — list leads + total + unread badge count.
  router.get('/landing-messages', async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
      const offset = Math.max(0, parseInt(req.query.offset) || 0);
      const { whereSql, args } = landingFilter(req.query);
      const rows = await db.all(
        `SELECT * FROM landing_messages ${whereSql} ORDER BY created_at DESC LIMIT ${P(args.length + 1)} OFFSET ${P(args.length + 2)}`,
        [...args, limit, offset]
      );
      const totalRow = await db.get(`SELECT COUNT(*) c FROM landing_messages ${whereSql}`, args);
      const unreadRow = await db.get(`SELECT COUNT(*) c FROM landing_messages WHERE status = ${P(1)}`, ['unread']);
      res.json({
        items: rows,
        total: totalRow ? Number(Object.values(totalRow)[0]) : 0,
        unread: unreadRow ? Number(Object.values(unreadRow)[0]) : 0,
        limit, offset
      });
    } catch (err) {
      console.error('[ROOT API] GET /landing-messages:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/root/landing-messages/:id/status  { status: 'unread'|'read'|'archived' }
  router.post('/landing-messages/:id/status', async (req, res) => {
    try {
      const status = req.body && req.body.status;
      if (!['unread', 'read', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      const result = await db.run(
        `UPDATE landing_messages SET status = ${P(1)} WHERE id = ${P(2)}`,
        [status, req.params.id]
      );
      if (!result || !result.changes) return res.status(404).json({ error: 'not_found' });
      logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'landing_message_status', target: req.params.id, details: { status }, ip: clientIp(req) });
      res.json({ success: true, status });
    } catch (err) {
      console.error('[ROOT API] POST /landing-messages/:id/status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/root/landing-messages/:id
  router.delete('/landing-messages/:id', async (req, res) => {
    try {
      const result = await db.run(`DELETE FROM landing_messages WHERE id = ${P(1)}`, [req.params.id]);
      if (!result || !result.changes) return res.status(404).json({ error: 'not_found' });
      logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'landing_message_deleted', target: req.params.id, ip: clientIp(req) });
      res.json({ success: true });
    } catch (err) {
      console.error('[ROOT API] DELETE /landing-messages/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/root/landing-messages/export.csv?status=&q= — CSV of the current filter.
  router.get('/landing-messages/export.csv', async (req, res) => {
    try {
      const { whereSql, args } = landingFilter(req.query);
      const rows = await db.all(`SELECT * FROM landing_messages ${whereSql} ORDER BY created_at DESC`, args);
      const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const header = ['Tarih', 'Ad', 'Restoran', 'E-posta', 'Telefon', 'Ülke', 'Durum', 'Mesaj'];
      const lines = [header.map(esc).join(',')];
      for (const r of rows) {
        lines.push([
          new Date(Number(r.created_at)).toISOString(),
          r.name, r.restaurant, r.email, r.phone, r.country, r.status, r.message
        ].map(esc).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="landing-messages-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send('﻿' + lines.join('\r\n'));
    } catch (err) {
      console.error('[ROOT API] GET /landing-messages/export.csv:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/root/analytics?days=30 — platform-wide aggregate across ALL tenants (root-only).
  router.get('/analytics', async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
      const since = Date.now() - days * 86400000;
      const orders = await db.all(`SELECT tenant_id, total, created_at, order_type FROM orders WHERE created_at >= ${P(1)}`, [since]);
      let revenue = 0, delivery = 0, dinein = 0; const byDay = {}, byTenant = {};
      for (const o of orders) {
        const t = Number(o.total) || 0; revenue += t;
        const isDinein = o.order_type === 'dinein';
        if (isDinein) dinein++; else delivery++;
        const key = new Date(Number(o.created_at)).toISOString().slice(0, 10);
        const day = (byDay[key] = byDay[key] || { date: key, orders: 0, revenue: 0, delivery: 0, dinein: 0 });
        day.orders++; day.revenue += t;
        if (isDinein) day.dinein++; else day.delivery++;
        (byTenant[o.tenant_id] = byTenant[o.tenant_id] || { tenant: o.tenant_id, orders: 0, revenue: 0 }).orders++; byTenant[o.tenant_id].revenue += t;
      }
      const series = [];
      for (let i = days - 1; i >= 0; i--) {
        const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        series.push(byDay[key] || { date: key, orders: 0, revenue: 0, delivery: 0, dinein: 0 });
      }
      const topTenants = Object.values(byTenant).sort((a, b) => b.orders - a.orders).slice(0, 8).map(t => ({ tenant: t.tenant, orders: t.orders, revenue: +t.revenue.toFixed(2) }));
      const tenantsRow = await db.get('SELECT COUNT(*) c FROM tenants');
      const rezRow = await db.get('SELECT COUNT(*) c FROM reservations');
      res.json({
        days,
        summary: {
          tenants: tenantsRow ? Number(Object.values(tenantsRow)[0]) : 0,
          orders: orders.length,
          revenue: +revenue.toFixed(2),
          avgOrderValue: orders.length ? +(revenue / orders.length).toFixed(2) : 0,
          reservations: rezRow ? Number(Object.values(rezRow)[0]) : 0
        },
        typeSplit: { delivery, dinein },
        ordersByDay: series,
        topTenants
      });
    } catch (err) {
      console.error('[ROOT API] GET /analytics:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Root Notification Center (broadcast to one/many/all tenants) ----------

  // POST /api/root/notifications — send a push notification to selected tenants (or all).
  // body: { title, body, url?, image?, icon?, priority?, ttl?, target: 'all' | [tenantSlug,...] }
  // Each target tenant gets its OWN notification row (tenant_id scoped) + delivery to only its subs.
  router.post('/notifications', async (req, res) => {
    try {
      const { title, body, url, image, icon, priority, ttl } = req.body || {};
      if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });

      let target = req.body && req.body.target;
      let tenantIds;
      if (!target || target === 'all') {
        const rows = await db.all("SELECT id FROM tenants WHERE status = 'active'");
        tenantIds = rows.map(r => r.id);
      } else if (Array.isArray(target)) {
        tenantIds = target.filter(Boolean).map(String);
      } else {
        return res.status(400).json({ error: "target must be 'all' or an array of tenant ids" });
      }
      if (!tenantIds.length) return res.status(400).json({ error: 'No target tenants' });

      const nowStr = new Date().toISOString();
      const sentTo = [];
      for (const tid of tenantIds) {
        const id = `notif-root-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await db.run(
          isPg
            ? 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,0,0)'
            : 'INSERT INTO notifications (id, tenant_id, title, body, image, icon, url, target, created_at, sent_at, status, priority, ttl, tag, collapse_key, created_by, success_count, failed_count, click_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)',
          [id, tid, title, body, image || '', icon || '', url || '', 'all', nowStr, nowStr, 'sending',
           priority || 'normal', parseInt(ttl || 24), '', '', 'root']
        );
        const notif = await db.get(`SELECT * FROM notifications WHERE id = ${P(1)}`, [id]);
        if (typeof sendPush === 'function') sendPush(notif);   // async fire-and-forget; scoped to this tenant's subs
        sentTo.push({ tenant: tid, notifId: id });
      }

      logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'notification_broadcast',
        target: (Array.isArray(target) ? target.join(',') : 'all'), details: title, ip: clientIp(req) });
      res.json({ success: true, count: sentTo.length, sentTo });
    } catch (err) {
      console.error('[ROOT API] POST /notifications:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/root/notifications?limit= — cross-tenant notification history (root-only).
  router.get('/notifications', async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
      const rows = await db.all(
        `SELECT id, tenant_id, title, body, target, status, success_count, failed_count, click_count, created_by, created_at
         FROM notifications ORDER BY created_at DESC LIMIT ${P(1)}`,
        [limit]
      );
      res.json({ items: rows, limit });
    } catch (err) {
      console.error('[ROOT API] GET /notifications:', err);
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

  // ---------- Groq AI Setup Assistant (Phase 26, provider swapped Phase 38) ----------
  // Reuses getPlatform/savePlatform — ai_key lives inside the same platform_settings JSON blob
  // (the "never leak ai_key" mask already existed at GET /platform-settings, line ~321, written
  // in anticipation of this). The key is NEVER sent to the frontend — only key_set:boolean.
  // Swapped from Gemini to Groq (Phase 38): Gemini's generateContent quota needs a billing account
  // linked to the underlying Google Cloud project even to use the nominal "free tier" — a key can
  // pass a cheap validation call but every real generation request 404s with "limit: 0" without
  // billing. Groq's free tier needs no card. Groq's API is OpenAI-compatible.
  const DEFAULT_AI_MODEL = 'llama-3.3-70b-versatile';
  // A value saved before the Phase 38 Groq swap ("gemini-...") is not a valid Groq model — treat
  // it as unset so old installs fall through to the new default instead of sending a doomed request.
  const cleanAiModel = m => (m && !/^gemini/i.test(m)) ? m : '';

  router.get('/ai-settings', async (req, res) => {
    try {
      const p = await getPlatform();
      res.json({
        ai_enabled: !!p.ai_enabled,
        ai_provider: 'groq',
        ai_model: cleanAiModel(p.ai_model) || DEFAULT_AI_MODEL,
        key_set: !!p.ai_key
      });
    } catch (err) {
      console.error('[ROOT API] GET /ai-settings:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/ai-settings', async (req, res) => {
    try {
      const p = await getPlatform();
      const b = req.body || {};
      p.ai_enabled = !!b.ai_enabled;
      p.ai_model = String(b.ai_model || DEFAULT_AI_MODEL).trim().slice(0, 60);
      p.ai_provider = 'groq';
      // Only overwrite the stored key if a non-empty one was submitted (leaves it untouched
      // when the admin saves other fields without retyping the key).
      if (typeof b.ai_key === 'string' && b.ai_key.trim()) {
        p.ai_key = b.ai_key.trim();
      }
      await savePlatform(p);
      logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'ai_settings_updated', target: 'platform', details: { ai_enabled: p.ai_enabled, ai_model: p.ai_model, key_changed: !!(b.ai_key && b.ai_key.trim()) }, ip: clientIp(req) });
      res.json({ success: true });
    } catch (err) {
      console.error('[ROOT API] PUT /ai-settings:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/root/ai-settings/test — validates a Groq key with a cheap model-list call
  // (no content generation, no quota spent). Tests the submitted key, or falls back to the saved one.
  router.post('/ai-settings/test', async (req, res) => {
    try {
      const b = req.body || {};
      let key = typeof b.ai_key === 'string' ? b.ai_key.trim() : '';
      if (!key) { const p = await getPlatform(); key = p.ai_key || ''; }
      if (!key) return res.json({ ok: false, error: 'no_key_configured' });

      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (r.ok) return res.json({ ok: true });
      const errBody = await r.json().catch(() => ({}));
      return res.json({ ok: false, error: (errBody.error && errBody.error.message) || ('http_' + r.status) });
    } catch (err) {
      console.error('[ROOT API] POST /ai-settings/test:', err);
      res.json({ ok: false, error: 'network_error' });
    }
  });

  // ---------- AI Assistant (Phase 27, extended Phase 30) — Root ----------
  // Two scopes, chosen by the caller's `targetTenant`:
  //   'platform'  → edits ALLOWED_PLATFORM_KEYS via savePlatform() (exactly like PUT /platform-settings)
  //   <tenantId>  → edits THAT tenant's products/categories via the same tenant_id-guarded UPDATE
  //                 the tenant-side assistant and PUT /api/products/:id already use.
  // The plan cache records which scope it was built for; execute refuses to apply it anywhere else.
  const rootAiPlanCache = new Map(); // planId -> { scope, actions, createdAt }
  const ROOT_AI_PLAN_TTL_MS = 10 * 60 * 1000;
  // Same menu whitelist the tenant-side assistant enforces (server.js AI_FIELD_WHITELIST).
  const ROOT_AI_MENU_WHITELIST = {
    products: ['name_tr', 'name_en', 'description_tr', 'description_en', 'price', 'category'],
    categories: ['name_tr', 'name_en']
  };

  // OpenAI-compatible: Bearer auth, messages array, response_format json_object. See server.js's
  // callAiJSON for the tenant-side twin of this function (identical shape, different call sites).
  async function callAiJSONRoot(key, model, systemPrompt, userMessage) {
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

  router.post('/ai-assistant/plan', async (req, res) => {
    try {
      const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
      if (!message) return res.status(400).json({ error: 'message_required' });
      const p = await getPlatform();
      if (!p.ai_enabled || !p.ai_key) return res.status(400).json({ error: 'ai_not_configured' });

      const scope = String((req.body && req.body.targetTenant) || '').trim() || 'platform';
      let systemPrompt, resolveActions;

      if (scope === 'platform') {
        const current = {}; for (const k of ALLOWED_PLATFORM_KEYS) current[k] = p[k] || '';
        systemPrompt = `Sen HASACA platformunun Root panelindeki asistansın. Sana platformun MEVCUT
ayarları JSON olarak verilecek. Kullanıcının isteğini SADECE aşağıdaki şemayla yanıtla:
{"summary": string, "actions": [{"field": string, "newValue": string}], "unsupported": [string]}
İzin verilen alanlar SADECE şunlardır: ${ALLOWED_PLATFORM_KEYS.join(', ')}. Bir restoran kiracısının
menüsü/fiyatı/rezervasyonu gibi bu listede olmayan bir şey istenirse "unsupported" listesine ekle,
ASLA action üretme.
Mevcut ayarlar: ${JSON.stringify(current)}`;
        resolveActions = (plan, unsupported) => {
          const out = [];
          for (const a of (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 20)) {
            if (!ALLOWED_PLATFORM_KEYS.includes(a.field)) { unsupported.push(`Desteklenmeyen alan: ${a.field}`); continue; }
            out.push({ field: a.field, label: a.field, oldValue: current[a.field] || '', newValue: String(a.newValue ?? '').slice(0, 2000) });
          }
          return out;
        };
      } else {
        // Tenant-targeted (Phase 30): Root edits ONE named tenant's menu, through the same
        // tenant_id-scoped statements the tenant's own admin panel uses.
        const t = await db.get(`SELECT id FROM tenants WHERE id = ${P(1)}`, [scope]);
        if (!t) return res.status(404).json({ error: 'tenant_not_found' });
        const products = await db.all(
          `SELECT id, name_tr, name_en, description_tr, description_en, category, price FROM products WHERE tenant_id = ${P(1)}`, [scope]
        );
        const categories = await db.all(`SELECT id, name_tr, name_en FROM categories WHERE tenant_id = ${P(1)}`, [scope]);
        systemPrompt = `Sen bir restoran yönetim panelinin asistanısın. Sana restoranın ürün ve kategori
verisi JSON olarak verilecek. Kullanıcının isteğini SADECE aşağıdaki JSON şemasıyla, SADECE verilen
id'leri kullanarak yanıtla. Hesaplama gerekiyorsa (yüzde artış, büyük harf, metin değişimi, çeviri vb.)
SONUCU SEN HESAPLA ve newValue alanına nihai değeri yaz — asla formül yazma.
Şema: {"summary": string, "actions": [{"table": "products"|"categories", "targetId": string,
"field": string, "newValue": string}], "unsupported": [string]}
İzin verilen alanlar — products: ${ROOT_AI_MENU_WHITELIST.products.join(', ')}.
categories: ${ROOT_AI_MENU_WHITELIST.categories.join(', ')}. Sistemde OLMAYAN bir şey istenirse
(örn. açılış saati, telefon numarası) onu "unsupported" listesine kısa bir açıklamayla ekle, ASLA
action üretme. Fiyat (price) her zaman sayı olarak string'e çevrilip yazılmalı (örn. "112.5").
Ürünler: ${JSON.stringify(products)}
Kategoriler: ${JSON.stringify(categories)}`;
        const productsById = Object.fromEntries(products.map(x => [x.id, x]));
        const categoriesById = Object.fromEntries(categories.map(x => [x.id, x]));
        resolveActions = (plan, unsupported) => {
          const out = [];
          for (const a of (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 50)) {
            const table = a.table === 'categories' ? 'categories' : (a.table === 'products' ? 'products' : null);
            if (!table || !ROOT_AI_MENU_WHITELIST[table].includes(a.field)) { unsupported.push(`Desteklenmeyen alan: ${a.field}`); continue; }
            const row = table === 'products' ? productsById[a.targetId] : categoriesById[a.targetId];
            if (!row) { unsupported.push(`Bulunamayan kayıt: ${a.targetId}`); continue; }
            out.push({ table, targetId: a.targetId, field: a.field, label: `${row.name_tr || a.targetId} · ${a.field}`,
              oldValue: row[a.field], newValue: String(a.newValue ?? '').slice(0, 2000) });
          }
          return out;
        };
      }

      let plan;
      try { plan = await callAiJSONRoot(p.ai_key, cleanAiModel(p.ai_model) || DEFAULT_AI_MODEL, systemPrompt, message); }
      catch (e) { return res.json({ planId: null, summary: '', actions: [], unsupported: [], error: e.message }); }

      const unsupported = Array.isArray(plan.unsupported) ? plan.unsupported.slice(0, 20) : [];
      const actions = resolveActions(plan, unsupported);
      if (!actions.length) return res.json({ planId: null, summary: plan.summary || '', actions: [], unsupported });

      const planId = 'aip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      rootAiPlanCache.set(planId, { scope, actions, createdAt: Date.now() });
      res.json({ planId, scope, summary: plan.summary || '', actions, unsupported });
    } catch (err) {
      console.error('[ROOT API] POST /ai-assistant/plan:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ai-assistant/execute', async (req, res) => {
    try {
      const planId = req.body && req.body.planId;
      const cached = planId && rootAiPlanCache.get(planId);
      if (!cached) return res.status(404).json({ error: 'plan_not_found' });
      rootAiPlanCache.delete(planId);
      if (Date.now() - cached.createdAt > ROOT_AI_PLAN_TTL_MS) return res.status(410).json({ error: 'plan_expired' });

      const scope = cached.scope || 'platform';
      if (scope === 'platform') {
        const p = await getPlatform();
        for (const a of cached.actions) p[a.field] = a.newValue;
        await savePlatform(p);
        logActivity({ tenantId: '', actor: 'root', role: 'root', action: 'ai_assistant_applied', target: 'platform', details: cached.actions.map(a => a.field).join(','), ip: clientIp(req) });
        return res.json({ success: true, applied: cached.actions, summary: `${cached.actions.length} değişiklik uygulandı.` });
      }

      // Tenant-targeted: re-verify every row still belongs to the tenant this plan was built for,
      // immediately before writing — the plan's own scope is the isolation boundary.
      const applied = [];
      for (const a of cached.actions) {
        const exists = await db.get(`SELECT id FROM ${a.table} WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [a.targetId, scope]);
        if (!exists) continue;
        await db.run(`UPDATE ${a.table} SET ${a.field} = ${P(1)} WHERE id = ${P(2)} AND tenant_id = ${P(3)}`, [a.newValue, a.targetId, scope]);
        applied.push(a);
      }
      logActivity({ tenantId: scope, actor: 'root', role: 'root', action: 'ai_assistant_applied', target: `${applied.length} field(s)`, details: applied.map(a => `${a.table}.${a.field}`).join(','), ip: clientIp(req) });
      res.json({ success: true, applied, summary: `${applied.length} değişiklik uygulandı.` });
    } catch (err) {
      console.error('[ROOT API] POST /ai-assistant/execute:', err);
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

  return router;
};

function safeParse(json) {
  try { return JSON.parse(json || '{}') || {}; } catch (e) { return {}; }
}

// tables.js requires this directly from root.js — re-exported from the shared module so that
// contract keeps working unchanged (the tenant-creation logic itself moved to
// backend/lib/tenantProvisioning.js, see the require() near the top of this file).
module.exports.generateTableToken = createTenantProvisioner.generateTableToken;
