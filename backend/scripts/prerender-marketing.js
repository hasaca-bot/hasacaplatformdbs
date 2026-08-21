// =============================================
// HASACA — build-time static generation for the 45 marketing pages
//
// WHY THIS EXISTS: in production, Netlify's _redirects serves /qr-menu,
// /fiyatlandirma etc. as static files (only /api/* and /uploads/* proxy to
// Render) — server.js's per-slug SEO route (marketingSeo.js's buildMarketingHead)
// never runs for real visitors or Googlebot, only in local dev. This script
// runs that SAME head-builder once, at build/deploy time, and writes 45 real
// static HTML files with the correct title/description/canonical/OG/JSON-LD
// already baked in — _redirects points each slug straight at its own file
// instead of the shared marketing.html shell.
//
// RUN THIS AGAIN whenever marketing-data.js changes (new page, new copy, new
// FAQ), then commit the regenerated files in pages/ alongside the content
// change — there is no CI build step in this project, so this is a manual,
// deliberate step, same spirit as this project's other one-off scripts/.
//
// Usage:  node backend/scripts/prerender-marketing.js [baseUrl]
// Default baseUrl is the current live Netlify domain; pass a real custom
// domain here once one is registered (see phase-51.md's "your action items").
// =============================================

const fs = require('fs');
const path = require('path');
const MARKETING = require('../../marketing-data.js');
const { buildMarketingHead } = require('../lib/marketingSeo');

const ROOT = path.join(__dirname, '..', '..');
const BASE_URL = (process.argv[2] || 'https://hasaca-api.onrender.com').replace(/\/+$/, '');
const OUT_DIR = path.join(ROOT, 'pages');

const shell = fs.readFileSync(path.join(ROOT, 'marketing.html'), 'utf8');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const slugs = Object.keys(MARKETING.pages);
let count = 0;
for (const slug of slugs) {
  const page = MARKETING.pages[slug];
  const head = buildMarketingHead(slug, page, BASE_URL);
  const html = shell.replace('<!--HEAD-->', head);
  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), html, 'utf8');
  count++;
}

console.log(`[prerender-marketing] wrote ${count} static pages to ${OUT_DIR} (base URL: ${BASE_URL})`);
console.log('[prerender-marketing] remember to update _redirects if slugs were added/removed, and commit pages/*.html.');
