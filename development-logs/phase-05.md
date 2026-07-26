# Phase 05 — Floating-action overlap + z-index system

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Eliminate overlapping floating UI. Reported bug: the bottom-right floating controls (Waiter Call /
Bill Request / Cart) overlap and become unusable at some sizes. Add safe-area support, a coherent
z-index scale, and prevent viewport overflow.

## Root cause
On desktop **dine-in mode**, `.cart-fab` (`bottom:28px; right:28px`) and the `.dinein-actions` bar
(`bottom:20px; right:20px`) were both anchored bottom-right in the same vertical band → direct
overlap. On mobile dine-in, the browsing `.bottom-nav` dock and the full-width `.dinein-actions` bar
both sat at the bottom. No shared spacing scale; no `env(safe-area-inset-*)`.

## What was done (`index.html`)
- Added a **spacing + z-index token scale** to `:root`: `--safe-bottom`/`--safe-top`
  (`env(safe-area-inset-*)`) and `--z-header … --z-push` (header 100 → bottomnav 200 → dinein-actions
  850 → fab 900 → dinein-badge 950 → cart-backdrop 1400 → cart-drawer 1450 → detail-backdrop 1600 →
  dinein-track 1650 → toast 1750 → modal 2000 → push 2200).
- `.cart-fab` — safe-area aware bottom, `z-index:var(--z-fab)`; normal mobile bottom raised to 96px
  for a comfortable gap above the bottom-nav dock.
- **Desktop dine-in fix** — cart FAB now stacks **above** the bottom-right action bar
  (`bottom: calc(120px + safe)`), leaving a clear gap; the action bar moved to `right:24px`.
- **Mobile dine-in** — `.bottom-nav` is **hidden in dine-in mode** (dine-in has its own bottom bar),
  and the cart FAB floats above the full-width bar.
- Applied `--safe-bottom`/`--safe-top` insets to `.cart-fab`, `.bottom-nav`, `.dinein-badge`,
  `.dinein-actions`; tokenized `.dinein-badge`, `.dinein-actions`, `.dinein-track` z-indexes.

## Files modified
- `index.html` (`:root` tokens; `.cart-fab`, `.bottom-nav`, `.dinein-badge`, `.dinein-actions`,
  `.dinein-track` and dine-in-mode rules).

## Scope check (other pages)
- `admin.html` — has leftover floating CSS but **renders no cart/dine-in elements** (0 in DOM) → no
  overlap; left as-is.
- `root.html` — modal system is `.overlay` (z100, fixed inset:0, centered) + `.toast` (z200,
  bottom-center, `pointer-events:none`). Correct layering, no conflict.

## Verification (measured element rects + pairwise overlap, per viewport)
- **Desktop 1280** normal: only cart FAB bottom-right, 0 overlaps. Dine-in: cart FAB y536 above action
  bar y608 (8px gap), badge top-center — **0 overlaps**.
- **Mobile 375×812** normal: cart FAB (bottomGap 96) 12px above bottom-nav dock — **0 overlaps**.
  Dine-in: cart FAB above full-width bar, bottom-nav hidden — **0 overlaps**.
- **Tablet 768×1024**: bottom-nav hidden (≥768), cart bottom-right, **hOverflow 0**.
- **1920×1080**: cart bottom-right, **hOverflow 0**.

## Known issues / notes
- Deep z-index refactor was intentionally scoped to the floating layers + tokens; existing overlay
  numerics (cart drawer/backdrop, detail, modal, push) already order correctly and were left numeric.
- Full multi-page responsive/spacing audit (all sections, zoom 80–150%) is **Phase 07**.

## Next phase
Phase 06 — Fix blank Tenant-Admin after login + header/logo rendering (and the startup polling errors).
