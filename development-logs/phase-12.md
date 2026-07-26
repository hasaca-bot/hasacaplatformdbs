# Phase 12 — Delete any tenant (incl. default) + auto-regenerate a fresh default

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
The default tenant is no longer protected from deletion. Root can permanently delete ANY tenant
(after a strong confirmation), but the platform is **never left without a tenant**: if the default
(or the last remaining) tenant is deleted, a brand-new default is auto-generated with full demo
content, immediately usable.

## What was done
### `backend/db.js`
- Added and exported **`regenerateDefaultTenant()`** — rebuilds a fresh, fully-usable `default`
  tenant from the master template. Idempotent: clears any stale `default` rows (order_items → the
  10 tenant tables → tenants), then reseeds:
  1. tenant row (`My Restaurant`, placeholder branding via `tpl.defaultSettings`, demo contact),
  2. demo menu via the existing **`seedTemplateMenu('default')`** (4 categories, 11 products),
  3. UI translations (151) from **`seedData.i18nData`** (already white-label clean since P04),
  4. default tenant admin `dayikatik` / `dayikatik123` (display name genericized to "Restaurant Admin").
- Reuses the exact seed patterns from `seedPlatform()` / `runSeeds()` — no duplicated logic.

### `backend/routes/root.js`
- `require('../db')` → `regenerateDefaultTenant` (no circular dep — db.js doesn't require root.js).
- `DELETE /api/root/tenants/:id`: removed the `id === 'default'` block. After the existing per-tenant
  wipe, it counts remaining tenants and checks for `default`; if **0 remain OR default is gone**, it
  calls `regenerateDefaultTenant()`, invalidates the cache, and returns `regeneratedDefault: true`.

### `root.html`
- `deleteTenant()`: for `slug === 'default'`, a **type-to-confirm ("DELETE")** step is required after
  the normal confirm; the success toast reflects `regeneratedDefault`. Added TR/EN i18n keys
  (`root_confirm_delete_default`, `root_delete_cancelled`, `root_default_regenerated`).

## DB / API changes
- **API:** `DELETE /api/root/tenants/:id` now accepts `default`; response includes `regeneratedDefault`.
- **DB:** no schema change. New exported helper `regenerateDefaultTenant()`.

## Verification (fork @ localhost:17888, via API)
- Tenants before: `[default, demo]`.
- **Delete non-default `demo`** → 200, `regenerated:false`; tenants after `[default]` — **default
  intact** (isolation preserved).
- **Delete `default`** → 200, `regeneratedDefault:true`; tenants after `[{default, "My Restaurant"}]`
  — **platform never empty**.
- Regenerated default is fully usable: site-config 200 (logo `/icons/placeholder-logo.svg`), admin
  login `dayikatik`/`dayikatik123` → 200 `tenant_admin`, **4 categories / 11 products / 151
  translations / 1 admin**, and **0 branding refs** (hero badge = "Favori Adresiniz").
- Server boots cleanly (no syntax/circular-dep errors); root.html loads with `deleteTenant` defined,
  i18n keys present, **no console errors**.
- Bonus: regeneration cleaned up the leftover `demo` tenant + "test my restauran" test product.

## Known issues / notes
- The *disable*-default protection (`PUT /tenants/:id/status`) is intentionally **kept**: deletion
  self-heals via regeneration, but disabling the sole tenant would not, so that guard remains a safety.
- Regeneration resets the default tenant to placeholder branding (by design — it's the master
  template). A tenant's own customizations are per-tenant and unaffected by deleting a *different* tenant.

## Next phase
Phase 13 — Root-editable per-tenant Contact & Social settings (tenant admin read-only).
