# Phase 29 — QR Designer (color/margin/ECC)

**Status:** ✅ Done & verified | **Date:** 2026-07-26 | fork @ localhost:17888

## Goal
Let a tenant customize the appearance of their table QR codes — foreground/background color, quiet-
zone margin, error-correction level. Before this phase both QR-generating routes in
`backend/routes/tables.js` used the same hardcoded `{width:512, margin:1, errorCorrectionLevel:'M'}`
with no color option at all (black-on-white only).

## What was done
- **Storage**: one new key inside the EXISTING `tenants.settings` JSON blob — no new column, no
  migration: `qr_style: {fg, bg, margin, ecc}`. Missing key/entry falls back to exactly the old
  hardcoded defaults, so untouched tenants generate byte-identical QR codes to before.
- **`backend/routes/tables.js`**: both `GET /tables/:id/qr` and `GET /tables-qr` now call a small
  `getQrOptions(tenantId)` helper that reads the tenant's `settings.qr_style` and builds the options
  object (`color:{dark,light}` alongside the existing `margin`/`errorCorrectionLevel`) passed straight
  into `QRCode.toDataURL`/`toString` — the `qrcode` package's own documented `color.dark`/`color.light`
  options (confirmed from its README before writing any code), no new dependency needed.
- **`backend/server.js`**: new `PUT /api/admin/qr-style` (adminAuth, tenant-scoped), placed beside
  Phase 28's `PUT /api/admin/site-widgets` and following its exact shape — read/merge/write ONLY
  `settings.qr_style`, `invalidateTenantCache()`, `logActivity()`. Validates `fg`/`bg` as hex colors
  (normalizes 6-digit to the library's expected 8-digit RGBA), `margin` as an integer 0-10, `ecc` as
  one of `L/M/Q/H` — rejects anything else with 400, never silently clamps bad input.
- **`admin.html`**: new "QR Stili" panel at the top of the existing Tables ("Masa Yönetimi") view —
  two color pickers, a margin number input, an ECC select, a Save button, and a live preview that
  re-fetches the first table's QR after a successful save (reusing the same `GET /tables/:id/qr`
  endpoint the existing QR modal already calls — no new preview-only code path). `loadQrStyle()` is
  called whenever the Tables view opens (alongside the existing `loadTables()`).

## Verification
- Baseline (no `qr_style` key): fetched a table's QR → PNG length 4238 bytes, black-on-white, margin 1.
- Saved `{fg:'#cc0000', bg:'#ffffff', margin:4, ecc:'H'}` → re-fetched the SAME table's QR → PNG length
  changed to 5710 bytes, the SVG variant literally contains `#cc0000`, and the encoded URL/token were
  completely unchanged (`.../t/2Q9VUVWpLE`) — confirms styling changes the image without touching the
  table's identity/scan behavior.
- Partial update `{margin:2}` alone → confirmed `fg`/`bg`/`ecc` from the prior save were preserved
  (nested-merge, not overwrite), only `margin` changed.
- Invalid input rejected with 400 + specific error codes: bad hex → `invalid_fg`; margin 99 →
  `invalid_margin`; ecc `'Z'` → `invalid_ecc`.
- Real UI round-trip: opened the Tables view, `loadQrStyle()` correctly pre-filled the pickers from the
  saved state after a fresh page load (not from a stale client cache); reset all fields to the original
  defaults via the real `saveQrStyle()` function → status showed "Kaydedildi.", live preview appeared,
  and its PNG length (4238) exactly matched the very first baseline capture — confirms the whole
  save→regenerate→preview path is byte-correct, not just "no error thrown."
- Regression: Category/Product in-shell forms (P27), AI Assistant view (P27), and Widget Ayarları view
  (P28) all re-verified still working after this phase's further admin.html edits.
- Noted, not a regression: a pre-existing 15-second order-polling `setInterval` (admin.html ~line 6484,
  predates this phase) occasionally logs a transient "Failed to fetch" console error during rapid
  page-reload testing — unrelated to QR/widgets/AI-assistant code, not introduced by this phase.

## Files modified
`backend/routes/tables.js`, `backend/server.js`, `admin.html`. No new DB table/column. No change to
auth, tenant isolation, the QR token/scanning logic, or any other settings field. Root/root.html not
touched (QR Designer is tenant-only self-service, per the backlog's own framing).

## Next
Backlog: fast-follows only (a Root AI assistant variant targeting a specific tenant's data; a menu-
generation wizard; QR logos/frames via an image-compositing library) — no remaining major backlog item.
