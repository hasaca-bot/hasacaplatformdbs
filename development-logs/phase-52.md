# Phase 52 — Consistent Black & White theme across landing.html AND all 45 marketing pages

## Why
User reported: choosing the white theme on landing.html, then navigating to a page like
"Özellikler" (`/ozellikler`), silently reverted to the dark theme with no way to switch it back on
that page. Root cause, confirmed by an Explore-agent code audit: `marketing.html` (the shared shell
that renders all 45 marketing sub-pages) had **zero theme code at all** — no `theme-mono` class
handling, no reading of `landing.html`'s `localStorage['landing_theme']`, no toggle button. Every
marketing page always rendered in a fixed dark look regardless of what was chosen on landing.html.
User also asked that, absent any explicit choice, the device's own system light/dark preference
should be respected — `landing.html` instead hardcoded `'dark'` as its no-selection fallback.

## What changed

### 1. `landing.html` — respect system preference, remove the flash of the wrong theme
- The `DOMContentLoaded` fallback (`let savedTheme = 'dark'`) now checks
  `window.matchMedia('(prefers-color-scheme: light)').matches` when nothing is saved yet, same
  pattern `index.html` already uses for tenant sites (`index.html:4961-4966`) — reused verbatim,
  not reinvented.
- Added a small synchronous `<script>` in `<head>` (right after the existing `js-anim` line) that
  applies `theme-mono` before `<body>` parses, so there's no flash of the wrong theme on load. The
  existing `DOMContentLoaded` call to `applyLandingTheme()` still runs afterward (idempotent — sets
  the toggle button's `.on` state, harmless to call twice).

### 2. `marketing.html` — ported landing's whole theme system
Reused landing.html's own already-proven pattern (not a new design):
- `--gold-rgb` added to `:root` (matching landing's own token-cascade trick) and the 4 hardcoded
  `rgba(216,184,119,...)` literals (`.plan.pop`, `.plan .badge`, `.field input:focus`, `.cta-box`)
  switched to `rgba(var(--gold-rgb),...)` so a theme change updates them for free.
- Full `html.theme-mono{...}` override block, adapted to marketing.html's own selectors: `.nav`,
  `.nav.scrolled`, `.nav.open .nav-links`, `.brand .mark`, `.btn-primary`, `.nav-toggle`,
  `::selection`, `.foot-social a:hover`, `.step .num` (+ its `.shine` text-gradient), matching
  landing.html's already-solved values 1:1.
- **Found one more genuine bug during this pass that wasn't in the original audit list**:
  `.yes` (the comparison-table checkmark used by `table.cmp` on e.g. `/karsilastirma`) was the
  exact same near-white-on-white contrast bug landing.html's `.cmp .yes` had before Phase 47 fixed
  it — added the matching `html.theme-mono .yes{ color:#0a0a0b; }` override.
- **Two genuinely new light-theme values, no landing.html equivalent to copy** (landing has no
  contact form or status page): `.form-msg.ok`/`.form-msg.bad` (contact-form success/error text —
  the dark-theme colors are pale mint/salmon tuned for a near-black background, unreadable on
  white) and `--ok`/`--warn` (the `/durum` status page's green "operational" badge) — both given
  new, legible dark tones (`#1f7a3d` green, `#a83226` red) for the light background.
- `.theme-switch` CSS copied verbatim from landing.html.
- Theme-switch button markup added to the nav (first child of `.nav-right`, before `.lang`) and
  footer (before `.lang` in `.foot-bottom`) — identical markup/IDs (`#themeSwitchBtn`/
  `#themeSwitchBtnFoot`) to landing.html's own.
- `applyLandingTheme()`/`toggleLandingTheme()` copied verbatim (self-contained, no landing-only
  dependency) — reads/writes the SAME `localStorage['landing_theme']` key as landing.html, which is
  exactly what makes the theme choice carry over between landing.html and every marketing page.
  Same synchronous head-level init script as landing.html's, plus the system-preference fallback in
  `DOMContentLoaded`.
- Checked `.card .ci` (a feature-card icon badge CSS rule the Explore audit flagged as
  possibly-dark-only) — confirmed it's dead CSS, never referenced by any actual rendered markup
  (`cards: b =>` doesn't emit a `.ci` element at all) — left untouched, no override needed.

### 3. Re-ran the marketing prerender script (again — now a standing lesson for this project)
`marketing.html` is only the *source template*; production serves 45 pre-generated static files
(`pages/*.html`, Phase 51) that do **not** auto-update when the template changes. Re-ran
`node backend/scripts/prerender-marketing.js` and committed the regenerated output — skipping this
step would have shipped code changes that silently never appeared on the live site, exactly like
almost happened with the WhatsApp-button change earlier this session.

## Verification
Live in the local preview, using the fresh-navigation methodology (this environment's test harness
doesn't reliably reflect a runtime class toggle read back in the same script — a limitation
documented since Phase 32):
- Set `landing_theme=mono`, fresh-navigated to `/landing` → `theme-mono` applied. Navigated (same
  localStorage, no reset) to `/ozellikler` → **also** `theme-mono`, toggle button shows `.on`, nav/
  body backgrounds correctly white. This is the exact bug reported — confirmed fixed.
- Toggled the theme OFF from *inside* `/ozellikler`, navigated to `/fiyatlandirma` then `/landing` —
  dark theme correctly persisted across both, proving the shared-key, cross-page consistency works
  in both directions, not just landing → marketing.
- Cleared `landing_theme` entirely and used `resize_window`'s `colorScheme` param to simulate both
  light and dark system preference with no saved choice — both `landing.html` and `/ozellikler`
  correctly followed the system preference automatically (verified light AND dark cases).
- Verified the new light-theme colors are genuinely legible: `.yes` checkmark
  (`/karsilastirma`) → `rgb(10,10,11)` on white; `.form-msg.ok`/`.st-badge` → `rgb(31,122,61)`;
  `.form-msg.bad` → `rgb(168,50,38)`; `.step .num` (`/partner-programi`) → light gradient badge with
  a correctly dark `.shine` gradient-clipped number.
- Re-confirmed the *default* dark theme (system preference dark, nothing saved) is unchanged:
  `/ozellikler` body background still the original `rgb(10,10,11)`.
- Regenerated `pages/*.html` spot-checked for the new theme code (`grep -c theme-mono
  pages/ozellikler.html` → 20 hits, `themeSwitchBtn` → 3 hits) before committing.

## Files changed
- `landing.html` — system-preference fallback (was hardcoded `'dark'`), synchronous head-level theme
  init script (removes flash of wrong theme).
- `marketing.html` — `--gold-rgb` token + 4 literal-to-var() conversions; full `html.theme-mono{...}`
  override block (ported + 3 new values: `.yes`, `.form-msg.ok/.bad`, `--ok`/`--warn`); `.theme-switch`
  CSS; theme-switch buttons in nav + footer; `applyLandingTheme()`/`toggleLandingTheme()` +
  synchronous head init script + system-preference fallback in `DOMContentLoaded`.
- `pages/*.html` (all 45, regenerated) — now carry the full theme system.
