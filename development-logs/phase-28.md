# Phase 28 — Widget Management (Root-gated + tenant self-service)

**Status:** ✅ Done & verified | **Date:** 2026-07-26 | fork @ localhost:17888

## Goal
Let a tenant (and Root) turn individual customer-site "widgets" — WhatsApp button, social icons,
Google Maps — on/off. Before this phase these elements were purely presence-based (shown whenever a
URL/value existed, with zero concept of enabled/disabled anywhere), and tenant admins had NO
self-service settings control at all (only Root could edit any part of `tenants.settings`).

## What was done
- **Storage**: one new key inside the EXISTING `tenants.settings` JSON blob — no new column, no
  migration: `widgets: {whatsapp, instagram, facebook, twitter, tiktok, youtube, website, maps}`
  (booleans). Missing key/entry defaults to enabled, so every tenant that never touches this renders
  identically to before.
- **`index.html`** (`applySiteConfig()`): added a `widgets.<x> !== false` guard alongside each existing
  presence check — WhatsApp/Instagram rows, the Google Maps box (new `id="gmapWidgetBox"` wrapper added
  for clean show/hide), and the social-icons loop (facebook/twitter/tiktok/youtube/website).
- **`backend/routes/root.js`**: the branding PUT handler's `ALLOWED`-key loop coerces every value to a
  trimmed string — `widgets` is a nested object, so it's handled in a separate merge step
  (`settings.widgets = {...current, ...body.widgets}`, key-by-key against a `WIDGET_KEYS` whitelist) so
  a partial toggle never wipes unrelated widget flags or any other settings field.
- **`backend/server.js`**: new `PUT /api/admin/site-widgets` (adminAuth, tenant-scoped) — a narrow,
  single-purpose endpoint that reads the tenant's own settings, merges ONLY the `widgets` key (same
  whitelist + merge pattern as root.js), writes back, and calls `invalidateTenantCache(req.tenantId)`.
  This is the first tenant self-service settings endpoint in the app; deliberately scoped to widgets
  only, preserving the existing "tenant admins don't edit branding/SEO" boundary.
- **`root.html`**: added a "Widget'lar" checkbox group to the existing Branding modal's Contact & Social
  section. `openBrandModal()` pre-fills from `t.settings.widgets` (default-true fallback);
  `saveBranding()` includes `widgets` in its PUT payload.
- **`admin.html`**: new "Widget Ayarları" nav-item in the Ayarlar group → a new `.view` (same
  `AP_VIEW_MAP`/`showAdminView` pattern as every other section) with one checkbox per widget + a Save
  button. `loadTenantWidgets()` pre-fills from the already-fetched `window.__siteConfig`;
  `saveTenantWidgets()` PUTs to the new endpoint and shows an inline status message.

## Bug caught during verification (fixed before shipping)
`PUT /api/admin/site-widgets` initially didn't call `invalidateTenantCache()` after writing. The tenant
resolver caches the tenant row (confirmed by `routes/root.js`'s branding handler already calling this
after its own writes) — without it, `GET /api/site-config` kept serving the pre-write cached row, so a
toggle appeared to succeed (200 OK, correct response body) but the customer site didn't change on
reload. Found by actually reloading the customer site after a toggle instead of trusting the 200
response; fixed by adding the same `invalidateTenantCache(req.tenantId)` call every other tenant
mutation route uses.

## Verification
- Baseline (no `widgets` key set): all rows/icons/map render exactly as before — confirms the
  default-true fallback.
- Toggled `whatsapp/instagram/maps` off via the tenant endpoint → customer site reload: WhatsApp row,
  Instagram row, and the Maps box all correctly hidden; the 5 social icons unaffected.
- Toggled `facebook` off in a SEPARATE request → previously-set flags (`whatsapp/instagram/maps: false`)
  were preserved, not overwritten — confirms the nested-merge; social icon count dropped from 5 to 4.
- Root Branding modal: toggled `facebook` off via `saveBranding()` (the real save path, not a raw
  fetch) → confirmed via the reloaded `tenants` array that only `widgets.facebook` changed; every other
  settings field (logo, hero text, SEO, contact info, all social URLs, theme) byte-for-byte unchanged.
- Tenant `admin.html` Widget Ayarları view: toggled `youtube` off via `saveTenantWidgets()` → status
  shows "Kaydedildi."; `GET /api/site-config` immediately reflects it (cache-invalidation fix
  confirmed); all other widget flags untouched. Restored all widgets to enabled afterward.
- Regression: Category/Product in-shell forms (Phase 27 Part A) and the AI Assistant view (Phase 27
  Part B) both still work correctly after this phase's further admin.html edits. 0 console errors on
  customer site, admin.html, and root.html.
- Not separately re-tested this phase (relied on code-pattern equivalence): live cross-tenant isolation
  on the new endpoint — it uses the exact same `WHERE id = req.tenantId` single-row scoping as every
  other tenant-mutation route already verified throughout this project, so a live second-tenant test
  was not repeated.

## Files modified
`index.html`, `backend/routes/root.js`, `backend/server.js`, `root.html`, `admin.html`. No new DB
table/column. No change to auth, tenant isolation, QR/orders/reservations, or any other settings field.

## Next
Backlog: QR Designer.
