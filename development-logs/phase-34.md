# Phase 34 — Production Fixes, Tenant Impersonation, Netlify Marketing Routing & Branding

**Status:** ✅ Complete & Verified | **Date:** 2026-07-26 | **Branch:** `fork/production-fixes`

## Executive Summary
This phase addresses production deployment issues across Netlify and Render API, resolves broken marketing sub-page routing, fixes the Tenant Impersonation ("Tenant Girişi") feature in the Root Panel, updates root password authentication, aligns marketplace commission rate comparisons, and deploys a theme-adaptive vector SVG logo across the platform.

---

## Comprehensive Change Log

### 1. Vector SVG Stacked Layers Logo Branding (`landing.html`, `root.html`, `login.html`, `marketing.html`, `panel.css`)
- **Logo Vectorization**: Converted the 3D stacked diamond layers icon into an inline vector SVG (`<svg class="hasaca-logo-svg" viewBox="0 0 24 24">...`).
- **Theme Adaptivity**: Styled paths with `stroke="currentColor"`.
  - **Dark Mode**: Stroke renders **white** (`#ffffff`).
  - **Light / White Mode (`.theme-bw`)**: Stroke renders **black** (`#15171c`).
- **Replacement Scope**: Replaced legacy `H` text logo across all platform navigation bars, headers, and footers.

---

### 2. Netlify Marketing Sub-page Routing (`_redirects` & `marketing-data.js`)
- **Root Cause**: On Netlify static CDN, requesting dynamic marketing URLs (e.g. `/ozellikler`, `/online-siparis`, `/hakkimizda`) failed with 404 because Express `.get()` routes do not execute on Netlify's HTML layer.
- **Fix**: Added 200 rewrite rules for all 45 marketing page slugs in `_redirects` mapping to `/marketing.html`:
  ```redirects
  /ozellikler            /marketing.html 200
  /online-siparis        /marketing.html 200
  /rezervasyon           /marketing.html 200
  /hakkimizda            /marketing.html 200
  /dokumantasyon         /marketing.html 200
  /api-docs              /marketing.html 200
  ...
  ```
- **API Slug Collision Resolution**: Renamed the API documentation marketing slug from `'api'` to `'api-docs'` in `marketing-data.js` and `landing.html` to avoid route collision with backend `/api/*` endpoint proxies.

---

### 3. Commission Rate Table Alignment & Styling (`landing.html`, `marketing-data.js`)
- **Marketplace Rate**: Set marketplace commission rate comparison to **`%15 - %20`** (EN: `15-20%`).
- **HASACA Rate**: Maintained HASACA commission rate at **`%0`**.
- **Column Order Alignment**: Fixed `CMP` matrix order in `landing.html` so HASACA receives the `%0` green badge (`yes_zero`) and Marketplace receives the `%15 - %20` red badge (`no_high`).

---

### 4. Root Password Authentication & Environment Sync (`backend/db.js`, `login.html`)
- **Neon DB Reset**: Updated the `root` user password in Neon PostgreSQL to `bunudabullan12A`.
- **Environment Overrides**: Updated `backend/db.js` so that `process.env.ROOT_PASSWORD` automatically overrides and syncs the `admin_users` table password hash on every server startup.
- **Multi-Token Session Storage**: Updated `login.html` so logging in as root saves both `hasaca_root_token` and `hasaca_admin_token`, enabling seamless cross-panel navigation between `/root` and `/admin`.

---

### 5. Tenant Impersonation & Single-Domain Routing (`root.html`, `admin.html`)
- **Missing Impersonation Handler**: Defined `async function impersonate(slug)` in `root.html` to invoke `POST /api/root/tenants/:id/impersonate` and obtain a 4-hour support session token.
- **Single-Domain URL Generators**: Updated `tenantSiteUrl(slug)` and `tenantAdminUrl(slug, impToken)` in `root.html` to generate valid paths (`/menu?tenant=slug` and `/admin?tenant=slug#imp=token`) when running on single-domain hosts like Netlify (`hasacaplatform.netlify.app`) or Render, preventing 404 subdomain errors (`slug.netlify.app`).
- **Admin Fetch Interceptor**: Updated `window.__devTenant` in `admin.html` to honor the `?tenant=slug` query parameter across cloud environments.

---

## Affected Files
1. `_redirects` (Netlify rewrite rules)
2. `landing.html` (SVG logo, commission table, footer groups)
3. `root.html` (SVG logo, impersonate function, URL generators)
4. `login.html` (SVG logo, token storage handler)
5. `marketing.html` (SVG logo)
6. `panel.css` (SVG logo theme stroke rules)
7. `marketing-data.js` (Commission text, api-docs slug)
8. `backend/db.js` (Root password env sync)
9. `admin.html` (Global `__devTenant` query support)
10. `development-logs/phase-34.md` (Detailed phase documentation)

---

## Verification & Branch State
- **Branch**: `fork/production-fixes`
- **Netlify CDN**: All 45 marketing pages, `/login`, `/root`, `/admin` verified 200 OK.
- **Render API**: `/api/health`, `/api/auth/login`, and `/api/root/tenants/default/impersonate` verified 200 OK.
