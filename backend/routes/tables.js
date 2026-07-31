// =============================================
// HASACA Platform — QR Table Ordering routes
// Table CRUD + permanent QR tokens + QR image generation,
// customer table context, and waiter/bill service requests.
// All tenant-scoped. Mounted at /api in server.js.
// =============================================

const express = require('express');
const QRCode = require('qrcode');
const { generateTableToken } = require('./root');

module.exports = function createTablesRouter({ db, isPg, events, adminAuth, rateLimiter }) {
  const router = express.Router();
  const P = (n) => (isPg ? `$${n}` : '?');
  const now = () => Date.now();

  function mapTable(row) {
    return {
      id: row.id, name: row.name, description: row.description || '',
      token: row.token, sort_order: row.sort_order, active: row.active === 1 || row.active === true,
      created_at: row.created_at
    };
  }

  // Build the customer-facing QR URL for a table.
  // Always includes ?tenant= so single-domain deployments (Netlify → Render) route correctly.
  // Phase 36: 'default' is no longer special-cased here — it gets ?tenant=default like every
  // other tenant, since a bare URL with no ?tenant= no longer resolves to any real tenant at all.
  function buildTableUrl(req, tenantId, token) {
    const tenantParam = tenantId ? ('?tenant=' + tenantId) : '';

    // 1) An explicit platform origin always wins (e.g. PLATFORM_ORIGIN=https://hasaca.com).
    let origin = process.env.PLATFORM_ORIGIN;

    // 2) Otherwise use the site the admin is actually browsing. Behind the Netlify -> Render
    //    proxy the API only ever sees its OWN hostname (Netlify does not forward the original
    //    host), so trusting host/x-forwarded-host bakes `hasaca-api.onrender.com` into every
    //    printed QR code and sends customers to the raw API domain. Origin/Referer survive the
    //    proxy and still carry the real customer-facing site.
    if (!origin) {
      const ref = req.headers.origin || req.headers.referer || '';
      if (ref) { try { origin = new URL(ref).origin; } catch (e) {} }
    }

    // 3) Last resort: the request host (correct for same-origin / local dev).
    if (!origin) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      origin = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
    }

    return origin.replace(/\/+$/, '') + '/t/' + token + tenantParam;
  }

  // ---------- TABLE MANAGEMENT (admin) ----------

  // GET /api/tables — list this tenant's tables
  router.get('/tables', adminAuth, async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT * FROM tables WHERE tenant_id = ${P(1)} ORDER BY sort_order ASC, created_at ASC`,
        [req.tenantId]
      );
      res.json(rows.map(mapTable));
    } catch (err) {
      console.error('[API ERROR] GET /api/tables:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tables — create one, or bulk-generate { count }
  router.post('/tables', adminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const count = Math.min(100, Math.max(1, parseInt(body.count, 10) || 1));

      // Continue numbering after the highest existing "Masa N"
      const existing = await db.all(
        `SELECT name FROM tables WHERE tenant_id = ${P(1)}`, [req.tenantId]
      );
      let maxNum = 0;
      for (const r of existing) {
        const m = /(\d+)\s*$/.exec(r.name || '');
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }

      const created = [];
      if (count === 1 && body.name) {
        const id = `table-${req.tenantId}-${now()}-${Math.random().toString(36).slice(2, 6)}`;
        const token = generateTableToken();
        await db.run(
          `INSERT INTO tables (id, tenant_id, token, name, description, sort_order, active, created_at)
           VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},1,${P(7)})`,
          [id, req.tenantId, token, String(body.name).trim(), String(body.description || '').trim(), maxNum + 1, now()]
        );
        created.push({ id, token, name: String(body.name).trim() });
      } else {
        for (let i = 1; i <= count; i++) {
          const num = maxNum + i;
          const id = `table-${req.tenantId}-${now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;
          const token = generateTableToken();
          const name = body.name_prefix ? `${body.name_prefix} ${num}` : `Masa ${num}`;
          await db.run(
            `INSERT INTO tables (id, tenant_id, token, name, description, sort_order, active, created_at)
             VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},1,${P(7)})`,
            [id, req.tenantId, token, name, '', num, now()]
          );
          created.push({ id, token, name });
        }
      }
      res.status(201).json({ success: true, created });
    } catch (err) {
      console.error('[API ERROR] POST /api/tables:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/tables/:id — rename / edit (token is NEVER changed here)
  router.put('/tables/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const t = await db.get(
        `SELECT * FROM tables WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]
      );
      if (!t) return res.status(404).json({ error: 'Table not found' });
      await db.run(
        `UPDATE tables SET name = ${P(1)}, description = ${P(2)}, active = ${P(3)} WHERE id = ${P(4)} AND tenant_id = ${P(5)}`,
        [b.name != null ? String(b.name).trim() : t.name,
         b.description != null ? String(b.description).trim() : t.description,
         b.active === false ? 0 : 1, req.params.id, req.tenantId]
      );
      const updated = await db.get(`SELECT * FROM tables WHERE id = ${P(1)}`, [req.params.id]);
      res.json(mapTable(updated));
    } catch (err) {
      console.error('[API ERROR] PUT /api/tables/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/tables/:id — permanently invalidates the QR (token gone)
  router.delete('/tables/:id', adminAuth, async (req, res) => {
    try {
      const result = await db.run(
        `DELETE FROM tables WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Table not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[API ERROR] DELETE /api/tables/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Phase 29: per-tenant QR appearance, stored at settings.qr_style. Missing key/entry falls back
  // to exactly the pre-Phase-29 hardcoded defaults, so untouched tenants render byte-identical QRs.
  async function getQrOptions(tenantId) {
    const row = await db.get(`SELECT settings FROM tenants WHERE id = ${P(1)}`, [tenantId]);
    let s = {}; try { s = JSON.parse((row && row.settings) || '{}') || {}; } catch (e) {}
    const q = s.qr_style || {};
    return {
      width: 512,
      margin: Number.isInteger(q.margin) ? q.margin : 1,
      errorCorrectionLevel: q.ecc || 'M',
      color: { dark: q.fg || '#000000ff', light: q.bg || '#ffffffff' }
    };
  }

  // GET /api/tables/:id/qr — QR image (PNG data-uri + SVG) + the encoded URL
  router.get('/tables/:id/qr', adminAuth, async (req, res) => {
    try {
      const t = await db.get(
        `SELECT * FROM tables WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]
      );
      if (!t) return res.status(404).json({ error: 'Table not found' });
      const url = buildTableUrl(req, req.tenantId, t.token);
      const opts = await getQrOptions(req.tenantId);
      const [png, svg] = await Promise.all([
        QRCode.toDataURL(url, opts),
        QRCode.toString(url, { ...opts, type: 'svg' })
      ]);
      res.json({ id: t.id, name: t.name, token: t.token, url, png, svg });
    } catch (err) {
      console.error('[API ERROR] GET /api/tables/:id/qr:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/tables-qr — all QR codes for this tenant (bulk print/download)
  router.get('/tables-qr', adminAuth, async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT * FROM tables WHERE tenant_id = ${P(1)} ORDER BY sort_order ASC, created_at ASC`,
        [req.tenantId]
      );
      const opts = await getQrOptions(req.tenantId);
      const out = [];
      for (const t of rows) {
        const url = buildTableUrl(req, req.tenantId, t.token);
        const png = await QRCode.toDataURL(url, opts);
        out.push({ id: t.id, name: t.name, token: t.token, url, png });
      }
      res.json(out);
    } catch (err) {
      console.error('[API ERROR] GET /api/tables-qr:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- CUSTOMER TABLE CONTEXT (public) ----------

  // GET /api/t/:token/context — resolve the scanned table within the current tenant.
  // On single-domain deployments (Netlify) req.tenantId may be 'default';
  // we look up the table by token alone and derive the real tenant from it.
  router.get('/t/:token/context', async (req, res) => {
    try {
      const t = await db.get(
        `SELECT * FROM tables WHERE token = ${P(1)}`, [req.params.token]
      );
      if (!t || !(t.active === 1 || t.active === true)) return res.status(404).json({ error: 'Table not found' });
      res.json({ tenant_id: t.tenant_id, table_id: t.id, table_name: t.name, token: t.token });
    } catch (err) {
      console.error('[API ERROR] GET /api/t/:token/context:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/t/:token/service — customer calls waiter / requests bill
  // On single-domain deployments the table token is globally unique; derive tenant from table.
  router.post('/t/:token/service', rateLimiter(20), async (req, res) => {
    try {
      const type = (req.body && req.body.type) === 'bill' ? 'bill' : 'waiter';
      const t = await db.get(
        `SELECT * FROM tables WHERE token = ${P(1)}`, [req.params.token]
      );
      if (!t) return res.status(404).json({ error: 'Table not found' });
      const tenantId = t.tenant_id; // always correct, regardless of host

      // Collapse duplicate open requests of the same type for the same table
      const open = await db.get(
        `SELECT id FROM service_requests WHERE tenant_id = ${P(1)} AND table_id = ${P(2)} AND type = ${P(3)} AND status = 'open'`,
        [tenantId, t.id, type]
      );
      if (open) return res.json({ success: true, deduped: true });

      const id = `svc-${now()}-${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        `INSERT INTO service_requests (id, tenant_id, table_id, type, status, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},'open',${P(5)})`,
        [id, tenantId, t.id, type, now()]
      );
      events.publishToAdmin(tenantId, 'service_request', { id, table_id: t.id, table_name: t.name, type, created_at: now() });
      res.status(201).json({ success: true, id });
    } catch (err) {
      console.error('[API ERROR] POST /api/t/:token/service:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- SERVICE REQUESTS (admin) ----------

  router.get('/service-requests', adminAuth, async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT s.*, t.name AS table_name FROM service_requests s
         LEFT JOIN tables t ON t.id = s.table_id
         WHERE s.tenant_id = ${P(1)} AND s.status = 'open' ORDER BY s.created_at ASC`,
        [req.tenantId]
      );
      res.json(rows);
    } catch (err) {
      console.error('[API ERROR] GET /api/service-requests:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/service-requests/:id/resolve', adminAuth, async (req, res) => {
    try {
      const result = await db.run(
        `UPDATE service_requests SET status = 'resolved', resolved_at = ${P(1)} WHERE id = ${P(2)} AND tenant_id = ${P(3)}`,
        [now(), req.params.id, req.tenantId]
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Service request not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[API ERROR] PUT /api/service-requests/:id/resolve:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
