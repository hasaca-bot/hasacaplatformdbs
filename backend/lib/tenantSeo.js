// =============================================
// HASACA — tenant site (index.html) <head> builder
// Previously every tenant's real name/description/canonical/JSON-LD only ever
// got applied client-side (applySiteConfig(), after `/api/site-config` resolves)
// — any crawler or social-share scraper that doesn't run JS saw the generic
// "My Restaurant" placeholder for every single tenant. This builds the exact
// same tag set server-side, with real values, so it's in the HTML from byte one.
// applySiteConfig() is untouched and still runs on top — it's idempotent
// against whatever this already set correctly.
//
// NOTE (see phase-51.md): this route only actually executes for requests that
// reach Express directly (local dev, or a tenant's own custom domain pointed
// straight at Render) — Netlify's _redirects serves /menu, /t/*, /tenant/* on
// the shared platformhasaca.netlify.app domain as static files today, bypassing
// this entirely, same as it did for the marketing pages before prerendering.
// =============================================

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildTenantHead(tenant, settings, url) {
  const name = settings.company_name || tenant.display_name || tenant.name || 'My Restaurant';
  const title = settings.seo_title || name;
  const desc = settings.seo_description || `${name} — lezzetli yemekler, hızlı teslimat. HASACA platformu ile oluşturulmuş restoran sitesi.`;
  const keywords = settings.seo_keywords || 'restoran, menü, online sipariş, yemek, rezervasyon, QR menü';
  const canonical = settings.seo_canonical || url;
  const robots = settings.seo_robots === 'noindex' ? 'noindex,nofollow' : 'index, follow';
  const ogImage = settings.og_image || settings.logo_url || '/icons/placeholder-logo.svg';
  const phone = tenant.contact_phone || '';
  const address = tenant.address || '';

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="title" content="${esc(title)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="keywords" content="${esc(keywords)}">`,
    `<meta name="author" content="${esc(name)}">`,
    `<meta name="robots" content="${robots}">`,
    `<meta name="language" content="Turkish">`,
    `<meta name="geo.region" content="TR">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:type" content="restaurant">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(ogImage)}">`,
    `<meta property="og:image:width" content="512">`,
    `<meta property="og:image:height" content="512">`,
    `<meta property="og:locale" content="tr_TR">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(ogImage)}">`,
    `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name,
      description: desc,
      url,
      telephone: phone || '123456789',
      address: {
        '@type': 'PostalAddress',
        streetAddress: address || 'Example Address',
        addressCountry: 'TR'
      },
      openingHoursSpecification: [
        { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '11:00', closes: '22:30' }
      ],
      servesCuisine: ['Restaurant'],
      priceRange: '₺₺'
    })}</script>`,
    `<script type="application/ld+json">${JSON.stringify([
      { '@context': 'https://schema.org', '@type': 'WebSite', name, url },
      { '@context': 'https://schema.org', '@type': 'Organization', name, url, logo: ogImage }
    ])}</script>`
  ].join('\n  ');
}

module.exports = { buildTenantHead };
