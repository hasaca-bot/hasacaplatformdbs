# Phase 25.2 — Remove all legacy orange/brown remnants from admin.html

**Status:** ✅ Done & verified | **Date:** 2026-07-25 | fork @ localhost:17888

## Goal
Phase 25's sidebar revision restyled the tenant admin shell itself, but several elements OUTSIDE
`#adminPanelOverlay` (or overridden by inline styles) still leaked the customer site's warm
orange/brown palette — screenshots showed an orange page-transition flash, an orange scrollbar, an
orange Category modal, and a notification preview hardcoding "DAYI KATIK" instead of live tenant data.

## What was done — `admin.html`
- Added `class="admin-page"` to `<html>`, then `html.admin-page{...}` + `html.admin-page[data-theme=
  "light"]{...}` + `html.admin-page body.theme-bw{...}` override blocks right after the customer
  `:root` block — neutralizes the customer `--fire/--card/--dark/--scroll-thumb` tokens **only on
  admin.html** (the real customer site, `index.html`, never carries this class, so it is unaffected).
- Fixed 6+ hardcoded hex leaks that inline styles/class rules still carried even after the token
  neutralization (inline styles win over inherited `:root` vars): `customConfirmOkBtn` background,
  `adminLoginError` color, `adminAddNewCategoryBtn` background, `orderFlash`/`.aoc-badge.new` keyframe
  rgba, the product-form `custom-select-trigger` background, waiter-cell/service-item colors, the
  confirm-popup SVG `stroke` (both the static markup and the JS-injected `iconEl.innerHTML` copy), and
  a `.custom-popup-actions-row .admin-btn.danger` class rule found only after the inline override on
  that button was removed and the still-orange class rule showed through underneath.
- Added `#adminPanelOverlay{ scrollbar-color: color-mix(...) transparent; scrollbar-width:thin; }` for
  Firefox parity with the existing WebKit `::-webkit-scrollbar-thumb` override.
- Notification preview: added `id="phoneMockBrandIcon"`/`id="phoneMockBrandName"` to the mock header
  (previously a static HASACA-agnostic hardcoded name/icon) and extended `updatePushPreview()` to read
  the existing `restaurantBrand()` helper (`window.__siteConfig`) so the push preview always shows the
  CURRENT tenant's real name/logo; also called from the `/api/site-config` load in `openAdminPanel()`
  so it's correct on first paint, not only when the Bildirim view is opened.

## Verification
- Definitive orange-RGB DOM scan (every visible element) → 1 offender found (`.admin-btn.danger` class
  rule) → fixed → re-scanned → 0 offenders.
- Notification preview shows the live tenant's brand name/logo instead of a hardcoded restaurant name.
- Customer site (`index.html`, served at `/`) unaffected — no `admin-page` class there, `:root` warm
  tokens untouched.

## Files modified
`admin.html` only. No DB/auth/tenant-isolation/business-logic change.

## Next
Phase 26 (Gemini AI Setup Assistant backend).
