# Phase 02 — Disable PWA / installability (re-enableable)

**Status:** ✅ Completed & verified
**Date:** 2026-07-21

> **Reordering note:** This was originally planned later. It was pulled forward because a
> leftover **service worker was serving stale cached pages**, masking source edits during
> verification. Disabling it both satisfies the user's "disable PWA" requirement and unblocks
> reliable verification for every remaining phase.

## Goal
Make the site behave as a normal responsive web app: no install prompt, no "Add to Home
Screen", no service-worker/offline caching. Keep everything structured so PWA can be
re-enabled with a **single flag**.

## What was done (all in `index.html`)
- Added a single master switch: `window.ENABLE_PWA = false;`
- **Service worker registration** is gated behind `ENABLE_PWA`. When disabled, the page now
  **proactively unregisters any existing SW and deletes all caches** (`caches.keys()` →
  `caches.delete`), so returning visitors who still had `hasaca-v1` cached stop being served
  stale HTML.
- **Install prompt** — `beforeinstallprompt` still calls `e.preventDefault()` (suppresses the
  browser's native mini-infobar) but returns early when `!ENABLE_PWA`, so the custom banner is
  never shown and the prompt is never stashed. The iOS `load` banner is likewise gated.
- **Manifest link** (`<link rel="manifest" href="/manifest.json">`) is commented out — this is
  what makes browsers offer "install". Left in place as a comment for easy re-enable.
- The `#installBanner` DOM element and all install functions are left intact (dormant), so
  flipping `ENABLE_PWA = true` + uncommenting the manifest link fully restores PWA behavior.

## Files modified
- `index.html` — `ENABLE_PWA` flag; gated SW registration + auto-cleanup; gated install
  listeners; commented-out manifest link.

## Scope check
- `admin.html` and `root.html` contain **no** SW/manifest/install code — nothing to change there.
- `service-worker.js` / `manifest.json` files are left on disk (unused) for easy re-enable.
- Push-notification client code is untouched here (it degrades gracefully without an SW); its
  full removal belongs to the "Remove Send Notification" phase.

## DB / API changes
- None.

## Verification (browser, localhost:12999, fresh load)
- `window.ENABLE_PWA` → `false` ✓
- `navigator.serviceWorker.getRegistrations()` → `[]` (none) ✓
- `caches.keys()` → `[]` (all cleared, incl. `hasaca-v1`) ✓
- `link[rel="manifest"]` → not present ✓
- `#installBanner` computed `display` → `none` ✓
- No console errors ✓

## How to re-enable PWA later
1. In `index.html`: set `window.ENABLE_PWA = true;`
2. Uncomment `<link rel="manifest" href="/manifest.json">` in `<head>`.
3. (Optional) bump the `service-worker.js` cache name to force a fresh cache.

## Next phase
Phase 03 — Image upload everywhere (file picker + live preview + validation, replacing manual
URL inputs) across Root Panel and Tenant Admin.
