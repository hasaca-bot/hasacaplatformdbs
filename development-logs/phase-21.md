# Phase 21 — SEO Management Center (per-tenant SEO + dynamic robots/sitemap)

**Status:** ✅ Completed & verified
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Full per-tenant SEO: dynamic host-based `robots.txt` + `sitemap.xml`, complete meta
(title/description/keywords/OG/Twitter/canonical/robots/JSON-LD) rendered on the customer site from
tenant settings, edited in the Root Panel with char counters, OG-image upload, and a live preview.
Also fix the stale `dayikatik.netlify.app` domain still hardcoded in robots/sitemap.

## What was done
### Dynamic robots.txt + sitemap.xml — `backend/server.js` (before `express.static`)
- `GET /robots.txt` — host-derived (`req.headers.host` + proto); `Disallow: /` when the tenant's
  `settings.seo_robots === 'noindex'`, else `Allow: /`; always `Sitemap: <host>/sitemap.xml`. No domain
  hardcoded.
- `GET /sitemap.xml` — valid urlset with the tenant homepage `<loc><host>/</loc>` + `<lastmod>` (tenant
  `updated_at`). Uses `req.tenant` from the resolver → correct per subdomain; default on localhost.
- Blanked the stale static `robots.txt` / `sitemap.xml` (removed the `dayikatik.netlify.app` URLs).

### Per-tenant SEO settings — `backend/routes/root.js`
- `PUT /tenants/:id/branding` ALLOWED += `seo_keywords`, `og_image`, `seo_robots`, `seo_canonical`
  (`seo_title`/`seo_description` already allowed). `seo_canonical` is URL-validated; `og_image` is an
  uploaded `/uploads/...` path (excluded from the http-URL check).

### Customer site renders all SEO — `index.html` `applySiteConfig()`
- Added a `setMeta(selector, attr, val)` create-or-update helper and set, from tenant settings:
  `description`, `keywords`, `og:title/description/image/url`, `twitter:title/description/image`,
  `link[rel=canonical]`, `meta[name=robots]` (`noindex,nofollow` vs `index,follow`), and updated the
  JSON-LD Restaurant `name`/`url`/`description`/`image`. OG image falls back to `logo_url`.

### Root Panel SEO block — `root.html`
- Branding modal "SEO" section: SEO Title/Description with **char counters** (60/160), **Keywords**,
  **OG image** (upload-only + preview via `uploadPlatformAsset('bOgImage')`/`refreshAssetThumb`), a
  **robots** select (Indexed / Not indexed), and a **live Google-style preview** (`updateSeoPreview()`).
  Wired into `openBrandModal` (populate) + `saveBranding` (send). Full TR/EN i18n.

## Files modified
- `backend/server.js` (robots/sitemap routes), `backend/routes/root.js` (ALLOWED += SEO),
  `index.html` (applySiteConfig SEO block), `root.html` (SEO UI + JS + i18n + CSS), `robots.txt` +
  `sitemap.xml` (de-branded/blanked).

## DB / API changes
- **API:** `GET /robots.txt`, `GET /sitemap.xml` (dynamic); branding endpoint accepts SEO keys. No DB change.

## Verification (fork @ localhost:17888)
- **robots.txt:** 200, `Sitemap: http://localhost:17888/sitemap.xml`, **0 `dayikatik` leaks**; tenant
  `seo_robots=noindex` → `Disallow: /`; reset → `Allow: /`.
- **sitemap.xml:** 200, valid XML, `<loc>http://localhost:17888/</loc>`, no old domain.
- **Customer meta:** after saving SEO → `document.title`, description, keywords, og:title/image/url,
  twitter:title, canonical, `robots=index,follow`, and JSON-LD name/url all reflect the tenant. No console errors.
- **Root UI:** SEO fields populate + save + round-trip; OG image uploads + previews (thumb shown);
  char counters (25/60, 26/160); live preview shows title + host + description. No console errors.

## Known issues / notes
- Sitemap lists the homepage only (single-page site) — extendable to menu/category anchors later.
- SEO stays Root-managed (consistent with Contact&Social/Theme); a tenant-admin self-service SEO tab
  is a follow-up.

## Next phase
Phase 22 — next backlog feature (Widget Management, QR Designer, or the Gemini AI Setup Assistant).
