# Phase 42 — Google Sign-In foundation: schema + shared tenant-provisioning module

## Why
First piece of the approved "Google ile Giriş + Restoran Sahiplerine Kendi Kendine Yönetim Paneli" plan
(saved at the time of approval as `C:\Users\hasan_y4hfwna\.claude\plans\evet-plan-haz-rla-composed-walrus.md`,
also mirrored in memory as `project_google_signin_plan.md`). Split into phases per the user's explicit
request to work "parça parça" (piece by piece) so each chunk stays reviewable and token-light. This phase
is pure foundation — no new user-facing behavior yet, just the groundwork later phases build on:
1. Database columns needed to store a Google identity on an admin account.
2. Extracting Root's tenant-creation logic out of its private closure so the future Google self-signup
   route can reuse the exact same, already-battle-tested seeding code instead of a second copy.

## Changes

### Database (`backend/db.js`, `backend/masterTemplate.js`)
- `runPlatformMigrations()`: new additive step 6 — `admin_users` gets `email`, `google_sub`,
  `avatar_url` (all nullable `TEXT`, via the existing `ensureColumn()` helper), plus a unique index on
  `google_sub` (`WHERE google_sub IS NOT NULL`, so existing password-only rows with a NULL value never
  collide). This unique index is the actual enforcement mechanism for "one Google account can only ever
  own one tenant" — a Google sub can appear in at most one `admin_users` row, and each row belongs to
  exactly one tenant.
- `masterTemplate.js`'s `defaultSettings()`: added `subscription_status: 'active'` (placeholder for a
  future, not-yet-built subscription/payment system — read-only display only, no billing logic) and
  `self_paused: false` (placeholder for Phase D's tenant-controlled "temporarily close my restaurant"
  toggle — deliberately a NEW, separate flag from Root's existing `tenants.status`, since that field also
  blocks the tenant's own login and the user explicitly wants self-service pausing to be self-reversible).
  Both apply automatically to every newly created tenant from now on; existing tenants simply read as
  `undefined`/falsy until they're touched, which every consuming code path must treat as the same default.

### Shared tenant-provisioning module (new: `backend/lib/tenantProvisioning.js`)
Moved `createTenantWithDemoContent` (previously a private closure inside `routes/root.js`'s router
factory) into a standalone module, exported as a factory:
`createTenantProvisioner({ db, isPg, hashPassword, generatePassword })` →
`{ createTenantWithDemoContent, generateSlugCandidate, RESERVED_SLUGS, SLUG_RE }`.

This is the single piece of tenant-creation logic both Root's existing manual "create tenant" form AND
the upcoming Google self-signup route will call — one tested code path, not two independently-maintained
copies.

Behavior-preserving for Root's existing call site: `createTenantWithDemoContent` gained one new
**optional** parameter, `adminOverride`. Omitted (Root's call, unchanged) → byte-for-byte identical
behavior to before (random-password admin account, password returned once in the response). Provided
(only used starting in Phase B, not yet called by anything in this phase) → step 5 inserts a Google-linked
admin row instead (`email`/`google_sub`/`avatar_url`, no password).

Also added, not yet used anywhere (prepared for Phase B): `generateSlugCandidate(seed)` — turns a free-text
seed (e.g. a Google account's first name) into a URL-legal slug candidate, reusing the same `SLUG_RE`
Root's own form already enforces.

`routes/root.js` now requires this module and destructures `createTenantWithDemoContent`/`RESERVED_SLUGS`/
`SLUG_RE` from it instead of defining them locally; the old ~100-line inline function and the local slug
constants were deleted. `generateTableToken` (which `routes/tables.js` imports directly from `root.js`,
`require('./root').generateTableToken`) also moved into the new module — `root.js` re-exports it from
there so `tables.js` needed zero changes and keeps working through the exact same require path. Removed
now-unused `crypto`/`masterTemplate` requires from `root.js` (both were only used by the code that moved).

## Verification
- `node --check` passes on all five touched/added files (`db.js`, `masterTemplate.js`,
  `lib/tenantProvisioning.js`, `routes/root.js`, `routes/tables.js`).
- Started the local dev server: all three `admin_users` migrations logged exactly once
  (`added column admin_users.email/google_sub/avatar_url`); restarted the server a second time and
  confirmed zero migration log lines the second time (idempotent).
- Real end-to-end test through the actual Root API (not just code review): logged in as `root`, created a
  real tenant (`POST /api/root/tenants`) — confirmed identical seeding counts to what this exact call
  produced before the refactor (151 translations, 4 categories, 11 products, 3 starter tables with valid
  QR tokens), confirmed the new `settings.subscription_status: 'active'` and `settings.self_paused: false`
  defaults are present on the freshly created tenant, confirmed a real random admin password was still
  generated and returned (Root's flow untouched).
- Verified the `generateTableToken` re-export chain end-to-end: impersonated the test tenant's admin and
  called `POST /api/tables` (the real tenant-admin "add table" endpoint, which lives in `tables.js` and
  calls `generateTableToken` via its existing `require('./root')` import) — got back a valid new table
  with a well-formed 10-char token, confirming `tables.js` needed no changes and still works through the
  new indirection.
- Deleted the test tenant via `DELETE /api/root/tenants/:id`, confirmed `regeneratedDefault: false`
  (correctly did not trigger the "zero tenants" safety net, since other real tenants still exist) and
  confirmed via `GET /api/root/tenants` that the `default` tenant and the platform's other existing
  tenants are all still present and unaffected — this refactor touched shared code Root's own delete flow
  also depends on, so this regression check mattered.

## Not yet built (subsequent phases, per the approved plan)
- Phase B: the actual `POST /api/auth/google` route, `GET /api/auth/me` extension, and the Google button
  on `login.html`/`admin.html`'s login modal. `adminOverride` and `generateSlugCandidate` exist now but are
  not called by anything yet.
- Phase C: tenant self-service "Restoran Bilgileri" / "Marka & Site" full-screen views + endpoints.
- Phase D: "Tehlikeli Bölge" (self-pause via the new `settings.self_paused` flag + self-delete) and the
  real Google-photo profile avatar in admin.html's top-right corner.

## Files changed
- `backend/db.js` — new migration step (3 columns + 1 unique index on `admin_users`).
- `backend/masterTemplate.js` — two new default settings keys.
- `backend/lib/tenantProvisioning.js` — new file, the extracted/shared tenant-creation logic.
- `backend/routes/root.js` — now consumes the shared module instead of a private copy; dead
  imports removed.
