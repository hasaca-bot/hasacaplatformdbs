/* admin-operations.js — İşletme Yönetimi ekranları (Faz 92)
   Stok, Malzemeler, Reçeteler, Tedarikçiler, Giderler, Müşteriler.

   admin.js'e eklemek yerine AYRI dosya: o dosya zaten 6.500 satır (bkz. phase-87.md) ve bu
   modüller kendi içinde bağımsız. Klasik <script> olarak yüklenir, yani fonksiyonlar global
   olur — HTML'deki onclick'ler ve admin.js'teki showAdminView dispatch'i bunlara erişir.
   admin.js'in yardımcılarını (getAdminToken, showCustomAlert, adminT) yeniden yazmak yerine
   ödünç alır; bu dosya admin.js'ten SONRA yüklendiği için hepsi tanımlıdır. */

(function () {
  'use strict';

  // ── Ortak yardımcılar ──
  const T = (key, fallback) => (typeof adminT === 'function' ? (adminT(key) !== key ? adminT(key) : fallback) : fallback);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₺' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString(window.currentLanguage === 'en' ? 'en-US' : 'tr-TR');
  const qty = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString(window.currentLanguage === 'en' ? 'en-US' : 'tr-TR');

  async function api(path, options) {
    const tok = (typeof getAdminToken === 'function' ? getAdminToken() : '');
    const res = await fetch('/api' + path, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }
    }, options || {}));
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || ('http_' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const alertBox = (msg, title, kind) => {
    if (typeof showCustomAlert === 'function') showCustomAlert(msg, title, kind || 'warning');
    else alert(msg);
  };

  // Sunucudan gelen hata kodlarını kullanıcının anlayacağı Türkçe cümlelere çevirir —
  // ham kod ("ingredient_in_use" gibi) asla kullanıcıya gösterilmez.
  function humanError(e) {
    const map = {
      name_required: 'Lütfen bir isim girin.',
      description_required: 'Lütfen bir açıklama girin.',
      phone_required: 'Lütfen telefon numarası girin.',
      ingredient_required: 'Lütfen bir malzeme seçin.',
      invalid_qty: 'Geçerli bir miktar girin.',
      invalid_amount: 'Geçerli bir tutar girin.',
      insufficient_stock: 'Stokta yeterli miktar yok.',
      ingredient_in_use: 'Bu malzeme bir reçetede kullanılıyor, önce reçeteden çıkarın.',
      supplier_in_use: 'Bu tedarikçiye bağlı malzemeler var, önce onları başka tedarikçiye taşıyın.',
      not_found: 'Kayıt bulunamadı, sayfa yenilenmiş olabilir.',
      ingredient_not_found: 'Malzeme bulunamadı.'
    };
    if (e && e.status === 401) return 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.';
    return (e && map[e.message]) || 'Bir şeyler ters gitti, lütfen tekrar deneyin.';
  }

  const stateHtml = {
    loading: () => '<div class="ops-empty">' + esc(T('admin_dash_loading', 'Yükleniyor…')) + '</div>',
    error: () => '<div class="ops-error">' + esc(T('admin_dash_err', 'Veriler yüklenemedi.')) + '</div>',
    empty: (msg) => '<div class="ops-empty"><div class="ops-empty-ic">—</div>' + esc(msg) + '</div>'
  };

  // ── Sayfalama durumu (her ekran kendi sayfasını hatırlar) ──
  const PAGE_SIZE = 20;
  const state = {
    stock: { offset: 0, search: '', filter: 'all', total: 0 },
    ingredients: { offset: 0, search: '', total: 0 },
    recipes: { offset: 0, search: '', total: 0 },
    suppliers: { offset: 0, search: '', total: 0 },
    expenses: { offset: 0, search: '', status: '', total: 0 },
    customers: { offset: 0, search: '', total: 0 },
    reminders: { offset: 0, search: '', filter: 'all', total: 0 }
  };

  function renderPager(elId, key, reloadFn) {
    const el = document.getElementById(elId);
    if (!el) return;
    const s = state[key];
    const page = Math.floor(s.offset / PAGE_SIZE) + 1;
    const pages = Math.max(1, Math.ceil(s.total / PAGE_SIZE));
    if (s.total <= PAGE_SIZE) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<button ' + (s.offset === 0 ? 'disabled' : '') + ' data-dir="prev">‹</button>' +
      '<span class="ops-page-info">' + page + ' / ' + pages + '</span>' +
      '<button ' + (page >= pages ? 'disabled' : '') + ' data-dir="next">›</button>';
    el.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        s.offset = b.dataset.dir === 'prev'
          ? Math.max(0, s.offset - PAGE_SIZE)
          : s.offset + PAGE_SIZE;
        reloadFn();
      };
    });
  }

  // Arama kutusuna her harfte istek atmamak için gecikmeli tetikleme.
  let debounceTimer = null;
  window.opsDebounced = function (which) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const map = {
        stock: ['opsStockSearch', 'stock', window.opsLoadStock],
        ingredients: ['opsIngSearch', 'ingredients', window.opsLoadIngredients],
        recipes: ['opsRecSearch', 'recipes', window.opsLoadRecipes],
        suppliers: ['opsSupSearch', 'suppliers', window.opsLoadSuppliers],
        expenses: ['opsExpSearch', 'expenses', window.opsLoadExpenses],
        customers: ['opsCusSearch', 'customers', window.opsLoadCustomers],
        reminders: ['opsRemSearch', 'reminders', window.opsLoadReminders]
      };
      const [inputId, key, fn] = map[which] || [];
      if (!fn) return;
      const input = document.getElementById(inputId);
      state[key].search = input ? input.value.trim() : '';
      state[key].offset = 0;            // arama değişince ilk sayfaya dön
      fn();
    }, 300);
  };

  const q = (key, extra) => {
    const s = state[key];
    let p = '?limit=' + PAGE_SIZE + '&offset=' + s.offset;
    if (s.search) p += '&search=' + encodeURIComponent(s.search);
    return p + (extra || '');
  };

  // ============================================================
  // STOK
  // ============================================================
  window.opsSetStockFilter = function (f) {
    state.stock.filter = f;
    state.stock.offset = 0;
    document.querySelectorAll('#opsStockFilters .ops-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
    window.opsLoadStock();
  };

  window.opsLoadStock = async function () {
    const list = document.getElementById('opsStockList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/ingredients' + q('stock', '&filter=' + state.stock.filter));
      state.stock.total = d.total;

      const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setTxt('opsStockTotal', d.total);
      setTxt('opsStockLow', d.low_count);
      const badge = document.getElementById('adminStockBadge');
      if (badge) { badge.textContent = d.low_count; badge.style.display = d.low_count > 0 ? '' : 'none'; }

      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.stock.search || state.stock.filter !== 'all'
          ? 'Bu filtreye uyan malzeme yok.'
          : 'Henüz malzeme eklenmemiş. "Malzemeler" ekranından ekleyebilirsiniz.');
        renderPager('opsStockPager', 'stock', window.opsLoadStock);
        return;
      }

      list.innerHTML = d.items.map(i => {
        const pct = i.stock_pct;
        const barClass = i.is_low ? 'low' : (pct != null && pct < 40 ? 'warn' : '');
        return '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(i.name) +
              (i.is_low ? ' <span class="ops-badge bad">KRİTİK</span>' : '') + '</div>' +
            '<div class="ops-sub">' + esc(i.category || '—') +
              (i.location ? ' · ' + esc(i.location) : '') +
              ' · kritik eşik: ' + qty(i.min_stock) + ' ' + esc(i.unit) + '</div>' +
            (pct != null ? '<div class="ops-bar ' + barClass + '"><span style="width:' + pct + '%"></span></div>' : '') +
          '</div>' +
          '<div class="ops-right">' +
            '<div class="ops-val">' + qty(i.stock_qty) + ' ' + esc(i.unit) + '</div>' +
            '<div class="ops-sub">' + money(i.unit_cost) + ' / ' + esc(i.unit) + '</div>' +
          '</div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Stok hareketi" onclick="opsOpenMovementForm(\'' + i.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>' +
          '</div>' +
        '</div>';
      }).join('');
      renderPager('opsStockPager', 'stock', window.opsLoadStock);

      // Stok değeri = elde kalan miktar × birim maliyet (sayfadaki değil, TÜM malzemeler için)
      const all = await api('/ingredients?limit=200');
      const value = all.items.reduce((s, i) => s + (Number(i.stock_qty) || 0) * (Number(i.unit_cost) || 0), 0);
      setTxt('opsStockValue', money(value));

      window.opsLoadMovements();
    } catch (e) {
      list.innerHTML = stateHtml.error();
      console.warn('[OPS] stok:', e);
    }
  };

  window.opsLoadMovements = async function () {
    const el = document.getElementById('opsMovementsList');
    if (!el) return;
    el.innerHTML = stateHtml.loading();
    try {
      const d = await api('/stock-movements?limit=10');
      if (!d.items.length) { el.innerHTML = stateHtml.empty('Henüz stok hareketi yok.'); return; }
      const label = { in: 'Giriş', out: 'Çıkış', adjust: 'Sayım' };
      el.innerHTML = d.items.map(m => {
        const positive = m.qty_delta > 0;
        return '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(m.ingredient_name) +
              ' <span class="ops-badge ' + (positive ? 'ok' : 'bad') + '">' + esc(label[m.type] || m.type) + '</span></div>' +
            '<div class="ops-sub">' + esc(m.note || '—') + (m.actor ? ' · ' + esc(m.actor) : '') + '</div>' +
          '</div>' +
          '<div class="ops-right">' +
            '<div class="ops-val" style="color:' + (positive ? 'var(--ap-ok)' : 'var(--ap-bad)') + '">' +
              (positive ? '+' : '') + qty(m.qty_delta) + ' ' + esc(m.unit) + '</div>' +
            '<div class="ops-sub">kalan: ' + qty(m.qty_after) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    } catch (e) {
      el.innerHTML = stateHtml.error();
    }
  };

  // ============================================================
  // MALZEMELER
  // ============================================================
  window.opsLoadIngredients = async function () {
    const list = document.getElementById('opsIngList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/ingredients' + q('ingredients'));
      state.ingredients.total = d.total;
      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.ingredients.search
          ? 'Aramanıza uyan malzeme bulunamadı.'
          : 'Henüz malzeme yok. Yemeklerinizde kullandığınız hammaddeleri ekleyerek başlayın.');
        renderPager('opsIngPager', 'ingredients', window.opsLoadIngredients);
        return;
      }
      list.innerHTML = d.items.map(i =>
        '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(i.name) + (i.is_low ? ' <span class="ops-badge bad">KRİTİK</span>' : '') + '</div>' +
            '<div class="ops-sub">' + esc(i.category || '—') + ' · ' + qty(i.stock_qty) + ' ' + esc(i.unit) +
              ' · ' + money(i.unit_cost) + '/' + esc(i.unit) + '</div>' +
          '</div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Düzenle" onclick="opsOpenIngredientForm(\'' + i.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
            '<button class="ops-icon-btn danger" title="Sil" onclick="opsDeleteIngredient(\'' + i.id + '\',\'' + esc(i.name).replace(/'/g, "\\'") + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
          '</div>' +
        '</div>'
      ).join('');
      renderPager('opsIngPager', 'ingredients', window.opsLoadIngredients);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  window.opsDeleteIngredient = async function (id, name) {
    if (!confirm('"' + name + '" malzemesi silinsin mi?')) return;
    try {
      await api('/ingredients/' + id, { method: 'DELETE' });
      window.opsLoadIngredients();
    } catch (e) {
      alertBox(humanError(e), 'Silinemedi', 'warning');
    }
  };

  // ============================================================
  // TEDARİKÇİLER
  // ============================================================
  window.opsLoadSuppliers = async function () {
    const list = document.getElementById('opsSupList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/suppliers' + q('suppliers'));
      state.suppliers.total = d.total;
      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.suppliers.search
          ? 'Aramanıza uyan tedarikçi bulunamadı.'
          : 'Henüz tedarikçi yok. Malzeme aldığınız firmaları ekleyin.');
        renderPager('opsSupPager', 'suppliers', window.opsLoadSuppliers);
        return;
      }
      list.innerHTML = d.items.map(s =>
        '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(s.name) +
              (!s.active ? ' <span class="ops-badge neutral">PASİF</span>' : '') + '</div>' +
            '<div class="ops-sub">' + esc(s.category || '—') +
              (s.contact_name ? ' · ' + esc(s.contact_name) : '') +
              (s.phone ? ' · ' + esc(s.phone) : '') + '</div>' +
          '</div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Düzenle" onclick="opsOpenSupplierForm(\'' + s.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
            '<button class="ops-icon-btn danger" title="Sil" onclick="opsDeleteSupplier(\'' + s.id + '\',\'' + esc(s.name).replace(/'/g, "\\'") + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
          '</div>' +
        '</div>'
      ).join('');
      renderPager('opsSupPager', 'suppliers', window.opsLoadSuppliers);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  window.opsDeleteSupplier = async function (id, name) {
    if (!confirm('"' + name + '" tedarikçisi silinsin mi?')) return;
    try {
      await api('/suppliers/' + id, { method: 'DELETE' });
      window.opsLoadSuppliers();
    } catch (e) {
      alertBox(humanError(e), 'Silinemedi', 'warning');
    }
  };

  // ============================================================
  // REÇETELER
  // ============================================================
  window.opsLoadRecipes = async function () {
    const list = document.getElementById('opsRecList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/recipes' + q('recipes'));
      state.recipes.total = d.total;
      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.recipes.search
          ? 'Aramanıza uyan reçete bulunamadı.'
          : 'Henüz reçete yok. Bir ürünün hangi malzemelerden yapıldığını tanımlayarak maliyetini görebilirsiniz.');
        renderPager('opsRecPager', 'recipes', window.opsLoadRecipes);
        return;
      }
      list.innerHTML = d.items.map(r => {
        const marginBadge = r.margin_pct == null ? ''
          : '<span class="ops-badge ' + (r.margin_pct >= 50 ? 'ok' : (r.margin_pct >= 20 ? 'neutral' : 'bad')) + '">' +
            'kâr %' + r.margin_pct + '</span>';
        const missing = r.items.filter(i => i.missing).length;
        return '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(r.name) + ' ' + marginBadge +
              (missing ? ' <span class="ops-badge bad">' + missing + ' malzeme silinmiş</span>' : '') + '</div>' +
            '<div class="ops-sub">' + r.items.length + ' malzeme · ' + r.servings + ' porsiyon' +
              (r.prep_time ? ' · ' + r.prep_time + ' dk' : '') +
              (r.product_name ? ' · ürün: ' + esc(r.product_name) : '') + '</div>' +
          '</div>' +
          '<div class="ops-right">' +
            '<div class="ops-val">' + money(r.cost_per_serving) + '</div>' +
            '<div class="ops-sub">porsiyon maliyeti</div>' +
          '</div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Düzenle" onclick="opsOpenRecipeForm(\'' + r.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
            '<button class="ops-icon-btn danger" title="Sil" onclick="opsDeleteRecipe(\'' + r.id + '\',\'' + esc(r.name).replace(/'/g, "\\'") + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
          '</div>' +
        '</div>';
      }).join('');
      renderPager('opsRecPager', 'recipes', window.opsLoadRecipes);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  window.opsDeleteRecipe = async function (id, name) {
    if (!confirm('"' + name + '" reçetesi silinsin mi?')) return;
    try {
      await api('/recipes/' + id, { method: 'DELETE' });
      window.opsLoadRecipes();
    } catch (e) {
      alertBox(humanError(e), 'Silinemedi', 'warning');
    }
  };

  // ============================================================
  // GİDERLER
  // ============================================================
  window.opsSetExpenseFilter = function (f) {
    state.expenses.status = f;
    state.expenses.offset = 0;
    document.querySelectorAll('#view-expenses .ops-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
    window.opsLoadExpenses();
  };

  window.opsLoadExpenses = async function () {
    const list = document.getElementById('opsExpList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/expenses' + q('expenses', state.expenses.status ? '&status=' + state.expenses.status : ''));
      state.expenses.total = d.total;
      const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setTxt('opsExpTotal', money(d.sum_amount));
      setTxt('opsExpCount', d.total);

      const pending = await api('/expenses?status=pending&limit=200');
      setTxt('opsExpPending', money(pending.sum_amount));

      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.expenses.search || state.expenses.status
          ? 'Bu filtreye uyan gider yok.'
          : 'Henüz gider kaydı yok. Kira, fatura, personel gibi masraflarınızı ekleyin.');
        renderPager('opsExpPager', 'expenses', window.opsLoadExpenses);
        return;
      }
      list.innerHTML = d.items.map(x => {
        const dt = x.expense_date ? new Date(Number(x.expense_date)).toLocaleDateString(window.currentLanguage === 'en' ? 'en-US' : 'tr-TR') : '—';
        return '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(x.description) +
              (x.status === 'pending' ? ' <span class="ops-badge bad">ÖDENMEDİ</span>' : '') + '</div>' +
            '<div class="ops-sub">' + esc(x.category || '—') + (x.vendor ? ' · ' + esc(x.vendor) : '') + ' · ' + dt + '</div>' +
          '</div>' +
          '<div class="ops-right"><div class="ops-val">' + money(x.amount) + '</div></div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Düzenle" onclick="opsOpenExpenseForm(\'' + x.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
            '<button class="ops-icon-btn danger" title="Sil" onclick="opsDeleteExpense(\'' + x.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
          '</div>' +
        '</div>';
      }).join('');
      renderPager('opsExpPager', 'expenses', window.opsLoadExpenses);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  window.opsDeleteExpense = async function (id) {
    if (!confirm('Bu gider kaydı silinsin mi?')) return;
    try {
      await api('/expenses/' + id, { method: 'DELETE' });
      window.opsLoadExpenses();
    } catch (e) {
      alertBox(humanError(e), 'Silinemedi', 'warning');
    }
  };

  // ============================================================
  // MÜŞTERİLER
  // ============================================================
  window.opsLoadCustomers = async function () {
    const list = document.getElementById('opsCusList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/customers' + q('customers'));
      state.customers.total = d.total;
      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.customers.search
          ? 'Aramanıza uyan müşteri bulunamadı.'
          : 'Henüz müşteri yok. Sipariş geldikçe müşteriler burada otomatik listelenir.');
        renderPager('opsCusPager', 'customers', window.opsLoadCustomers);
        return;
      }
      list.innerHTML = d.items.map(c => {
        const last = c.last_visit ? new Date(Number(c.last_visit)).toLocaleDateString(window.currentLanguage === 'en' ? 'en-US' : 'tr-TR') : '—';
        return '<div class="ops-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(c.name || 'İsimsiz müşteri') +
              (c.saved ? '' : ' <span class="ops-badge neutral">KAYITSIZ</span>') + '</div>' +
            '<div class="ops-sub">' + esc(c.phone) + ' · ' + c.visits + ' sipariş · son: ' + last + '</div>' +
          '</div>' +
          '<div class="ops-right">' +
            '<div class="ops-val">' + money(c.total_spend) + '</div>' +
            '<div class="ops-sub">toplam harcama</div>' +
          '</div>' +
        '</div>';
      }).join('');
      renderPager('opsCusPager', 'customers', window.opsLoadCustomers);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  // ============================================================
  // KASA (POS) — personelin elle sipariş girmesi.
  // Sipariş MEVCUT POST /api/orders ucundan oluşturulur; fiyat SUNUCUDA çözülür, buradan
  // gönderilen bir fiyata asla güvenilmez (mevcut güvenlik tasarımının devamı).
  // Referansta olup burada BİLEREK olmayanlar: kupon/indirim ve vergi — sistemde bu
  // kavramlar yok, dış referanstan ürün özelliği uydurulmaz (external-reference-boundary).
  // ============================================================
  const pos = { products: [], tables: [], cart: [], type: 'dinein', payment: 'cash', category: 'all', search: '' };

  window.posLoad = async function () {
    const grid = document.getElementById('posGrid');
    if (!grid) return;
    grid.innerHTML = stateHtml.loading();
    try {
      const hdr = { 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') };
      const [pRes, cRes, tRes] = await Promise.all([
        fetch('/api/products', { headers: hdr }),
        fetch('/api/categories', { headers: hdr }),
        fetch('/api/tables', { headers: hdr })
      ]);
      const norm = (d) => Array.isArray(d) ? d : (d.items || d.tables || d.products || []);
      pos.products = pRes.ok ? norm(await pRes.json()) : [];
      const cats = cRes.ok ? norm(await cRes.json()) : [];
      pos.tables = tRes.ok ? norm(await tRes.json()) : [];

      // Kategori çipleri
      const chips = document.getElementById('posCategories');
      if (chips) {
        chips.innerHTML = '<button class="ops-chip active" data-cat="all" onclick="posSetCategory(\'all\')">Tümü</button>' +
          cats.map(c => '<button class="ops-chip" data-cat="' + esc(c.id) + '" onclick="posSetCategory(\'' + esc(c.id) + '\')">' +
            esc(c.name || c.name_tr || c.id) + '</button>').join('');
      }

      // Masa listesi
      const tSel = document.getElementById('posTable');
      if (tSel) {
        tSel.innerHTML = pos.tables.length
          ? pos.tables.map(t => '<option value="' + esc(t.token) + '">' + esc(t.name) + '</option>').join('')
          : '<option value="">Masa tanımlı değil</option>';
      }
      posFilter();
      posRenderCart();
    } catch (e) {
      grid.innerHTML = stateHtml.error();
    }
  };

  window.posSetCategory = function (c) {
    pos.category = c;
    document.querySelectorAll('#posCategories .ops-chip').forEach(x => x.classList.toggle('active', x.dataset.cat === c));
    posFilter();
  };

  window.posSetType = function (t) {
    pos.type = t;
    document.querySelectorAll('[data-postype]').forEach(x => x.classList.toggle('active', x.dataset.postype === t));
    const din = document.getElementById('posDineinBox');
    const del = document.getElementById('posDeliveryBox');
    if (din) din.style.display = t === 'dinein' ? '' : 'none';
    if (del) del.style.display = t === 'dinein' ? 'none' : '';
  };

  window.posSetPayment = function (p) {
    pos.payment = p;
    document.querySelectorAll('#posPayment .ops-chip').forEach(x => x.classList.toggle('active', x.dataset.pay === p));
  };

  window.posFilter = function () {
    const grid = document.getElementById('posGrid');
    if (!grid) return;
    const s = (document.getElementById('posSearch') || {}).value || '';
    pos.search = s.trim().toLowerCase();
    let list = pos.products;
    if (pos.category !== 'all') list = list.filter(p => String(p.category) === pos.category);
    if (pos.search) list = list.filter(p => String(p.name || '').toLowerCase().includes(pos.search));

    if (!list.length) { grid.innerHTML = stateHtml.empty('Bu filtreye uyan ürün yok.'); return; }
    grid.innerHTML = list.map(p => {
      const portions = Array.isArray(p.portions) ? p.portions : [];
      // Porsiyonlu üründe kartta EN DÜŞÜK fiyat gösterilir (müşteri sitesindeki kuralın aynısı)
      const price = portions.length ? Math.min(...portions.map(x => Number(x.price) || 0)) : Number(p.price) || 0;
      return '<button class="pos-item" onclick="posAdd(\'' + esc(p.id) + '\')">' +
        '<span class="pos-item-name">' + esc(p.name) + '</span>' +
        '<span class="pos-item-price">' + (portions.length ? '≥ ' : '') + money(price) + '</span>' +
      '</button>';
    }).join('');
  };

  // Porsiyonlu üründe hangi boyutun eklendiği belirsiz kalmasın — seçtiriyoruz.
  window.posAdd = async function (productId) {
    const p = pos.products.find(x => x.id === productId);
    if (!p) return;
    const portions = Array.isArray(p.portions) ? p.portions : [];
    if (portions.length) {
      openModal('Porsiyon Seçin — ' + p.name,
        '<div class="ops-chips" id="posPortionPick">' +
          portions.map((x, i) => '<button type="button" class="ops-chip' + (i === 0 ? ' active' : '') + '" data-i="' + i +
            '" onclick="[...this.parentElement.children].forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\')">' +
            esc(x.name_tr) + ' · ' + money(x.price) + '</button>').join('') + '</div>',
        async () => {
          const sel = document.querySelector('#posPortionPick .ops-chip.active');
          posPush(p, sel ? parseInt(sel.dataset.i, 10) : 0);
        });
      return;
    }
    posPush(p, null);
  };

  function posPush(p, portionIndex) {
    const portions = Array.isArray(p.portions) ? p.portions : [];
    const chosen = (portionIndex != null) ? portions[portionIndex] : null;
    const key = p.id + '::' + (portionIndex == null ? '' : portionIndex);
    const ex = pos.cart.find(c => c.key === key);
    if (ex) ex.qty = Math.min(99, ex.qty + 1);
    else pos.cart.push({
      key, id: p.id, name: p.name,
      portion_index: portionIndex,
      portion_name: chosen ? chosen.name_tr : '',
      price: chosen ? Number(chosen.price) || 0 : Number(p.price) || 0,
      qty: 1
    });
    posRenderCart();
  }

  window.posQty = function (key, delta) {
    const it = pos.cart.find(c => c.key === key);
    if (!it) return;
    it.qty += delta;
    if (it.qty < 1) pos.cart = pos.cart.filter(c => c.key !== key);
    posRenderCart();
  };

  window.posClearCart = function () { pos.cart = []; posRenderCart(); };

  function posRenderCart() {
    const box = document.getElementById('posCartItems');
    if (!box) return;
    if (!pos.cart.length) {
      box.innerHTML = '<div class="ops-empty" style="padding:20px 8px;">Sepet boş. Soldan ürün seçin.</div>';
    } else {
      box.innerHTML = pos.cart.map(c =>
        '<div class="pos-cart-row">' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(c.name) + '</div>' +
            (c.portion_name ? '<div class="ops-sub">' + esc(c.portion_name) + '</div>' : '') +
            '<div class="ops-sub">' + money(c.price) + '</div>' +
          '</div>' +
          '<div class="pos-qty">' +
            '<button onclick="posQty(\'' + c.key + '\',-1)">−</button>' +
            '<span>' + c.qty + '</span>' +
            '<button onclick="posQty(\'' + c.key + '\',1)">+</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }
    const total = pos.cart.reduce((s, c) => s + c.price * c.qty, 0);
    const el = document.getElementById('posTotal');
    if (el) el.textContent = money(total);
  }

  window.posSubmit = async function () {
    if (!pos.cart.length) { alertBox('Sepet boş.', 'Sipariş oluşturulamadı', 'warning'); return; }
    const btn = document.getElementById('posSubmitBtn');
    if (btn) btn.disabled = true;
    try {
      const body = {
        payment_method: pos.payment,
        order_notes: (document.getElementById('posNote') || {}).value || '',
        // Fiyat GÖNDERİLMEZ — sunucu her kalemi kendi veritabanından fiyatlandırır.
        items: pos.cart.map(c => ({ product_id: c.id, quantity: c.qty, portion_index: c.portion_index }))
      };
      if (pos.type === 'dinein') {
        const tok = (document.getElementById('posTable') || {}).value;
        if (!tok) throw new Error('table_required');
        body.table_token = tok;
        body.name = 'Kasa';           // masa siparişinde backend ad/telefon/adres istemiyor
        body.phone = '';
      } else {
        body.name = (document.getElementById('posName') || {}).value.trim();
        body.phone = (document.getElementById('posPhone') || {}).value.trim();
        body.address = (document.getElementById('posAddress') || {}).value.trim();
        if (!body.name || !body.phone || !body.address) throw new Error('delivery_fields_required');
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('http_' + res.status));

      posClearCart();
      ['posName', 'posPhone', 'posAddress', 'posNote'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      // Siparişi hemen fiş olarak bas — kasada beklenen davranış bu.
      if (data.id && confirm('Sipariş oluşturuldu.\n\nFiş yazdırılsın mı?')) {
        window.kdsPrintReceipt(data.id);
      }
    } catch (e) {
      const map = {
        table_required: 'Önce bir masa seçin (Ayarlar > Masa Yönetimi\'nden masa ekleyebilirsiniz).',
        delivery_fields_required: 'Paket sipariş için ad, telefon ve adres gerekli.'
      };
      alertBox(map[e.message] || humanError(e), 'Sipariş oluşturulamadı', 'warning');
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // ============================================================
  // MUTFAK EKRANI (KDS) — 3 sütunlu iş akışı panosu.
  // Yeni bir sipariş sistemi KURMAZ: mevcut orders tablosunu, mevcut dine-in durum akışını
  // ve mevcut PUT /api/orders/:id/status ucunu kullanır. "Masa Sipariş Kontrolü" ekranı
  // yöneticinin liste görünümü; bu ise mutfağın panosu — ikisi aynı veriye bakar.
  // ============================================================
  // Sütunlar. DİKKAT: online/paket siparişler 'new', masa siparişleri 'received' durumuyla
  // başlar (backend: initialStatus). İkisi de "Yeni" sütununda toplanır ki mutfak tek bir
  // yerden hem uzaktan hem masadan geleni görsün — kullanıcının istediği otomatik akış budur.
  const KDS_COLS = [
    { key: 'received', match: ['received', 'new'], label: 'Yeni Siparişler', next: 'preparing', nextLabel: 'Hazırlamaya Başla' },
    { key: 'preparing', match: ['preparing'],      label: 'Hazırlanıyor',    next: 'ready',     nextLabel: 'Hazır' },
    { key: 'ready', match: ['ready'],              label: 'Servise Hazır',   next: 'serving',   nextLabel: 'Servise Ver' }
  ];

  // Siparişin ne kadar süredir beklediği — mutfakta en kritik bilgi budur.
  function kdsMinutes(createdAt) {
    const ms = Date.now() - Number(createdAt || 0);
    return Math.max(0, Math.floor(ms / 60000));
  }

  // silent=true → yükleme durumunu GÖSTERME. Bir butona basıldıktan sonraki tazelemede
  // panoyu "Yükleniyor…" ile sıfırlamak ekranı yanıp söndürüyordu; artık mevcut içerik
  // yerinde kalıyor, yeni içerik yumuşak geçişle beliriyor.
  let kdsFirstLoad = true;
  window.kdsLoad = async function (silent) {
    const board = document.getElementById('kdsBoard');
    if (!board) return;
    if (kdsFirstLoad && !silent) board.innerHTML = stateHtml.loading();
    try {
      // HEM masa HEM uzaktan/paket siparişleri al — mutfak tek ekrandan hepsini görsün.
      const hdr = { 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') };
      const [dineinRes, allRes] = await Promise.all([
        fetch('/api/orders?type=dinein&archived=0', { headers: hdr }),
        fetch('/api/orders', { headers: hdr })
      ]);
      if (!dineinRes.ok) throw new Error('http_' + dineinRes.status);
      const norm = (d) => Array.isArray(d) ? d : (d.orders || d.items || []);
      const dinein = norm(await dineinRes.json());
      const others = allRes.ok ? norm(await allRes.json()).filter(o => o.order_type !== 'dinein') : [];

      // Aynı sipariş iki uçtan da gelebilir — id'ye göre tekilleştir.
      const byId = {};
      [...dinein, ...others].forEach(o => { byId[o.id] = o; });
      const orders = Object.values(byId);

      const badge = document.getElementById('adminKitchenBadge');
      const active = orders.filter(o => ['received', 'new', 'preparing', 'ready'].includes(o.status));
      if (badge) { badge.textContent = active.length; badge.style.display = active.length ? '' : 'none'; }

      const html = KDS_COLS.map(col => {
        const list = orders.filter(o => col.match.includes(o.status))
          .sort((a, b) => Number(a.created_at) - Number(b.created_at));   // en eski üstte: sıra bozulmasın
        const cards = list.length ? list.map(o => {
          const mins = kdsMinutes(o.created_at);
          // 15 dakikayı geçen sipariş acil sayılır — mutfakta gecikme en pahalı hatadır.
          const urgent = mins >= 15;
          const isDinein = o.order_type === 'dinein';
          const source = isDinein ? ('Masa ' + esc(o.table_name || '')) : 'Paket / Gel-Al';
          const items = (o.items || []).map(it =>
            '<li><span class="kds-qty">' + (it.quantity || 1) + '×</span> ' + esc(it.name || it.product_name || '') + '</li>'
          ).join('');
          return '<div class="kds-card' + (urgent ? ' urgent' : '') + '">' +
            '<div class="kds-card-top">' +
              '<span class="kds-table">' + source +
                '<span class="ops-badge ' + (isDinein ? 'neutral' : 'ok') + '" style="margin-left:6px;">' +
                  (isDinein ? 'MASA' : 'UZAKTAN') + '</span></span>' +
              '<span class="kds-time' + (urgent ? ' urgent' : '') + '">' + mins + ' dk</span>' +
            '</div>' +
            (!isDinein && o.customer_name ? '<div class="ops-sub" style="margin-bottom:6px;">' + esc(o.customer_name) + '</div>' : '') +
            '<ul class="kds-items">' + (items || '<li class="ops-sub">Kalem yok</li>') + '</ul>' +
            (o.order_notes ? '<div class="kds-note">' + esc(o.order_notes) + '</div>' : '') +
            '<div class="kds-actions">' +
              '<button class="admin-btn kds-advance" onclick="kdsAdvance(\'' + o.id + '\',\'' + col.next + '\',event)">' +
                esc(col.nextLabel) + '</button>' +
              '<button class="ops-icon-btn" title="Fiş yazdır" onclick="kdsPrintReceipt(\'' + o.id + '\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg></button>' +
              '<button class="ops-icon-btn danger" title="Siparişi kaldır" onclick="kdsRemove(\'' + o.id + '\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
            '</div>' +
          '</div>';
        }).join('') : '<div class="ops-empty" style="padding:24px 8px;">Bu aşamada sipariş yok.</div>';

        return '<div class="kds-col">' +
          '<div class="kds-col-head"><span>' + esc(col.label) + '</span>' +
            '<span class="ops-badge neutral">' + list.length + '</span></div>' +
          '<div class="kds-col-body">' + cards + '</div>' +
        '</div>';
      }).join('');

      // Yeni içerik hazır olduktan SONRA tek seferde yaz — böylece ara bir "boş" kare olmuyor.
      board.innerHTML = html;
      kdsFirstLoad = false;
    } catch (e) {
      // Tazeleme sırasındaki geçici bir hata yüzünden dolu panoyu silme — sadece ilk
      // yüklemede hata ekranı göster, sonrasında mevcut içerik ekranda kalsın.
      if (kdsFirstLoad) board.innerHTML = stateHtml.error();
      console.warn('[KDS]', e);
    }
  };

  // ── FİŞ YAZDIRMA (POS altyapısı) ──
  // Sunucudan yazıcıya hazır düz metni alır ve tarayıcının yazdırma penceresine verir.
  // Termal yazıcı işletim sistemine tanımlıysa bu doğrudan fiş olarak basılır.
  // İleride gerçek bir POS cihazına bağlanınca aynı uç (`/orders/:id/receipt`) kullanılacak —
  // cihaz `text` alanını olduğu gibi basabilir ya da `lines` dizisinden kendi formatını üretir.
  window.kdsPrintReceipt = async function (orderId) {
    try {
      const r = await api('/orders/' + orderId + '/receipt?width=42');
      let area = document.getElementById('kdsPrintArea');
      if (!area) {
        area = document.createElement('div');
        area.id = 'kdsPrintArea';
        document.body.appendChild(area);
      }
      area.innerHTML = '<pre>' + esc(r.text) + '</pre>';
      document.body.classList.add('kds-printing');
      window.print();
      // Yazdırma penceresi kapandıktan sonra ekranı eski hâline döndür.
      setTimeout(() => { document.body.classList.remove('kds-printing'); }, 500);
    } catch (e) {
      alertBox('Fiş oluşturulamadı, tekrar deneyin.', 'İşlem başarısız', 'warning');
    }
  };

  // Siparişi panodan kaldır — SİLMEZ, arşivler. Mutfakta yanlışlıkla basılan bir tuş
  // gerçek sipariş kaydını yok etmemeli (ciro/analitik verisi bozulur).
  window.kdsRemove = async function (orderId) {
    if (!confirm('Bu sipariş mutfak panosundan kaldırılsın mı?\n\nSipariş kaydı silinmez, arşivlenir.')) return;
    try {
      const res = await fetch('/api/orders/' + orderId + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') },
        body: JSON.stringify({ status: 'delivered' })   // 'delivered' backend'de otomatik arşivler
      });
      if (!res.ok) throw new Error('http_' + res.status);
      window.kdsLoad();
    } catch (e) {
      alertBox('Sipariş kaldırılamadı, tekrar deneyin.', 'İşlem başarısız', 'warning');
    }
  };

  // Karta basınca önce kartı yumuşakça soldur, sonra sunucuya git. Böylece kullanıcı
  // ağ gecikmesini beklemeden tepki görür ve pano "flash" yapmaz.
  function kdsFadeOutCard(el) {
    if (!el) return;
    el.classList.add('leaving');
  }

  window.kdsAdvance = async function (orderId, nextStatus, ev) {
    const card = (ev && ev.target) ? ev.target.closest('.kds-card') : null;
    kdsFadeOutCard(card);
    try {
      const res = await fetch('/api/orders/' + orderId + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error('http_' + res.status);
      await window.kdsLoad(true);          // sessiz tazeleme — yükleniyor ekranı yok
    } catch (e) {
      if (card) card.classList.remove('leaving');   // başarısızsa kartı geri getir
      alertBox('Sipariş durumu güncellenemedi, tekrar deneyin.', 'İşlem başarısız', 'warning');
    }
  };

  // ============================================================
  // UYARILAR — sistemden türetilir, saklanmaz, kullanıcı işaretleyemez.
  // ============================================================
  let alertFilter = 'all';
  window.opsSetAlertFilter = function (f) {
    alertFilter = f;
    document.querySelectorAll('#opsAlertFilters .ops-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
    window.opsLoadAlerts();
  };

  const SEV = {
    high:   { label: 'ACİL',   cls: 'bad' },
    medium: { label: 'ÖNEMLİ', cls: 'neutral' },
    low:    { label: 'BİLGİ',  cls: 'ok' }
  };

  window.opsLoadAlerts = async function () {
    const list = document.getElementById('opsAlertList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/alerts');
      const badge = document.getElementById('adminAlertsBadge');
      if (badge) {
        const urgent = d.items.filter(a => a.severity === 'high').length;
        badge.textContent = d.total;
        badge.style.display = d.total > 0 ? '' : 'none';
        badge.title = urgent ? urgent + ' acil uyarı' : '';
      }
      let items = d.items;
      if (alertFilter !== 'all') items = items.filter(a => a.severity === alertFilter);

      if (!items.length) {
        list.innerHTML = stateHtml.empty(alertFilter === 'all'
          ? 'Her şey yolunda görünüyor — bekleyen uyarı yok.'
          : 'Bu önem derecesinde uyarı yok.');
        return;
      }
      list.innerHTML = items.map(a => {
        const s = SEV[a.severity] || SEV.low;
        // link alanı hangi ekrana gidileceğini söyler; tıklayınca oraya götürüyoruz.
        return '<div class="ops-row" ' + (a.link ? 'style="cursor:pointer" onclick="showAdminView(\'' + a.link + '\')"' : '') + '>' +
          '<div class="ops-main">' +
            '<div class="ops-name">' + esc(a.title) + ' <span class="ops-badge ' + s.cls + '">' + s.label + '</span></div>' +
            '<div class="ops-sub">' + esc(a.detail || '') + '</div>' +
          '</div>' +
          (a.link ? '<div class="ops-right"><span class="ops-sub">Git ›</span></div>' : '') +
        '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  // ============================================================
  // HATIRLATICILAR — kullanıcının kendi görevleri.
  // ============================================================
  window.opsSetReminderFilter = function (f) {
    state.reminders.filter = f;
    state.reminders.offset = 0;
    document.querySelectorAll('#opsRemFilters .ops-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
    window.opsLoadReminders();
  };

  const PRIO = {
    high:   { label: 'YÜKSEK', cls: 'bad' },
    medium: { label: 'ORTA',   cls: 'neutral' },
    low:    { label: 'DÜŞÜK',  cls: 'ok' }
  };

  window.opsLoadReminders = async function () {
    const list = document.getElementById('opsRemList');
    if (!list) return;
    list.innerHTML = stateHtml.loading();
    try {
      const d = await api('/reminders' + q('reminders', '&filter=' + state.reminders.filter));
      state.reminders.total = d.total;
      const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setTxt('opsRemPending', d.pending_count);
      setTxt('opsRemOverdue', d.overdue_count);
      setTxt('opsRemTotal', d.total);
      const badge = document.getElementById('adminRemindersBadge');
      if (badge) { badge.textContent = d.overdue_count; badge.style.display = d.overdue_count > 0 ? '' : 'none'; }

      if (!d.items.length) {
        list.innerHTML = stateHtml.empty(state.reminders.search || state.reminders.filter !== 'all'
          ? 'Bu filtreye uyan hatırlatıcı yok.'
          : 'Henüz hatırlatıcı yok. Düzenli yapmanız gereken işleri ekleyin (stok sayımı, fatura ödemesi gibi).');
        renderPager('opsRemPager', 'reminders', window.opsLoadReminders);
        return;
      }
      const loc = window.currentLanguage === 'en' ? 'en-US' : 'tr-TR';
      list.innerHTML = d.items.map(r => {
        const p = PRIO[r.priority] || PRIO.medium;
        const due = r.due_at ? new Date(Number(r.due_at)).toLocaleDateString(loc) : '';
        return '<div class="ops-row">' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="' + (r.done ? 'Geri al' : 'Tamamlandı işaretle') + '" onclick="opsToggleReminder(\'' + r.id + '\',' + (r.done ? 'true' : 'false') + ')">' +
              (r.done
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--ap-ok)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>') +
            '</button>' +
          '</div>' +
          '<div class="ops-main">' +
            '<div class="ops-name" style="' + (r.done ? 'opacity:.5;text-decoration:line-through;' : '') + '">' +
              esc(r.title) + ' <span class="ops-badge ' + p.cls + '">' + p.label + '</span>' +
              (r.overdue ? ' <span class="ops-badge bad">TARİHİ GEÇTİ</span>' : '') +
              (r.recurring ? ' <span class="ops-badge neutral">' + (r.recurring === 'weekly' ? 'HAFTALIK' : 'AYLIK') + '</span>' : '') +
            '</div>' +
            '<div class="ops-sub">' + esc(r.description || '—') +
              (r.category ? ' · ' + esc(r.category) : '') + (due ? ' · ' + due : '') + '</div>' +
          '</div>' +
          '<div class="ops-actions">' +
            '<button class="ops-icon-btn" title="Düzenle" onclick="opsOpenReminderForm(\'' + r.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>' +
            '<button class="ops-icon-btn danger" title="Sil" onclick="opsDeleteReminder(\'' + r.id + '\')">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' +
          '</div>' +
        '</div>';
      }).join('');
      renderPager('opsRemPager', 'reminders', window.opsLoadReminders);
    } catch (e) {
      list.innerHTML = stateHtml.error();
    }
  };

  window.opsToggleReminder = async function (id, currentlyDone) {
    try {
      const r = await api('/reminders/' + id, { method: 'PUT', body: JSON.stringify({ done: !currentlyDone }) });
      // Tekrarlayan görev tamamlanınca kapanmaz, ötelenir — kullanıcıya bunu söylüyoruz,
      // yoksa "tamamladım ama hâlâ listede" diye kafası karışır.
      if (r && r.rescheduled) {
        const next = new Date(Number(r.due_at)).toLocaleDateString(window.currentLanguage === 'en' ? 'en-US' : 'tr-TR');
        alertBox('Tekrarlayan görev, bir sonraki tarihe taşındı: ' + next, 'Tamamlandı', 'success');
      }
      window.opsLoadReminders();
    } catch (e) {
      alertBox(humanError(e), 'İşlem başarısız', 'warning');
    }
  };

  window.opsDeleteReminder = async function (id) {
    if (!confirm('Bu hatırlatıcı silinsin mi?')) return;
    try {
      await api('/reminders/' + id, { method: 'DELETE' });
      window.opsLoadReminders();
    } catch (e) {
      alertBox(humanError(e), 'Silinemedi', 'warning');
    }
  };

  // ============================================================
  // FORMLAR — mevcut panelde hazır bir "modal" bileşeni olmadığı için
  // basit prompt tabanlı akış YERİNE dinamik bir modal kurulur.
  // ============================================================
  function openModal(title, fieldsHtml, onSubmit) {
    let back = document.getElementById('opsModalBackdrop');
    if (!back) {
      back = document.createElement('div');
      back.id = 'opsModalBackdrop';
      back.className = 'admin-modal-backdrop';
      back.onclick = (e) => { if (e.target === back) closeModal(); };
      (document.getElementById('adminPanelOverlay') || document.body).appendChild(back);
    }
    back.innerHTML =
      '<div class="admin-modal-card" onclick="event.stopPropagation()">' +
        '<h3 style="margin-bottom:14px;">' + esc(title) + '</h3>' +
        '<form id="opsModalForm">' + fieldsHtml +
          '<div id="opsModalErr" class="hint" style="color:var(--ap-bad);display:none;margin-top:10px;"></div>' +
          '<div style="display:flex;gap:8px;margin-top:18px;">' +
            '<button type="button" class="admin-btn secondary" onclick="opsCloseModal()">Vazgeç</button>' +
            '<button type="submit" class="admin-btn">Kaydet</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    back.classList.add('open');
    back.style.display = 'flex';
    const form = document.getElementById('opsModalForm');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const errEl = document.getElementById('opsModalErr');
      errEl.style.display = 'none';
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await onSubmit(new FormData(form));
        closeModal();
      } catch (e) {
        errEl.textContent = humanError(e);
        errEl.style.display = 'block';
        btn.disabled = false;
      }
    };
    const first = form.querySelector('input,select,textarea');
    if (first) first.focus();
  }
  function closeModal() {
    const back = document.getElementById('opsModalBackdrop');
    if (back) { back.classList.remove('open'); back.style.display = 'none'; back.innerHTML = ''; }
  }
  window.opsCloseModal = closeModal;

  const field = (label, name, opts) => {
    const o = opts || {};
    return '<label class="admin-form-label" style="display:block;margin-top:12px;">' + esc(label) + '</label>' +
      (o.type === 'select'
        ? '<select name="' + name + '" class="admin-input">' + (o.options || '') + '</select>'
        : '<input type="' + (o.type || 'text') + '" name="' + name + '" class="admin-input"' +
          (o.value != null ? ' value="' + esc(o.value) + '"' : '') +
          (o.step ? ' step="' + o.step + '"' : '') +
          (o.min != null ? ' min="' + o.min + '"' : '') +
          (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
          (o.required ? ' required' : '') + '>');
  };

  window.opsOpenSupplierForm = async function (id) {
    let cur = {};
    if (id) {
      const d = await api('/suppliers?limit=200');
      cur = (d.items || []).find(x => x.id === id) || {};
    }
    openModal(id ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi',
      field('Firma Adı *', 'name', { value: cur.name, required: true }) +
      field('Yetkili Kişi', 'contact_name', { value: cur.contact_name }) +
      field('Telefon', 'phone', { value: cur.phone }) +
      field('E-posta', 'email', { type: 'email', value: cur.email }) +
      field('Kategori', 'category', { value: cur.category, placeholder: 'Örn: Et & Tavuk' }) +
      field('Adres', 'address', { value: cur.address }),
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!String(body.name || '').trim()) throw new Error('name_required');
        await api(id ? '/suppliers/' + id : '/suppliers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        window.opsLoadSuppliers();
      });
  };

  window.opsOpenIngredientForm = async function (id) {
    const sup = await api('/suppliers?limit=200').catch(() => ({ items: [] }));
    let cur = {};
    if (id) {
      const d = await api('/ingredients?limit=200');
      cur = (d.items || []).find(x => x.id === id) || {};
    }
    const supOptions = '<option value="">— Tedarikçi seçilmedi —</option>' +
      (sup.items || []).map(s => '<option value="' + s.id + '"' + (cur.supplier_id === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
    openModal(id ? 'Malzemeyi Düzenle' : 'Yeni Malzeme',
      field('Malzeme Adı *', 'name', { value: cur.name, required: true }) +
      field('Birim', 'unit', { value: cur.unit || 'kg', placeholder: 'kg / L / adet' }) +
      field('Kategori', 'category', { value: cur.category, placeholder: 'Örn: Sebze' }) +
      (id ? '' : field('Açılış Stoğu', 'stock_qty', { type: 'number', step: '0.001', min: 0, value: 0 })) +
      field('Kritik Stok Eşiği', 'min_stock', { type: 'number', step: '0.001', min: 0, value: cur.min_stock != null ? cur.min_stock : 0 }) +
      field('Maksimum Stok (isteğe bağlı)', 'max_stock', { type: 'number', step: '0.001', min: 0, value: cur.max_stock != null ? cur.max_stock : '' }) +
      field('Birim Maliyet (₺)', 'unit_cost', { type: 'number', step: '0.01', min: 0, value: cur.unit_cost != null ? cur.unit_cost : 0 }) +
      field('Depo / Konum', 'location', { value: cur.location, placeholder: 'Örn: Soğuk oda' }) +
      field('Tedarikçi', 'supplier_id', { type: 'select', options: supOptions }) +
      (id ? '<div class="hint" style="margin-top:10px;">Stok miktarı buradan değiştirilemez — Stok ekranından hareket ekleyerek değiştirin (böylece her değişikliğin kaydı tutulur).</div>' : ''),
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!String(body.name || '').trim()) throw new Error('name_required');
        await api(id ? '/ingredients/' + id : '/ingredients', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        window.opsLoadIngredients();
        if (document.getElementById('view-stock') && !document.getElementById('view-stock').hidden) window.opsLoadStock();
      });
  };

  window.opsOpenMovementForm = async function (ingredientId) {
    const d = await api('/ingredients?limit=200').catch(() => ({ items: [] }));
    if (!d.items || !d.items.length) {
      alertBox('Önce en az bir malzeme eklemelisiniz.', 'Malzeme yok', 'warning');
      return;
    }
    const options = d.items.map(i =>
      '<option value="' + i.id + '"' + (i.id === ingredientId ? ' selected' : '') + '>' +
      esc(i.name) + ' (' + qty(i.stock_qty) + ' ' + esc(i.unit) + ')</option>').join('');
    openModal('Stok Hareketi',
      field('Malzeme *', 'ingredient_id', { type: 'select', options }) +
      field('İşlem *', 'type', { type: 'select', options:
        '<option value="in">Giriş (stoğa ekle)</option>' +
        '<option value="out">Çıkış (stoktan düş)</option>' +
        '<option value="adjust">Sayım (yeni miktarı gir)</option>' }) +
      field('Miktar *', 'qty', { type: 'number', step: '0.001', min: 0, required: true }) +
      field('Not', 'note', { placeholder: 'Örn: Tedarikçi teslimatı' }) +
      '<div class="hint" style="margin-top:10px;">Sayım seçerseniz, girdiğiniz miktar yeni stok miktarı olur.</div>',
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!(parseFloat(body.qty) >= 0)) throw new Error('invalid_qty');
        await api('/stock-movements', { method: 'POST', body: JSON.stringify(body) });
        window.opsLoadStock();
      });
  };

  window.opsOpenExpenseForm = async function (id) {
    let cur = {};
    if (id) {
      const d = await api('/expenses?limit=200');
      cur = (d.items || []).find(x => x.id === id) || {};
    }
    const dateVal = cur.expense_date
      ? new Date(Number(cur.expense_date)).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    openModal(id ? 'Gideri Düzenle' : 'Yeni Gider',
      field('Açıklama *', 'description', { value: cur.description, required: true }) +
      field('Tutar (₺) *', 'amount', { type: 'number', step: '0.01', min: 0, value: cur.amount != null ? cur.amount : '', required: true }) +
      field('Kategori', 'category', { value: cur.category, placeholder: 'Örn: Kira, Fatura, Personel' }) +
      field('Tarih', 'date_str', { type: 'date', value: dateVal }) +
      field('Firma / Kime', 'vendor', { value: cur.vendor }) +
      field('Durum', 'status', { type: 'select', options:
        '<option value="paid"' + (cur.status !== 'pending' ? ' selected' : '') + '>Ödendi</option>' +
        '<option value="pending"' + (cur.status === 'pending' ? ' selected' : '') + '>Ödenmedi</option>' }),
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!String(body.description || '').trim()) throw new Error('description_required');
        if (!(parseFloat(body.amount) >= 0)) throw new Error('invalid_amount');
        body.expense_date = body.date_str ? new Date(body.date_str).getTime() : Date.now();
        delete body.date_str;
        await api(id ? '/expenses/' + id : '/expenses', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        window.opsLoadExpenses();
      });
  };

  window.opsOpenReminderForm = async function (id) {
    let cur = {};
    if (id) {
      const d = await api('/reminders?limit=200');
      cur = (d.items || []).find(x => x.id === id) || {};
    }
    const dateVal = cur.due_at ? new Date(Number(cur.due_at)).toISOString().slice(0, 10) : '';
    openModal(id ? 'Hatırlatıcıyı Düzenle' : 'Yeni Hatırlatıcı',
      field('Başlık *', 'title', { value: cur.title, required: true, placeholder: 'Örn: Haftalık stok sayımı' }) +
      field('Açıklama', 'description', { value: cur.description }) +
      field('Son Tarih', 'date_str', { type: 'date', value: dateVal }) +
      field('Öncelik', 'priority', { type: 'select', options:
        '<option value="high"' + (cur.priority === 'high' ? ' selected' : '') + '>Yüksek</option>' +
        '<option value="medium"' + (cur.priority !== 'high' && cur.priority !== 'low' ? ' selected' : '') + '>Orta</option>' +
        '<option value="low"' + (cur.priority === 'low' ? ' selected' : '') + '>Düşük</option>' }) +
      field('Kategori', 'category', { value: cur.category, placeholder: 'Örn: Operasyon, Finans' }) +
      field('Tekrarla', 'recurring', { type: 'select', options:
        '<option value=""' + (!cur.recurring ? ' selected' : '') + '>Tekrarlama</option>' +
        '<option value="weekly"' + (cur.recurring === 'weekly' ? ' selected' : '') + '>Her hafta</option>' +
        '<option value="monthly"' + (cur.recurring === 'monthly' ? ' selected' : '') + '>Her ay</option>' }) +
      '<div class="hint" style="margin-top:10px;">Tekrarlayan bir görevi tamamladığınızda silinmez, bir sonraki tarihe taşınır.</div>',
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!String(body.title || '').trim()) throw new Error('title_required');
        body.due_at = body.date_str ? new Date(body.date_str).getTime() : null;
        delete body.date_str;
        await api(id ? '/reminders/' + id : '/reminders', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        window.opsLoadReminders();
      });
  };

  window.opsOpenRecipeForm = async function (id) {
    const [ings, prods] = await Promise.all([
      api('/ingredients?limit=200').catch(() => ({ items: [] })),
      fetch('/api/products', { headers: { 'Authorization': 'Bearer ' + (typeof getAdminToken === 'function' ? getAdminToken() : '') } })
        .then(r => r.json()).catch(() => [])
    ]);
    if (!ings.items || !ings.items.length) {
      alertBox('Reçete oluşturmak için önce malzeme eklemelisiniz.', 'Malzeme yok', 'warning');
      return;
    }
    let cur = { items: [] };
    if (id) {
      const d = await api('/recipes?limit=200');
      cur = (d.items || []).find(x => x.id === id) || { items: [] };
    }
    const prodList = Array.isArray(prods) ? prods : [];
    const prodOptions = '<option value="">— Ürüne bağlı değil —</option>' +
      prodList.map(p => '<option value="' + p.id + '"' + (cur.product_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');

    window.__opsIngOptions = ings.items.map(i => ({ id: i.id, name: i.name, unit: i.unit }));

    openModal(id ? 'Reçeteyi Düzenle' : 'Yeni Reçete',
      field('Reçete Adı *', 'name', { value: cur.name, required: true }) +
      field('Bağlı Ürün', 'product_id', { type: 'select', options: prodOptions }) +
      field('Porsiyon Sayısı', 'servings', { type: 'number', min: 1, value: cur.servings || 1 }) +
      field('Hazırlık Süresi (dk)', 'prep_time', { type: 'number', min: 0, value: cur.prep_time != null ? cur.prep_time : '' }) +
      '<label class="admin-form-label" style="display:block;margin-top:14px;">Malzemeler</label>' +
      '<div id="opsRecipeItems"></div>' +
      '<button type="button" class="admin-btn secondary" style="width:auto;padding:8px 14px;font-size:.82rem;margin-top:8px;" onclick="opsAddRecipeItem()">+ Malzeme Ekle</button>',
      async (fd) => {
        const body = Object.fromEntries(fd.entries());
        if (!String(body.name || '').trim()) throw new Error('name_required');
        body.items = [...document.querySelectorAll('#opsRecipeItems .ops-recipe-item')].map(row => ({
          ingredient_id: row.querySelector('.ops-ri-id').value,
          qty: parseFloat(row.querySelector('.ops-ri-qty').value)
        })).filter(i => i.ingredient_id && i.qty > 0);
        await api(id ? '/recipes/' + id : '/recipes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        window.opsLoadRecipes();
      });

    (cur.items || []).forEach(it => window.opsAddRecipeItem(it.ingredient_id, it.qty));
    if (!(cur.items || []).length) window.opsAddRecipeItem();
  };

  window.opsAddRecipeItem = function (selectedId, qtyVal) {
    const box = document.getElementById('opsRecipeItems');
    if (!box) return;
    const opts = (window.__opsIngOptions || []).map(i =>
      '<option value="' + i.id + '"' + (i.id === selectedId ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('');
    const row = document.createElement('div');
    row.className = 'ops-recipe-item';
    row.innerHTML =
      '<select class="admin-input ops-ri-id" style="margin:0;">' + opts + '</select>' +
      '<input type="number" step="0.001" min="0" class="admin-input ops-ri-qty" style="margin:0;" placeholder="Miktar" value="' + (qtyVal != null ? qtyVal : '') + '">' +
      '<button type="button" class="ops-icon-btn danger" onclick="this.parentElement.remove()">✕</button>';
    box.appendChild(row);
  };

  // Görünüm açılışlarını admin.js'teki showAdminView'a bağlar — o fonksiyonu değiştirmek
  // yerine sarmalıyoruz (mevcut davranış aynen korunur, sadece bizim yüklemelerimiz eklenir).
  const OPS_LOADERS = {
    stock: () => window.opsLoadStock(),
    ingredients: () => window.opsLoadIngredients(),
    recipes: () => window.opsLoadRecipes(),
    suppliers: () => window.opsLoadSuppliers(),
    expenses: () => window.opsLoadExpenses(),
    customers: () => window.opsLoadCustomers(),
    alerts: () => window.opsLoadAlerts(),
    reminders: () => window.opsLoadReminders(),
    kitchen: () => window.kdsLoad(),
    pos: () => window.posLoad()
  };

  function hookViewSwitching() {
    if (typeof window.showAdminView !== 'function' || window.__opsHooked) return;
    const original = window.showAdminView;
    window.showAdminView = function (view) {
      original.apply(this, arguments);
      const loader = OPS_LOADERS[view];
      if (loader) { try { loader(); } catch (e) { console.warn('[OPS] yükleme:', e); } }
    };
    window.__opsHooked = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookViewSwitching);
  else hookViewSwitching();
})();
