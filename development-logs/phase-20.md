# Phase 20 — Tenant-isolated Push: Root Notification Center + push-only service worker

**Status:** ✅ Completed & verified
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Tenant-isolated web push: each tenant admin notifies ONLY its own subscribers; Root can broadcast to
selected/all tenants — while the install prompt stays OFF. Re-enable push delivery without
reintroducing the Phase-02 stale-cache bug.

## Key finding
The tenant side was ALREADY fully isolated (no rebuild): `POST /api/subscriptions` stores
`tenant_id=req.tenantId`; `POST /api/notifications/send` writes `tenant_id=req.tenantId` and
`sendPushNotificationInternal` selects `subscriptions WHERE tenant_id=<notif.tenant_id>`; list/delete
are tenant-scoped. Gaps: Root couldn't broadcast, and the SW was disabled (Phase 02) so push couldn't
be delivered.

## What was done
### Push-only service worker — `service-worker.js`
- Rewrote as **push-only**: removed the `fetch` page-caching handler + `STATIC_ASSETS` + install-time
  `cache.addAll`; kept only `push` + `notificationclick`. `activate` now deletes ALL caches. Result:
  the SW can be registered for push WITHOUT ever serving stale cached HTML.

### Re-enable SW for push (install still off) — `index.html`
- Added `window.ENABLE_PUSH = true` (separate from `window.ENABLE_PWA = false`). The SW is registered
  when `ENABLE_PUSH`; the `beforeinstallprompt` / install banner stay gated by `ENABLE_PWA` (OFF);
  manifest link stays commented. Per-tenant SW scope is inherent to the subdomain model; on shared-origin
  dev, isolation is by the `tenant_id` stored at subscribe time.

### Root Notification Center — backend (`server.js` + `routes/root.js`)
- Passed the hoisted `sendPushNotificationInternal` into `createRootRouter({ …, sendPush })`.
- `POST /api/root/notifications` — `{title, body, url?, image?, icon?, priority?, ttl?, target:'all'|[slugs]}`;
  resolves targets (all active, or the given list), creates ONE `notifications` row per tenant
  (tenant_id scoped) + calls `sendPush` (delivers only to that tenant's subs); returns `{count, sentTo}`;
  logs `notification_broadcast`.
- `GET /api/root/notifications?limit=` — cross-tenant history (all tenants) with counts.

### Root Notification Center — UI (`root.html`)
- "Bildirim / Notifications" topbar button + modal: compose (title/body/URL), target radio
  (All restaurants / Selected → tenant checkbox list from the loaded `tenants`), Send, and a send-history
  table (time · tenant · title · sent/failed). `openNotifyModal`/`toggleNotifyTargets`/
  `sendRootNotification`/`loadNotifyHistory`. Full TR/EN i18n.

## Files modified
- `service-worker.js`, `index.html`, `backend/server.js` (pass sendPush), `backend/routes/root.js`
  (2 endpoints + logActivity), `root.html` (button, modal, JS, i18n).

## DB / API changes
- **API added:** `POST /api/root/notifications`, `GET /api/root/notifications` (root-only). No DB change
  (reuses existing `notifications` / `subscriptions` schema; both already carry `tenant_id`).

## Verification (fork @ localhost:17888)
- **Isolation (synthetic subs: default=2, bfbfb=1):** default admin `send` → notification attempted
  **exactly 2** subs (its own) — bfbfb's sub NOT touched. Root `send target=[bfbfb]` → bfbfb notif
  attempted **1**. Root `send target=all` → **count=2** (one notification per tenant). Root history
  spans default+bfbfb; tenant `GET /api/notifications` returns **only default** rows. (Real device
  delivery needs a live browser push subscription — not reproducible headless; targeting/isolation
  verified via attempt counts + DB. Synthetic data cleaned up after the test.)
- **Push-only SW:** customer page shows SW registered (`/service-worker.js`), **`caches.keys()` empty**
  (no page caching → no Phase-02 stale regression), manifest absent, install banner hidden. No console errors.
- **Root UI:** "Bildirim Merkezi" modal opens with 2 tenant checkboxes, target toggle reveals the list,
  history renders. No console errors.

## Known issues / notes
- End-to-end delivery to a real device isn't verifiable in this headless env (needs a real PushManager
  subscription + granted permission). All server-side targeting/isolation IS verified.
- Scheduling/cancel + delivery/read stats for the Root Center, and a tenant-admin re-subscribe UX
  polish, are follow-ups. Tenant SEND already exists in the admin "Bildirim Gönder" tab.

## Next phase
Phase 21 — next backlog feature (Widget Management, SEO Center, or QR Designer).
