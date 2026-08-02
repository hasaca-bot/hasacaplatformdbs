# Phase 49 — Admin logo badge adapts to white theme, landing page loses fake testimonials/brand logos, flat-black dark mode, last unconverted icon fixed, real pricing feature lists

## Why
Follow-up polish requests after Phase 48 shipped: the admin panel's sidebar logo badge still looked
dark-mode-only in the white theme; the landing page's "Referanslar" section quoted fake customer reviews
with made-up brand names (Bistro Co, Kahve Lab, etc.) that could be mistaken for real testimonials; the
default dark theme's background had faint ambient color glows the user wanted removed for a flat black;
one icon badge on the landing page was never converted for the monochrome theme; and the pricing cards
needed their real, final feature lists (visual copy only — no billing/payment logic was requested).

## 1. Admin/root sidebar logo badge — genuine bug, not adapting to light theme
`#adminPanelOverlay .side-brand .mark` (admin.html) and the identical `.side-brand .mark` in the shared
`panel.css` (root.html) both had a permanently dark badge background
(`linear-gradient(150deg,#2a2a30,#0c0c0e)`) with no light-theme override at all — only the icon's own
`color` changes with theme (via panel.css's existing `.mark{color:var(--text)}` rule), so switching to
the white theme left a dark badge with a now-dark icon on top of it, unreadable. Added a
`html[data-theme="light"] #adminPanelOverlay .side-brand .mark` override in admin.html (light gray badge
`#eceef2`, dark icon `#15171c`) and the equivalent `:root[data-theme="light"] .side-brand .mark` in
panel.css, matching the light-badge treatment already used elsewhere (`.brand .mark` on landing.html,
`.step .num`, etc.). Verified live: dark theme keeps its original dark badge + white icon byte-for-byte;
light theme now shows a light badge + dark icon with real contrast.

## 2. Landing page — testimonials + fake client-logo strip removed entirely
Removed the "Referanslar" section (four fabricated customer quotes attributed to fictional brands: Bistro
Co, UrbanEats, Kahve Lab, Anadolu Sofra) and the "Trust" section's fake client-logo strip (six more made-up
restaurant names) — both could read as real social proof HASACA doesn't actually have yet. Deleted the
`TESTI` array, `renderTesti()`/`scrollTesti()` functions and their call sites, the `tst-track`/`tst-dots`/
`.logos`/`.lg` CSS, and every related i18n key (`ts_eyebrow`, `ts_title`, `t1`-`t4`, `t1_role`-`t4_role`)
in both TR and EN. The numeric usage counters (500+ restaurants, 150K+ orders, etc.) were left alone — the
request was specifically about fabricated quotes/reviews and brand names, not the stat counters.

## 3. Landing page — dark theme background is now flat black, no ambient glows
`body::before` was a fixed full-viewport overlay with three radial gradients (a gold glow top-right, a
blue-ish glow top-left, a white glow at the bottom) layered over the base `--bg` color in the default dark
theme. Removed the pseudo-element entirely (and the now-pointless `html.theme-mono body::before{opacity:.3}`
companion rule from the earlier white-theme pass) — the page background is now exactly `var(--bg)` with
nothing layered on top, in both themes. Verified live: `getComputedStyle(body,'::before').backgroundImage`
is `'none'` in both dark and mono theme, `body`'s own background is the flat `rgb(10,10,11)` in dark.

## 4. Landing page — one real leftover unconverted icon badge found and fixed
An exhaustive computed-style scan across every element on the page (color/background/fill/stroke/
box-shadow, in mono theme) found exactly one spot still hardcoded outside the token system:
`.feat .fi` — the icon badge on the 16-card feature grid — had a permanently dark badge
(`linear-gradient(150deg,#232329,#0e0e11)`, `color:#e6e6ea`) with no mono-theme override, the same class
of miss as the admin logo badge above. Added `html.theme-mono .feat .fi{ background:linear-gradient(150deg,
#f0f0f2,#e2e2e6); color:#0a0a0b; }`, matching the light-badge pattern used everywhere else. Verified live in
both themes; nothing else on the page matched an "unconverted warm color" scan.

## 5. Pricing — real final feature lists (display copy only, no billing logic)
Replaced both plans' feature lists and Kurumsal's price with the user's exact final copy:
- **Profesyonel (₺749/ay)**: QR Menü, Masa Siparişi, Online Sipariş, Rezervasyon Sistemi, Mutfak Ekranı,
  Garson Çağırma, Hesap İsteme, Analitik Panel, Bildirim Gönderme, SEO Altyapısı, Tema Motoru, Çoklu Dil,
  Özel Alan Adı. Trial note unchanged from Phase 48 ("İlk 14 gün ücretsiz").
- **Kurumsal**: price changed from "Özel"/"Satışla Görüş" (contact-sales placeholder) to a real **₺1499/ay**
  — since it's now a normal priced tier, its CTA was unified with Professional's ("Ücretsiz Dene" →
  `/giris`), removing the old `p_cta_ent`/`/satis-ekibi` special-case branch (which also happened to have a
  pre-existing dead-link typo, `\satis-ekibi` instead of `/satis-ekibi`, moot now that the branch is gone).
  Feature list: "Profesyonel'deki her şey +" then AI Asistan, White Label (HASACA logosuz), Rol Yönetimi,
  Çoklu Şube Yönetimi, Teslimat Modülü, Gelişmiş Analitik, Öncelikli Destek, API Entegrasyonları, Özel
  Başarı Danışmanı, SLA Garantisi.
All old/dead `pf_*` i18n keys tied to the removed Starter plan (`pf_menu`, `pf_1table`, `pf_email`,
`pf_all_start`) and the old combined `pf_orders` key were replaced with the new granular set. Purely
visual/copy — no payment or subscription-tier enforcement logic was added, per explicit instruction.

## Files changed
- `admin.html` — light-theme override for `.side-brand .mark` (logo badge background + icon color).
- `panel.css` — same light-theme override, shared with root.html.
- `landing.html` — removed testimonials section + fake client-logo strip (HTML/CSS/JS/i18n); removed
  `body::before` ambient glow gradients; added a mono-theme override for `.feat .fi`; rewrote `PLANS`'
  feature lists + Kurumsal's price/CTA; replaced the stale `pf_*` i18n key set with the new one (TR+EN).
