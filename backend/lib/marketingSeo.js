// =============================================
// HASACA — Marketing page <head> builder
// Single source of truth for the per-slug meta/JSON-LD block injected into
// marketing.html's <!--HEAD--> placeholder. Used by TWO callers that must never
// drift apart: server.js's live route (local dev / any direct-Render request)
// and scripts/prerender-marketing.js (build-time static files for Netlify,
// since Netlify's _redirects serves marketing pages as static files and never
// reaches this Express route in production — see phase-51.md for why).
// =============================================

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Every marketing page's own FAQ block (if it has one) becomes real FAQPage
// JSON-LD — Google can render these as rich results, and it's free: the exact
// same Turkish copy already shown on the page, just also machine-readable.
function faqJsonLd(page) {
  const block = (page.blocks || []).find((b) => b && b.t === 'faq' && Array.isArray(b.items) && b.items.length);
  if (!block) return null;
  const mainEntity = block.items.map(([q, a]) => ({
    '@type': 'Question',
    name: q[0],
    acceptedAnswer: { '@type': 'Answer', text: a[0] }
  }));
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity };
}

function breadcrumbJsonLd(page, url, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: baseUrl + '/landing' },
      { '@type': 'ListItem', position: 2, name: page.title[0], item: url }
    ]
  };
}

// baseUrl: origin only, no trailing slash (e.g. "https://tadadigital.netlify.app").
function buildMarketingHead(slug, page, baseUrl) {
  const title = page.title[0] + ' — tada';
  const desc = page.desc[0];
  const url = baseUrl + '/' + slug;
  const jsonLdBlocks = [breadcrumbJsonLd(page, url, baseUrl)];
  const faq = faqJsonLd(page);
  if (faq) jsonLdBlocks.push(faq);

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="keywords" content="${esc(page.title[0])}, tada, restoran yazılımı, komisyonsuz sipariş">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="robots" content="index,follow">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="tada">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="/icons/tada-logo.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="theme-color" content="#0a0a0b">`,
    ...jsonLdBlocks.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
  ].join('\n');
}

module.exports = { buildMarketingHead, esc };
