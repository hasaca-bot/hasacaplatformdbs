# Phase 80 — Public-site UI/UX regression audit, navigation repair, design-system consolidation

## Why
`landing.html` was redesigned (One UI 8.5, blue accent). The redesign reached **only**
landing.html, login.html and restoran-olustur.html. The other **46 public pages**
(`marketing.html` + `pages/*.html` ×45) were left on the old design, so clicking any link from
the landing page visibly changed the product. A full audit of every public route was requested —
not a page-at-a-time patch.

Three parallel read-only audits (routes/links, design-token diff, legacy/regression hunt) mapped
the whole public surface before any edit was made.

## Root causes found (all verified against the files, not assumed)

1. **Accent colour was never migrated.** `landing.html:102,141` = `--gold:#387AFF`;
   `marketing.html:34,52` and `pages/*.html:50,68` = `--gold:#d8b877` (old warm gold), and
   `#0a0a0b` in light theme. Only 4 of 96 accent declarations were blue. `.btn-primary` was a blue
   pill on landing and a **white** pill on the other 46 pages.

2. **`.wrap` + padding-shorthand bug in all 45 `pages/*.html`** (`:174` `.block{ padding:44px 0; }`).
   `.wrap` (`:114`) supplies `padding:0 24px`; every section is `<section class="block wrap">`, so
   the shorthand's `0` wiped the horizontal gutter. **Two failures at once:** text touched the
   viewport edge on desktop, and at `≤560px` the later `.wrap{padding:0 18px}` rule wiped the
   *vertical* padding so sections collapsed into each other. `marketing.html:162` had already fixed
   this via `section.block{padding-top;padding-bottom}` — never backported.

3. **CSS duplicated 46×.** The `pages/*` `<style>` block (328 lines) was byte-identical across all
   45 files (MD5-verified); no public page used an external stylesheet. This is *why* fix #2 never
   propagated.

4. **Footer registry drift.** All 46 marketing pages listed slug `'api'`, which is not a registry
   key — the renderer silently dropped it, so that footer link never appeared. `landing.html:1567`
   already had the correct `'api-docs'`.

5. **Genuinely broken link:** `marketing-data.js:372` pointed a card at `/api`, which is not an
   HTML route (it hits the `/api/*` proxy in production).

6. **`/pages/<slug>.html` always rendered a client-side 404.** That URL is publicly reachable
   (Netlify static + `express.static`); `SLUG` resolved to `pages/qr-menu.html`, missed the
   registry, printed "404 Sayfa bulunamadı" and returned before the footer rendered.

7. **`/yonetici-girisi` and `/restoran-girisi` 404'd in production** — Express routes existed
   (`server.js:2978`), `_redirects` had no rule.

8. **Social preview was broken on all 47 pages.** `og:image` pointed at
   `/icons/placeholder-logo.svg` — the *orange* tenant-default logo, in SVG (unsupported by every
   major platform), via a root-relative URL (rejected by crawlers).

9. **Horizontal scroll on the auth pages (320-375px).** Google's `renderButton` takes a fixed pixel
   width; the hardcoded 320/340 needed 376px inside a card with 56px padding. `.shell` is a grid
   item with the default `min-width:auto`, so it could not shrink either.

## What changed

### New: `public.css` (single shared public stylesheet)
Derived from `marketing.html`'s block (the more-correct of the two copies — it already carried the
section-padding fix, centred `.b-head`, and the step/FAQ/table component updates that the 45 pages
never received), then corrected further:

- accent → `#387AFF` / `56,122,255` in **both** themes; `.btn-primary` → blue pill (dark + mono)
- `section.block{padding-top:64px;padding-bottom:64px}` + `@media(max-width:760px)` → 44px
  (user-approved middle ground; longhand only — a `padding` shorthand must never be used on an
  element that also carries `.wrap`)
- removed `body::before`, which hardcoded `rgba(216,184,119,…)` and would have survived the token
  swap (landing has no ambient glow in either theme)
- `h1,h2,h3` line-height 1.1 → 1.08, plus `overflow-wrap:break-word` as a safety net for long
  Turkish compounds ("Restoranınızı") that cannot fit a 320px screen at heading sizes
- **new `@media (max-width:400px)` nav block** — after the ≤620px rules hide both CTAs the bar still
  needed ~324px against ~310px available; the compact TR/EN pill is dropped there (the footer keeps
  a full "Türkçe / English" switcher) and the remaining controls tighten
- **focus states added** (`:focus-visible` on buttons, nav links, footer links, FAQ summaries) —
  the public site previously had **zero** focus rules anywhere

The embedded `<style>` block in all 46 files was replaced with
`<link rel="stylesheet" href="/public.css">`, removing **~981 KB / 14,868 lines** of duplication.

**`landing.html`'s own CSS was deliberately left intact** — it is the design reference. Its only
changes are the 3-line `overflow-wrap` safety net and the new pricing card (below).

### Navigation
- footer registry `'api'` → `'api-docs'` (46 files); `/api` → `/api-docs` (`marketing-data.js:372`)
- `SLUG` derivation now strips a `pages/` prefix and `.html` suffix, so the directly-reachable
  `/pages/<slug>.html` URL renders the real page instead of a 404
- `_redirects`: added `/yonetici-girisi` and `/restoran-girisi`
- `og:image` → absolute `https://hasacaplatform.netlify.app/logo.png` (the current black/white
  layered mark; byte-identical to `icons/icon-512.png`) on 46 files; `marketing.html` had none, added

### Auth pages
- `.shell{min-width:0}` (grid items default to `min-width:auto` and could not shrink)
- new `googleBtnWidth()` helper measures the real container and clamps to Google's supported range,
  replacing the hardcoded 320/340
- tokens aligned to the shared system: `--bg` `#000000`→`#0a0a0b`, `--bg-2` `#0a0a0a`→`#0e0e11`,
  `--text` `#ffffff`→`#f4f4f6`, `--text-dim` `#909095`→`#a6a6b0`, `--text-mute` `#6b6b70`→`#6c6c78`,
  `--radius` `26px`→`22px`; login's `.btn` padding `14px 24px`→`13px 24px`
  (`restoran-olustur.html` has no `.btn` rule at all, so only the tokens changed there)

### Landing pricing — third card (user request)
`PLANS` gained the **Başlangıç / Starter (₺0)** tier as its first entry, matching the
`/fiyatlandirma` page's own plan block field-for-field. New i18n keys `p_start`, `p_start_d`,
`pf_unlimited`, `pf_single_table`, `pf_email_support` (TR + EN). No CSS change was needed —
`.price-grid` was already `repeat(3,1fr)` and `.plan .btn{margin-top:auto}` already existed.

## A mistake I made and corrected
I first "unified" the nav pill to landing's `max-width:1040px`, dismissing marketing.html's comment
about needing a wider pill — I had compared marketing vs pages (identical) instead of vs **landing**.
Measurement proved the comment right: this nav carries five right-side items (theme, TR/EN, two
CTAs, hamburger) where landing carries three, needing ~1225px. Reverted to `var(--maxw)` with the
tuned gaps and rewrote the comment with the measured numbers. Side effect: this revealed that
`pages/*.html` had been overflowing at 1040px **all along** — a real pre-existing bug now fixed.

## Verification (measured, not eyeballed)
- **Routes:** all 45 marketing slugs + `/landing` `/giris` `/restoran-olustur` `/login` `/hasaca`
  `/ai-ile-baslayin` `/yonetici-girisi` `/restoran-girisi` → **200**, all link `public.css`, none
  retain a `<style>` block. Registry keys ↔ routes ↔ `pages/` files = **45/45/45, zero orphans**.
- **Links:** 54 distinct internal destinations extracted from static markup *and* the JS
  footer/feature registries; 51 real destinations all resolve with real content. (3 were regex false
  positives: `/${s}` is a template literal, `/ay` and `/mo` are price-period labels.)
- **Responsive:** 320/360/375/390/430/768/1024/1280/1440/1920 across 16 pages covering every block
  type — **zero horizontal overflow**. Note the iframe harness measures against a 10px-narrower
  viewport than a real device (classic scrollbar), so results are stricter than reality.
- **Tokens:** `--gold`/`--bg`/`--text`/`--radius` and `.btn-primary` background verified **identical**
  across landing, marketing and both auth pages, in **both** themes.
- **Landing intact:** `git diff` shows +15/−3 lines only (safety net + third plan card); no CSS
  values changed.
- **No business-logic regression:** `git diff backend/` is **empty**.
- Console: zero errors on the checked pages.

## Files changed
52 files, **+447 / −15,315**. New: `public.css`. Untouched by design: `backend/**`, `admin.html`,
`root.html`, `index.html`, `panel.css`.

## Known / deliberately left
- **`/gizlilik-politikasi` and `/kvkk-aydinlatma-metni`** work on Netlify (200 rewrites) but 404 in
  Express, which has no such routes. Low impact (canonical points at the real slug); out of scope.
- **Landing shows Kurumsal as ₺1499 while `/fiyatlandirma` shows "Özel / Custom"** — a pre-existing
  content inconsistency. Not changed: pricing is a business decision, not a UI fix.
- `style.css` (67 KB) is referenced by **no** public page — confirmed dead, but deletion was left to
  a separate task rather than removed speculatively.
- No real designed OG image was produced; the existing logo PNG is used.
- The auth pages keep their own components (centred glass card, ambient blobs, `:disabled` state) —
  only their tokens were aligned.

## Recommended next phase
Delete the confirmed-dead `style.css`; add the two legacy aliases to Express for parity with
Netlify; decide the Kurumsal price wording so landing and `/fiyatlandirma` agree; consider a real
1200×630 OG image.

## Push
Not committed or pushed — the standing rule is that push waits for explicit approval.
