# Phase 23 — Marketing site expansion: 45 pages, dedicated login, enterprise footer

**Status:** ✅ Completed & verified
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Turn the single landing page into a complete marketing website: a real page behind **every**
navigation item, footer link and CTA (nothing pointing at `#`), a dedicated professional login page,
and a full enterprise footer — all in the same premium black & white design language.

## Architecture decision (important)
45 hand-written HTML files would have forked the design system 45 ways and been unmaintainable.
Instead:

- **`marketing-data.js`** — a UMD content registry (works in Node **and** the browser) holding every
  page as `{slug, title, desc, blocks}`. All copy is `[tr, en]` pairs. Factory helpers (`product()`,
  `legal()`) generate the repetitive page shapes.
- **`marketing.html`** — one shared shell that renders any page from the registry via a small block
  vocabulary: `hero, cards, prose, steps, faq, stats, table, plans, posts, timeline, status, code,
  form, cta`.
- **`backend/server.js`** — registers a route per slug and **injects per-page meta server-side**
  (`<!--HEAD-->` placeholder), so each URL is genuinely crawlable rather than a client-side shim.

Result: adding a page = one registry entry. It automatically gets a route, a footer slot, a sitemap
entry and correct SEO — with **no hardcoded link lists anywhere**.

## Pages created (45 + 4 auth routes = 49)
- **Products (14):** qr-menu, online-siparis, rezervasyon, garson-cagirma, mutfak-ekrani,
  masa-yonetimi, paket-servis, analitik, coklu-sube, tema-sistemi, white-label, seo,
  bildirim-sistemi, yapay-zeka
- **Core (6):** ozellikler, cozumler, fiyatlandirma, neden-hasaca, karsilastirma, entegrasyonlar
- **Company (6):** hakkimizda, kariyer, referanslar, basari-hikayeleri, partner-programi, bayilik
- **Resources (5):** dokumantasyon, api, blog, yol-haritasi, surum-notlari
- **Support (4):** destek, yardim, sss, durum
- **Forms (4):** demo-talep, teklif-al, satis-ekibi, iletisim
- **Legal (6):** guvenlik, gizlilik, kvkk, cerez-politikasi, kullanim-sartlari, hizmet-sozlesmesi
- **Auth (4 routes → login.html):** /giris, /yonetici-girisi, /restoran-girisi, /root-girisi

## Login page — `login.html`
Matches the landing design language: glass card, **animated ambient background** (drifting blurred
orbs + masked grid), large spacing, premium typography, black & white theme.
Includes: Restoran / Root Panel tabs (`/root-girisi` auto-selects Root), username + password with
show/hide toggle, **Remember Me**, **Forgot Password**, **Back to Website**, a **secure-login notice**,
TR/EN switch, and links to Destek / Gizlilik / Kullanım Şartları / Demo.

**Authentication itself was NOT modified** — the page posts to the existing `POST /api/auth/login`
and stores the existing token keys, then redirects to `/root` or `/admin.html` by role. A guard
blocks non-root accounts from the Root tab (no token is written when blocked).

## Landing page rewiring — `landing.html`
- Nav → `/ozellikler`, `/cozumler`, `/fiyatlandirma`, `/dokumantasyon`, `/iletisim` + `Yönetici Girişi`.
- Hero CTAs → `/demo-talep` and `/ozellikler`; showcase CTA → `/qr-menu`;
  pricing CTAs → `/demo-talep` (Enterprise → `/satis-ekibi`).
- All 16 feature cards are now links to their product pages.
- Footer replaced with the 8-column enterprise footer rendered from the shared registry.
- **All 7 `href="#"` links removed** (4 social + 3 legal).

## Files modified / added
- **NEW** `marketing-data.js` (registry), `marketing.html` (shell), `login.html` (auth page)
- `backend/server.js` — marketing routes + per-slug meta injection, auth page routes, sitemap now
  includes `/landing` + all 45 marketing URLs
- `landing.html` — nav/CTA/footer rewiring, registry-driven footer, feature-card links
- `admin.html`, `root.html` — token getters now fall back to `sessionStorage` (see below)

## DB / API changes
**None.** No schema change, no new endpoint. The four marketing forms reuse the existing
`POST /api/landing/contact` and tag the lead in its message (`[Demo Talebi]`, `[Teklif Talebi]`,
`[Satış Görüşmesi]`, `[İletişim]`) so everything still lands in one Root inbox.

## Verification (fork @ localhost:17888) — all passed
- **Routes:** 49/49 new routes return 200.
- **No dead links:** landing = 0 `href="#"`, 47 internal links, **0 broken**; marketing page = 48
  internal links, **0 broken** (each fetched and status-checked in the browser).
- **Per-page SEO:** title / description / canonical / OG / Twitter verified distinct per slug
  (fiyatlandirma, qr-menu, kvkk, api). Login page is `noindex,nofollow`.
- **Sitemap:** 47 URLs, host-derived, **0 domain leaks**.
- **Login flow:** empty → client validation (2 fields flagged, no network); wrong password → 401 →
  "hatalı"; tenant creds on Root tab → blocked, **no token written**; tenant login (Remember Me off)
  → `sessionStorage` only; root login (Remember Me on) → `localStorage`, redirect to `/root`, panel
  loads with 2 tenant cards and 0 console errors.
- **Forms:** `/demo-talep` submitted for real → 201, stored in `landing_messages` with Turkish
  characters intact (`Şehir Lokantası`) and tagged `[Demo Talebi]`.
- **Existing architecture untouched:** `/`, `/landing`, `/hasaca`, `/root`, `/admin.html`,
  `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/service-worker.js`, `/api/products`,
  `/api/categories`, `/api/site-config` all 200; `/` still serves the restaurant site;
  `POST /api/auth/login` still returns a token and still 401s on a bad password;
  `/api/root/tenants` still 401s without a token.
- **Responsive:** 1920 / 1440 / 1280 / 768 / 360 → **0 horizontal overflow** on landing, marketing
  and form pages.
- **TR/EN:** toggling switches nav, hero, body copy, breadcrumb and footer on every page type.
- **0 console errors** on landing, marketing pages, login page and Root Panel.

## Bugs found & fixed during this phase
1. **"Remember Me" would have broken login** — `admin.html`/`root.html` read tokens from
   `localStorage` only, so an unchecked Remember Me (which writes to `sessionStorage`) would have
   bounced the user straight back to the login page. Both getters now fall back to `sessionStorage`,
   and the setters clear both. This is session persistence, not auth logic — token issuing and
   validation are unchanged.
2. **Nav overflow at 1280px** — 6 nav links + 2 buttons + language switch exceeded the container.
   Trimmed the nav and moved the collapse breakpoint from 900px to 1080px.
3. **Nav overflow at ~360–430px** — only the primary button was hidden below 620px. Now **both**
   nav buttons collapse into the mobile menu, which gained a "Ücretsiz Demo" entry alongside login.
4. **Footer grid could not hold 8 groups** — was a fixed 5-column grid. Both footers now use
   `auto-fit` columns (landing nests them beside the brand; marketing gives the brand its own row).

## Known issues / notes
- Marketing pages are served at root-level slugs on every host, including tenant subdomains.
  Restricting them to the marketing/apex domain is a deployment concern, noted for later.
- Blog posts, careers roles, testimonials, stats and pricing figures are placeholder marketing
  content — replace with real data before going public.
- Blog/careers entries are list items only; individual article/role detail pages are not built.
- "Şifremi unuttum" links to `/destek` — there is no self-service password-reset flow yet (Root
  resets tenant passwords from the panel).

## Next phase
Phase 24 — **Admin + Root Panel UI/UX redesign** (sidebar + workspace shell, centralized design
tokens, Black/White/System themes, unified components, redesigned tables/forms/dashboard, mobile
drawer). UI only: no changes to DB, auth, permissions, API routes, business logic or tenant isolation.
