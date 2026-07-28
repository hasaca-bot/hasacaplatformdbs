// =============================================
// HASACA Platform — Tenant Resolution
// Resolves the tenant (restaurant) from the request host:
//   restaurant1.hasaca.com      -> 'restaurant1'
//   restaurant1.localhost:12000 -> 'restaurant1'  (local dev, no setup needed)
//   localhost / IP / base host  -> 'default'
// Local dev only: ?tenant=slug query override.
// Unknown slug -> 404, disabled tenant -> 403.
// =============================================

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

function slugFromHost(rawHost) {
  const host = String(rawHost || '').split(':')[0].toLowerCase();
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'default';

  // *.localhost — modern browsers resolve these to loopback with zero setup
  if (host.endsWith('.localhost')) {
    const s = host.slice(0, -'.localhost'.length);
    return s && s !== 'www' ? s : 'default';
  }

  // Explicit platform domain (e.g. PLATFORM_DOMAIN=hasaca.com -> restaurant1.hasaca.com)
  const platformDomain = (process.env.PLATFORM_DOMAIN || '').toLowerCase();
  if (platformDomain) {
    if (host === platformDomain || host === 'www.' + platformDomain) return 'default';
    if (host.endsWith('.' + platformDomain)) {
      const s = host.slice(0, -(platformDomain.length + 1));
      return s && s !== 'www' && !s.includes('.') ? s : 'default';
    }
  }

  // Hosting base domains: app-name.onrender.com / site.netlify.app are the app itself, not a tenant
  if (host.endsWith('.onrender.com') || host.endsWith('.netlify.app')) return 'default';

  // Generic custom domain: sub.domain.tld -> 'sub'
  const parts = host.split('.');
  if (parts.length > 2 && parts[0] && parts[0] !== 'www') return parts[0];
  return 'default';
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
      // Query param or header override (essential for single-domain deployments like Netlify/Render)
      if (req.query && typeof req.query.tenant === 'string' && req.query.tenant) {
        slug = req.query.tenant.toLowerCase();
      } else if (req.headers && req.headers['x-tenant-id']) {
        slug = String(req.headers['x-tenant-id']).toLowerCase();
      }

      let tenant = cacheGet(slug);
      if (!tenant) {
        tenant = await db.get(
          isPg ? 'SELECT * FROM tenants WHERE id = $1' : 'SELECT * FROM tenants WHERE id = ?',
          [slug]
        );
        if (tenant) cache.set(slug, { tenant, ts: Date.now() });
      }

      // Root panel + root APIs + auth operate across tenants; never block them on host resolution.
      const isRootPath = req.path === '/root' || req.path === '/root.html' || req.path.startsWith('/api/root');

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

module.exports = { createTenantResolver, invalidateTenantCache, slugFromHost };
