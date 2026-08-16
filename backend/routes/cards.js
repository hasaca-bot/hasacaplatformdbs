// =============================================
// HASACA Platform — NFC + QR masa kartı routes (tenant tarafı)
// Hazır tasarım seçimi (designId) → onay → fiziksel kart siparişi oluşturma.
// Masa/QR sistemi YENİDEN YAZILMAZ: masalar mevcut `tables` tablosundan okunur,
// URL'ler lib/tableUrl.js ile üretilir (QR route'uyla birebir aynı).
// Tümü tenant-scoped. server.js'de /api altına mount edilir.
// =============================================

const express = require('express');
// Galeri kaydı (id listesi) TEK kaynaktan — admin.html/root.html/landing.html
// aynı dosyayı yüklüyor, id'ler burada ayrıca kopyalanmıyor.
const HasacaGallery = require('../../card-gallery.js');
const { buildTableUrl } = require('../lib/tableUrl');
const { logActivity } = require('../db');

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

// Sipariş durumları — tenant onayından teslimata. Root Panel bu sırayla ilerletir.
// Dışa açık: backend/routes/root.js aynı listeyi kullanır (durum whitelist'i tek yerde).
const ORDER_STATUSES = ['design_approved', 'print_pending', 'printing', 'shipped', 'delivered', 'cancelled'];
// Tenant'ın yeni bir tasarım turu başlatmasını engelleyen "hâlâ işlemde" durumları.
const OPEN_STATUSES = ['design_approved', 'print_pending', 'printing', 'shipped'];

module.exports = function createCardsRouter({ db, isPg, adminAuth, rateLimiter }) {
  const router = express.Router();
  const P = (n) => (isPg ? `$${n}` : '?');
  const now = () => Date.now();
  const rl = typeof rateLimiter === 'function' ? rateLimiter : () => (req, res, next) => next();

  function mapOrder(row) {
    let design = {}, tables = [], delivery = {};
    try { design = JSON.parse(row.design || '{}'); } catch (e) {}
    try { tables = JSON.parse(row.tables_snapshot || '[]'); } catch (e) {}
    try { delivery = JSON.parse(row.delivery || '{}'); } catch (e) {}
    return {
      id: row.id, tenant_id: row.tenant_id,
      designId: design.designId || null, tables, delivery,
      table_count: row.table_count, status: row.status, root_note: row.root_note || '',
      created_at: row.created_at, updated_at: row.updated_at
    };
  }

  // Bu tenant'ın hâlâ işlemdeki (iptal/teslim edilmemiş) en yeni siparişi.
  async function findOpenOrder(tenantId) {
    const placeholders = OPEN_STATUSES.map((_, i) => P(i + 2)).join(',');
    return db.get(
      `SELECT * FROM card_orders WHERE tenant_id = ${P(1)} AND status IN (${placeholders})
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, ...OPEN_STATUSES]
    );
  }

  /**
   * Teslimat adresini doğrular. Hata mesajları Türkçe ve kullanıcıya doğrudan
   * gösterilebilir (UX kuralı: teknik hata kodu gösterme).
   */
  function validateDelivery(input) {
    const d = (input && typeof input === 'object') ? input : {};
    const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const out = {
      contact:  str(d.contact, 120),
      phone:    str(d.phone, 30),
      city:     str(d.city, 60),
      district: str(d.district, 60),
      address:  str(d.address, 400),
      postal:   str(d.postal, 20),
      note:     str(d.note, 400)
    };
    const errors = [];
    if (!out.contact)  errors.push('Yetkili kişi adı gerekli.');
    if (!out.phone)    errors.push('Telefon numarası gerekli.');
    else if (out.phone.replace(/\D/g, '').length < 10) errors.push('Telefon numarası geçersiz görünüyor.');
    if (!out.city)     errors.push('İl gerekli.');
    if (!out.district) errors.push('İlçe gerekli.');
    if (out.address.length < 10) errors.push('Açık adres çok kısa.');
    return { delivery: out, errors };
  }

  // ---------- GET /api/card-design — mevcut seçim + açık sipariş durumu ----------
  router.get('/card-design', adminAuth, async (req, res) => {
    try {
      const row = await db.get(
        `SELECT * FROM card_designs WHERE tenant_id = ${P(1)}`, [req.tenantId]
      );
      let designId = null;
      if (row) {
        try { designId = HasacaGallery.normalizeDesignId(JSON.parse(row.design || '{}').designId); } catch (e) {}
      }

      const openRow = await findOpenOrder(req.tenantId);
      const tableCount = await db.get(
        `SELECT COUNT(*) AS n FROM tables WHERE tenant_id = ${P(1)} AND active = 1`, [req.tenantId]
      );

      res.json({
        designId,
        hasDesign: !!designId,
        tableCount: Number((tableCount && tableCount.n) || 0),
        order: openRow ? mapOrder(openRow) : null
      });
    } catch (err) {
      console.error('[API ERROR] GET /api/card-design:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- PUT /api/card-design — seçimi kaydet ----------
  // Tenant başına TEK aktif seçim (card_designs üzerindeki unique index bunu
  // veritabanı seviyesinde de garanti ediyor), bu yüzden upsert.
  router.put('/card-design', adminAuth, async (req, res) => {
    try {
      const designId = HasacaGallery.normalizeDesignId(req.body && req.body.designId);
      if (!designId) {
        return res.status(400).json({ error: 'invalid_design', message: 'Geçersiz tasarım seçimi.' });
      }
      const ts = now();
      const existing = await db.get(
        `SELECT id FROM card_designs WHERE tenant_id = ${P(1)}`, [req.tenantId]
      );
      const payload = JSON.stringify({ designId });
      if (existing) {
        await db.run(
          `UPDATE card_designs SET design = ${P(1)}, updated_at = ${P(2)} WHERE id = ${P(3)}`,
          [payload, ts, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO card_designs (id, tenant_id, design, updated_at) VALUES (${P(1)},${P(2)},${P(3)},${P(4)})`,
          [`carddes-${req.tenantId}-${ts}`, req.tenantId, payload, ts]
        );
      }
      res.json({ success: true, designId });
    } catch (err) {
      console.error('[API ERROR] PUT /api/card-design:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/card-design/approve — onayla ve sipariş oluştur ----------
  router.post('/card-design/approve', adminAuth, rl(10), async (req, res) => {
    try {
      const open = await findOpenOrder(req.tenantId);
      if (open) {
        return res.status(409).json({
          error: 'order_in_progress',
          message: 'Halihazırda işlemde olan bir kart siparişiniz var. Yeni sipariş için mevcut siparişin tamamlanmasını bekleyin.',
          order: mapOrder(open)
        });
      }

      const row = await db.get(`SELECT * FROM card_designs WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      let designId = null;
      if (row) { try { designId = HasacaGallery.normalizeDesignId(JSON.parse(row.design || '{}').designId); } catch (e) {} }

      const errors = [];
      if (!designId) errors.push('Önce bir tasarım seçin.');

      const { delivery, errors: deliveryErrors } = validateDelivery(req.body && req.body.delivery);
      errors.push(...deliveryErrors);

      // Masalar mevcut sistemden okunur — kart sistemi kendi masa kaydını TUTMAZ.
      const tables = await db.all(
        `SELECT id, name, token FROM tables WHERE tenant_id = ${P(1)} AND active = 1
         ORDER BY sort_order ASC, created_at ASC`, [req.tenantId]
      );
      if (!tables.length) {
        errors.push('Kart basılabilmesi için en az bir masanız olmalı. Önce Masa Yönetimi\'nden masa ekleyin.');
      }

      if (errors.length) {
        return res.status(400).json({ error: 'validation_failed', messages: errors });
      }

      // Onay anındaki masa listesinin KOPYASI. Sonradan masa eklenir/yeniden
      // adlandırılırsa basılacak sipariş değişmemeli.
      const snapshot = tables.map(t => ({
        id: t.id, name: t.name, token: t.token,
        url: buildTableUrl(req, req.tenantId, t.token)
      }));

      const ts = now();
      const orderId = `cardord-${req.tenantId}-${ts}-${Math.random().toString(36).slice(2, 8)}`;
      await db.run(
        `INSERT INTO card_orders
           (id, tenant_id, design, table_count, tables_snapshot, delivery, status, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)})`,
        [orderId, req.tenantId, JSON.stringify({ designId }), snapshot.length,
         JSON.stringify(snapshot), JSON.stringify(delivery), 'design_approved', ts, ts]
      );

      logActivity({
        tenantId: req.tenantId, actor: (req.auth && req.auth.username) || '', role: (req.auth && req.auth.role) || '',
        action: 'card_order_created', target: orderId,
        details: `${snapshot.length} masa · ${designId}`, ip: clientIp(req)
      });

      const created = await db.get(`SELECT * FROM card_orders WHERE id = ${P(1)}`, [orderId]);
      res.json({ success: true, order: mapOrder(created) });
    } catch (err) {
      console.error('[API ERROR] POST /api/card-design/approve:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/card-design/custom-request — özel tasarım talebi ----------
  // Hazır galeri yetmediğinde tenant isteğini serbest metinle anlatır. Talep
  // Root Panel'e düşer; geri dönüş burada verilen e-posta üzerinden yapılır.
  router.post('/card-design/custom-request', adminAuth, rl(5), async (req, res) => {
    try {
      const body = req.body || {};
      const message = String(body.message == null ? '' : body.message).trim().slice(0, 1000);
      const email = String(body.email == null ? '' : body.email).trim().slice(0, 160);
      const errors = [];
      if (message.length < 10) errors.push('Lütfen isteğinizi biraz daha detaylı anlatın (en az 10 karakter).');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Lütfen geçerli bir e-posta adresi girin.');
      if (errors.length) return res.status(400).json({ error: 'validation_failed', messages: errors });

      const ts = now();
      const id = `cardreq-${req.tenantId}-${ts}-${Math.random().toString(36).slice(2, 8)}`;
      await db.run(
        `INSERT INTO card_custom_requests (id, tenant_id, message, email, status, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)})`,
        [id, req.tenantId, message, email, 'new', ts]
      );
      logActivity({
        tenantId: req.tenantId, actor: (req.auth && req.auth.username) || '', role: (req.auth && req.auth.role) || '',
        action: 'card_custom_request', target: id, details: email, ip: clientIp(req)
      });
      res.json({ success: true, id });
    } catch (err) {
      console.error('[API ERROR] POST /api/card-design/custom-request:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

module.exports.ORDER_STATUSES = ORDER_STATUSES;
