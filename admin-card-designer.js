/* admin-card-designer.js — masa karti tasarim galerisi arayuzu (/card-gallery.js verisini kullanir).
   admin.html'in 3. <script> blogundan cikarildi (eski satir 11909-12125, Faz 87).
   Icerik DEGISTIRILMEDI; etiket ayni belge konumunda durdugu icin calisma sirasi da ayni. */
/* ===================== MASA KARTI TASARIM GALERİSİ =====================
   Canlı özelleştirme YOK (kullanıcı kararı) — hazır tasarımlardan biri seçilir.
   Görseller ÖN GÖSTERİMdir (içlerindeki QR/logo sahte olabilir); gerçek QR +
   logo işleme adımı fiziksel üretimde elle yapılır. Seçim anında kaydedilir.  */
let cdDesignId = null;    // seçili tasarımın id'si (HasacaGallery.GALLERY'den)
let cdTableCount = 0;     // mevcut masa sistemi sayımı (yeniden yazılmaz, sadece okunur)
let cdOrder = null;       // işlemdeki sipariş (varsa galeri yerine durum ekranı gösterilir)
let cdSaveTimer = null;
let cdLoaded = false;

const cdT = (k) => (typeof adminT === 'function' ? adminT(k) : k);
const cdEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cdLang = () => ((window.currentLanguage || 'tr') === 'en' ? 'en' : 'tr');

async function cdInit(){
  if (cdLoaded) return;                    // görünüm her açılışta yeniden yüklenmesin
  try {
    const [dRes, tRes] = await Promise.all([
      fetch('/api/card-design'),
      fetch('/api/tables')
    ]);
    const d = await dRes.json();
    const tables = tRes.ok ? await tRes.json() : [];
    cdTableCount = tables.filter(t => t.active !== false).length;
    cdOrder = d.order || null;
    cdDesignId = d.designId || null;
    cdLoaded = true;
  } catch (e) {
    console.error('card design load failed', e);
  }
  document.getElementById('cdLoading').hidden = true;
  cdApplyMode();
}

/** Sipariş varsa galeri yerine salt-okunur durum ekranı gösterilir. */
function cdApplyMode(){
  const editing = !cdOrder;
  document.getElementById('cdEditor').hidden = !editing;
  const os = document.getElementById('cdOrderState');
  os.hidden = editing;
  if (editing) cdRenderAll(); else cdRenderOrderState();
}

function cdRenderOrderState(){
  const o = cdOrder;
  const FLOW = ['design_approved','print_pending','printing','shipped','delivered'];
  const idx = FLOW.indexOf(o.status);
  const steps = (o.status === 'cancelled')
    ? '<span class="cd-stp now">' + cdEsc(cdT('admin_cards_st_cancelled')) + '</span>'
    : FLOW.map((s,i) => '<span class="cd-stp ' + (i < idx ? 'done' : (i === idx ? 'now' : '')) + '">' +
        cdEsc(cdT('admin_cards_st_' + s)) + '</span>').join('');
  const dt = o.created_at ? new Date(o.created_at).toLocaleDateString(cdLang() === 'en' ? 'en-GB' : 'tr-TR') : '';
  const dl = o.delivery || {};
  document.getElementById('cdOrderState').innerHTML =
    '<div class="cd-os-head">' +
      '<img class="cd-os-preview" src="' + cdEsc(HasacaGallery.imageUrl(o.designId)) + '" alt="">' +
      '<div class="cd-os-info">' +
        '<div class="cd-os-title">' + cdEsc(cdT('admin_cards_os_title')) + '</div>' +
        '<div class="cd-os-line">' + cdEsc(cdT('admin_cards_os_count')) + ': <b>' + (o.table_count || 0) + '</b></div>' +
        '<div class="cd-os-line">' + cdEsc(cdT('admin_cards_os_date')) + ': <b>' + cdEsc(dt) + '</b></div>' +
        '<div class="cd-os-line">' + cdEsc(cdT('admin_cards_os_to')) + ': ' +
          cdEsc([dl.contact, dl.district, dl.city].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="cd-steps">' + steps + '</div>' +
      '</div>' +
    '</div>';
}

/* ---------------- galeri render ---------------- */
function cdRenderAll(){
  document.getElementById('cdGallery').innerHTML = HasacaGallery.GALLERY.map(g => {
    const on = cdDesignId === g.id;
    return '<button type="button" class="cd-gallery-item' + (on ? ' on' : '') + '" onclick="cdSelect(\'' + g.id + '\')">' +
      '<img class="cd-gallery-img" src="' + cdEsc(HasacaGallery.imageUrl(g)) + '" alt="' + cdEsc(HasacaGallery.label(g, cdLang())) + '">' +
      '<span class="cd-gallery-name">' + cdEsc(HasacaGallery.label(g, cdLang())) + '</span>' +
      '<span class="cd-gallery-badge">✓ ' + cdEsc(cdT('admin_cards_selected')) + '</span>' +
      '</button>';
  }).join('');

  document.getElementById('cdStageTables').textContent = cdTableCount
    ? cdT('admin_cards_tables_n').replace('{n}', cdTableCount)
    : cdT('admin_cards_no_tables');

  const approveBtn = document.getElementById('cdApproveTriggerBtn');
  if (approveBtn) approveBtn.disabled = !cdDesignId;
}

function cdSelect(id){
  cdDesignId = id;
  cdRenderAll();
  cdQueueSave();
}

/* ---------------- otomatik kaydetme ---------------- */
function cdSaveMsg(msg, isErr){
  const el = document.getElementById('cdSaveState');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}
function cdQueueSave(){
  clearTimeout(cdSaveTimer);
  cdSaveMsg(cdT('admin_cards_saving'));
  cdSaveTimer = setTimeout(cdSaveNow, 600);   // her tuşta istek atma
}
async function cdSaveNow(){
  if (!cdDesignId) return;   // henüz bir seçim yapılmadıysa kaydedecek bir şey yok
  try {
    const r = await fetch('/api/card-design', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designId: cdDesignId })
    });
    if (!r.ok) throw new Error('save_failed');
    cdSaveMsg(cdT('admin_cards_saved'));
    setTimeout(() => { if (document.getElementById('cdSaveState').textContent === cdT('admin_cards_saved')) cdSaveMsg(''); }, 1800);
  } catch (e) {
    cdSaveMsg(cdT('admin_cards_save_err'), true);
  }
}

/* ---------------- onay + teslimat ---------------- */
function cdOpenApprove(){
  // Buton zaten cdRenderAll() içinde tasarım seçilmeden disable ediliyor; bu, doğrudan
  // JS'ten (ör. konsoldan) çağrılırsa diye ikinci bir savunma katmanı.
  if (!cdDesignId) { cdSaveMsg(cdT('admin_cards_pick_first'), true); return; }
  document.getElementById('cdApproveErrors').hidden = true;
  document.getElementById('cdApproveBackdrop').classList.add('open');
}
async function cdSubmitApprove(){
  const btn = document.getElementById('cdApproveBtn');
  const errBox = document.getElementById('cdApproveErrors');
  const delivery = {
    contact:  document.getElementById('cdDContact').value,
    phone:    document.getElementById('cdDPhone').value,
    city:     document.getElementById('cdDCity').value,
    district: document.getElementById('cdDDistrict').value,
    address:  document.getElementById('cdDAddress').value,
    postal:   document.getElementById('cdDPostal').value,
    note:     document.getElementById('cdDNote').value
  };
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = cdT('admin_cards_appr_wait');
  errBox.hidden = true;
  try {
    await cdSaveNow();                                   // son değişiklikler kaybolmasın
    const r = await fetch('/api/card-design/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery })
    });
    const data = await r.json();
    if (!r.ok) {
      // Sunucudan gelen Türkçe doğrulama mesajları doğrudan gösterilir.
      const msgs = data.messages || (data.message ? [data.message] : ['Bir hata oluştu.']);
      errBox.innerHTML = '<ul>' + msgs.map(m => '<li>' + cdEsc(m) + '</li>').join('') + '</ul>';
      errBox.hidden = false;
      return;
    }
    cdOrder = data.order;
    closeTblModal('cdApproveBackdrop');
    cdApplyMode();
  } catch (e) {
    errBox.textContent = cdT('admin_cards_save_err');
    errBox.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* ---------------- özel tasarım talebi ---------------- */
function cdOpenCustom(){
  document.getElementById('cdCustomErrors').hidden = true;
  document.getElementById('cdCustomOk').hidden = true;
  document.getElementById('cdCustomForm').hidden = false;
  document.getElementById('cdCustomBackdrop').classList.add('open');
}
async function cdSubmitCustom(){
  const btn = document.getElementById('cdCustomBtn');
  const errBox = document.getElementById('cdCustomErrors');
  const okBox = document.getElementById('cdCustomOk');
  const message = document.getElementById('cdCustomMsg').value.trim();
  const email = document.getElementById('cdCustomEmail').value.trim();
  errBox.hidden = true;
  const errs = [];
  if (message.length < 10) errs.push(cdT('admin_cards_custom_err_msg'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push(cdT('admin_cards_custom_err_mail'));
  if (errs.length) {
    errBox.innerHTML = '<ul>' + errs.map(m => '<li>' + cdEsc(m) + '</li>').join('') + '</ul>';
    errBox.hidden = false;
    return;
  }
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = cdT('admin_cards_appr_wait');
  try {
    const r = await fetch('/api/card-design/custom-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, email })
    });
    const data = await r.json();
    if (!r.ok) {
      const msgs = data.messages || [data.message || cdT('admin_cards_save_err')];
      errBox.innerHTML = '<ul>' + msgs.map(m => '<li>' + cdEsc(m) + '</li>').join('') + '</ul>';
      errBox.hidden = false;
      return;
    }
    // Başarı: formu gizle, e-posta ile dönüş yapılacağını açıkça söyle.
    document.getElementById('cdCustomForm').hidden = true;
    okBox.textContent = cdT('admin_cards_custom_ok').replace('{mail}', email);
    okBox.hidden = false;
  } catch (e) {
    errBox.textContent = cdT('admin_cards_save_err');
    errBox.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

