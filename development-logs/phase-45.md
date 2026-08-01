# Phase 45 — Tehlikeli Bölge (self-pause + self-delete) + real profile avatar

## Why
Fourth and final piece of the approved "Google ile Giriş + Restoran Sahiplerine Kendi Kendine Yönetim
Paneli" plan. Gives a tenant admin the same disable/delete power Root already has over any tenant, plus a
real Google profile photo/name in the top-right corner instead of the permanent placeholder "A"/"Yönetici".
With this phase, the entire approved plan is now implemented (Phases 42–45 / A–D).

## Backend (`backend/server.js`, `backend/db.js`, `backend/routes/root.js`)

### "Geçici Kapat" — a deliberately NEW, separate mechanism from Root's disable
`PUT /api/admin/self-pause` toggles a brand-new `settings.self_paused` boolean (already defaulted to
`false` in Phase 42's `masterTemplate.js`). This is **not** the same thing as Root's existing
`tenants.status='disabled'` — that field, enforced in `resolveTenant` (`lib/tenant.js:132`), blocks *every*
`/api/*` call for the tenant, including `/api/auth/login` itself, so a tenant that disabled itself could
never log back in to undo it. The platform owner was asked directly about this trade-off and chose:
self-pausing must always be self-reversible. So `self_paused` is checked **only** in the two routes that
actually let a customer create new business for the tenant — `POST /api/orders` (both the delivery/pickup
path via the early `req.tenant` check, and the dine-in path, re-checked against the scanned table's *real*
tenant since `req.tenant` may not reflect it — see the code comment for why two checks were needed) and
`POST /api/reservations`. Nothing about admin login, `adminAuth`, or any `/api/admin|root/*` route changed
at all — verified live (see Verification).

### "Restoranı Sil" — real, permanent, self-scoped delete
`DELETE /api/admin/self` — scoped strictly to `req.tenantId` (never a client-supplied id, unlike Root's
`:id`-based route), blocks tenant `'default'`. Reuses a newly-extracted shared helper,
`deleteTenantData(tenantId)` in `backend/db.js`, which now also replaces the previously-duplicated
cascading-delete table list inside `regenerateDefaultTenant()` **and** Root's own
`DELETE /api/root/tenants/:id` — one table list in one place instead of three copies that could silently
drift apart over time (a small, low-risk DRY cleanup the approved plan explicitly called for while
building this phase's own delete path).

### `GET /api/auth/me` — already returned what this phase needed
Phase 43 already extended this to return `display_name`/`email`/`avatar_url` from the `admin_users` row —
this phase is the first one to actually *consume* that (the new `loadAdminProfile()` in admin.html).

## Frontend (`admin.html`)
- New **"Tehlikeli Bölge"** sidebar group (bottom of the sidebar) → one new full-screen `.view`
  (`view-danger-zone`, wired through the existing `AP_VIEW_MAP`/`showAdminView()` — never a popup):
  - A toggle-style button ("Restoranı Kapat" ⇄ "Restoranı Tekrar Aç") for `self_paused`, confirmed via the
    site's existing `showCustomConfirm()` dialog (the same confirmation mechanism already used everywhere
    else in this panel — not a new competing UI pattern) before pausing.
  - A "Restoranı Sil" button using the stronger two-step pattern root.html's own tenant-delete flow
    already uses: a `showCustomConfirm()` step, then a native `prompt()` asking the admin to type their
    restaurant's own name exactly — client-side match is just UX, the server never trusts it (there's
    nothing to trust; the DELETE endpoint takes no body at all, only the verified session's own tenant).
- **Real profile avatar**: `.profile-btn .av`/`.nm` (previously 100% hardcoded "A"/"Yönetici") now
  populated by a new `loadAdminProfile()`, called once from `openAdminPanel()`. Fetches `/api/auth/me`; if
  `avatar_url` is present, swaps the letter badge for a real `<img>` (new CSS makes the existing 30×30
  circle host either); otherwise keeps the existing initial-letter fallback untouched — so every
  password-only account (which has no `avatar_url`) looks and behaves exactly as before.
- New i18n keys (TR+EN) for all Danger Zone strings.

## Verification
- `node --check` passes on `server.js`, `db.js`, `routes/root.js`; admin.html's inline scripts parse
  cleanly.
- Real requests against the actual local server (not just code review), all in sequence against the real
  `default` tenant (restored to its clean demo state afterward, same as every prior phase in this feature):
  1. Toggled `self_paused=true` → confirmed a real delivery order attempt gets `403 restaurant_paused`.
  2. **Confirmed admin login still returns 200 while paused** — the entire point of this being a separate
     mechanism from Root's `disabled` status, proven with a real request, not just code review.
  3. Confirmed a real dine-in order (via an actual table token) also correctly gets `403` while paused —
     this exercises the SECOND check (the table's real tenant), not just the first.
  4. Confirmed a real reservation attempt also gets `403` while paused.
  5. Toggled `self_paused=false` → confirmed a real order now succeeds (`201`).
  6. Created a genuine **throwaway** test tenant via Root (`test-faz-d`) specifically for the destructive
     delete test — never risked `default` or any real tenant. Confirmed `DELETE /api/admin/self` on
     `default` correctly 400s (`default_tenant_protected`) BEFORE running the real delete.
  7. Logged in as `test-faz-d`'s own admin, called `DELETE /api/admin/self` for real — confirmed success,
     confirmed the tenant no longer appears in Root's own tenant list, confirmed `default` was completely
     unaffected by the same check.
  8. Manually set a test `avatar_url`/`display_name` on the `default` tenant's admin row (SQLite, reverted
     immediately after this check), confirmed `/api/auth/me` returns them, then confirmed **in the real
     browser UI** that `loadAdminProfile()` correctly swapped the top-right badge to a real `<img>` and
     updated the name — reverted the test data afterward.
  9. Opened the actual "Tehlikeli Bölge" view in the browser, confirmed it renders as a genuine full-screen
     view (never a popup) with the correct initial button state and label.
  10. Zero console errors across all of the above.
- **Noted, not a new issue**: a deleted tenant's already-issued session token remains cryptographically
  "valid" (the platform's HMAC token format, `lib/auth.js`, is fully stateless — `adminAuth` never queries
  the DB to confirm the account still exists, only the signature and `exp`) until it naturally expires
  (24h). This is not something this phase introduced — Root's own existing tenant-delete flow has always
  had the exact same property, since it's a property of the token format itself, not of any specific
  delete path. No token-revocation/blacklist system exists anywhere in this codebase; building one was not
  part of this phase's scope and would be a separate, deliberate architecture decision if ever needed.

## Full feature status
With this phase, the entire approved Google Sign-In + tenant self-service plan is implemented:
- Phase 42 (A): DB schema + shared tenant-provisioning module.
- Phase 43 (B): real Google Sign-In (auto-provisioning included) + login buttons.
- Phase 44 (C): tenant self-service restaurant info + branding.
- Phase 45 (D): tenant self-service pause/delete + real profile avatar.

**Still needed before this is live for real users** (platform owner's own steps, not code):
- Add `GOOGLE_CLIENT_ID` as a real environment variable on Render (it's only in the local `.env` so far).
- A genuine click-through with a real Google account through the actual consent popup — this has never
  been possible to automate/script by design (that's the whole point of ID-token verification); worth
  doing once deployed, or locally on request.

## Files changed
- `backend/server.js` — new `PUT /api/admin/self-pause`, `DELETE /api/admin/self`, self-pause checks added
  to `POST /api/orders` (both paths) and `POST /api/reservations`, `deleteTenantData` import.
- `backend/db.js` — new shared `deleteTenantData(tenantId)`, `regenerateDefaultTenant()` refactored to
  call it, new export.
- `backend/routes/root.js` — `DELETE /api/root/tenants/:id` refactored to call the same shared helper
  instead of its own inline copy of the table list.
- `admin.html` — new "Tehlikeli Bölge" sidebar group + `view-danger-zone`, new `loadAdminProfile()` wired
  into `openAdminPanel()`, new avatar-image CSS, new i18n keys (TR+EN).
