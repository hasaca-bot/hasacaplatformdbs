# Phase 03 — Image upload everywhere (file picker + preview, no manual URLs)

**Status:** ✅ Completed & verified
**Date:** 2026-07-21

## Goal
Every editable image asset is chosen by **uploading a file from the computer** — with a file
picker, live preview, format/size validation, and replace-on-upload — and stored as a hosted
file (never a manual URL, never base64 in the DB). Applies to the Tenant Admin **and** the Root
Panel.

## What was done

### Backend
- **New endpoint `POST /api/admin/upload-image`** (`backend/server.js`) — `adminAuth`, rate-limited,
  **tenant-scoped**. Accepts a base64 data URL, validates format (PNG/JPG/WEBP/GIF/SVG) and size
  (≤5MB), writes the file to `/uploads/<tenantId>-<time>-<rand>.<ext>`, and returns a same-origin
  relative URL (`/uploads/...`). Files are served by the existing `express.static(rootDir)`.

### Tenant Admin (`admin.html`) — product images
- Replaced the mixed **URL-or-file text input** with an **upload-only picker**: a hidden field
  holds the stored URL, plus a preview thumbnail, a "Görsel Seç / Choose Image" button, a status
  line, and a "Remove image" link.
- Rewrote `handleAdminImageUpload()`: validates type + size → shows an instant local preview →
  uploads to `/api/admin/upload-image` → stores the returned **URL** (not base64) → updates the
  preview + status. A new upload replaces the old one; remove clears it.
- Added `setAdminProductImagePreview()` / `clearAdminProductImage()`, and wired the preview into
  the add-form reset and the edit-load path (shows a product's current image).
- Added a small `adminT()` i18n helper (missing before) + TR/EN keys for all new strings.
- Replaced the remote **Unsplash** fallback image with a local `/icons/placeholder-dish-1.svg`
  (no external image dependency, no broken image if a product has no photo).

### Root Panel (`root.html`) — platform + tenant branding assets
- Converted the platform branding fields (**logo, login logo, favicon**) and the per-tenant
  **logo** field from manual-URL text inputs to **upload-only**: the URL input is now `readonly`
  and paired with a live **preview thumbnail** + upload button.
- `uploadPlatformAsset()` now refreshes the thumbnail; added `refreshAssetThumb()`, called when
  either branding modal opens. Relabeled "Logo URL / Favicon URL / …" → "Logo / Favicon / …"
  (TR + EN) since URLs are no longer hand-entered.

## Files modified
- `backend/server.js` — new `/api/admin/upload-image` endpoint.
- `admin.html` — upload-only product image picker + handler + i18n + local fallback image.
- `root.html` — upload-only branding assets (preview thumbs, readonly URLs, `.asset-field` CSS,
  relabeled i18n).

## DB / API changes
- **API added:** `POST /api/admin/upload-image` (admin, tenant-scoped).
- **DB:** none. (Bonus: product images stop being stored as multi-hundred-KB base64 blobs.)

## Verification (browser, localhost:12999)
- **Endpoint:** login → upload 1×1 PNG → `200`, returns `/uploads/default-…​.png`, file served as
  `image/png`; non-image payload rejected `400`. ✓
- **Admin UI:** product form shows preview box + "Görsel Seç" + no URL text field
  (`urlTextInputExists:false`); driving the real `handleAdminImageUpload` with a `File` stored
  `/uploads/…` (not base64), updated the preview, showed "Yüklendi ✓", revealed Remove. ✓
- **Root UI:** branding modal fields are `readonly` with visible preview thumbnails; label reads
  "Logo" (no "URL"). ✓
- No new console errors on the pages exercised. ✓

## Known issues / notes
- Pre-existing (not from this phase): `admin.html` logs `Failed to fetch orders` /
  `loadTableOrders` / `loadServiceRequests` on first paint — a **startup polling race** that fires
  before the session token is restored (`/api/orders` returns `200 []` once authed). Flagged for
  Phase 08 polish.
- Tenant admin still has **no branding/settings tab** of its own (logo/hero for a tenant's public
  site are edited from the Root Panel). Adding a tenant-side branding editor is a separate feature.
- **Residual branding leftovers found** during this phase (see status doc): `index.html` &
  `admin.html` still contain visible "Safranbolu / Tantuni / Döner" content, a hardcoded Google
  Maps embed of the **real** restaurant, and stale `og:/twitter:/schema` meta. This is a
  white-label defect → scheduled as the next phase.

## Next phase
Phase 04 — Residual branding cleanup (remove all Safranbolu/Tantuni/Döner/real-map content from
`index.html` + `admin.html`; genericize head meta and the map embed).
