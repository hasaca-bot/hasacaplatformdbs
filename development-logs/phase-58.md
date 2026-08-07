# Phase 58 — Revert: product page price text + cart icon back to original white

## Why
User feedback after checking the One UI restaurant-site restyle (Phase 55/Faz 2B) live: the price
text on the product cards/detail panel and the shopping-cart icon (floating button + add-to-cart
icon on cards) had turned blue along with the rest of the redesign, and the user wants specifically
these back to their original white/cream look — not a request to revert the whole site restyle.

## What changed
`index.html`:
- `--ember`/`--gold`/`--amber` (+ their `-rgb` companions) reverted to their exact pre-Faz-2B values
  in both `:root` (dark) and `body.theme-bw` (light) — `--ember:#f4f4f6`, `--gold:#e6e6ea`(dark)/
  `#0a0a0b`(light), `--amber:#e6e6ea`(dark)/`#565c69`(light). **`--fire`/`--fire-text` stay blue** —
  this token still drives the hero/checkout/admin buttons across the site, which the user did not
  ask to revert. This single change fixes `.food-card-price` and `.detail-price` (both
  `color:var(--ember)`) back to their original near-white text.
- `.food-card-cart-btn` (add-to-cart icon on each menu card) and `.cart-fab` (the main floating
  shopping-cart button) — background/color/shadow hardcoded back to the original white gradient
  (`linear-gradient(135deg,#ffffff,#f4f4f6)`, `color:#0a0a0b`) instead of referencing `var(--fire)`/
  `var(--ember)`, so these two stay white even though `--fire` itself remains blue for every other
  button. `.cart-fab-badge` needed no separate fix — it already reads `var(--gold)`, which the
  token revert above already restored to its original value.

## Verification
Live, via a real table QR-entry URL (`/t/<token>?tenant=default`, the exact URL format a printed
QR code encodes — confirmed by reading `buildTableUrl()` in `backend/routes/tables.js`), fetched a
real table token from the local dev DB for the `default` tenant:
- `body.dinein-mode` active (confirms QR/table entry context, not a plain browse).
- `.food-card-price` color → `rgb(244,244,246)` (reverted, was blue).
- `.detail-price` (opened a real product detail panel) → same `rgb(244,244,246)`.
- `.food-card-cart-btn` and `.cart-fab` background → `linear-gradient(135deg, rgb(255,255,255),
  rgb(244,244,246))` (reverted, was blue gradient).
- Screenshots taken confirming the white cart FAB with its count badge, and the white product price
  on the detail panel.
- Left the preview server running and this exact QR-entry page open in the Browser pane for the
  user to inspect directly.

## Files changed
- `index.html` — token revert (`--ember`/`--gold`/`--amber` + rgb) and two hardcoded component
  overrides (`.food-card-cart-btn`, `.cart-fab`).
