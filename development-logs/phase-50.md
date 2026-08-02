# Phase 50 — Multi-restaurant Google accounts: "Restoranlarım" hub

## Why
User request, discussed and designed together before building: can the same Gmail account own
more than one restaurant, see all of them in one place, switch between them, and see combined
totals — while a different device signed in with the same Gmail can independently have a
different restaurant open? Previously the platform enforced "one Google account, one tenant,
ever" (a unique index on `admin_users.google_sub`), by explicit design from Phase 42.

## Design (agreed with the user before implementation)
- A Google account can now be linked to **N restaurants** (N `admin_users` rows sharing one
  `google_sub`, one per tenant — same shape Root's manual multi-admin support already had).
- Signing in with a Google account linked to **exactly one** restaurant behaves byte-for-byte as
  before — direct login, no picker, fully backward compatible.
- Signing in with a Google account linked to **two or more** restaurants lands on a new
  **"Restoranlarım" hub**: real combined stats (total restaurants, total orders, total sales)
  across every linked restaurant, a list of them each with an "Aç" (Open) button, and a
  "Yeni Restoran Ekle" button to self-provision another one under the same account.
- Clicking a restaurant opens its normal admin panel exactly as today — same URL, same sidebar,
  same everything; nothing about a single restaurant's own admin experience changed.
- **The existing "Çıkış Yap" (logout) button, inside any restaurant's own admin panel, now
  returns to the hub instead of a full logout** — the Google session stays alive, exactly what
  the user asked for ("aynı çıkış yazısı ... total istatistikler sayfasına gelinebilsin"). Logout
  from the hub itself (or from a single-restaurant account, which never sees the hub at all) is a
  full logout, clearing everything.
- Sessions are independent per device for free — each browser's own `localStorage`/`sessionStorage`
  already isolates one restaurant's session token from another; no server-side change was needed
  for "computer A has restaurant X open, computer B has restaurant Y open, same Gmail."

## Backend
- `backend/db.js`: the `google_sub` index is no longer `UNIQUE` — dropped and recreated as a plain
  lookup index. Existing single-restaurant accounts are unaffected (still exactly one row).
- `backend/server.js`:
  - `provisionTenantForGoogleAccount(payload, clientIp, nameOverride)` — the exact tenant-creation
    logic from the original first-time-signup path, extracted into a shared helper so both the
    first sign-in AND "add another restaurant" call the same tested code (same demo-content clone,
    same table generation, same `adminOverride` Google-linked admin row).
  - `POST /api/auth/google` — now looks up **every** `admin_users` row for a `google_sub`, not just
    one. Exactly 1 row: unchanged response shape (`{token,...}`), fully backward compatible. 2+
    rows: returns `{multi:true, identityToken, tenants:[...]}` — an identity-only token (no
    `tenant_id`, cannot call any tenant-scoped API) instead of a real session.
  - `POST /api/auth/select-tenant` (new) — exchanges the identity token + a chosen `tenant_id` for
    a normal per-tenant session token, after verifying that `admin_users` row actually belongs to
    this Google account. Wrong/foreign `tenant_id` → 403, not a token.
  - `GET /api/auth/my-restaurants` (new) — every tenant linked to this Google account (accepts
    either the identity token or a normal tenant token, so it also works called from inside an
    already-open admin panel) plus real aggregate totals: `COUNT(*)`/`SUM(total)` from the real
    `orders` table across every linked `tenant_id`, not fabricated numbers.
  - `POST /api/auth/create-restaurant` (new) — an identity-token-only endpoint; reuses
    `provisionTenantForGoogleAccount` with a user-supplied name instead of the generic
    "X'in Restoranı" default, linking the new tenant under the same `google_sub`.
- **Real bug found and fixed while testing this feature, unrelated to the multi-tenant logic
  itself**: `app.get(['/admin.html','/admin'], ...)` had a pre-existing guard —
  `if (req.tenantId === null) return res.status(404).send(...'Restoran Bulunamadı'...)` — that
  actively broke the hub: a multi-restaurant account is deliberately redirected to **bare** `/admin`
  (there is no single tenant to encode in the URL until a restaurant is picked), and this guard
  intercepted that exact request before admin.html's own client-side auth gate ever got to run.
  Removed the guard — `admin.html`'s `openAdminLogin()` already handles every case correctly on its
  own (valid session → panel, identity token only → hub, neither → login modal), so the server-side
  block was actively wrong now, not just redundant. This was also the literal bug behind the user's
  live report ("restoranlar admin panelinde geri tuşuna basınca restoran bulunamadı çıkıyor").

## Frontend (`admin.html`)
- `getIdentityToken()`/`setIdentityToken()` — mirror the existing `getAdminToken()` pattern, stored
  under a separate `hasaca_identity_token` key so a restaurant switch never needs a fresh Google
  login.
- `openAdminLogin()` — after the existing tenant-token session-restore check, now also checks for
  an identity token and shows the hub instead of the login modal.
- `onAdminGoogleCredential()` (embedded login modal) and `login.html`'s `onGoogleCredential()` — both
  handle the new `{multi:true}` response shape: store the identity token, show the hub (admin.html)
  or redirect to bare `/admin` (login.html, letting admin.html's own gate show the hub).
- `adminLogout()` — context-aware: inside a restaurant's own panel with an identity token present,
  clears only the tenant token and returns to the hub; from the hub itself, or for any account with
  no identity token at all (the overwhelmingly common single-restaurant case), full logout exactly
  as before.
- New `'hub'` entry in `AP_VIEW_MAP` + a new `view-hub` section — reuses the ENTIRE existing
  `#adminPanelOverlay` shell (theme tokens, `.stat-card`/`.panel-card`/`.admin-btn` components) so
  dark/white theming, responsive layout, and every existing visual pattern work with zero new theme
  code. `.hub-mode` on `#adminAppShell` hides the sidebar + hamburger and collapses the shell to a
  single column — the topbar (theme switch, language, logout) stays fully functional.
- `showRestaurantHub()` / `renderHubStats()` / `renderHubList()` / `selectRestaurant()` /
  `createNewRestaurantFromHub()` — fetch, render, and wire up the hub's 3 real stat cards
  (Restoran / Satış / Sipariş) and the restaurant list, each row escaped via the existing
  `aiAsstEsc()` helper (no new XSS surface).
- Found and fixed a real bug of my own before it shipped: the welcome heading's name span was
  originally nested INSIDE the `data-i18n`-tagged element — the existing i18n-apply routine
  overwrites `.textContent` on every `[data-i18n]` element on every language switch, which would
  have silently deleted the name span (and broken every later `getElementById('hubWelcomeName')`
  lookup) the first time someone toggled TR/EN. Fixed by moving the translated text into its own
  sibling span, leaving the name span untouched by the i18n pass.

## Verification
Since a real 2-restaurant Google account can't be scripted (Google's own consent screen isn't
automatable), verified with a synthetic account: 2 `admin_users` rows sharing a fake `google_sub`
(one on `default`, one on a throwaway test tenant) and a real, validly-signed identity token
generated locally with the same `lib/auth.js` the server uses — then drove every endpoint with real
HTTP requests: `my-restaurants` returned both tenants + correct real aggregate totals;
`select-tenant` returned a normal working per-tenant token (cross-checked against `/api/auth/me`);
a wrong/foreign `tenant_id` correctly 403'd; `create-restaurant` provisioned a full 3rd tenant
(demo content, tables, everything) and it immediately appeared in the next `my-restaurants` call;
`create-restaurant` correctly rejected a normal tenant token (401, identity-only). Verified the hub
UI live in the browser (bare `/admin.html`, no query param) in both dark and light theme (using the
project's own established fresh-navigation test methodology, since a runtime theme toggle read in
the same script is known to report stale computed styles in this environment) — sidebar hidden,
stats/list/theme controls all correctly themed. Verified the full switch/logout loop: hub → "Aç" →
normal panel (sidebar back, correct tenant token) → "Çıkış" → back to hub (identity token kept,
admin token cleared) — matching the agreed design exactly. All synthetic test data removed from the
local dev DB afterward; the real `default` tenant's own admin row was untouched throughout.

## Files changed
- `backend/db.js` — `google_sub` index no longer unique.
- `backend/server.js` — `/api/auth/google` now multi-tenant-aware; 3 new endpoints
  (`select-tenant`, `my-restaurants`, `create-restaurant`); removed the `/admin` tenant-required
  404 guard (real bug, broke the hub and was reported live by the user during testing).
- `admin.html` — identity-token storage; hub view (HTML/CSS/JS); context-aware `adminLogout()`;
  hub-aware `openAdminLogin()`/`onAdminGoogleCredential()`; new i18n keys (`admin_hub_*`, TR+EN).
- `login.html` — `handleLoginSuccess()`/`onGoogleCredential()` handle the new multi-tenant response.
