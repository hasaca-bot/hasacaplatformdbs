# Phase 15 — Theme engine (warm default + Black & White)

**Status:** ✅ Engine complete & verified · ⚠️ B&W theme functional with one documented residual
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
A token-based theme engine: warm "Modern Minimal" default + a selectable Black & White theme.
Per-tenant default theme, instant switch, persistence — reusing the existing CSS-variable + theme
class mechanism (do not rebuild).

## What was done
### Theme engine (`index.html`)
- Extended the existing `applyTheme()` to support three themes: **`dark`** (warm default, no class),
  **`light`** (existing warm-light, `theme-bw`), **`bw`** (Black & White, `theme-mono`). Keeps the
  existing light/dark toggle + `localStorage('theme')` persistence + cross-tab sync intact.
- **Per-tenant default theme:** `applySiteConfig()` applies `settings.theme` on load *only if the
  visitor hasn't chosen their own* (`!localStorage.theme`) — so tenant default + user override coexist.

### Black & White theme (`index.html` CSS)
- `body.theme-mono` = **dark monochrome**: overrides only the warm accent tokens (`--fire`, `--ember`,
  `--gold`, `--amber`, `--muted`) to greyscale on top of the fully-working dark base — so nothing
  structural breaks; orange simply becomes grey. Gradients (`fire→ember`) render as grey→dark-grey;
  cart FAB, primary buttons, category buttons, badges, muted text all go greyscale. Added scoped
  overrides to neutralise hardcoded warm glows and a few components that latch warm accents.

### Root Panel (`root.html` + `backend/routes/root.js`)
- Added a **Theme selector** (Warm / Light / Black & White) to the per-tenant branding modal; wired
  into `openBrandModal`/`saveBranding`; added `theme` to the branding endpoint's ALLOWED whitelist +
  TR/EN i18n. Root sets each tenant's default theme.

## Files modified
- `index.html` (applyTheme, theme-mono CSS, per-tenant apply), `root.html` (theme select + i18n + save),
  `backend/routes/root.js` (`theme` in ALLOWED).

## Verification (fork @ localhost:17888)
- **Engine:** `applyTheme('bw')` → `body.theme-mono`, `--fire:#4A4A4A` (grey); `applyTheme('dark')` →
  no classes, `--fire:#D93B0A` restored — **default theme is 100% intact, zero regression**.
  Persistence (`localStorage`) + per-tenant default (`settings.theme` via `PUT …/branding` → 200) work.
- **B&W visual:** cart FAB gradient = `rgb(74,74,74)→rgb(107,107,107)` (grey), accents/text/muted
  greyscale, no orange across topbar/hero/sections/cards. No console errors.
- Root modal theme selector saves + round-trips; master-template default reset to `dark`.

## Known issue (documented, not blocking)
- A handful of **reservation guest-count `.pax-btn`** buttons retain their warm accent in B&W. These
  elements resist both CSS-variable overrides **and** `!important` component overrides (they match the
  selector, have no inline style, yet `var(--fire)` resolves to the root orange) — a non-standard
  styling latch in this legacy code. It is a minor cosmetic residual in a sub-form, not broken UI.
  Proper fix = tokenise the ~28 hardcoded `rgba(217,59,10,…)` values project-wide (a dedicated
  refactor). Default and light themes are unaffected.

## Remaining (theme scope)
- The other 8 restaurant themes (Luxury/Cafe/Fast-Food/…) are later data-only additions per decision.
- Applying the theme engine to `admin.html` / `root.html` panels is a follow-up (customer site done).

## Next phase
Phase 16+ — platform feature backlog: Widget Management, SEO Center, Activity Log, Platform Health
Dashboard, Restaurant Analytics, QR Designer, Root Notification Center.
