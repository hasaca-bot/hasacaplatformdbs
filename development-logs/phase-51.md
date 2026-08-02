# Phase 51 — Real SEO (server-side per-page/per-tenant meta, JSON-LD, build-time prerendering) + favicon fixed to the real triangle mark

## Why
User asked for genuine SEO work aimed at ranking in Turkey, plus a favicon fix ("kırmızı şeyden 3
tane üçgen platforma çevir" — from the red thing to the 3-triangle platform mark). An Explore-agent
audit of the existing SEO infrastructure (meta tags, JSON-LD, robots.txt/sitemap.xml, the per-tenant
SEO Management Center from Phase 21/23) plus direct research into 2026 technical SEO / schema.org /
hreflang / favicon best practices grounded the plan. Two concrete, previously-unknown bugs were found
during the audit and fixed as part of this phase (see below) — one of them was significant enough
that essentially none of the already-built SEO work (Phase 21/23) was ever reaching production.

## 1. A real production bug found mid-implementation: none of the dynamic SEO ever reached prod
Checked the LIVE `robots.txt` (`platformhasaca.netlify.app/robots.txt`) — it was serving the static
placeholder file at the repo root ("superseded by the dynamic route", per its own comment), not the
real per-tenant version `backend/server.js`'s `GET /robots.txt` generates. Root cause: Netlify's
`_redirects` only proxies `/api/*` and `/uploads/*` to the Render backend — every other path,
including the 45 marketing sub-pages and `/robots.txt`/`/sitemap.xml`, is served by Netlify as a
static file, never reaching Express at all. Confirmed the same for a marketing sub-page
(`/qr-menu` rendered generic homepage-like content, not the per-page injected head) via a live fetch.
This means the entire Phase 21/23 SEO system has likely never been visible to Google on the real
production domain since the Netlify+Render split was set up — a significant, previously-undiscovered
gap, unrelated to (and larger than) what was originally asked for, found by verifying rather than
assuming the existing "done" work was actually live.

**Fix, two different mechanisms depending on cost of a Render round-trip:**
- `/robots.txt` and `/sitemap.xml` — added to `_redirects`' Render proxy list (same pattern as
  `/api/*`). Low traffic, mostly hit by bots (which tolerate Render's free-tier cold start fine),
  so proxying is the right, zero-new-code fix — the dynamic routes already existed and were correct.
- The 45 marketing pages — proxying these too would round-trip EVERY real visitor and every Googlebot
  crawl through Render's cold start, hurting Core Web Vitals (a real ranking factor) and crawl budget.
  Instead: **build-time prerendering**. New `backend/scripts/prerender-marketing.js` runs the exact
  same head-building logic server.js's live route uses (extracted into a shared
  `backend/lib/marketingSeo.js` so the two can never drift apart) and writes 45 real, complete static
  HTML files to `pages/<slug>.html`, each with its own baked-in title/description/canonical/OG/
  Twitter/JSON-LD. `_redirects` now points each of the 45 slugs at its own pre-rendered file instead
  of the shared `marketing.html` shell. **Must be re-run (and the output committed) after any
  `marketing-data.js` content change, or any edit to `marketing.html`'s shell/CSS/JS** — documented
  in the script's own header comment and in `_redirects`.

## 2. Marketing pages — new structured data, on top of the already-correct meta pipeline
`backend/lib/marketingSeo.js`'s `buildMarketingHead()` adds, beyond what already existed
(title/description/canonical/robots/OG/Twitter, all already correct per Phase 21/23):
- `meta name="keywords"` (was missing on sub-pages; landing.html already had one).
- `BreadcrumbList` JSON-LD (Ana Sayfa → page) on every page.
- `FAQPage` JSON-LD, built from each page's own existing `faq()` block in `marketing-data.js` (real
  content already on the page, not new copy) — only emitted for the ~pages that actually have one.
Spot-verified `pages/qr-menu.html` (has FAQ: 2 JSON-LD blocks, BreadcrumbList + FAQPage, both valid)
and `pages/gizlilik.html` (no FAQ: 1 JSON-LD block, BreadcrumbList only) — confirms the conditional
logic is correct, not blindly emitting an empty/broken FAQPage on pages without one.

## 3. landing.html — fixed a real broken canonical, added missing robots/JSON-LD
The canonical + `og:url` were hardcoded to `https://hasaca.com/` — verified this domain does **not
resolve at all** (DNS lookup fails), so Google was being told the canonical version of the page lives
at a domain that doesn't exist. Since landing.html is always served as a static file (same Netlify
constraint as above — there's no dynamic host to derive this from at request time), fixed it to the
real, current live domain `https://platformhasaca.netlify.app/` directly in the source, with a comment
flagging it for a manual update once/if a permanent custom domain exists. Also added: the missing
`meta name="robots"`, `Offer`/`priceSpecification` pricing data on the existing `SoftwareApplication`
JSON-LD (was `price: "0"` — actively misleading, now reflects the real ₺749/₺1499 tiers from Phase 49),
and a `FAQPage` JSON-LD block built from the page's own existing q1–q6 FAQ copy (kept in sync by hand,
flagged in a comment, since this file has no server-side templating step).

## 4. Tenant sites (index.html) — real per-tenant SEO now server-side, not JS-only
The biggest gap the audit found: every tenant's real `seo_title`/`seo_description`/canonical/OG/
JSON-LD was previously applied ONLY by client-side JS (`applySiteConfig()`, runs after
`/api/site-config` resolves) — any crawler or social-share scraper that doesn't execute JS saw the
generic "My Restaurant" placeholder for every single tenant, and the second JSON-LD block
(WebSite+Organization) was never patched even by the JS, ever. Replaced index.html's static default
meta/JSON-LD block with a `<!--HEAD-->` placeholder (same pattern marketing.html already used) and
added `backend/lib/tenantSeo.js`'s `buildTenantHead()`, wired into a new shared `sendTenantIndex()`
used by `/`, the catch-all route, and `/t/:token` (QR table scans). `applySiteConfig()` was left
completely untouched — it selects elements by attribute (`meta[name="description"]` etc.), not by
their static text, so it works identically whether the tag came from the old static default or this
new server-injected version; in practice it now just re-confirms values that are already correct.
Verified live: `curl`'d the raw HTML (no JS) for the `default` tenant and confirmed its REAL
configured title ("My Restaurant — Best Food"), description, phone/address, and BOTH JSON-LD blocks
are present in the initial response, not the generic placeholder.
**Important caveat, told to the user directly**: this only takes effect for requests that actually
reach Express — local dev, or a future tenant custom domain pointed straight at Render. On the current
`platformhasaca.netlify.app/menu?tenant=X` demo path, Netlify's static `_redirects` rule for `/menu`
bypasses this exactly like it did for the marketing pages, so it has no visible effect there yet. This
is a hosting/DNS limitation, not something further code can fix — becomes fully live the moment a real
tenant subdomain is set up.

## 5. Sitemap `lastmod` correctness (small)
`/landing` and the 45 marketing pages were using whichever TENANT happened to resolve the request's
`updated_at` as their `lastmod` — meaningless and inconsistent (would change depending on which
restaurant's host served the sitemap). Split into `tenantLastmod` (still the real tenant's own
`updated_at`, for the tenant's own homepage entry only) and a separate `today` value for every
HASACA-owned URL.

## 6. Favicon — real triangle-mark raster assets, replacing pre-rebrand orange/red placeholders
Opened every raster icon file in the repo directly (Read tool, as images) to check, rather than
trust file names: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`,
`icons/icon-192.png`, `icons/icon-512.png`, and `logo.png` were ALL a flat orange/red rounded
square/blob — leftover pre-monochrome-rebrand placeholders with no mark at all. Only the SVG files
(`favicon.svg`, `icons/favicon.svg`) had the correct dark-bg/white-triangle mark (already wired up as
the primary `<link rel="icon">` since Phase 46) — but browsers/OSes that prefer a raster favicon over
SVG (Windows taskbar pins, iOS "Add to Home Screen", some browser tabs) were showing the stale red
asset instead, which is exactly the bug being reported.
No image-processing library exists in this project's dependencies (checked `backend/package.json`) —
rather than add one permanently for a one-off asset-generation task, installed `sharp` +
`png-to-ico` into the scratchpad only (`npm install --no-save`, never touches this repo's
`package.json`/lockfile) and rasterized `icons/favicon.svg` (its default, non-media-query rule set —
dark background, white mark) at every needed size: 16×16, 32×32 (favicons), 180×180 (Apple touch
icon), 192×192/512×512 (`icons/icon-*.png`, PWA manifest sizes), 512×512 (`logo.png`), and a real
multi-resolution `favicon.ico` bundling 16/32/48px renders. Visually re-verified every regenerated
file afterward (Read tool) — all show the correct 3-tier triangle/diamond stack mark on a dark
rounded-square background, matching the brand mark used everywhere else in the app. No `<link
rel="icon">` tags needed to change — they already pointed at the right filenames, only the file
CONTENTS were wrong.

## What's left — the user's own action items (not code)
Told directly to the user (external actions, no credentials/DNS access available here):
1. **Google Search Console**: verify the site (a `google-site-verification` meta tag already exists
   in index.html, so tenant-site verification is partly ready; landing/marketing would need their own
   verification) and submit `sitemap.xml` once `/robots.txt`/`/sitemap.xml` are live on production.
2. **Domain decision**: `hasaca.com` is not registered/live. A permanent domain (optionally `.com.tr`
   for a mild local-search edge, per research — not required) is recommended; the code is already
   written to make this a one-line update (landing.html's hardcoded canonical) plus one prerender-
   script re-run, not a bigger change.
3. **Google Business Profile** — benefits individual TENANT restaurants (HASACA itself isn't a local
   business), already a value-add the platform can point tenants toward.
4. **Backlinks / directories / PR** — genuinely external, no code path for this.

## Files changed
- `backend/lib/marketingSeo.js` (NEW) — shared per-slug head builder (meta/OG/Twitter/JSON-LD incl.
  new BreadcrumbList + conditional FAQPage), used by both the live route and the prerender script.
- `backend/lib/tenantSeo.js` (NEW) — shared per-tenant head builder for index.html.
- `backend/scripts/prerender-marketing.js` (NEW) — generates `pages/<slug>.html` (45 files) from
  `marketing-data.js` + `marketingSeo.js`; re-run manually after content/shell changes.
- `pages/` (NEW, 45 files) — build-time output of the above, committed since there's no CI build step.
- `backend/server.js` — marketing route refactored to use `marketingSeo.js` (behavior-identical);
  new `sendTenantIndex()` (uses `tenantSeo.js`) wired into `/`, the catch-all, and `/t/:token`;
  sitemap `lastmod` fix.
- `_redirects` — `/robots.txt`+`/sitemap.xml` now proxy to Render; the 45 marketing slugs now point
  at their own `pages/<slug>.html` instead of the shared `marketing.html` shell.
- `index.html` — static default meta/JSON-LD block replaced with a `<!--HEAD-->` placeholder
  (mirrors marketing.html's existing pattern); favicon `<link>` tags unchanged.
- `landing.html` — fixed canonical/`og:url` to the real live domain; added `meta robots`, pricing
  `Offer` data on the existing `SoftwareApplication` JSON-LD, and a new `FAQPage` JSON-LD block.
- `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`,
  `icons/icon-192.png`, `icons/icon-512.png`, `logo.png` — regenerated from the real triangle mark
  (were flat orange/red placeholders).
