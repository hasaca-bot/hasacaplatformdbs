# Phase 32 — Zero legacy orange, platform-wide

**Status:** ✅ Done & verified | **Date:** 2026-07-26 | fork @ localhost:17888

## Goal
Finish the B&W-theme cleanup Phase 31 (routing) interrupted, under an explicit "ZERO legacy orange
anywhere in the platform" bar — not just the originally-scoped `index.html`.

## Scope found (platform-wide re-scan, not just index.html)
- **`index.html`** — the original ~58 literal occurrences (in `theme-mono`, the actual B&W theme).
- **`admin.html`** — ~50 more literal occurrences, discovered this phase. Root cause: admin.html
  physically embeds the SAME customer-site markup/CSS as index.html (its own `:root` declares the
  identical `--fire:#D93B0A` etc.). Phase 25.2 only re-themed the admin OVERLAY (`#adminPanelOverlay`,
  `--ap-*` tokens) — it never touched this underlying embedded copy. **Verified live** (not assumed)
  that this embedded content is unconditionally `display:none` on admin.html (confirmed via
  `getComputedStyle` on `#hero` and `SECTION#rezervasyon` — both `none`), so this was a pure
  de-hardcoding refactor with zero visual outcome, not a live bug fix.
- **`root.html`** — 2 lines, an old pre-Phase-24 inline `:root` fallback. **Verified inert** by reading
  `panel.css` directly: it redeclares the same variable names at `:root` and is linked last in
  `<head>`, so it already wins the cascade — confirmed post-fix via `getComputedStyle` that `--fire`
  still resolves to `#d8b877` (unchanged). Updated anyway so the fallback carries zero orange text and
  stays consistent if panel.css ever failed to load.
- **`landing.html` / `marketing.html` / `login.html`** — re-grepped, zero hits (deliberately different
  gold palette built fresh in Phase 22/23, not legacy orange).
- **`backend/db.js`** — the seeded default-tenant admin's `display_name` was `'Dayı Katık Yönetici'`, a
  literal old-brand string. Changed to `'Yönetici'`. Everything else matching "Dayı Katık" in this file
  is the *cure* (a one-time DB-text migration, `db.js:701-718`) and was left untouched.
- **Flagged, not touched:** `backup_before_push_notifications/` (an old snapshot folder, already
  excluded from being served — confirmed in server.js's static-file guard) and `backend/seedDev.js` /
  `backend/seedNewMenu.js` (confirmed via grep: never `require()`d anywhere, unused). Both still contain
  old brand/orange content but are dead weight, not live platform surface — deleting files is outside
  "remove orange styles / demo content" scope, flagged for the user to decide.

## Design
Added RGB-triplet companions (`--fire-rgb`, `--ember-rgb`, `--amber-rgb`, and a new `--bad`/`--bad-rgb`
for the `#FF7043` error/warning color, which turned out to be a genuinely distinct shade from `--ember`,
not a variant of it) to `index.html`'s and `admin.html`'s `:root`, then rewrote every
`rgba(217,59,10,X)` / `rgba(255,87,34,X)` / `rgba(255,167,38,X)` / `rgba(255,112,67,X)` /
solid-hex literal to its `var()` form. Added greyscale RGB triplets to `index.html`'s `body.theme-mono`
block so every rewritten site greys out under B&W. Excluded (deliberately, unchanged): the nutrition
macro-chart's 3 data-series colors (fat/carb/protein, matching legend dots — greying one breaks the
chart's own purpose), the static `<meta name="theme-color">` tag, and the `theme-bw` (light theme) /
default-theme token blocks — those are intentional, user-selectable brand options, not legacy.

## Bugs caught during verification (fixed before calling this done)
1. **Self-referential token declarations, twice.** The bulk literal→`var()` replacement script matched
   its own newly-added token declarations (e.g. `--bad:#FF7043;` → `--bad:var(--bad);`, a circular
   reference) because a blind numeric/string match doesn't know the difference between "this is a USE
   of the color" and "this is the DEFINITION of the color." Happened once for `--fire-rgb`/`--amber-rgb`/
   `--bad`/`--bad-rgb` in `index.html`, then again for the same `--bad` token in `admin.html` (same
   mistake repeated before I'd fully internalized the fix). Caught by re-grepping immediately after each
   script run, not by assuming success. Fixed by hand each time; later replacements were anchored to
   `rgba\(` context specifically so the declaration line can never match.
2. **A whole color missed from the original scope.** `--ember`'s RGB-decimal form (`255,87,34`) was
   never included in the original discovery grep (which checked hex forms and 4 other RGB triplets, but
   not this one) — found only because the FIRST post-edit B&W verification came back with 35 remaining
   hits instead of 0, all tracing to this one missed pattern (`NAV.bottom-nav` border-color and similar).
   Fixed in both files once identified; re-verified at 0.
3. **A test-methodology false alarm, correctly distinguished from a real bug.** After the first round of
   fixes, live-checking B&W via `applyTheme('bw')` (a runtime class switch, no page reload) showed 8
   elements still reporting old orange `box-shadow`/`backgroundColor` values — even though the CSS
   source, the CSSOM rule text, and the `--fire-rgb` custom-property value at that exact element were
   ALL independently confirmed correct. Root-caused to the same environment limitation already
   documented in this project (CSS transitions freeze when `document.visibilityState==='hidden'`, i.e.
   this preview pane isn't composited) — extended here to certain derived "used values" (box-shadow,
   `var()`-driven backgrounds) not being recomputed after a runtime class change in a non-painting tab.
   Proved it wasn't a real bug by setting `localStorage.theme='bw'` and doing a FRESH navigation (so B&W
   is the very first paint, no runtime switch involved) — the same elements then correctly read
   `rgb(74, 74, 74)`. All subsequent verification used fresh-navigation-per-theme, not runtime switching.

## Verification
- **Identity (no regression):** fresh-navigation computed-style scan (every element × 13 color-bearing
  properties) for the default theme → **991 hits, hash `63e8ffea`** — byte-identical to the pre-edit
  baseline. Light theme → **943 hits, hash `38049f87`** — byte-identical. Both confirm zero visual
  change to the two themes that must stay exactly as they were.
- **B&W actually zero:** same scan, fresh-navigation into B&W → **0 hits** (was 106 at the start of this
  phase). Re-confirmed with a dynamically-triggered state the initial-load scan couldn't reach on its
  own (`.co-pay:has(input:checked)`, checked via JS + a real `change` event) — still 0 hits, and the
  element's border/background correctly read `rgb(74, 74, 74)`.
- **Platform-wide re-grep** (all hex/rgb legacy patterns, all `.html` files): matches now exist ONLY in
  `index.html`/`admin.html`'s documented exclusion zones (token declarations, `theme-bw` block,
  nutrition chart) and the already-flagged `backup_before_push_notifications/` folder. `root.html`,
  `landing.html`, `marketing.html`, `login.html`: zero matches.
- `root.html`: `getComputedStyle` confirms `--fire` still resolves to `#d8b877` (gold, from panel.css,
  unchanged) after the dead-fallback fix.
- `admin.html`: visible panel chrome (`#adminPanelOverlay`, sidebar) still reads correct neutral
  `--ap-*` colors, unaffected (only the inert embedded customer `:root` was touched).
- 0 console errors on the customer site (both themes), admin panel, and Root panel.
- `backend/db.js`: `node --check` passes; the fix is source-verified (no live DB reset performed —
  destructive/unnecessary, and the existing dev DB's already-seeded row predates this fix by design,
  per the plan's own scoping to "freshly-seeded tenants").

## Files modified
`index.html`, `admin.html`, `root.html`, `backend/db.js`. No new dependency. No DB schema/API/auth/
tenant-isolation change. No business logic touched — every change is either a CSS custom-property
substitution (proven identical resolved value) or one seeded string literal.

## Next
No major backlog item remains (cleared as of Phase 30; Phase 31/32 were both scope corrections, not
backlog items). Ask the user before starting any fast-follow — see AI-CONTEXT.txt's NEXT PHASE list.

## Addendum — flagged items deleted on explicit user instruction
The user replied "delete" to the two flagged items above. Removed, same session:
- `backup_before_push_notifications/` (whole folder — admin.html, index.html, server.js, db.js,
  manifest.json, service-worker.js; ~2.2MB, dated 2026-07-14).
- `backend/seedDev.js` (10KB, dated 2026-07-21) and `backend/seedNewMenu.js` (27KB, dated 2026-07-18).

Verified before deleting: neither seed script was ever `require()`d anywhere (confirmed via grep), and
the backup folder was already excluded from being served (server.js's static-file guard). Verified
after: `node --check` on the touched area is moot (no code files changed), and the server boots clean
on restart with no missing-module or missing-file errors — confirming nothing else in the live app
depended on any of the three. No git repository exists for this project, so this deletion is
NOT recoverable via version control — done only after explicit, direct user instruction.
