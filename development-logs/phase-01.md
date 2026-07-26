# Phase 01 — Bug fixes & UI polish (brand text, placeholder logo, broken assets)

**Status:** ✅ Completed & verified
**Date:** 2026-07-21

## Goal
Fix the two visible defects the user reported and sweep for broken assets:
1. The logo next to the "My Restaurant" title was unrecognizable.
2. The "My Restaurant" brand text rendered wrong (showed a stale "hasaca").
3. Scan the site for broken images / missing assets / bad paths.

## What was done
- **Redesigned `icons/placeholder-logo.svg`** — replaced the ugly dark "DEMO" circle with a clean, recognizable fork/knife/plate emblem on an orange rounded-square (viewBox 120×120, gradient `#FF7A3D → #D93B0A`). Loads cleanly (`complete:true`, 150×150).
- **Fixed stale brand text** — the `default` (master template) tenant's DB `name`/`display_name` was a leftover `"hasaca"` that had survived the one-time white-label migration. Root cause: the migration flag was already `'1'` on the boot where the stale value was written.
  - Added an **idempotent self-heal** in `backend/db.js → seedPlatform()`: on every boot it re-syncs the default tenant's `name`/`display_name` to its own `settings.company_name` (`"My Restaurant"`). Self-healing, so this class of drift can never resurface.
  - Verified log line on boot: `[DB] Self-healed default tenant name/display to "My Restaurant".`
- **Favicon now follows the logo** — `applySiteConfig()` in `index.html` sets the favicon (and apple-touch-icon) to `settings.favicon_url || settings.logo_url`, creating the `<link rel="icon">` if absent. For the placeholder case the favicon becomes the clean placeholder logo. (Advance on Phase 5.)
- **Broken-asset sweep** — all 25 `<img>` on the customer page load (0 broken). `placeholder-dish-1..4.svg` and `placeholder-logo.svg` all return HTTP 200. No console errors.

## Files modified
- `icons/placeholder-logo.svg` — new clean emblem.
- `backend/db.js` — idempotent default-tenant self-heal in `seedPlatform()`.
- `index.html` — favicon-follows-logo logic in `applySiteConfig()`.

## DB changes
- No schema change. Data self-heal: `UPDATE tenants SET name='My Restaurant', display_name='My Restaurant' WHERE id='default'` (runs automatically via `seedPlatform()` when drift is detected).

## API changes
- None.

## Verification (browser, localhost:12999)
- Tab title: `My Restaurant | HASACA` ✓
- `[data-i18n="brand_name"]` → `["My Restaurant"]` (no "hasaca") ✓
- No stale `hasaca` / `Dayı Katık` text anywhere in `body.innerText` ✓
- Logo `placeholder-logo.svg` loads (complete, 150×150) ✓
- Favicon + apple-touch-icon → `placeholder-logo.svg` ✓
- All images load, all placeholder assets HTTP 200, 0 console errors ✓

## Known issues / notes
- Screenshot tool times out in this environment; verification done via DOM/JS assertions + HTTP status checks.
- Discovered during verification: a leftover **service worker was serving stale cached HTML**, masking edits. Handled in Phase 02 (PWA disable) which was pulled forward for this reason.

## Next phase
Phase 02 — Disable PWA / installability (reordered forward because the stale SW blocked reliable verification).
