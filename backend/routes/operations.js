// =============================================
// HASACA/tada Platform — İşletme Yönetimi (Operations) route'ları
// Tedarikçi, Malzeme, Stok Hareketi, Reçete, Gider, Müşteri.
// Hepsi tenant kapsamlı (her sorgu tenant_id ile kısıtlanır). /api altına bağlanır.
//
// Bu modül, referans olarak incelenen bir dış projeden (Yasas SaaS, Figma export) yalnızca
// İŞLEV KAPSAMI açısından ilham aldı; kodu/tasarımı kopyalanmadı ve o projede olup burada
// karşılığı olmayan hiçbir kavram uydurulmadı.
// =============================================

const express = require('express');

module.exports = function createOperationsRouter({ db, isPg, adminAuth }) {
  const router = express.Router();
  const P = (n) => (isPg ? `$${n}` : '?');
  const now = () => Date.now();

  const newId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Girdi temizleme — admin panelinden gelse bile HTML asla ham saklanmaz (mevcut
  // stripHtmlTags yaklaşımının aynısı, bu modül bağımsız kalsın diye burada).
  const clean = (v, max = 200) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().slice(0, max);
  const num = (v, def = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
  const int = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };

  // Sayfalama — büyük listelerde tüm tabloyu tek seferde göndermemek için. Üst sınır 200:
  // istemci daha fazlasını isteyemez, böylece kötü/bozuk bir istek sunucuyu zorlayamaz.
  const paging = (q) => {
    const limit = Math.min(200, Math.max(1, int(q.limit, 50)));
    const offset = Math.max(0, int(q.offset, 0));
    return { limit, offset };
  };

  // Sıralama sütununu güvenli hale getirir: sütun adı SQL'e parametre olarak BAĞLANAMAZ, o yüzden
  // istemciden gelen değer asla doğrudan kullanılmaz — yalnızca beyaz listedekiler kabul edilir.
  const orderBy = (sort, dir, allowed, fallback) => {
    const col = allowed.includes(String(sort)) ? String(sort) : fallback;
    const d = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    return `ORDER BY ${col} ${d}`;
  };

  // ============================================================
  // TEDARİKÇİLER (suppliers)
  // ============================================================
  const mapSupplier = (r) => ({
    id: r.id, name: r.name, contact_name: r.contact_name || '', phone: r.phone || '',
    email: r.email || '', address: r.address || '', category: r.category || '',
    notes: r.notes || '', active: r.active === 1 || r.active === true,
    created_at: r.created_at, updated_at: r.updated_at
  });

  router.get('/suppliers', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();
      const ord = orderBy(req.query.sort, req.query.dir, ['name', 'category', 'created_at'], 'name');
      const dirIsName = ord.startsWith('ORDER BY name');
      const rows = await db.all(
        `SELECT * FROM suppliers WHERE tenant_id = ${P(1)} ${dirIsName ? 'ORDER BY name ASC' : ord}`,
        [req.tenantId]
      );
      const filtered = search
        ? rows.filter(r => [r.name, r.contact_name, r.category, r.phone, r.email]
            .some(v => String(v || '').toLowerCase().includes(search)))
        : rows;
      res.json({
        total: filtered.length,
        items: filtered.slice(offset, offset + limit).map(mapSupplier)
      });
    } catch (err) {
      console.error('[OPS] GET /suppliers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/suppliers', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const name = clean(b.name, 120);
      if (!name) return res.status(400).json({ error: 'name_required' });
      const id = newId('sup');
      await db.run(
        `INSERT INTO suppliers (id, tenant_id, name, contact_name, phone, email, address, category, notes, active, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)})`,
        [id, req.tenantId, name, clean(b.contact_name, 120), clean(b.phone, 40), clean(b.email, 120),
         clean(b.address, 300), clean(b.category, 60), clean(b.notes, 500),
         b.active === false ? 0 : 1, now(), now()]
      );
      const row = await db.get(`SELECT * FROM suppliers WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [id, req.tenantId]);
      res.status(201).json(mapSupplier(row));
    } catch (err) {
      console.error('[OPS] POST /suppliers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/suppliers/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await db.get(`SELECT * FROM suppliers WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const name = b.name !== undefined ? clean(b.name, 120) : cur.name;
      if (!name) return res.status(400).json({ error: 'name_required' });
      await db.run(
        `UPDATE suppliers SET name=${P(1)}, contact_name=${P(2)}, phone=${P(3)}, email=${P(4)}, address=${P(5)},
         category=${P(6)}, notes=${P(7)}, active=${P(8)}, updated_at=${P(9)} WHERE id=${P(10)} AND tenant_id=${P(11)}`,
        [name,
         b.contact_name !== undefined ? clean(b.contact_name, 120) : cur.contact_name,
         b.phone !== undefined ? clean(b.phone, 40) : cur.phone,
         b.email !== undefined ? clean(b.email, 120) : cur.email,
         b.address !== undefined ? clean(b.address, 300) : cur.address,
         b.category !== undefined ? clean(b.category, 60) : cur.category,
         b.notes !== undefined ? clean(b.notes, 500) : cur.notes,
         b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
         now(), req.params.id, req.tenantId]
      );
      const row = await db.get(`SELECT * FROM suppliers WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      res.json(mapSupplier(row));
    } catch (err) {
      console.error('[OPS] PUT /suppliers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/suppliers/:id', adminAuth, async (req, res) => {
    try {
      // Bu tedarikçiye bağlı malzeme varsa silme — sessizce yetim kayıt bırakmak yerine
      // kullanıcıya neden silinemediğini söylüyoruz.
      const used = await db.get(
        `SELECT COUNT(*) c FROM ingredients WHERE tenant_id = ${P(1)} AND supplier_id = ${P(2)}`,
        [req.tenantId, req.params.id]
      );
      if (used && Number(Object.values(used)[0]) > 0) {
        return res.status(409).json({ error: 'supplier_in_use', count: Number(Object.values(used)[0]) });
      }
      const r = await db.run(`DELETE FROM suppliers WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /suppliers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // MALZEMELER (ingredients)
  // ============================================================
  const mapIngredient = (r) => ({
    id: r.id, name: r.name, sku: r.sku || '', unit: r.unit || 'kg', category: r.category || '',
    stock_qty: num(r.stock_qty), min_stock: num(r.min_stock),
    max_stock: r.max_stock == null ? null : num(r.max_stock),
    unit_cost: num(r.unit_cost), supplier_id: r.supplier_id || '', location: r.location || '',
    active: r.active === 1 || r.active === true,
    // Türetilmiş: istemcinin aynı kuralı tekrar yazmasına gerek kalmasın diye sunucuda hesaplanır.
    is_low: num(r.stock_qty) <= num(r.min_stock),
    stock_pct: num(r.max_stock) > 0 ? Math.max(0, Math.min(100, Math.round((num(r.stock_qty) / num(r.max_stock)) * 100))) : null,
    created_at: r.created_at, updated_at: r.updated_at
  });

  router.get('/ingredients', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();
      const filter = clean(req.query.filter, 20);   // all | low | ok
      const rows = await db.all(`SELECT * FROM ingredients WHERE tenant_id = ${P(1)} ORDER BY name ASC`, [req.tenantId]);
      let list = rows;
      if (search) {
        list = list.filter(r => [r.name, r.sku, r.category, r.location]
          .some(v => String(v || '').toLowerCase().includes(search)));
      }
      if (filter === 'low') list = list.filter(r => num(r.stock_qty) <= num(r.min_stock));
      else if (filter === 'ok') list = list.filter(r => num(r.stock_qty) > num(r.min_stock));

      res.json({
        total: list.length,
        low_count: rows.filter(r => num(r.stock_qty) <= num(r.min_stock)).length,
        items: list.slice(offset, offset + limit).map(mapIngredient)
      });
    } catch (err) {
      console.error('[OPS] GET /ingredients:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ingredients', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const name = clean(b.name, 120);
      if (!name) return res.status(400).json({ error: 'name_required' });
      const id = newId('ing');
      const stock = Math.max(0, num(b.stock_qty));
      await db.run(
        `INSERT INTO ingredients (id, tenant_id, name, sku, unit, category, stock_qty, min_stock, max_stock,
         unit_cost, supplier_id, location, active, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)},${P(13)},${P(14)},${P(15)})`,
        [id, req.tenantId, name, clean(b.sku, 60), clean(b.unit, 20) || 'kg', clean(b.category, 60),
         stock, Math.max(0, num(b.min_stock)), b.max_stock == null || b.max_stock === '' ? null : Math.max(0, num(b.max_stock)),
         Math.max(0, num(b.unit_cost)), clean(b.supplier_id, 60), clean(b.location, 80),
         b.active === false ? 0 : 1, now(), now()]
      );
      // Açılış stoğu varsa deftere de yazılır — bakiye ile hareket geçmişi baştan tutarlı olsun.
      if (stock > 0) {
        await db.run(
          `INSERT INTO stock_movements (id, tenant_id, ingredient_id, type, qty_delta, qty_after, unit_cost, note, actor, created_at)
           VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)})`,
          [newId('mov'), req.tenantId, id, 'in', stock, stock, Math.max(0, num(b.unit_cost)),
           'Açılış stoğu', (req.auth && req.auth.username) || 'admin', now()]
        );
      }
      const row = await db.get(`SELECT * FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [id, req.tenantId]);
      res.status(201).json(mapIngredient(row));
    } catch (err) {
      console.error('[OPS] POST /ingredients:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/ingredients/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await db.get(`SELECT * FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const name = b.name !== undefined ? clean(b.name, 120) : cur.name;
      if (!name) return res.status(400).json({ error: 'name_required' });
      // stock_qty BİLEREK burada güncellenmez — stok yalnızca /stock-movements üzerinden değişir,
      // böylece bakiye ile defter asla birbirinden ayrılamaz.
      await db.run(
        `UPDATE ingredients SET name=${P(1)}, sku=${P(2)}, unit=${P(3)}, category=${P(4)}, min_stock=${P(5)},
         max_stock=${P(6)}, unit_cost=${P(7)}, supplier_id=${P(8)}, location=${P(9)}, active=${P(10)}, updated_at=${P(11)}
         WHERE id=${P(12)} AND tenant_id=${P(13)}`,
        [name,
         b.sku !== undefined ? clean(b.sku, 60) : cur.sku,
         b.unit !== undefined ? (clean(b.unit, 20) || 'kg') : cur.unit,
         b.category !== undefined ? clean(b.category, 60) : cur.category,
         b.min_stock !== undefined ? Math.max(0, num(b.min_stock)) : cur.min_stock,
         b.max_stock !== undefined ? (b.max_stock === '' || b.max_stock == null ? null : Math.max(0, num(b.max_stock))) : cur.max_stock,
         b.unit_cost !== undefined ? Math.max(0, num(b.unit_cost)) : cur.unit_cost,
         b.supplier_id !== undefined ? clean(b.supplier_id, 60) : cur.supplier_id,
         b.location !== undefined ? clean(b.location, 80) : cur.location,
         b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
         now(), req.params.id, req.tenantId]
      );
      const row = await db.get(`SELECT * FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      res.json(mapIngredient(row));
    } catch (err) {
      console.error('[OPS] PUT /ingredients:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/ingredients/:id', adminAuth, async (req, res) => {
    try {
      // Reçetede kullanılıyorsa silinmez (yetim reçete kalemi oluşmasın).
      const recipes = await db.all(`SELECT id, name, items FROM recipes WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      const usedIn = recipes.filter(r => {
        try { return (JSON.parse(r.items || '[]') || []).some(i => i && i.ingredient_id === req.params.id); }
        catch (e) { return false; }
      });
      if (usedIn.length) {
        return res.status(409).json({ error: 'ingredient_in_use', recipes: usedIn.map(r => r.name).slice(0, 5), count: usedIn.length });
      }
      const r = await db.run(`DELETE FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      // Defter kayıtları da temizlenir — malzeme yoksa hareketleri anlamsız kalır.
      await db.run(`DELETE FROM stock_movements WHERE tenant_id = ${P(1)} AND ingredient_id = ${P(2)}`, [req.tenantId, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /ingredients:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // STOK HAREKETLERİ (stock_movements)
  // Stok bakiyesini değiştirmenin TEK yolu burasıdır.
  // ============================================================
  const mapMovement = (r) => ({
    id: r.id, ingredient_id: r.ingredient_id, type: r.type,
    qty_delta: num(r.qty_delta), qty_after: r.qty_after == null ? null : num(r.qty_after),
    unit_cost: num(r.unit_cost), note: r.note || '', actor: r.actor || '', created_at: r.created_at
  });

  router.get('/stock-movements', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const ing = clean(req.query.ingredient_id, 60);
      const rows = ing
        ? await db.all(`SELECT * FROM stock_movements WHERE tenant_id = ${P(1)} AND ingredient_id = ${P(2)} ORDER BY created_at DESC`, [req.tenantId, ing])
        : await db.all(`SELECT * FROM stock_movements WHERE tenant_id = ${P(1)} ORDER BY created_at DESC`, [req.tenantId]);
      // Malzeme adını da ekliyoruz ki istemci ikinci bir istek atmak zorunda kalmasın.
      const names = {};
      (await db.all(`SELECT id, name, unit FROM ingredients WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .forEach(i => { names[i.id] = { name: i.name, unit: i.unit }; });
      res.json({
        total: rows.length,
        items: rows.slice(offset, offset + limit).map(r => ({
          ...mapMovement(r),
          ingredient_name: (names[r.ingredient_id] || {}).name || '(silinmiş malzeme)',
          unit: (names[r.ingredient_id] || {}).unit || ''
        }))
      });
    } catch (err) {
      console.error('[OPS] GET /stock-movements:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stock-movements — giriş / çıkış / sayım düzeltmesi
  //   type=in      → qty kadar ekler
  //   type=out     → qty kadar düşer
  //   type=adjust  → sayım sonucu: yeni bakiyeyi doğrudan qty yapar (fark deftere yazılır)
  router.post('/stock-movements', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const ingredientId = clean(b.ingredient_id, 60);
      const type = ['in', 'out', 'adjust'].includes(b.type) ? b.type : 'in';
      const qty = num(b.qty);
      if (!ingredientId) return res.status(400).json({ error: 'ingredient_required' });
      if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'invalid_qty' });

      const ing = await db.get(`SELECT * FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [ingredientId, req.tenantId]);
      if (!ing) return res.status(404).json({ error: 'ingredient_not_found' });

      const before = num(ing.stock_qty);
      let delta;
      if (type === 'in') delta = qty;
      else if (type === 'out') delta = -qty;
      else delta = qty - before;                       // adjust: hedef bakiyeye götüren fark

      // Stok negatife düşemez — çıkış eldekinden fazlaysa isteği reddediyoruz (sessizce
      // sıfıra çekmek, gerçekte olmayan bir tüketimi kaydetmek olurdu).
      const after = Math.round((before + delta) * 1000) / 1000;
      if (after < 0) return res.status(400).json({ error: 'insufficient_stock', available: before });

      await db.run(
        `INSERT INTO stock_movements (id, tenant_id, ingredient_id, type, qty_delta, qty_after, unit_cost, note, actor, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)})`,
        [newId('mov'), req.tenantId, ingredientId, type, delta, after,
         b.unit_cost !== undefined ? Math.max(0, num(b.unit_cost)) : num(ing.unit_cost),
         clean(b.note, 300), (req.auth && req.auth.username) || 'admin', now()]
      );
      await db.run(
        `UPDATE ingredients SET stock_qty = ${P(1)}, updated_at = ${P(2)} WHERE id = ${P(3)} AND tenant_id = ${P(4)}`,
        [after, now(), ingredientId, req.tenantId]
      );
      const row = await db.get(`SELECT * FROM ingredients WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [ingredientId, req.tenantId]);
      res.status(201).json({ success: true, ingredient: mapIngredient(row) });
    } catch (err) {
      console.error('[OPS] POST /stock-movements:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // REÇETELER (recipes)
  // ============================================================
  function parseItems(raw) {
    let arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { return []; } }
    if (!Array.isArray(arr)) return [];
    return arr.map(i => {
      if (!i || typeof i !== 'object') return null;
      const ingredient_id = clean(i.ingredient_id, 60);
      const qty = num(i.qty);
      if (!ingredient_id || !(qty > 0)) return null;
      return { ingredient_id, qty: Math.round(qty * 1000) / 1000 };
    }).filter(Boolean).slice(0, 60);
  }

  router.get('/recipes', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();
      const rows = await db.all(`SELECT * FROM recipes WHERE tenant_id = ${P(1)} ORDER BY name ASC`, [req.tenantId]);
      const ings = {};
      (await db.all(`SELECT id, name, unit, unit_cost FROM ingredients WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .forEach(i => { ings[i.id] = i; });
      const products = {};
      (await db.all(`SELECT id, name_tr, price FROM products WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .forEach(p => { products[p.id] = p; });

      let list = search ? rows.filter(r => String(r.name || '').toLowerCase().includes(search)) : rows;

      const mapped = list.slice(offset, offset + limit).map(r => {
        const items = parseItems(r.items).map(it => {
          const ing = ings[it.ingredient_id];
          const lineCost = ing ? Math.round(num(ing.unit_cost) * it.qty * 100) / 100 : 0;
          return {
            ...it,
            name: ing ? ing.name : '(silinmiş malzeme)',
            unit: ing ? ing.unit : '',
            unit_cost: ing ? num(ing.unit_cost) : 0,
            line_cost: lineCost,
            missing: !ing
          };
        });
        // Maliyet reçeteden HESAPLANIR, saklanmaz — malzeme fiyatı değişince otomatik güncel kalsın.
        const costTotal = Math.round(items.reduce((s, i) => s + i.line_cost, 0) * 100) / 100;
        const prod = products[r.product_id];
        const sellPrice = prod ? num(prod.price) : 0;
        const servings = Math.max(1, int(r.servings, 1));
        const costPerServing = Math.round((costTotal / servings) * 100) / 100;
        return {
          id: r.id, name: r.name, product_id: r.product_id || '',
          product_name: prod ? prod.name_tr : '',
          category: r.category || '', prep_time: r.prep_time == null ? null : int(r.prep_time),
          servings, items, instructions: r.instructions || '',
          cost_total: costTotal, cost_per_serving: costPerServing,
          selling_price: sellPrice,
          // Kâr marjı sadece ürün bağlıysa ve fiyatı varsa anlamlıdır.
          margin_pct: sellPrice > 0 ? Math.round(((sellPrice - costPerServing) / sellPrice) * 100) : null,
          created_at: r.created_at, updated_at: r.updated_at
        };
      });
      res.json({ total: list.length, items: mapped });
    } catch (err) {
      console.error('[OPS] GET /recipes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/recipes', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const name = clean(b.name, 120);
      if (!name) return res.status(400).json({ error: 'name_required' });
      const id = newId('rec');
      await db.run(
        `INSERT INTO recipes (id, tenant_id, product_id, name, category, prep_time, servings, items, instructions, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)})`,
        [id, req.tenantId, clean(b.product_id, 60), name, clean(b.category, 60),
         b.prep_time == null || b.prep_time === '' ? null : Math.max(0, int(b.prep_time)),
         Math.max(1, int(b.servings, 1)), JSON.stringify(parseItems(b.items)),
         clean(b.instructions, 2000), now(), now()]
      );
      res.status(201).json({ success: true, id });
    } catch (err) {
      console.error('[OPS] POST /recipes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/recipes/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await db.get(`SELECT * FROM recipes WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const name = b.name !== undefined ? clean(b.name, 120) : cur.name;
      if (!name) return res.status(400).json({ error: 'name_required' });
      await db.run(
        `UPDATE recipes SET product_id=${P(1)}, name=${P(2)}, category=${P(3)}, prep_time=${P(4)}, servings=${P(5)},
         items=${P(6)}, instructions=${P(7)}, updated_at=${P(8)} WHERE id=${P(9)} AND tenant_id=${P(10)}`,
        [b.product_id !== undefined ? clean(b.product_id, 60) : cur.product_id,
         name,
         b.category !== undefined ? clean(b.category, 60) : cur.category,
         b.prep_time !== undefined ? (b.prep_time === '' || b.prep_time == null ? null : Math.max(0, int(b.prep_time))) : cur.prep_time,
         b.servings !== undefined ? Math.max(1, int(b.servings, 1)) : cur.servings,
         b.items !== undefined ? JSON.stringify(parseItems(b.items)) : cur.items,
         b.instructions !== undefined ? clean(b.instructions, 2000) : cur.instructions,
         now(), req.params.id, req.tenantId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] PUT /recipes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/recipes/:id', adminAuth, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM recipes WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /recipes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // GİDERLER (expenses)
  // ============================================================
  const mapExpense = (r) => ({
    id: r.id, description: r.description, category: r.category || '', amount: num(r.amount),
    expense_date: r.expense_date, supplier_id: r.supplier_id || '', vendor: r.vendor || '',
    status: r.status || 'paid', note: r.note || '', created_at: r.created_at
  });

  router.get('/expenses', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();
      const category = clean(req.query.category, 60);
      const status = clean(req.query.status, 20);
      const rows = await db.all(`SELECT * FROM expenses WHERE tenant_id = ${P(1)} ORDER BY expense_date DESC, created_at DESC`, [req.tenantId]);
      let list = rows;
      if (search) list = list.filter(r => [r.description, r.vendor, r.category].some(v => String(v || '').toLowerCase().includes(search)));
      if (category) list = list.filter(r => String(r.category || '') === category);
      if (status) list = list.filter(r => String(r.status || 'paid') === status);

      const total = list.reduce((s, r) => s + num(r.amount), 0);
      const byCategory = {};
      list.forEach(r => { const k = r.category || 'Diğer'; byCategory[k] = Math.round(((byCategory[k] || 0) + num(r.amount)) * 100) / 100; });

      res.json({
        total: list.length,
        sum_amount: Math.round(total * 100) / 100,
        by_category: byCategory,
        items: list.slice(offset, offset + limit).map(mapExpense)
      });
    } catch (err) {
      console.error('[OPS] GET /expenses:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/expenses', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const description = clean(b.description, 200);
      if (!description) return res.status(400).json({ error: 'description_required' });
      const amount = num(b.amount);
      if (!(amount >= 0)) return res.status(400).json({ error: 'invalid_amount' });
      const id = newId('exp');
      await db.run(
        `INSERT INTO expenses (id, tenant_id, description, category, amount, expense_date, supplier_id, vendor, status, note, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)})`,
        [id, req.tenantId, description, clean(b.category, 60), Math.round(amount * 100) / 100,
         b.expense_date ? int(b.expense_date, now()) : now(),
         clean(b.supplier_id, 60), clean(b.vendor, 120),
         ['paid', 'pending'].includes(b.status) ? b.status : 'paid',
         clean(b.note, 500), now(), now()]
      );
      const row = await db.get(`SELECT * FROM expenses WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [id, req.tenantId]);
      res.status(201).json(mapExpense(row));
    } catch (err) {
      console.error('[OPS] POST /expenses:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/expenses/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await db.get(`SELECT * FROM expenses WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!cur) return res.status(404).json({ error: 'not_found' });
      const description = b.description !== undefined ? clean(b.description, 200) : cur.description;
      if (!description) return res.status(400).json({ error: 'description_required' });
      await db.run(
        `UPDATE expenses SET description=${P(1)}, category=${P(2)}, amount=${P(3)}, expense_date=${P(4)},
         supplier_id=${P(5)}, vendor=${P(6)}, status=${P(7)}, note=${P(8)}, updated_at=${P(9)}
         WHERE id=${P(10)} AND tenant_id=${P(11)}`,
        [description,
         b.category !== undefined ? clean(b.category, 60) : cur.category,
         b.amount !== undefined ? Math.round(Math.max(0, num(b.amount)) * 100) / 100 : cur.amount,
         b.expense_date !== undefined ? int(b.expense_date, cur.expense_date) : cur.expense_date,
         b.supplier_id !== undefined ? clean(b.supplier_id, 60) : cur.supplier_id,
         b.vendor !== undefined ? clean(b.vendor, 120) : cur.vendor,
         b.status !== undefined && ['paid', 'pending'].includes(b.status) ? b.status : cur.status,
         b.note !== undefined ? clean(b.note, 500) : cur.note,
         now(), req.params.id, req.tenantId]
      );
      const row = await db.get(`SELECT * FROM expenses WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      res.json(mapExpense(row));
    } catch (err) {
      console.error('[OPS] PUT /expenses:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/expenses/:id', adminAuth, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM expenses WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /expenses:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // MÜŞTERİLER (customers)
  // Sistemde müşteri girişi yok → tekrar eden müşteri TELEFONA göre eşleştirilir.
  // visits/total_spend/last_visit alanları siparişlerden TÜRETİLİR (elle girilmez).
  // ============================================================
  const digits = (s) => String(s || '').replace(/[^\d]/g, '');

  const mapCustomer = (r) => ({
    id: r.id, name: r.name || '', phone: r.phone, email: r.email || '', address: r.address || '',
    notes: r.notes || '', visits: int(r.visits), total_spend: num(r.total_spend),
    last_visit: r.last_visit, created_at: r.created_at
  });

  router.get('/customers', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();

      // Sipariş geçmişinden canlı özet — müşteri kaydı hiç açılmamış olsa bile telefonu olan
      // her sipariş sahibi burada görünür (gerçek veriyi göstermek, boş liste göstermekten iyi).
      const orders = await db.all(
        `SELECT customer_name, phone, total, created_at FROM orders WHERE tenant_id = ${P(1)}`,
        [req.tenantId]
      );
      const agg = {};
      for (const o of orders) {
        const key = digits(o.phone);
        if (!key) continue;
        const a = (agg[key] = agg[key] || { phone: o.phone, name: o.customer_name || '', visits: 0, total_spend: 0, last_visit: 0 });
        a.visits++;
        a.total_spend += num(o.total);
        if (Number(o.created_at) > a.last_visit) { a.last_visit = Number(o.created_at); if (o.customer_name) a.name = o.customer_name; }
      }

      const saved = await db.all(`SELECT * FROM customers WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      const savedByPhone = {};
      saved.forEach(c => { savedByPhone[digits(c.phone)] = c; });

      // Kaydedilmiş müşteri + sipariş geçmişi birleştirilir; kayıt varsa onun adı/notu kazanır.
      const keys = new Set([...Object.keys(agg), ...Object.keys(savedByPhone)]);
      let list = [...keys].map(k => {
        const a = agg[k] || { phone: (savedByPhone[k] || {}).phone || k, name: '', visits: 0, total_spend: 0, last_visit: null };
        const c = savedByPhone[k];
        return {
          id: c ? c.id : null,
          name: (c && c.name) || a.name || '',
          phone: (c && c.phone) || a.phone,
          email: c ? (c.email || '') : '',
          address: c ? (c.address || '') : '',
          notes: c ? (c.notes || '') : '',
          visits: a.visits,
          total_spend: Math.round(a.total_spend * 100) / 100,
          last_visit: a.last_visit || (c ? c.last_visit : null),
          saved: !!c
        };
      });

      if (search) {
        list = list.filter(c => [c.name, c.phone, c.email].some(v => String(v || '').toLowerCase().includes(search)));
      }
      list.sort((x, y) => (y.total_spend - x.total_spend) || (y.visits - x.visits));

      res.json({
        total: list.length,
        sum_spend: Math.round(list.reduce((s, c) => s + c.total_spend, 0) * 100) / 100,
        items: list.slice(offset, offset + limit)
      });
    } catch (err) {
      console.error('[OPS] GET /customers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Müşteri kaydı oluştur/güncelle — telefon doğal anahtar olduğu için aynı telefonla
  // ikinci kez gönderilirse yeni kayıt açmak yerine mevcut kaydı günceller.
  router.post('/customers', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const phone = clean(b.phone, 40);
      if (!digits(phone)) return res.status(400).json({ error: 'phone_required' });
      const existing = (await db.all(`SELECT * FROM customers WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .find(c => digits(c.phone) === digits(phone));
      if (existing) {
        await db.run(
          `UPDATE customers SET name=${P(1)}, email=${P(2)}, address=${P(3)}, notes=${P(4)}, updated_at=${P(5)}
           WHERE id=${P(6)} AND tenant_id=${P(7)}`,
          [clean(b.name, 120), clean(b.email, 120), clean(b.address, 300), clean(b.notes, 1000),
           now(), existing.id, req.tenantId]
        );
        const row = await db.get(`SELECT * FROM customers WHERE id = ${P(1)}`, [existing.id]);
        return res.json(mapCustomer(row));
      }
      const id = newId('cus');
      await db.run(
        `INSERT INTO customers (id, tenant_id, name, phone, email, address, notes, visits, total_spend, last_visit, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)})`,
        [id, req.tenantId, clean(b.name, 120), phone, clean(b.email, 120), clean(b.address, 300),
         clean(b.notes, 1000), 0, 0, null, now(), now()]
      );
      const row = await db.get(`SELECT * FROM customers WHERE id = ${P(1)}`, [id]);
      res.status(201).json(mapCustomer(row));
    } catch (err) {
      console.error('[OPS] POST /customers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/customers/:id', adminAuth, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM customers WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /customers:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // İŞLETME RAPORU (Faz 93) — mevcut /api/admin/analytics'in YERİNE GEÇMEZ, onu tamamlar.
  // Orası ciro/sipariş tarafına bakar; burası yeni modüllerin (gider, stok, reçete) verisini
  // ekleyip kâr–zarar tablosunu kurar. Hepsi hesaplanır, hiçbiri saklanmaz.
  // ============================================================
  router.get('/reports/summary', adminAuth, async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, int(req.query.days, 30)));
      const since = Date.now() - days * 86400000;

      // ── Gelir (siparişlerden) ──
      const orders = await db.all(
        `SELECT total, created_at, order_type FROM orders WHERE tenant_id = ${P(1)} AND created_at >= ${P(2)}`,
        [req.tenantId, since]
      );
      const revenue = orders.reduce((s, o) => s + num(o.total), 0);

      // ── Gider ──
      const expenses = (await db.all(`SELECT * FROM expenses WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .filter(e => !e.expense_date || Number(e.expense_date) >= since);
      const expenseTotal = expenses.reduce((s, e) => s + num(e.amount), 0);
      const expenseByCategory = {};
      expenses.forEach(e => {
        const k = e.category || 'Diğer';
        expenseByCategory[k] = Math.round(((expenseByCategory[k] || 0) + num(e.amount)) * 100) / 100;
      });
      const unpaidExpenses = expenses.filter(e => e.status === 'pending')
        .reduce((s, e) => s + num(e.amount), 0);

      // ── Stok değeri (anlık, döneme bağlı değil) ──
      const ingredients = await db.all(`SELECT * FROM ingredients WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      const stockValue = ingredients.reduce((s, i) => s + num(i.stock_qty) * num(i.unit_cost), 0);
      const lowStock = ingredients.filter(i => num(i.stock_qty) <= num(i.min_stock));

      // ── Reçete kârlılığı ──
      // Maliyet reçeteden hesaplanır (saklanmaz), satış fiyatı bağlı üründen gelir.
      const ingById = {};
      ingredients.forEach(i => { ingById[i.id] = i; });
      const products = await db.all(`SELECT id, name_tr, price FROM products WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      const prodById = {};
      products.forEach(p => { prodById[p.id] = p; });

      const recipes = await db.all(`SELECT * FROM recipes WHERE tenant_id = ${P(1)}`, [req.tenantId]);
      const profitability = recipes.map(r => {
        let items = [];
        try { items = JSON.parse(r.items || '[]') || []; } catch (e) {}
        const cost = items.reduce((s, it) => {
          const ing = ingById[it.ingredient_id];
          return s + (ing ? num(ing.unit_cost) * num(it.qty) : 0);
        }, 0);
        const servings = Math.max(1, int(r.servings, 1));
        const costPer = Math.round((cost / servings) * 100) / 100;
        const prod = prodById[r.product_id];
        const price = prod ? num(prod.price) : 0;
        return {
          name: r.name,
          product_name: prod ? prod.name_tr : '',
          cost_per_serving: costPer,
          selling_price: price,
          profit: price > 0 ? Math.round((price - costPer) * 100) / 100 : null,
          margin_pct: price > 0 ? Math.round(((price - costPer) / price) * 100) : null
        };
      }).filter(r => r.margin_pct != null)
        .sort((a, b) => b.margin_pct - a.margin_pct);

      const net = Math.round((revenue - expenseTotal) * 100) / 100;
      res.json({
        days,
        revenue: Math.round(revenue * 100) / 100,
        order_count: orders.length,
        expense_total: Math.round(expenseTotal * 100) / 100,
        expense_unpaid: Math.round(unpaidExpenses * 100) / 100,
        expense_by_category: expenseByCategory,
        net_profit: net,
        // Kâr marjı yalnızca gelir varsa anlamlıdır — 0 gelirde yüzde hesabı yanıltıcı olur.
        net_margin_pct: revenue > 0 ? Math.round((net / revenue) * 100) : null,
        stock_value: Math.round(stockValue * 100) / 100,
        low_stock_count: lowStock.length,
        ingredient_count: ingredients.length,
        most_profitable: profitability.slice(0, 5),
        least_profitable: profitability.slice(-5).reverse()
      });
    } catch (err) {
      console.error('[OPS] GET /reports/summary:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // POS FİŞ ALTYAPISI (Faz 93)
  // GET /api/orders/:id/receipt — bir siparişin fişini hem YAPISAL veri hem de yazıcıya
  // hazır DÜZ METİN olarak döner. Amaç: ileride bir POS/termal yazıcıya bağlandığında
  // ekstra iş gerekmesin — cihaz ya `text` alanını doğrudan basar (ESC/POS uyumlu, sabit
  // genişlikli), ya da `lines` dizisinden kendi formatını üretir.
  // Yazıcı genişliği ?width=32|42 ile seçilir (58mm kağıt=32, 80mm kağıt=42 sütun).
  // ============================================================
  function padLine(left, right, width) {
    const l = String(left);
    const r = String(right);
    const space = width - l.length - r.length;
    if (space >= 1) return l + ' '.repeat(space) + r;
    // Sığmıyorsa ürün adını kırp — fiş satırı ASLA taşmamalı, yoksa yazıcıda alt satıra düşer
    const keep = Math.max(1, width - r.length - 1);
    return l.slice(0, keep) + ' ' + r;
  }
  const center = (s, w) => {
    const t = String(s).slice(0, w);
    const pad = Math.max(0, Math.floor((w - t.length) / 2));
    return ' '.repeat(pad) + t;
  };

  router.get('/orders/:id/receipt', adminAuth, async (req, res) => {
    try {
      const width = int(req.query.width, 42) === 32 ? 32 : 42;
      const order = await db.get(
        `SELECT * FROM orders WHERE id = ${P(1)} AND tenant_id = ${P(2)}`,
        [req.params.id, req.tenantId]
      );
      if (!order) return res.status(404).json({ error: 'not_found' });
      const items = await db.all(
        `SELECT * FROM order_items WHERE order_id = ${P(1)} AND tenant_id = ${P(2)}`,
        [req.params.id, req.tenantId]
      );
      const tenant = await db.get(`SELECT name, display_name, address, contact_phone FROM tenants WHERE id = ${P(1)}`, [req.tenantId]);

      const isDinein = order.order_type === 'dinein';
      const source = isDinein ? (order.table_name ? 'Masa ' + order.table_name : 'Masa') : 'Paket / Gel-Al';
      const dt = new Date(Number(order.created_at));
      const stamp = dt.toLocaleString('tr-TR');

      const lines = items.map(it => ({
        qty: int(it.quantity, 1),
        name: it.product_name,
        unit_price: num(it.unit_price),
        line_total: num(it.line_total)
      }));

      // Düz metin fiş — yazıcıya olduğu gibi gönderilebilir.
      const sep = '-'.repeat(width);
      const txt = [];
      txt.push(center((tenant && (tenant.display_name || tenant.name)) || 'Restoran', width));
      if (tenant && tenant.contact_phone) txt.push(center(tenant.contact_phone, width));
      txt.push(sep);
      txt.push(padLine(source, '#' + String(order.id).slice(-6), width));
      txt.push(stamp);
      if (!isDinein && order.customer_name) txt.push('Musteri: ' + order.customer_name);
      if (!isDinein && order.address) txt.push('Adres: ' + String(order.address).slice(0, width - 7));
      txt.push(sep);
      lines.forEach(l => {
        txt.push(padLine(l.qty + 'x ' + l.name, l.line_total.toFixed(2), width));
      });
      txt.push(sep);
      txt.push(padLine('ARA TOPLAM', num(order.subtotal).toFixed(2), width));
      if (num(order.delivery_fee) > 0) txt.push(padLine('TESLIMAT', num(order.delivery_fee).toFixed(2), width));
      if (num(order.tax) > 0) txt.push(padLine('VERGI', num(order.tax).toFixed(2), width));
      txt.push(padLine('TOPLAM', num(order.total).toFixed(2) + ' TL', width));
      if (order.order_notes) { txt.push(sep); txt.push('NOT: ' + order.order_notes); }
      txt.push(sep);
      txt.push(center('Afiyet olsun', width));

      res.json({
        order_id: order.id,
        source,
        order_type: order.order_type,
        table_name: order.table_name || '',
        customer_name: order.customer_name || '',
        phone: order.phone || '',
        address: order.address || '',
        notes: order.order_notes || '',
        created_at: order.created_at,
        restaurant: {
          name: (tenant && (tenant.display_name || tenant.name)) || '',
          phone: (tenant && tenant.contact_phone) || '',
          address: (tenant && tenant.address) || ''
        },
        lines,
        subtotal: num(order.subtotal),
        delivery_fee: num(order.delivery_fee),
        tax: num(order.tax),
        total: num(order.total),
        width,
        text: txt.join('\n')
      });
    } catch (err) {
      console.error('[OPS] GET /orders/:id/receipt:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // HATIRLATICILAR (reminders) — kullanıcının kendi girdiği görevler.
  // Uyarılardan (alerts) farkı: bunlar SAKLANIR ve tamamlanabilir.
  // ============================================================
  const mapReminder = (r) => ({
    id: r.id, title: r.title, description: r.description || '',
    due_at: r.due_at, priority: r.priority || 'medium', category: r.category || '',
    done: r.done === 1 || r.done === true, done_at: r.done_at,
    recurring: r.recurring || '', created_at: r.created_at,
    // Türetilmiş: tarihi geçmiş mi? İstemcinin aynı kuralı tekrar yazmasına gerek kalmasın.
    overdue: !(r.done === 1 || r.done === true) && r.due_at && Number(r.due_at) < Date.now()
  });

  router.get('/reminders', adminAuth, async (req, res) => {
    try {
      const { limit, offset } = paging(req.query);
      const search = clean(req.query.search, 80).toLowerCase();
      const filter = clean(req.query.filter, 20);   // all | pending | done
      const rows = await db.all(
        `SELECT * FROM reminders WHERE tenant_id = ${P(1)} ORDER BY done ASC, due_at ASC, created_at DESC`,
        [req.tenantId]
      );
      let list = rows;
      if (search) list = list.filter(r => [r.title, r.description, r.category].some(v => String(v || '').toLowerCase().includes(search)));
      if (filter === 'pending') list = list.filter(r => !(r.done === 1 || r.done === true));
      else if (filter === 'done') list = list.filter(r => r.done === 1 || r.done === true);

      const pending = rows.filter(r => !(r.done === 1 || r.done === true));
      res.json({
        total: list.length,
        pending_count: pending.length,
        overdue_count: pending.filter(r => r.due_at && Number(r.due_at) < Date.now()).length,
        items: list.slice(offset, offset + limit).map(mapReminder)
      });
    } catch (err) {
      console.error('[OPS] GET /reminders:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/reminders', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const title = clean(b.title, 160);
      if (!title) return res.status(400).json({ error: 'title_required' });
      const id = newId('rem');
      await db.run(
        `INSERT INTO reminders (id, tenant_id, title, description, due_at, priority, category, done, recurring, created_at, updated_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)})`,
        [id, req.tenantId, title, clean(b.description, 600),
         b.due_at ? int(b.due_at, null) : null,
         ['high', 'medium', 'low'].includes(b.priority) ? b.priority : 'medium',
         clean(b.category, 60), 0,
         ['weekly', 'monthly'].includes(b.recurring) ? b.recurring : '',
         now(), now()]
      );
      const row = await db.get(`SELECT * FROM reminders WHERE id = ${P(1)}`, [id]);
      res.status(201).json(mapReminder(row));
    } catch (err) {
      console.error('[OPS] POST /reminders:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/reminders/:id', adminAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await db.get(`SELECT * FROM reminders WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!cur) return res.status(404).json({ error: 'not_found' });

      // Tamamlandı işaretlenirken tekrarlayan bir görevse: kapatmak yerine bir sonraki tarihe
      // ötelenir — "her hafta stok say" görevi tamamlanınca kaybolmamalı, yenilenmelidir.
      const markingDone = b.done !== undefined && b.done && !(cur.done === 1 || cur.done === true);
      if (markingDone && cur.recurring && cur.due_at) {
        const step = cur.recurring === 'weekly' ? 7 * 86400000 : 30 * 86400000;
        let next = Number(cur.due_at) + step;
        while (next < Date.now()) next += step;   // uzun süre atlanmışsa geleceğe taşı
        await db.run(
          `UPDATE reminders SET due_at = ${P(1)}, done = 0, done_at = NULL, updated_at = ${P(2)} WHERE id = ${P(3)} AND tenant_id = ${P(4)}`,
          [next, now(), req.params.id, req.tenantId]
        );
        const row = await db.get(`SELECT * FROM reminders WHERE id = ${P(1)}`, [req.params.id]);
        return res.json({ ...mapReminder(row), rescheduled: true });
      }

      const title = b.title !== undefined ? clean(b.title, 160) : cur.title;
      if (!title) return res.status(400).json({ error: 'title_required' });
      const done = b.done !== undefined ? (b.done ? 1 : 0) : cur.done;
      await db.run(
        `UPDATE reminders SET title=${P(1)}, description=${P(2)}, due_at=${P(3)}, priority=${P(4)}, category=${P(5)},
         done=${P(6)}, done_at=${P(7)}, recurring=${P(8)}, updated_at=${P(9)} WHERE id=${P(10)} AND tenant_id=${P(11)}`,
        [title,
         b.description !== undefined ? clean(b.description, 600) : cur.description,
         b.due_at !== undefined ? (b.due_at ? int(b.due_at, null) : null) : cur.due_at,
         b.priority !== undefined && ['high', 'medium', 'low'].includes(b.priority) ? b.priority : cur.priority,
         b.category !== undefined ? clean(b.category, 60) : cur.category,
         done, done ? now() : null,
         b.recurring !== undefined ? (['weekly', 'monthly'].includes(b.recurring) ? b.recurring : '') : cur.recurring,
         now(), req.params.id, req.tenantId]
      );
      const row = await db.get(`SELECT * FROM reminders WHERE id = ${P(1)}`, [req.params.id]);
      res.json(mapReminder(row));
    } catch (err) {
      console.error('[OPS] PUT /reminders:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/reminders/:id', adminAuth, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM reminders WHERE id = ${P(1)} AND tenant_id = ${P(2)}`, [req.params.id, req.tenantId]);
      if (!r.changes) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[OPS] DELETE /reminders:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // UYARILAR (alerts) — türetilmiş, saklanmaz.
  // Mevcut verilerden gerçek zamanlı hesaplanır; uydurma uyarı üretilmez.
  // ============================================================
  router.get('/alerts', adminAuth, async (req, res) => {
    try {
      const alerts = [];

      const lowIngredients = (await db.all(`SELECT * FROM ingredients WHERE tenant_id = ${P(1)} AND active = 1`, [req.tenantId]))
        .filter(i => num(i.stock_qty) <= num(i.min_stock));
      lowIngredients.forEach(i => alerts.push({
        id: `low-${i.id}`, type: 'low_stock',
        severity: num(i.stock_qty) <= 0 ? 'high' : 'medium',
        title: `${i.name} stoğu kritik`,
        detail: `${num(i.stock_qty)} ${i.unit} kaldı (kritik eşik: ${num(i.min_stock)} ${i.unit})`,
        link: 'stock'
      }));

      const pendingOrders = await db.get(
        `SELECT COUNT(*) c FROM orders WHERE tenant_id = ${P(1)} AND status IN ('new','received','pending')`,
        [req.tenantId]
      );
      const pendingCount = pendingOrders ? Number(Object.values(pendingOrders)[0]) : 0;
      if (pendingCount > 0) {
        alerts.push({
          id: 'pending-orders', type: 'pending_orders', severity: pendingCount > 5 ? 'high' : 'medium',
          title: `${pendingCount} sipariş işlem bekliyor`,
          detail: 'Siparişler ekranından durumlarını güncelleyin.', link: 'orders'
        });
      }

      const noImage = await db.get(
        `SELECT COUNT(*) c FROM products WHERE tenant_id = ${P(1)} AND (image IS NULL OR image = '')`,
        [req.tenantId]
      );
      const noImgCount = noImage ? Number(Object.values(noImage)[0]) : 0;
      if (noImgCount > 0) {
        alerts.push({
          id: 'missing-images', type: 'missing_images', severity: 'low',
          title: `${noImgCount} ürünün görseli yok`,
          detail: 'Görselli ürünler müşteride daha çok tercih edilir.', link: 'products'
        });
      }

      const pendingExpenses = (await db.all(`SELECT * FROM expenses WHERE tenant_id = ${P(1)}`, [req.tenantId]))
        .filter(e => e.status === 'pending');
      if (pendingExpenses.length) {
        const sum = Math.round(pendingExpenses.reduce((s, e) => s + num(e.amount), 0) * 100) / 100;
        alerts.push({
          id: 'pending-expenses', type: 'pending_expenses', severity: 'medium',
          title: `${pendingExpenses.length} ödenmemiş gider`,
          detail: `Toplam ₺${sum} tutarında ödeme bekliyor.`, link: 'expenses'
        });
      }

      // Vadesi geçmiş hatırlatıcılar da uyarı üretir — kullanıcı kendi koyduğu görevi
      // kaçırdıysa bunu Uyarılar ekranında da görsün.
      const overdue = (await db.all(`SELECT * FROM reminders WHERE tenant_id = ${P(1)} AND done = 0`, [req.tenantId]))
        .filter(r => r.due_at && Number(r.due_at) < Date.now());
      if (overdue.length) {
        alerts.push({
          id: 'overdue-reminders', type: 'overdue_reminders',
          severity: overdue.some(r => r.priority === 'high') ? 'high' : 'medium',
          title: `${overdue.length} hatırlatıcının tarihi geçti`,
          detail: overdue.slice(0, 3).map(r => r.title).join(', ') + (overdue.length > 3 ? '…' : ''),
          link: 'reminders'
        });
      }

      const order = { high: 0, medium: 1, low: 2 };
      alerts.sort((a, b) => order[a.severity] - order[b.severity]);
      res.json({ total: alerts.length, items: alerts });
    } catch (err) {
      console.error('[OPS] GET /alerts:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
