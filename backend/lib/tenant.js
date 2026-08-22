// =============================================
// HASACA Platform — Tenant Resolution
// Resolves the tenant (restaurant) from the request host:
//   restaurant1.hasaca.com      -> 'restaurant1'
//   restaurant1.localhost:12000 -> 'restaurant1'  (local dev, no setup needed)
//   localhost / IP / bare platform host -> null (no tenant guessed — see below)
// ?tenant=slug query param / x-tenant-id header override the host on every environment
// (needed for Netlify/Render single-domain hosting, and to test either param locally).
// slugFromHost() returns null (not a guessed id) whenever the host genuinely carries no
// tenant slug — resolveTenant() then does NOT substitute any real tenant; it leaves
// req.tenantId = null and lets the caller decide (most static routes just render their
// tenant-agnostic shell; /admin and the customer catch-all show "no restaurant" instead
// of silently exposing whichever tenant used to be the host-fallback default).
// Unknown/explicit slug -> 404, disabled tenant -> 403.
// =============================================

const { verifyToken } = require('./auth');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // slug -> { tenant, ts }

function cacheGet(slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.tenant;
  cache.delete(slug);
  return null;
}

// Root panel mutations (create/update/disable tenant) must call this so changes apply instantly.
function invalidateTenantCache(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

// Returns a real tenant slug when (and only when) the host itself genuinely carries one
// (a subdomain). Returns null — never a guessed/default id — for every case where the host
// carries no tenant information at all: bare host, IP, the platform's own apex/base domain,
// or a hosting provider's own base domain. Applies identically in local dev and production —
// there is no dev-only carve-out, so local testing reflects what production actually does.
function slugFromHost(rawHost) {
  const host = String(rawHost || '').split(':')[0].toLowerCase();
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

  // *.localhost — modern browsers resolve these to loopback with zero setup
  if (host.endsWith('.localhost')) {
    const s = host.slice(0, -'.localhost'.length);
    return s && s !== 'www' ? s : null;
  }

  // Explicit platform domain (e.g. PLATFORM_DOMAIN=hasaca.com -> restaurant1.hasaca.com)
  const platformDomain = (process.env.PLATFORM_DOMAIN || '').toLowerCase();
  if (platformDomain) {
    if (host === platformDomain || host === 'www.' + platformDomain) return null;
    if (host.endsWith('.' + platformDomain)) {
      const s = host.slice(0, -(platformDomain.length + 1));
      return s && s !== 'www' && !s.includes('.') ? s : null;
    }
  }

  // Hosting base domains: app-name.onrender.com / site.netlify.app are the app itself, not a tenant
  if (host.endsWith('.onrender.com') || host.endsWith('.netlify.app')) return null;

  // Generic custom domain: sub.domain.tld -> 'sub'
  const parts = host.split('.');
  if (parts.length > 2 && parts[0] && parts[0] !== 'www') return parts[0];
  return null;
}

function wantsHtml(req) {
  if (req.path === '/' || req.path.endsWith('.html')) return true;
  const accept = String(req.headers.accept || '');
  // Asset requests (with an extension) are shared across tenants — never block them.
  const lastSeg = req.path.split('/').pop() || '';
  return accept.includes('text/html') && !lastSeg.includes('.');
}

function errorPageHtml(titleTr, titleEn, bodyTr, bodyEn) {
  // Rendered before any tenant/i18n context exists, so it is intentionally bilingual on one page.
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titleTr} | ${titleEn}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#1C0A00;color:#FFF8F0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
.card{max-width:420px}.card h1{font-size:1.4rem;margin-bottom:10px;color:#FF5722}.card p{color:#C4906A;line-height:1.5;margin:6px 0}</style></head>
<body><div class="card"><h1>${titleTr}</h1><p>${bodyTr}</p><hr style="border:none;border-top:1px solid rgba(255,255,255,.1);margin:16px 0"><h1 style="font-size:1.1rem">${titleEn}</h1><p>${bodyEn}</p></div></body></html>`;
}

// Factory: bind to the shared db driver + dialect flag from server.js
function createTenantResolver(db, isPg) {
  async function resolveTenant(req, res, next) {
    try {
      let slug = slugFromHost(req.headers['x-forwarded-host'] || req.headers.host);
      // Allow ?tenant= query param on all environments (needed for Netlify/Render single-domain hosting)
      if (req.query && typeof req.query.tenant === 'string' && req.query.tenant) {
        slug = req.query.tenant.toLowerCase();
      } else if (req.headers && req.headers['x-tenant-id']) {
        slug = String(req.headers['x-tenant-id']).toLowerCase();
      }

      // Root panel + root APIs + auth operate across tenants; never block them on host resolution.
      const isRootPath = req.path === '/root' || req.path === '/root.html' || req.path.startsWith('/api/root');

      // No tenant was specified at all — not a query param, not a header, and the host itself
      // carried no slug. Do NOT substitute any real tenant here (that used to silently expose
      // whichever tenant happened to own the fallback id). Leave req.tenantId = null; it is up
      // to each route to decide what "no tenant" means for it (most render fine regardless;
      // /admin and the customer catch-all explicitly check for null and show "no restaurant").
      if (slug === null) {
        if (isRootPath) { req.tenant = null; req.tenantId = 'default'; return next(); }
        // Faz 97 düzeltmesi: burada durup req.tenantId = null bırakmak, host bare olan HER
        // ortamda (bare localhost, ve tenant subdomain'i henüz kurulmamış production) admin
        // panelinin oturum açmış olsa bile TÜM /api/products gibi adminAuth kullanmayan uçlarda
        // boş sonuç almasına yol açıyordu — istekte geçerli bir oturum token'ı olsa bile hiç
        // okunmuyordu (yalnızca adminAuth token okuyordu, ama /api/products gibi hem müşteriye
        // hem admin'e açık uçlar adminAuth kullanmıyor). Somut belirti: admin AI ile ürün
        // oluşturdu, veritabanına yazıldı, ama Ürün Yönetimi ekranı boş göründü (tenant_id=null
        // sorgusu hiçbir satırla eşleşmiyordu). Çözüm: host/query'den slug çıkmazsa, isteğin
        // kendi Authorization token'ına bak — geçerliyse ve root değilse oradaki tenant_id'yi
        // kullan. Host zaten bir tenant taşıyorsa bu koda hiç girilmez, yani mevcut
        // izolasyon/404/403 davranışı host bazlı istekler için aynen duruyor.
        const authHeader = String(req.headers.authorization || '');
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (bearer) {
          try {
            const payload = verifyToken(bearer);
            if (payload && payload.tenant_id && payload.role !== 'root') {
              req.tenant = null; req.tenantId = payload.tenant_id;
              return next();
            }
          } catch (e) { /* gecersiz/eksik token — asagida null'a duser, davranis degismez */ }
        }
        req.tenant = null; req.tenantId = null;
        return next();
      }

      let tenant = cacheGet(slug);
      if (!tenant) {
        tenant = await db.get(
          isPg ? 'SELECT * FROM tenants WHERE id = $1' : 'SELECT * FROM tenants WHERE id = ?',
          [slug]
        );
        if (tenant) cache.set(slug, { tenant, ts: Date.now() });
      }

      if (!tenant) {
        if (isRootPath) { req.tenant = null; req.tenantId = 'default'; return next(); }
        if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Unknown restaurant' });
        if (req.method === 'GET' && wantsHtml(req)) {
          return res.status(404).send(errorPageHtml(
            'Restoran Bulunamadı', 'Restaurant Not Found',
            `"${slug}" adresinde kayıtlı bir restoran yok.`,
            `No restaurant is registered at "${slug}".`
          ));
        }
        req.tenant = null; req.tenantId = slug;
        return next(); // shared static assets
      }

      if (tenant.status === 'disabled' && !isRootPath) {
        if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Restaurant disabled' });
        if (req.method === 'GET' && wantsHtml(req)) {
          return res.status(403).send(errorPageHtml(
            'Site Geçici Olarak Kapalı', 'Site Temporarily Closed',
            'Bu restoran sitesi şu anda hizmet vermiyor.',
            'This restaurant site is currently unavailable.'
          ));
        }
      }

      req.tenant = tenant;
      req.tenantId = tenant.id;
      next();
    } catch (err) {
      console.error('[TENANT] resolveTenant error:', err);
      res.status(500).json({ error: 'Tenant resolution failed' });
    }
  }

  return { resolveTenant, invalidateTenantCache, slugFromHost };
}

module.exports = { createTenantResolver, invalidateTenantCache, slugFromHost, errorPageHtml };
