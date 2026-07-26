// =============================================
// HASACA Platform — Real-time events (SSE)
// In-memory publish/subscribe, isolated per tenant.
// Two audiences:
//   - admin channel per tenant (order_new, order_status, service_request)
//   - per-order track channel (order_status) for the customer's phone
// Sufficient for a single server instance (Render free tier). For multiple
// instances this would need a shared bus (e.g. Redis pub/sub) — noted in README.
// =============================================

// tenantId -> Set<res>
const adminClients = new Map();
// orderId -> Set<res>
const orderClients = new Map();

function addTo(map, key, res) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(res);
}
function removeFrom(map, key, res) {
  const set = map.get(key);
  if (set) { set.delete(res); if (set.size === 0) map.delete(key); }
}

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) { /* client already gone */ }
}

function initSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n'); // initial comment flushes headers
}

// ── ADMIN CHANNEL ──
function subscribeAdmin(tenantId, req, res) {
  initSse(res);
  addTo(adminClients, tenantId, res);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(heartbeat); removeFrom(adminClients, tenantId, res); });
}

function publishToAdmin(tenantId, event, data) {
  const set = adminClients.get(tenantId);
  if (!set) return;
  for (const res of set) writeEvent(res, event, data);
}

// ── ORDER TRACK CHANNEL (customer) ──
function subscribeOrder(orderId, req, res) {
  initSse(res);
  addTo(orderClients, orderId, res);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
  req.on('close', () => { clearInterval(heartbeat); removeFrom(orderClients, orderId, res); });
}

function publishToOrder(orderId, event, data) {
  const set = orderClients.get(orderId);
  if (!set) return;
  for (const res of set) writeEvent(res, event, data);
}

module.exports = { subscribeAdmin, publishToAdmin, subscribeOrder, publishToOrder };
