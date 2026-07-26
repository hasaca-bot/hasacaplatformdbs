# Phase 17 — Activity Log (tenant-isolated audit trail)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
An audit trail recording important actions (login, restaurant create/delete, branding changes).
Each entry stores timestamp, actor, role, tenant, action, target, details, IP. Tenant admins see
only their own tenant's log; Root sees every tenant's. Automatic migration; no manual SQL.

## What was done
### DB — `backend/db.js`
- **Auto-migration:** new `activity_log` table (id, tenant_id, actor, role, action, target, details,
  ip, created_at) + indexes on `tenant_id` and `created_at`, created in the shared `runMigrations()`
  block (runs on every boot; `tenant_id=''` denotes a platform/root-level action).
- **`logActivity({tenantId, actor, role, action, target, details, ip})`** helper — fire-and-forget,
  wrapped in try/catch so audit logging can never break the request it records. Exported from db.js.

### Logging hooks
- **`backend/server.js`** — `POST /api/auth/login` logs `login` (tenant-scoped for tenant admins,
  platform-level for root) with the client IP.
- **`backend/routes/root.js`** — `tenant_created` (POST /tenants), `tenant_deleted` (DELETE, notes
  regeneration), `branding_updated` (PUT /branding, records which keys changed). Added a `clientIp()`
  helper.

### Read endpoints (tenant-isolated)
- **`GET /api/root/activity`** (root) — all tenants; filters `?tenant=`, `?action=`; pagination
  `?limit=`/`?offset=` (limit capped 200); returns `{items, total, limit, offset}`.
- **`GET /api/admin/activity`** (adminAuth) — **only `WHERE tenant_id = req.tenantId`** — a tenant can
  never see another tenant's log.

### Root Panel — `root.html`
- "Aktivite / Activity" topbar button + modal with a filter row (tenant text + action dropdown) and a
  scrollable table (time / user+role / action / target / tenant). `openActivityModal()` + `loadActivity()`
  (HTML-escaped, localized timestamps). Full TR/EN i18n.

## Files modified
- `backend/db.js` (table + `logActivity` + export), `backend/server.js` (login log + `/api/admin/activity`),
  `backend/routes/root.js` (`/api/root/activity` + create/delete/branding hooks + `clientIp`),
  `root.html` (button, modal, JS, i18n).

## DB / API changes
- **DB:** new `activity_log` table (auto-migrated; existing data untouched).
- **API added:** `GET /api/root/activity` (root), `GET /api/admin/activity` (tenant-scoped).

## Verification (fork @ localhost:17888)
- Root + tenant logins → logged. Create + delete a throwaway tenant → `tenant_created` +
  `tenant_deleted` logged. `GET /api/root/activity` → all 4 events, newest first; `?action=login`
  filter returns only logins.
- **Isolation:** `GET /api/admin/activity` as `dayikatik/default` returns **only its own `login`
  (1 row)** — no root or other-tenant rows leak.
- **UI:** Activity modal opens ("Aktivite Kaydı"), renders 5 rows (time/actor/role/action/target/tenant).
  No console errors.

## Known issues / notes
- Export (CSV) and an automatic-cleanup/retention policy are not yet added (spec mentions them) —
  small follow-ups. A tenant-admin UI panel for its own log can be added later (endpoint already exists).

## Next phase
Phase 18 — next backlog feature (Widget Management, SEO Center, Restaurant Analytics, QR Designer, or
Root Notification Center).
