# Phase 44 — Google Sign-In: tenant self-service "Restoran Bilgileri" + "Marka & Site"

## Why
Third piece of the approved "Google ile Giriş + Restoran Sahiplerine Kendi Kendine Yönetim Paneli" plan.
Gives every tenant admin — whether they've always had a password account or just got auto-provisioned via
Google (Phase 43) — the same editing power Root already has over their tenant via root.html's two modals,
but from their own panel and as full-screen views, never a popup (the platform owner's explicit rule).

## Backend (`backend/server.js`)
- `PUT /api/admin/restaurant-info` — mirrors Root's `PUT /api/root/tenants/:id` (name, display_name,
  contact_phone, contact_email, address), scoped to `req.tenantId` only.
- `PUT /api/admin/branding` — mirrors Root's `PUT /api/root/tenants/:id/branding` field-for-field (same
  27-key `ALLOWED` list, same URL/email validation), scoped to `req.tenantId`. Two deliberate differences
  from Root's own endpoint, both already called out in the approved plan:
  - **Widgets excluded.** They already have their own dedicated screen (`view-widgets` →
    `PUT /api/admin/site-widgets`); merging the same `settings.widgets` key from two different screens
    would risk stale/conflicting state between them.
  - **Every field is HTML-stripped** (reusing the existing `stripHtmlTags()` from the Phase 35
    website-content endpoint) before storing. Root's own endpoint stores raw HTML on purpose (a trusted
    platform owner); this is a self-service endpoint with a much wider surface, so the safer default
    applies here — confirmed with a real request containing `<script>alert(1)</script>`, which is
    correctly stripped to just its text content, never stored as markup.

### A real bug found and fixed during testing
Both new endpoints touch the SAME underlying data (`tenants.contact_phone/contact_email/address` columns
AND `settings.contact_phone/contact_email/address` keys) but originally kept them in sync in only one
direction: `restaurant-info` wrote the columns and never touched `settings`, while `branding` — matching
Root's own existing endpoint exactly — always re-derives the columns FROM whatever is cached in
`settings`. Caught this with a real repro: save a new phone number via "Restoran Bilgileri", then save
anything unrelated (just the theme) via "Marka & Site" — the phone number silently reverted to its old
value, because branding's "keep legacy columns in sync" step read a stale `settings.contact_phone` that
restaurant-info had never updated. This is a **pre-existing latent inconsistency in Root's own two-modal
design** (root.html's "Restoranı Düzenle" + "Marka / Site İçeriği" have the exact same two-endpoint split
and would exhibit the identical silent-revert if used in that order) — not something newly introduced, but
newly exposed by giving tenants two separate save buttons for data that used to only ever be touched
one endpoint at a time in most real usage. Fixed by having `restaurant-info` write `settings.contact_phone/
contact_email/address` in the same request, so neither endpoint can ever undo the other's most recent
save. Root's own two endpoints were left untouched (out of scope for this phase — fixing this class of
bug there would be a separate, deliberate task) but the underlying vulnerability that made it possible
to observe here is worth remembering if a similar order-of-saves report ever comes from Root's own panel.

## Frontend (`admin.html`)
- New sidebar group **"Restoranım"**, inserted right after "Genel" and before "Ürünler": "Restoran
  Bilgileri" and "Marka & Site" nav items, both full-screen `.view` sections switched via the existing
  `showAdminView()`/`AP_VIEW_MAP` mechanism — same pattern as every other section (Widget Ayarları, Web
  Sitesi Editörü), never a modal/popup.
- **Restoran Bilgileri view**: name/display name/phone/email/address form (reuses the existing
  `.admin-input`/`.admin-form-label` styling everywhere else in the panel already uses) + a read-only
  "Üyelik Durumu" card showing `settings.subscription_status` (the Phase 42 placeholder — no real billing
  logic, just a status pill for now, per the explicit "prepare for later, don't build it now" instruction).
- **Marka & Site view**: logo upload (reuses the existing tenant-scoped `POST /api/admin/upload-image`,
  same upload flow the hero-images editor already uses) + company name, hero title/subtitle (TR/EN),
  footer text, SEO title/description/keywords, theme selector, and 11 contact & social fields — this
  matches **Root's own 25-field UI subset** exactly (root.html's modal doesn't expose `favicon_url`/
  `banner_text_tr/en`/`seo_canonical` either, even though the backend accepts them) — not the full 27-key
  backend list, per the plan's explicit reasoning to stay visually/functionally consistent with what Root
  itself shows.
- New i18n keys (TR+EN) for both views, following the existing `admin_*` naming convention.

## Verification
- `node --check` passes on `server.js`; admin.html's inline `<script>` blocks parse cleanly.
- Real requests against the actual local server:
  - `PUT /api/admin/restaurant-info` with new phone/email/address — confirmed via Root's own
    `GET /api/root/tenants/default` that the change is visible cross-panel.
  - `PUT /api/admin/branding` with `<b>Test Şirket</b>` and `Merhaba <script>alert(1)</script> Dünya` —
    confirmed both were correctly HTML-stripped in the stored value; confirmed `settings.widgets` was
    completely untouched by the same request (proves the widget-exclusion is real, not just documented);
    confirmed an invalid `instagram` URL correctly 400s.
  - Reproduced the sync bug (restaurant-info save → unrelated branding save → phone silently reverted),
    applied the fix, then re-ran the exact same sequence and confirmed the phone number now survives.
- Real browser UI walkthrough (not just curl): logged into the actual admin panel, opened both new
  sidebar items, confirmed each renders as a full-screen view (never a popup) with real, correctly-loaded
  tenant data, triggered the actual `saveRestaurantInfo()`/`saveBranding()` functions bound to the real
  Save buttons, confirmed both show "Kaydedildi." and that the saved values persist (re-verified via
  Root's panel afterward). Zero console errors on the new code paths.
- The `default` demo tenant — reused across this whole session's testing — was restored to its original
  clean values after every test round in this phase (it's the shared demo tenant other future test runs
  depend on looking normal).

## Not yet built (final phase, per the approved plan)
- Phase D: "Tehlikeli Bölge" — a NEW, separate `settings.self_paused` toggle (never touching Root's own
  `tenants.status`, since that field also blocks the tenant's own login — the owner explicitly wants
  self-pausing to be self-reversible) + a real cascading self-delete with a type-to-confirm step. Real
  Google-photo profile avatar in admin.html's top-right corner (the `/api/auth/me` fields Phase 43 added
  are the prerequisite, not yet consumed by any UI).

## Files changed
- `backend/server.js` — new `PUT /api/admin/restaurant-info` and `PUT /api/admin/branding` (with the
  sync-bug fix folded into `restaurant-info`'s implementation), new top-level `isBlankOrUrl`/
  `isBlankOrEmail`/`ADMIN_BRANDING_ALLOWED`/`ADMIN_BRANDING_URL_FIELDS`.
- `admin.html` — new "Restoranım" sidebar group + two new full-screen views + their JS
  (`loadRestaurantInfo`/`saveRestaurantInfo`/`loadBranding`/`saveBranding`/`handleBrandLogoUpload`) + new
  `AP_VIEW_MAP` entries/lazy-load branches + new i18n keys (TR+EN).
