# Phase 57 — One UI polish: logo mark not circular, text fields fully pill

## Why
User feedback after seeing Phase 1/2's One UI redesign live: the site logo/brand mark (sidebar
badge in admin.html/root.html, nav mark in login.html/landing.html) had been made a full circle
(`border-radius:999px`) during the earlier passes — user wants it NOT round. Separately, text input
fields (the "rounded-corner text boxes you can type into") were only at the moderate `--radius-sm`
scale (14px) — user wants those FULLY rounded (pill, 999px), consistent with the buttons/switches
already using that treatment.

This clarifies a design rule that applies across every page touched in Phase 1/2: pill radius is for
buttons, switches, and now text input fields — but the logo/brand mark should stay a soft rounded
square, not a circle.

## What changed
Across `admin.html`, `panel.css` (root.html), `login.html`, `index.html`, `landing.html`:
- Every `.side-brand .mark` / `.brand .mark` (logo badge) → `border-radius` reverted from `999px`
  back to the `--radius-sm`/`--ap-radius-sm` scale (14px) — a soft rounded square, not a circle.
- Every text `<input>`/`<textarea>`/`<select>` rule that was at 12-14px → `border-radius:999px`
  (full pill): admin.html's `.admin-input`/general input rule + `.custom-select-trigger`;
  panel.css's shared `input,select,textarea`; login.html's `.field input`; index.html's `.co-input`
  (checkout form) and the reservation form's name/phone/note fields; landing.html's
  `.field input,.field textarea` (contact form).
- Icon badges that are NOT the logo (stat card icons, chip icons, feature icons, etc.) were left
  pill as before — this change is scoped specifically to the brand/logo mark and to genuine
  text-entry fields, not every rounded element on the site.

## Verification
Live, fresh-navigation, computed styles on every affected page:
- `admin.html`: mark `14px`, text input `999px`.
- `root.html` (via panel.css): mark `14px`, text input `999px`.
- `login.html`: mark `14px`, field input `999px`.
- `index.html`: reservation name field `999px` (checked via `#rezAd`).
- `landing.html`: mark `14px`, contact form field `999px`.

## Files changed
- `admin.html`, `panel.css`, `login.html`, `index.html`, `landing.html` — small, targeted radius
  corrections only, no other changes.
