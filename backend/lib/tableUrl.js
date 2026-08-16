// =============================================
// HASACA Platform — customer-facing table URL builder
// Extracted verbatim from routes/tables.js so the QR image route and the NFC
// card-order route produce the EXACT same URL for a given table. Two copies of
// this logic would let a printed QR and its NFC chip point at different origins.
// =============================================

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

module.exports = { buildTableUrl };
