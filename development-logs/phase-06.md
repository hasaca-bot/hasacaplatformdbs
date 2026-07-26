# Phase 06 — Fix blank Tenant-Admin after login + header rendering

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Clicking Tenant Login opened the Admin Panel but it rendered blank. Fix the root cause and remove the
startup console errors; confirm the admin header (logo + "My Restaurant") renders.

## Root cause
`admin.html` sets `window.isStandaloneAdmin = true`, and `loadMenuDatabase()` called
`openAdminPanel()` **unconditionally on load** (both the success path ~line 4730 and the `catch`
~line 4736), bypassing the auth check in `openAdminLogin()`. So a visit with **no/stale token**
opened the panel whose data calls (`/api/orders`, reservations, tables, service-requests) all 401 →
blank panel, and the login modal never gated it. Those same unauthenticated calls produced the
`Failed to fetch orders` / `loadTableOrders` / `loadServiceRequests` console errors on first paint.

## What was done (`admin.html` only — extended existing functions, no new systems)
- In `loadMenuDatabase()`, both standalone auto-open calls now go through **`openAdminLogin()`**
  instead of `openAdminPanel()`. `openAdminLogin()` already validates any stored token via
  `GET /api/auth/me` and opens the panel only if valid; otherwise it shows the login modal.
- Added an **auth guard** (`if (!getAdminToken()) return;`) at the top of `loadOrders()`,
  `loadTableOrders()`, and `loadServiceRequests()` so they no-op before login (kills the 401 noise;
  they are still called normally from `openAdminPanel()` once authenticated).

## Files modified
- `admin.html` (3 loader guards + 2 auto-open calls re-routed through the auth gate).

## DB / API changes
- None.

## Verification (fork @ localhost:17888, all via the real UI flow)
- **Fresh visit, no token:** login modal opens (`adminLoginBackdrop.open = true`), panel stays closed,
  username field visible — **no blank panel**, **0 console errors**.
- **Login via modal** (`dayikatik`/`dayikatik123`): token stored, panel opens, login modal closes,
  **6 tabs**, **11 product rows** rendered, `menuData` = 11, **0 console errors**.
- **Impersonation from Root** (`/admin.html#imp=<token>` handoff): token stored, `#imp` hash cleared
  via `history.replaceState`, panel opens, **0 console errors**.
- **Header:** logo (`placeholder-logo.svg`, complete, 150px) + brand text "My Restaurant" render.

## Known issues / notes
- The "menu couldn't load" fallback message in `loadMenuDatabase()` still contains a ⚠️ emoji — left
  for the dedicated **emoji→icon** sweep (Phase 14), out of this phase's scope.
- Admin **"Bildirim Gönder"** tab is still TR-only (i18n gap) — to be handled with the notifications
  work (Phase 10/11).
- Full multi-page responsive/spacing audit remains **Phase 07**.

## Next phase
Phase 07 — Responsive / spacing / alignment audit (all pages) to close Wave 1.
