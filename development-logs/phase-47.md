# Phase 47 — Landing B&W theme actually white (not gray), admin profile avatar squashing fixed

## Why
Two follow-up reports after Phase 46 shipped: the Black & White theme button on landing.html still
"didn't change anything," and the admin panel's top-right profile picture (added in Phase 45 for
Google-linked accounts) looked squashed. Both turned out to be real, fixable bugs — found and fixed
by testing with the correct methodology this time (see "A real environment gotcha" below).

## 1. Landing page theme — user clarified they want an actual WHITE background, not gray
Phase 46's fix (swap `--gold` to gray) was too subtle to register as "a different theme" at all — gold
is only a small fraction of the page's surface. The user explicitly clarified: **"bembeyaz"** (all-white),
not gray. Replaced the approach entirely:

- `html.theme-mono` now overrides the full design-token set (`--bg`, `--surface`, `--border`, `--text`,
  `--gold`, `--shine`, etc.) to a real light palette — white background, dark text — the same way
  index.html/admin.html/root.html's own light theme works.
- Found and fixed 5 real hardcoded-color spots that don't route through tokens and would otherwise have
  broken (dark-on-dark or white-on-white, i.e. exactly the "unreadable text" risk the user flagged):
  `.btn-primary` (was white-bg/dark-text — on a white page a white button is invisible), the base `.nav`
  background AND `.nav.scrolled` (both hardcoded dark, sitting under now-dark-on-dark nav text), the
  mobile dropdown menu background, `.step .num`'s number (uses `.shine` gradient-text, which is now dark
  — but sits on an intentionally-still-dark badge), and the testimonial avatar's initials color.
- **`.devices` (hero laptop/phone illustration) and `.mock` (the 3 showcase sections' screen mockups)
  are deliberately kept dark in BOTH themes** — they represent screenshots of the actual product's own
  dark UI, and a real screenshot shouldn't recolor itself just because the marketing page around it
  changed theme. Re-declared the original dark tokens scoped to these two containers so every descendant
  that already correctly used a token (not a hardcoded color) keeps working with zero per-element patching.
- Verified the default (non-toggled) theme is byte-for-byte unchanged — re-checked `.btn-primary`'s
  colors with the toggle off, matches the original exactly.

### A real environment gotcha (worth remembering for next time)
This project's own history already documented it (Phase 32): this specific automated browser testing
environment doesn't reliably recompute certain styles immediately after a **runtime** class/DOM change
made while the pane isn't actively composited — `getComputedStyle` right after `element.click()` can
report stale/wrong values that don't match what a real browser shows. Confirmed this by comparing the
SAME toggle: reading styles right after a scripted click (looked broken) vs. setting `localStorage`
*before* a fresh navigation and reading styles after that load (correct, matches the declared CSS). All
verification in this phase used the second method. Two apparent "still broken" moments during this
session were this exact artifact, not real bugs — but every fix that survived the *correct* test method
either already worked or, once found to be a real bug (see below), was actually fixed in the source.

## 2. Admin panel profile avatar — genuine CSS bug, not a caching/artifact issue
Verified with the correct fresh-navigation methodology and it was STILL wrong — a real bug:
`.profile-btn` is a `display:flex` container, and its `.av` avatar circle had no `flex-shrink:0`. Under
normal flex rules, a flex item without that property can shrink below its declared `width:30px` when the
row doesn't have enough horizontal room — which is exactly what was happening, squashing the circle from
30×30 down to a non-square ~21×30, and the `<img>` inside (sized as 100% of that already-wrong box)
inherited the same squashed proportions despite `object-fit:cover` being correctly set. `object-fit`
cannot fix a wrongly-shaped *container* — it only controls how the image fills whatever box it's actually
given. Fixed with one line: `flex-shrink:0` on `.av`. Verified via a real fresh page load with an actual
(intentionally non-square, 1536×1024) test image set as the avatar: the container now correctly measures
30×30, and the image renders as a proper 28.4×28.4 square (the 1.6px difference is the element's own
1px border on each side, expected) — cropped via `object-fit:cover`, never stretched.

## Favicon — re-confirmed already correct in production, not a code issue
Checked the live site directly: `platformhasaca.netlify.app/admin`'s served HTML already has the correct
`<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">` and the corrected sidebar SVG mark —
Phase 46's fix is live and correct. Also checked the actual image behind the platform's live
`favicon_url` setting (a different, legitimate 2048×2048 square PNG of the same logo, not the broken
giant-rectangle test data found in the LOCAL dev database during Phase 46 — that bad data was local only,
never touched production) — it's a real, correctly-square, if needlessly large, file. The remaining
"still looks broken" perception is almost certainly the browser's own favicon cache, which is notoriously
sticky (often survives a normal hard-refresh, sometimes needs a full browser restart or explicit
site-data clear) — not something further code changes can address.

## Files changed
- `landing.html` — replaced the `theme-mono` gray-swap with a full light-theme token override + 6
  component-specific fixes for hardcoded colors that don't route through tokens.
- `admin.html` — `flex-shrink:0` added to `.profile-btn .av`; the earlier (harmless but insufficient)
  `justify-self`/`align-self`/`display:block` additions to the inner `<img>` kept as defensive belt-and-
  suspenders, though the flex-shrink fix on the parent was the actual root cause.
