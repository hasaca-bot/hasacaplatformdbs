# Phase 40 — Fix real-time status updates not reaching the customer's live screen

## Why
User report: changing an order's status in the admin panel (preparing/ready/serving/delivered)
was not updating in real time on the customer's own tracking screen in production, even though
the confirm-plan feature (Phase 39) and the AI assistant were confirmed working well.

## Root cause
Reproduced the exact symptom locally first: placed a real order, opened the tracking card,
triggered a status change via the real API, and watched it update live — worked correctly on
`localhost`. That ruled out the pub/sub logic itself (`backend/lib/events.js`,
`subscribeAdmin`/`publishToAdmin`, `subscribeOrder`/`publishToOrder`) and pointed at something
environment-specific to production.

Confirmed via a direct `curl -N` comparison: an `EventSource`/SSE connection straight to Render
receives the initial `: connected` comment immediately; the identical connection routed through
Netlify's `_redirects`-based `/api/*` proxy (`platformhasaca.netlify.app` → `hasaca-api.onrender.com`)
never receives a single byte and just hangs until timeout. Netlify's redirect proxy does not support
streaming responses — it works fine for normal, buffered request/response API calls (which is why
every other `/api/*` call was unaffected), but breaks long-lived SSE connections entirely. This
silently broke **two** consumers in production:
1. The customer's live order-tracking card (`dkTrackOrder()` in `index.html`) — the bug the user
   reported.
2. The admin panel's own live dashboard feed (`connectAdminEvents()` in `admin.html` — new-order
   notifications, service-request alerts, sound cues) — not yet reported by the user, found
   proactively while investigating the same code path.

## Fix
Added `window.SSE_BASE` (parallel to the existing `window.API_BASE`, which stays `''`/same-origin
for all non-streaming calls) to both `index.html` and `admin.html`: resolves to `''` on
`localhost`/`127.0.0.1`/`*.onrender.com` (no proxy involved there), and to the hardcoded direct
Render origin `https://hasaca-api.onrender.com` everywhere else (i.e. when served from Netlify).
Used exclusively for `EventSource` URL construction — every other `/api/*` call is untouched.
Updated the only two `EventSource` construction sites in the codebase: `dkTrackOrder()`
(index.html) and `connectAdminEvents()` (admin.html). `root.html` was checked and has no
`EventSource` usage of its own — no change needed there.

### Cascading auth fix
Connecting directly to Render's own domain means `slugFromHost()` (per Phase 36) can't derive a
tenant slug from `.onrender.com` (it's a "no real tenant, host doesn't carry a slug" case) — so
`req.tenantId` is `null` on these direct connections unless an explicit `?tenant=` is present. This
broke `GET /api/events/admin`'s original strict `payload.tenant_id === req.tenantId` check for
every real tenant admin (their JWT normally doesn't need to carry `?tenant=` at all). Fixed by
trusting the JWT's own `tenant_id` directly for non-root sessions instead of relying on
host-derived tenant resolution — the same trust model `adminAuth` middleware already uses
elsewhere in this codebase. Root sessions keep their existing ability to view any tenant's feed
via `?tenant=`.

## Verification
- Reproduced the bug locally end-to-end before touching any code (confirmed pub/sub logic itself
  was not at fault).
- `curl -N` comparison: direct-to-Render SSE connects instantly; through-Netlify-proxy SSE never
  receives any bytes — confirmed the proxy is the actual point of failure.
- `node --check backend/server.js` — passes.
- All inline `<script>` blocks in `index.html` and `admin.html` parse cleanly (excluding the two
  pre-existing `application/ld+json` blocks, which are not JS and always fail a JS parse check —
  confirmed by content-type, not just line count).
- Tenant-isolation check for the new `/api/events/admin` logic: opened an SSE connection using a
  real tenant admin's token with a **spoofed** `?tenant=bfbfb` query param (attempting to read
  another tenant's channel), then triggered a real status-change event on that admin's own tenant
  (`hacimustafa`) via the real `PUT /api/orders/:id/status` endpoint. The spoofed connection
  received the `hacimustafa` event (payload confirmed `"tenant_id":"hacimustafa"`) — proving the
  backend subscribed it to the JWT's own tenant regardless of the spoofed query param, i.e. no
  cross-tenant leak was introduced by trusting `payload.tenant_id`.

## Files changed
- `backend/server.js` — `GET /api/events/admin`: trust `payload.tenant_id` for non-root sessions
  instead of requiring it to match host-derived `req.tenantId`.
- `index.html` — added `window.SSE_BASE`; `dkTrackOrder()` now builds its `EventSource` URL from
  `SSE_BASE` instead of `API_BASE`.
- `admin.html` — added `window.SSE_BASE`; `connectAdminEvents()` now builds its `EventSource` URL
  from `SSE_BASE` instead of `API_BASE`.

## Known limitation (unchanged, pre-existing)
The pub/sub layer itself (`backend/lib/events.js`) is in-memory, `Map`-based — correct for a single
server instance but would need Redis pub/sub (or similar) to work across multiple horizontally
scaled backend instances. Not a regression from this phase; noted in the code already.

## Not part of this phase
The user also asked about an "orange card" on the customer's tracking screen that should be
monochrome. Investigated thoroughly — `.dt-status`/`.dt-bar`/`.dt-fill`/`.dt-steps` CSS and the
`body.theme-bw .dt-*` overrides in `index.html` were all found to already be fully monochrome
(using the already-converted `--fire`/`--gold`/`--cart-chip`/`--cart-muted` tokens from Phase 37),
confirmed against both the local source and production's actually-served `index.html` via curl.
The service worker was checked and does not cache pages (push-notification-only, no `fetch`
handler), ruling it out as a source of stale content. No code change made — most likely a stale
client-side view. Asked the user to hard-refresh and send a screenshot if the issue persists so
the exact element can be identified if it's something not yet found.
