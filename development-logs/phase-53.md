# Phase 53 — Admin Panel: One UI 8.5 tasarım diline geçiş (Faz 1)

## Why
User asked to redesign the entire site to match Samsung's One UI 8.5 design language —
buttons, icons, cards, bars, charts, everything — supplying reference screenshots from a Figma
Community "One UI Design Kit". Given the scope (landing, 45 marketing pages, customer site, admin
panel, root panel, login), the user chose to start with the **Admin Panel** (masa siparişi, uzaktan
sipariş, rezervasyon, dashboard all live there) and to defer the "4-way split screen" Bottom
Container widget feature to a later phase. This phase is visual-only — no JS/logic changes, no
font change (`--font-primary` stays exactly as-is per explicit instruction).

Reference tokens extracted from the design kit: primary blue `#387AFF` (constant across both
themes — dark bg `#000000`/container `#17171A`, light bg `#F1F1F3`/container `#FFFFFF`), large
corner radii throughout (cards ~20-28px, buttons/switches full pill/999px), Navigation Rail
(selected item = solid filled pill, no side-line indicator), Dialog (large radius, blurred
backdrop), Card/List item pattern (icon badge + title + subtitle + trailing control).

admin.html already had its own self-contained `--ap-*` design-token system
(`#adminPanelOverlay{ --ap-bg, --ap-gold, --ap-radius, ... }` + a `html[data-theme="light"]`
override block) — this phase reused that exact architecture rather than building a new one; only
the token *values* changed.

## What changed

### 1. `--ap-*` tokens → One UI 8.5 values
Both the dark-default and light-override `#adminPanelOverlay{...}` blocks: `--ap-gold` (accent,
previously white/black) → `#387AFF` in both themes; backgrounds/lines/text flipped to the design
kit's dark (`#000000`/`#17171A`) and light (`#F1F1F3`/`#FFFFFF`) neutral scales; `--ap-radius`
16px→20px, `--ap-radius-sm` 11px→14px, `--ap-radius-lg` 22px→28px. (`--ap-radius-pill:999px`
already existed elsewhere in the file, reused as-is.)

### 2. Sidebar → Navigation Rail
`.nav-item` radius → pill; removed the old `.nav-item.active::before` 3px left accent bar in favor
of a solid filled-pill selected state (`background:var(--ap-gold); color:var(--ap-gold-text)`),
matching the reference's Navigation Rail pattern. `.side-brand .mark`, `.collapse-btn`, and
`.topbar-icon` all bumped to pill radius to match.

### 3. Confirm dialogs → One UI Dialog
`.custom-popup-card` radius 24px→28px, scrim changed from a warm near-black
(`rgba(10,5,3,.6)`) to a neutral `rgba(0,0,0,.55)` with a stronger blur (12px→16px).
**Also fixed a real, pre-existing theme-binding bug found during this pass**: `#customConfirmOverlay`
is a DOM *sibling* of `#adminPanelOverlay`, not a descendant, so the panel's `--dark2`/`--cream`
token remap never reached it — the shared confirm/delete dialog was always following the
*customer site's* `body.theme-bw` class instead of the admin panel's own dark/light toggle. Fixed
by adding `body:has(#adminPanelOverlay.open) .custom-popup-*` (and a `light` variant) rules that
mirror the `--ap-panel`/`--ap-text`/`--ap-gold` values directly, placed after the existing
`body.theme-bw` rules so they win on equal specificity whenever the admin panel is open. Verified
live in both admin themes — dialog now correctly follows the admin panel's own toggle.

### 4. Buttons, switches, cards
- `.admin-btn`/`.admin-btn.secondary` → pill radius.
- Native checkbox toggles (`.ap-chk-lbl input[type=checkbox]`, used by all the widget on/off
  switches — WhatsApp/Instagram/Facebook/etc.) converted to visual One UI pill switches via
  `appearance:none` + a `::before` pseudo-element thumb — **CSS-only, no markup/JS change**, so
  every existing checkbox picked this up automatically.
- `.stat-card .st-ic` icon badge → pill radius.
- Text inputs, selects, and the custom-select trigger → `--ap-radius-sm` (were hardcoded 11px).
- Masa (dine-in) screens' `.tbl-card`/`.floor-section`/`.dinein-card`/`.floor-cell`/`.dc-items`
  and uzaktan sipariş's `.orders-search`/`.aoc-items`/`.aoc-btn` — these reuse a separate,
  pre-existing `--tbl-*`/`--ord-*` token system (colors already remapped to `--ap-*` inside the
  overlay from earlier phases) but had their corner radii hardcoded per-rule rather than
  variable-driven, so those needed a direct bump to the One UI scale via new `#adminPanelOverlay`-
  scoped override rules.

### 5. Icon style pass (kept intentionally cheap, per explicit "don't waste tokens" instruction)
Every icon in admin.html is already an inline outline SVG (`stroke="currentColor"
stroke-width="2"`). Rather than hand-redrawing hundreds of icons to match the reference set 1:1,
added one rule — `#adminPanelOverlay svg{ stroke-width:2.25; stroke-linecap:round;
stroke-linejoin:round; }` — which overrides every icon's own presentation attributes at once
(CSS always wins over SVG presentation attributes), giving every existing glyph the slightly
bolder, fully-rounded stroke the One UI Vector Icons reference uses.

### 6. Top App Bar
Already matched the reference well once the topbar-icon pill radius (step 2) landed — title left,
circular icons right, blurred translucent background on scroll. No further changes needed.

## A parser bug found and fixed during verification
While live-testing, `.tbl-card`/`.floor-section`/`.dinein-card` weren't picking up the new radius
despite the CSS being correct on disk and served correctly by the server. Root cause: my own code
comment contained the literal text `.tbl-*/.floor-*/.dinein-*` — the `*/` inside that text closes
a CSS comment early, so everything after it (including the *next* rule from the same edit) was
consumed by the parser as invalid CSS until it resynced a few rules later. Confirmed via
`insertRule()` (identical text parses fine in isolation) and by bisecting which grouped selectors
were missing from `document.styleSheets`. Fixed by rewording the comment to avoid an asterisk
immediately followed by a slash.

## Verification
Local preview (`localhost:12999`), locally-signed JWT (`backend/lib/auth.js` `signToken()`, dev-only)
for `tenant_id:'default'`, fresh-navigation methodology throughout:
- Dark theme: nav-item active pill = `rgb(56,122,255)` (`#387AFF`), brand mark/collapse-btn/
  topbar-icon all `border-radius:999px`, font-family unchanged (`"Samsung Sharp Sans", ...`).
- Light theme: `--ap-bg:#f1f1f3`, `--ap-gold:#387AFF` (same blue as dark), nav-item active pill
  stays blue with white text.
- Masa siparişi (table-orders) view: `.dinein-card` → 20px, `.floor-cell` → 14px.
- Uzaktan sipariş (orders) view: `.admin-order-card` → 20px, `.aoc-btn` → pill (999px).
- Confirm dialog opened programmatically in both admin themes: dark → `rgb(23,23,26)` bg /
  white title text; light → `rgb(255,255,255)` bg / black title text — confirms the
  `:has()` theme-binding fix works in both directions, independent of the customer site's own
  `theme-bw` state.
- Pill checkbox switch: `appearance:none`, `border-radius:999px` confirmed via computed style.
- `git diff admin.html` reviewed end-to-end — every change scoped to `#adminPanelOverlay` (or the
  new `:has()`-bound dialog rules); no `font-family` line touched; no stray old hardcoded radius
  values left behind (grepped for `border-radius:11px` post-edit — zero remaining).

## Out of scope (per user's explicit choice, not started)
- The "4-way split screen" Bottom Container widget (masa siparişi + uzaktan sipariş shown
  together, up to 4 panels) — deferred to a later phase.
- root.html, login.html, landing.html, marketing.html (45 pages), index.html (customer sites) —
  same `--ap-*`-style token pattern to be extended there once the admin panel system is proven,
  not in this phase.

## Files changed
- `admin.html` — all changes described above, entirely within the existing `--ap-*` token
  architecture plus the new `:has()`-bound dialog override.
