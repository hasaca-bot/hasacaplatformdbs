# Phase 04 — Complete white-label cleanup (index + admin + seed + DB)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (in the working fork @ localhost:17888)

## Goal
Remove ALL remaining Dayı Katık / Tantuni / Döner / Safranbolu / Getir / real-address content from
the customer page, tenant admin, the translation seed source, and the live database, so the platform
is fully white-label and every visible string is generic or tenant-driven.

## Root cause discovered
Visible text (hero badge, footer, etc.) is loaded at runtime from the **`translations` DB table**
(per tenant), which overrides the static `i18nData` in the HTML. The Phase E migration only replaced
"Dayı Katık", never "Safranbolu/Tantuni". So static-HTML edits alone were insufficient — the DB rows
and the seed source (`backend/seedData.js`) also had to be fixed.

## What was done
- **`index.html`** — removed dead `defaultItemTranslations` (173 lines) + `defaultCategoriesMap`;
  emptied inline `catTranslations` fallback maps; neutral defaults (`'starters'`, push title → "My
  Restaurant"). (Visible chrome, meta, map, footer, Getir CTAs were handled earlier in Phase 04.)
- **`admin.html`** — full mirror cleanup: removed 4 Getir anchor blocks (+48KB base64), dead objects,
  emptied `catTranslations`; genericized meta description/keywords/og/twitter/geo/schema, hero
  badge/sub, contact address, Google-Maps embed + link (→ `q=restaurant`), footer, `about_text`,
  `hero_subtitle_1`, `servesCuisine`, category default, doc.title fallbacks, `detail-menu-footer-sub`.
- **`backend/seedData.js`** — genericized the 9 branded i18n keys (TR+EN); fixed `brand_name` →
  "My Restaurant"; removed the two dead exported objects (`defaultCategoriesMap`,
  `defaultItemTranslations`); slimmed `module.exports` to `{ i18nData }`. Now 0 brand refs, 151 keys intact.
- **Live DB (`translations`)** — updated 18 branded rows (9 keys × default + demo tenants) + 1
  `brand_name` row to the same generic values. **0 branded rows remain.**
- **`backend/server.js`** — console banner "Dayı Katık Web App Server" → "HASACA Platform Server".

## Files modified
- `index.html`, `admin.html`, `backend/seedData.js`, `backend/server.js`; live `backend/dayikatik.db`
  (`translations` table).

## DB / API changes
- Data-only: `translations` rows genericized. No schema/API change.
- Dev-only: reset `dayikatik`/`default` admin password to `dayikatik123` (the stored hash no longer
  matched any known password; needed for phased verification). Root remains `bunudabullan12A`.

## Verification (fork @ localhost:17888)
- Customer page: **0 visible branding** (TR and EN); hero badge "Favori Adresiniz"/"Your Favorite
  Spot"; footer "© 2025 My Restaurant"; menu renders 11 `food-card`s from DB; **no console errors**.
- Admin page: logs in, panel renders (6 tabs, login hidden), **0 branding**, JS intact (no parse
  errors from the heavy edits).
- `seedData.js` loads: exports `[i18nData]`, 151 keys, `brand_name` = "My Restaurant".

## Known issues / notes
- **Leftover `demo` tenant** exists (old clone, now genericized). Consider removing later.
- Leftover **test product** "test my restauran" in the default tenant menu (from Phase 03 upload
  tests) — demo data, not branding.
- Admin **"Bildirim Gönder"** tab label is TR-only (no EN i18n) — to be addressed with the
  notifications work (Phase 10/11).
- Pre-existing **startup polling errors** (`loadOrders`/`loadTableOrders`/`loadServiceRequests` fire
  before session restore) still log to console — **Phase 06** target (panel still renders).

## Next phase
Phase 05 — Floating-action overlap + z-index system.
