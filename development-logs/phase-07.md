# Phase 07 — Responsive / overflow audit + custom scrollbar (Wave 1 close)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Audit every page for horizontal overflow / broken responsive layout, and add a professional custom
scrollbar (thin, rounded, subtle hover; Chromium + Firefox) across the whole platform.

## What was done
- **Custom scrollbar** added to `index.html`, `admin.html`, `root.html`:
  - Themeable tokens `--scroll-thumb` / `--scroll-thumb-hover` in each page's `:root`.
  - `html{ scrollbar-width:thin; scrollbar-color:var(--scroll-thumb) transparent; }` (Firefox) +
    `::-webkit-scrollbar{width:10px;height:10px}` / `-track{transparent}` /
    `-thumb{rounded 999px, padding-box border, token bg}` / `-thumb:hover{token-hover}` (Chromium).
  - The intentional carousel scrollbar-hiding (`.gallery-scroll` / `.reviews-scroll`
    `::-webkit-scrollbar{display:none}`) still wins by specificity — carousels stay clean.
- **Overflow audit** across all three pages (mobile 375, desktop 1280–1440) using a DOM probe that
  measures `documentElement.scrollWidth − clientWidth` and lists non-fixed/absolute elements
  overflowing the right edge whose ancestors don't already clip overflow.

## Files modified
- `index.html`, `admin.html`, `root.html` (scrollbar tokens + rules).

## DB / API changes
- None.

## Verification (fork @ localhost:17888)
- **Customer page:** `hOverflow = 0` at mobile (375×812) and desktop (1270×720); the only
  "overflowing" nodes are inside `overflow:hidden` carousels / off-screen slide-in panels (hero
  slider, food-detail panel) — the page never scrolls horizontally. Scrollbar `thin`.
- **Tenant admin:** `hOverflow = 0` at mobile and 1440×900; panel is a centered 900px overlay that
  fits. Scrollbar `thin`.
- **Root panel:** `hOverflow = 0` at mobile (375) and desktop (1440); the tenants table sits in an
  `overflow-x:auto` wrapper (scrolls within its container, not the page). Scrollbar `thin`.
- Scrollbar token resolves (`--scroll-thumb = rgba(217,59,10,.45)`); **no console errors** on any page.

## Known issues / notes
- Fine visual spacing/alignment polish is limited in this environment (screenshots time out); the
  objective checks (no overflow, responsive containers, centered panels, custom scrollbar) all pass.
  Any specific pixel-level misalignment the user spots can be addressed on report.
- Scrollbar colors currently use the warm accent; they will follow the theme automatically once the
  token-based theme engine lands (Phase 14).

## Wave 1 status
✅ P04 white-label · ✅ P05 floating overlap · ✅ P06 blank admin · ✅ P07 responsive + scrollbar.
**Wave 1 complete.**

## Next phase
Phase 12 — Delete any tenant (incl. default) + auto-regenerate a fresh default (user-prioritized
concrete feature), then Phase 13 — Root-editable Contact & Social settings.
