/* admin-tables.js — QR masa yonetimi + masa siparis kontrolu.
   admin.html'in 2. <script> blogundan cikarildi (eski satir 11530-11851, Faz 87).
   Icerik DEGISTIRILMEDI; etiket ayni belge konumunda durdugu icin calisma sirasi da ayni. */
// ===================== QR TABLE ORDERING — ADMIN =====================
let tablesData = [];
let currentQr = null;              // { name, png, url }
let dineinOrders = [];
let dineinView = 'active';         // active | archived
let serviceRequests = [];
let dineinKnownIds = new Set();
let dineinFirstLoad = true;
window.dineinFlashIds = [];
const DINEIN_FLOW = ['received', 'preparing', 'ready', 'serving', 'delivered'];

function tblT(key){
  const lang = window.currentLanguage || 'tr';
  if (typeof i18nData !== 'undefined' && i18nData[lang] && i18nData[lang][key] != null) return i18nData[lang][key];
  if (typeof i18nData !== 'undefined' && i18nData.tr && i18nData.tr[key] != null) return i18nData.tr[key];
  return key;
}
function tblEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dineinStatusLabel(st){ return tblT('dinein_status_' + st) || st; }

// ---------- Table Management ----------
async function loadTables(){
  try {
    const res = await fetch('/api/tables');
    if (!res.ok) throw new Error('load failed');
    tablesData = await res.json();
    renderTables();
  } catch(e){ console.error('loadTables', e); }
}

function renderTables(){
  const c = document.getElementById('adminTablesList');
  if (!c) return;
  if (!tablesData.length){ c.innerHTML = '<div class="tbl-empty">' + tblT('admin_tbl_empty') + '</div>'; return; }
  c.innerHTML = tablesData.map(t => `
    <div class="tbl-card">
      <div class="tbl-card-top">
        <div>
          <div class="tbl-card-name">${tblEsc(t.name)}</div>
          ${t.description ? `<div class="tbl-card-desc">${tblEsc(t.description)}</div>` : ''}
          <div class="tbl-card-date">${t.created_at ? new Date(Number(t.created_at)).toLocaleDateString() : ''}</div>
        </div>
      </div>
      <div class="tbl-card-actions">
        <button class="tbl-mini-btn" onclick="viewQr('${t.id}')">${tblT('admin_tbl_qr')}</button>
        <button class="tbl-mini-btn" onclick="renameTablePrompt('${t.id}')">${tblT('admin_tbl_rename')}</button>
        <button class="tbl-mini-btn del" onclick="deleteTable('${t.id}')">${tblT('admin_tbl_delete')}</button>
      </div>
    </div>
  `).join('');
}

function openAddTableModal(){ document.getElementById('tblName').value=''; document.getElementById('tblDesc').value=''; document.getElementById('addTableBackdrop').classList.add('open'); }
function openBulkTableModal(){ document.getElementById('tblCount').value='10'; document.getElementById('bulkTableBackdrop').classList.add('open'); }
function closeTblModal(id){ document.getElementById(id).classList.remove('open'); }

async function createSingleTable(){
  const name = document.getElementById('tblName').value.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/tables', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, description: document.getElementById('tblDesc').value.trim() }) });
    if (!res.ok) throw new Error();
    closeTblModal('addTableBackdrop'); loadTables();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}
async function createBulkTables(){
  const count = parseInt(document.getElementById('tblCount').value, 10) || 1;
  try {
    const res = await fetch('/api/tables', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ count }) });
    if (!res.ok) throw new Error();
    closeTblModal('bulkTableBackdrop'); loadTables();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}
async function renameTablePrompt(id){
  const t = tablesData.find(x => x.id === id); if (!t) return;
  const name = await showCustomPrompt(tblT('admin_tbl_rename_prompt'), tblT('admin_tbl_rename'), t.name);
  if (name == null || !name.trim()) return;
  try {
    const res = await fetch('/api/tables/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
    if (!res.ok) throw new Error();
    loadTables();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}
async function deleteTable(id){
  const ok = await showCustomConfirm(tblT('admin_tbl_confirm_delete'));
  if (!ok) return;
  try {
    const res = await fetch('/api/tables/' + id, { method:'DELETE' });
    if (!res.ok) throw new Error();
    loadTables();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}

async function viewQr(id){
  try {
    const res = await fetch('/api/tables/' + id + '/qr');
    if (!res.ok) throw new Error();
    const data = await res.json();
    currentQr = data;
    document.getElementById('qrModalTitle').textContent = data.name;
    document.getElementById('qrModalImg').src = data.png;
    document.getElementById('qrModalUrl').textContent = data.url;
    document.getElementById('qrModalBackdrop').classList.add('open');
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}
function downloadCurrentQr(){
  if (!currentQr) return;
  const a = document.createElement('a');
  a.href = currentQr.png;
  a.download = 'QR-' + currentQr.name.replace(/\s+/g, '_') + '.png';
  a.click();
}
function restaurantBrand(){
  const cfg = window.__siteConfig || {};
  return { name: (cfg.display_name || cfg.name || 'Restaurant'), logo: (cfg.settings && cfg.settings.logo_url) || '/logo.png' };
}
function buildPrintCard(item){
  const b = restaurantBrand();
  return `<div class="qr-print-card">
    <img class="pc-logo" src="${tblEsc(b.logo)}" alt="">
    <div class="pc-rest">${tblEsc(b.name)}</div>
    <img class="qrimg" src="${item.png}" alt="QR">
    <div class="pc-table">${tblEsc(item.name)}</div>
    <div class="pc-hint">${tblEsc(tblT('admin_tbl_scan_hint'))}</div>
  </div>`;
}
function printCurrentQr(){
  if (!currentQr) return;
  document.getElementById('qrPrintArea').innerHTML = buildPrintCard(currentQr);
  window.print();
}
async function printAllQr(){
  try {
    const res = await fetch('/api/tables-qr');
    if (!res.ok) throw new Error();
    const items = await res.json();
    if (!items.length) { showCustomAlert(tblT('admin_tbl_empty')); return; }
    document.getElementById('qrPrintArea').innerHTML = items.map(buildPrintCard).join('');
    window.print();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}

// ---------- Table Order Control ----------
async function loadTableOrders(){
  if (!getAdminToken()) return;   // not signed in yet — skip
  try {
    const res = await fetch('/api/orders?type=dinein&archived=' + (dineinView === 'archived' ? '1' : '0'));
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (dineinView === 'active') {
      const ids = data.map(o => o.id);
      if (!dineinFirstLoad) window.dineinFlashIds = ids.filter(id => !dineinKnownIds.has(id));
      if (window.dineinFlashIds.length && typeof playOrderSound === 'function') playOrderSound();
      dineinKnownIds = new Set(ids);
      dineinFirstLoad = false;
    }
    dineinOrders = data;
    renderTableOrders();
    updateTableOrdersBadge();
    renderFloorOverview();
  } catch(e){ console.error('loadTableOrders', e); }
}

function updateTableOrdersBadge(){
  const badge = document.getElementById('adminTableOrdersBadge');
  if (!badge) return;
  // Count of active (non-archived) dine-in orders not yet delivered + open service requests
  const n = (dineinView === 'active' ? dineinOrders.length : 0) + serviceRequests.length;
  if (n > 0){ badge.textContent = n; badge.style.display = 'flex'; } else badge.style.display = 'none';
}

function setDineinView(v){
  dineinView = v;
  document.getElementById('dineinActiveChip').classList.toggle('active', v === 'active');
  document.getElementById('dineinArchiveChip').classList.toggle('active', v === 'archived');
  loadTableOrders();
}

function renderTableOrders(){
  const c = document.getElementById('tableOrdersList');
  if (!c) return;
  if (!dineinOrders.length){ c.innerHTML = '<div class="tbl-empty">' + tblT(dineinView === 'archived' ? 'admin_dinein_no_archive' : 'admin_dinein_none') + '</div>'; return; }
  const flash = new Set(window.dineinFlashIds || []);
  c.innerHTML = dineinOrders.map(o => {
    const items = (o.items || []).map(it => `<div class="dc-item"><span><span class="q">${parseInt(it.quantity)||0} ×</span> ${tblEsc(it.name)}</span><span>${ordFormatPrice(it.line_total)}</span></div>`).join('');
    const idx = DINEIN_FLOW.indexOf(o.status);
    const canBack = idx > 0 && dineinView === 'active';
    const canFwd = idx >= 0 && idx < DINEIN_FLOW.length - 1 && dineinView === 'active';
    const nextLabel = canFwd ? dineinStatusLabel(DINEIN_FLOW[idx + 1]) : '';
    return `
    <div class="dinein-card ${flash.has(o.id) ? 'flash' : ''}">
      <div class="dc-top">
        <span class="dc-table">${tblEsc(o.table_name || '-')}</span>
        <span class="dc-time">#${tblEsc(String(o.id).slice(-5))} · ${o.created_at ? ordDate(o.created_at) : ''}</span>
      </div>
      <div class="dc-items">${items}</div>
      ${o.order_notes ? `<div class="dc-note"><b>${tblT('admin_order_notes')}:</b> ${tblEsc(o.order_notes)}</div>` : ''}
      <div class="dc-total"><span>${tblT('admin_order_total')}</span><span>${ordFormatPrice(o.total)}</span></div>
      <div class="dc-status-row"><span class="dc-status-badge">${dineinStatusLabel(o.status)}</span></div>
      ${dineinView === 'active' ? `
      <div class="dc-nav">
        <button ${canBack ? '' : 'disabled'} onclick="advanceOrder('${o.id}','${DINEIN_FLOW[idx-1]||''}')">← ${canBack ? dineinStatusLabel(DINEIN_FLOW[idx-1]) : ''}</button>
        <button class="fwd" ${canFwd ? '' : 'disabled'} onclick="advanceOrder('${o.id}','${DINEIN_FLOW[idx+1]||''}')">${nextLabel} →</button>
      </div>` : `
      <div class="dc-nav"><button class="del" onclick="deleteArchivedOrder('${o.id}')" style="color:#FF5252;">${tblT('admin_order_delete')}</button></div>`}
    </div>`;
  }).join('');
  window.dineinFlashIds = [];
}

async function advanceOrder(id, status){
  if (!status) return;
  try {
    const res = await fetch('/api/orders/' + id + '/status', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) });
    if (!res.ok) throw new Error();
    loadTableOrders();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}
async function deleteArchivedOrder(id){
  const ok = await showCustomConfirm(tblT('admin_order_confirm_delete'));
  if (!ok) return;
  try {
    const res = await fetch('/api/orders/' + id, { method:'DELETE' });
    if (!res.ok) throw new Error();
    loadTableOrders();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}

// ---------- Floor overview ----------
function renderFloorOverview(){
  const c = document.getElementById('floorOverview');
  if (!c) return;
  // Base state from all tables; overlay active orders + service requests
  const byTable = {};
  (tablesData || []).forEach(t => { byTable[t.id] = { name: t.name, status: 'available' }; });
  // active orders (only meaningful in active view; fetch a fresh active list if archived is shown)
  const activeOrders = dineinView === 'active' ? dineinOrders : [];
  activeOrders.forEach(o => {
    if (!o.table_id) return;
    if (!byTable[o.table_id]) byTable[o.table_id] = { name: o.table_name, status: 'available' };
    const map = { received: 'new_order', preparing: 'preparing', ready: 'ready', serving: 'serving' };
    byTable[o.table_id].status = map[o.status] || byTable[o.table_id].status;
  });
  serviceRequests.forEach(s => {
    if (byTable[s.table_id]) byTable[s.table_id].status = s.type === 'bill' ? 'bill' : 'waiter';
  });
  const labels = { available:'admin_floor_available', new_order:'admin_floor_neworder', preparing:'dinein_status_preparing', ready:'dinein_status_ready', serving:'dinein_status_serving', bill:'admin_floor_bill', waiter:'admin_floor_waiter' };
  const cells = Object.values(byTable);
  if (!cells.length){ c.innerHTML = '<div class="tbl-empty" style="padding:20px;">' + tblT('admin_tbl_empty') + '</div>'; return; }
  c.innerHTML = cells.map(t => `<div class="floor-cell ${t.status}"><div class="fc-name">${tblEsc(t.name)}</div><div class="fc-status">${tblT(labels[t.status])}</div></div>`).join('');
}

// ---------- Service requests ----------
async function loadServiceRequests(){
  if (!getAdminToken()) return;   // not signed in yet — skip
  try {
    const res = await fetch('/api/service-requests');
    if (!res.ok) throw new Error();
    serviceRequests = await res.json();
    renderServiceRequests();
    updateTableOrdersBadge();
    renderFloorOverview();
  } catch(e){ console.error('loadServiceRequests', e); }
}
function renderServiceRequests(){
  const bar = document.getElementById('serviceRequestsBar');
  if (!bar) return;
  if (!serviceRequests.length){ bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = serviceRequests.map(s => {
    const label = s.type === 'bill' ? tblT('admin_svc_bill') : tblT('admin_svc_waiter');
    return `<div class="service-item">
      <div class="si-txt"><b>${tblEsc(s.table_name || '-')}</b> — ${label}</div>
      <button class="tbl-mini-btn" onclick="resolveService('${s.id}')">${tblT('admin_svc_resolve')}</button>
    </div>`;
  }).join('');
}
async function resolveService(id){
  try {
    const res = await fetch('/api/service-requests/' + id + '/resolve', { method:'PUT' });
    if (!res.ok) throw new Error();
    loadServiceRequests();
  } catch(e){ showCustomAlert(tblT('admin_tbl_err')); }
}

// ---------- Real-time (SSE) ----------
let adminEventSource = null;
let adminEventsReconnectTimer = null;
function connectAdminEvents(){
  try {
    if (adminEventsReconnectTimer) { clearTimeout(adminEventsReconnectTimer); adminEventsReconnectTimer = null; }
    if (adminEventSource) { adminEventSource.close(); adminEventSource = null; }
    const token = getAdminToken();
    if (!token) return;
    let url = '/api/events/admin?token=' + encodeURIComponent(token);
    if (window.__devTenant) url += '&tenant=' + encodeURIComponent(window.__devTenant);
    // SSE_BASE (not API_BASE) — this connection must bypass the Netlify proxy, see its definition.
    url = window.SSE_BASE + url;
    const es = new EventSource(url);
    adminEventSource = es;
    const onDineinTab = () => document.getElementById('adminTabTableOrdersCont') && document.getElementById('adminTabTableOrdersCont').classList.contains('active-tab');
    es.addEventListener('order_new', (e) => {
      const o = JSON.parse(e.data);
      if (o.order_type === 'dinein') { if (onDineinTab()) loadTableOrders(); else { /* keep badge fresh */ loadTableOrders(); } }
      else if (typeof loadOrders === 'function') loadOrders();
    });
    es.addEventListener('order_status', () => { loadTableOrders(); });
    es.addEventListener('service_request', () => { loadServiceRequests(); if (typeof playOrderSound === 'function') playOrderSound(); });
    // The browser only auto-retries SSE on transient network drops (readyState stays CONNECTING). On a
    // FATAL error — e.g. a 401 once the 24h session token expires, or the backend restarting mid-
    // reconnect — the spec has the browser set readyState=CLOSED and give up permanently, silently, per
    // https://html.spec.whatwg.org/#sse-processing-model. That was the real cause of "live feed just
    // stops, needs a manual refresh": nothing ever tried to reconnect again. Detect that case ourselves
    // and retry after a short delay.
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && adminEventSource === es) {
        adminEventSource = null;
        adminEventsReconnectTimer = setTimeout(connectAdminEvents, 5000);
      }
    };
  } catch(e){ console.error('SSE connect failed', e); }
}
