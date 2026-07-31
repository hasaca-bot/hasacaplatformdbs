# Phase 37 — Monochrome rebrand, Root dashboard analytics chart, contrast fix

## Summary
Three things land in this phase:

1. **Monochrome rebrand** (done in a prior session, held back pending sign-off — now shipped).
   Every gold/amber accent — buttons, badges, focus rings, status pulses, chart colors — converted
   to monochrome (white/black/gray) across `admin.html`, `root.html`, `login.html`, `index.html`,
   and `panel.css`. `landing.html`/`marketing.html` deliberately untouched (shared public marketing
   branding, kept as-is per the user).
2. **Root panel: "Son Aktivite" → interactive analytics chart.** The dashboard's Recent Activity
   card is replaced with a dependency-free SVG area chart (Masa/dine-in vs Paket/delivery orders per
   day, 7/30/90-day range selector, smooth curve, gradient fill, hover tooltip) — adapted from a
   shadcn/Recharts reference the user provided, rebuilt in vanilla JS/SVG since this codebase has no
   bundler and no charting library. The underlying Activity Log feature is untouched and still
   reachable from the sidebar; only this one dashboard card changed.
3. **Contrast bug found and fixed**, caused by the monochrome pass exposing a latent conflict.

## 1. Monochrome rebrand
Converted every `--fire`/`--ember`/`--gold`/`--amber`/`--ap-gold*` token definition (dark and light
theme variants) plus every literal gold/amber hex/rgba value that bypassed the tokens (nutrition
chart colors, floor-cell status pulses, order badges). Semantic red (errors/delete) and green
(success/protein) were deliberately left alone — a different, functionally meaningful color family,
not what was described as "yellow/orange-like."

Palette: dark theme accent → white/light-grey (`#ffffff` / `#e6e6ea`); light theme accent →
near-black/grey (`#15171c` / `#565c69`), reusing the same values already used for normal text color,
so it reads as genuinely monochrome rather than a different-hued theme.

A real bug was caught and fixed *during* this pass: `root.html`/`panel.css`'s `.btn`/`.admin-btn`
had `color:#0a0a0b` hardcoded, assuming the button background was always light. Once the dark-theme
accent became white and the light-theme accent became near-black, that hardcoded text color would
have been invisible in light theme. Introduced `--gold-text`/`--ap-gold-text` (theme-aware, flips
per theme) and switched every accent-background button to use it instead.

## 2. Root dashboard analytics chart
- `backend/routes/root.js` — `GET /api/root/analytics` now also breaks `ordersByDay` down by
  `delivery`/`dinein` per day (previously only totals), giving the two-series data the chart needs.
  Zero-day-fill behavior unchanged.
- `root.html` — the "Son Aktivite" panel-card (title + `act-list`) replaced with an "Analitik" card:
  a day-range `<select>` (7/30/90, reusing the existing analytics-modal pattern), a legend (Masa /
  Paket), and the chart mount point. New `renderDashAreaChart()` + `dcSmoothPath()`/`dcAreaPath()`
  (Catmull-Rom → cubic-bezier smoothing, stacked-area path construction) — no external dependency.
  Hover shows a vertical guide line and a tooltip with both series' values for that day.
- `panel.css` — new `.dash-chart-*` classes for the chart wrapper, legend, and tooltip.
- The chart's colors are the same monochrome tokens (`--gold`/`--muted`) used everywhere else, so it
  automatically follows the dark/light theme toggle.

## 3. Contrast fix
Found via a live-DOM contrast checker (computes actual rendered text-vs-background contrast ratio,
not just reading CSS) run across Root panel, Admin panel, login page, and the customer site, in both
themes.

**Real bug**: `root.html`'s own `.chip.active` rule (`color:var(--fire-text) !important`) fought
`panel.css`'s authoritative `.chip.active{ background:var(--gold-soft); color:var(--text); }`. Before
this phase, `--fire-text` was undefined, so the `!important` was inert (fell back to inherited color,
which happened to look fine by coincidence). Once `--fire-text` was correctly defined (needed to fix
the button-text bug above), this stale `!important` became active and produced near-black text on a
near-black translucent background — the "Tümü" active filter chip on the Restaurants view was
essentially invisible. Root cause: this rule was a redundant duplicate of what `panel.css` (linked
last, authoritative per this file's own header comment) already provides. Removed the duplicate.

Every other flag from the automated checker was investigated individually and confirmed to be either
pre-existing (the `--faint` tertiary-label color, never touched by this pass; the `--bad` red confirm
button, also untouched) or a false positive from the checker's inability to read `background-image`
gradients (it walked past a gradient to a distant ancestor's solid color) — each confirmed via direct
`getComputedStyle` inspection and a screenshot before being dismissed. Light theme was also spot-
checked visually across the hero, menu, reservation, and contact sections — no issues found.

## Verification
- All four HTML files' inline `<script>` blocks pass `node --check` (only the pre-existing JSON-LD
  false positive, as in every prior phase). All touched backend files pass `node --check`.
- Root dashboard: chart renders with real local data (657 orders / 30 days), range selector
  (7/30/90) re-fetches and re-renders correctly, hover tooltip shows correct per-day values, 0
  console errors.
- `.chip.active` ("Tümü"): confirmed via `getComputedStyle` and screenshot — white text
  (`rgb(244,244,246)`) on the translucent highlight background, clearly legible.
- Root panel: `default` tenant's Disable/Delete buttons still present (Phase 36 regression check).
- Hero Image Management (Phase 35) re-verified end-to-end through the *real* admin UI this session
  (not just direct API calls as in Phase 35's original verification): upload, reorder, remove, save,
  fresh-reload-of-admin, and the customer site all correctly reflect each change. No reproduction of
  the "hero images don't update" issue the user reported — see Known Issues below.

## Known issues (not resolved this phase)
- **User-reported: hero image edits don't appear updated locally.** Could not reproduce after
  thorough testing of the full cycle (upload → reorder → remove → save → fresh admin reload →
  customer site reload) via the actual `admin.html` UI functions, on the `default` tenant, with a
  freshly restarted local server. Needs exact repro steps from the user (which tenant, exact
  sequence of actions, whether a hard browser refresh was tried) to diagnose further.
- **AI Assistant reported not working.** Not yet investigated this phase — next up, pending the
  user rotating the Gemini API key they exposed in chat (flagged and asked not to be pasted again;
  it must be entered directly in the Root panel's AI Assistant setup screen, never through chat).
- Chatbot UI modernization (visual redesign to match the current site UI) — not yet started.

## Files changed
- `admin.html`, `root.html`, `login.html`, `index.html`, `panel.css` — monochrome token conversion
  (all five) + `root.html`/`panel.css` `--gold-text`/`--ap-gold-text` contrast fix + `.chip.active`
  duplicate-rule removal (`root.html` only) + dashboard chart (`root.html`, `panel.css` only).
- `backend/routes/root.js` — `/api/root/analytics` per-day delivery/dinein split.
