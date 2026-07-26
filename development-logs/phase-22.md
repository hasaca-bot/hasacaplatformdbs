# Phase 22 — HASACA Landing Page (premium SaaS marketing site) + Root "Landing Messages"

**Status:** ✅ Completed & verified
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Give the platform a public **marketing website** — a premium, dark-luxury SaaS landing page in the
Stripe / Linear / Vercel / Framer register — that sells HASACA to restaurant owners, plus a
**database-backed contact system** whose leads land in the Root Panel. Reference-*inspired* only
(spacing, hierarchy, glass, lighting, dark luxury); layout, copy and graphics are original.
Hard constraint: **extend** the existing Express app, never replace the restaurant site.

## What was done

### New marketing page — `landing.html`
Self-contained single page following the existing 3-page pattern (embedded `<style>` + `<script>` +
TR/EN `i18nData` + `data-i18n` + `applyLanguage`). **Zero external assets** — every device mockup,
"screenshot" and icon is CSS + inline SVG, so the page is fast, offline-safe and dependency-free.

Sections: sticky glass navbar → cinematic hero (huge headline + dual CTA + floating laptop/phone
device cluster with live-looking dashboard, QR menu and floating chips) → animated trust counters +
logo strip → 3 alternating platform showcases (Website & QR / Management & Kitchen / AI & Analytics)
with CSS mockups (stat tiles, bar chart, kanban kitchen board, AI chat) → 16-card glass feature grid
with hover-lift → 6-step timeline → HASACA-vs-marketplace comparison table → animated stat cards →
testimonial carousel (scroll-snap) → 3 pricing plans (Professional highlighted) → FAQ accordion →
contact form → enterprise multi-column footer.

Design system: near-monochrome dark luxury (`--bg:#0a0a0b`, charcoal surfaces, `--gold:#d8b877`
accent), glassmorphism, large radii, soft shadows, ambient radial glows, metallic "shine" gradient
text. Samsung Sharp Sans via the same `@font-face` + `--font-primary` config as the rest of the app.

SEO head: title, description, keywords, canonical, full OpenGraph, Twitter cards, and
`SoftwareApplication` + `Organization` JSON-LD.

Motion: IntersectionObserver reveal-on-scroll + count-up counters, 120–180ms transitions,
`prefers-reduced-motion` respected.

### Routing — `backend/server.js`
- `app.get(['/landing','/hasaca'])` → `landing.html`, registered beside the existing page routes
  (before `express.static`). **`/` still serves the restaurant `index.html`** — tenant resolution,
  static serving and the `*` fallback are untouched.

### Public lead capture — `backend/server.js`
- `POST /api/landing/contact` (no auth, public form). Requires name + valid email + message;
  every field length-capped; captures IP; inserts a `landing_messages` row (`unread`) and fires
  `logActivity({action:'landing_message'})`. Returns 400 `invalid_input` with a per-field map.

### DB — `backend/db.js`
- New `landing_messages` table via the same `CREATE TABLE IF NOT EXISTS` auto-migration pattern as
  `activity_log`, in the shared (SQLite + PG) section:
  `id, name, restaurant, email, phone, country, message, status('unread'), ip, created_at`
  + `idx_landing_status`, `idx_landing_created`. No existing table touched.

### Root API — `backend/routes/root.js` (all behind `rootAuth`)
Reuses the `GET /activity` filter/paginate idiom and the `P(n)` param helper:
- `GET /landing-messages?status=&q=&limit=&offset=` → `{items, total, unread, limit, offset}`
  (`q` searches name/restaurant/email; shared `landingFilter()` builds WHERE for list/count/CSV).
- `POST /landing-messages/:id/status` `{status:'unread'|'read'|'archived'}` → 400 on bad status,
  404 on unknown id, `logActivity`.
- `DELETE /landing-messages/:id` → 404 when absent, `logActivity`.
- `GET /landing-messages/export.csv` → UTF-8 BOM CSV (Excel-safe Turkish chars), honours filters.

### Root Panel UI — `root.html`
- Topbar **"Landing Mesajları"** button with a live unread badge (`.lbadge`), populated on panel
  load by `refreshLandingBadge()`.
- `#landingOverlay` modal reusing the existing modal + `.tbl` + `T()` i18n pattern: status filter,
  search, total/unread counter, CSV export, table (Tarih · Restoran · Ad · İletişim · Durum ·
  actions), unread rows visually emphasised, and a detail panel (full message + `mailto:` link + IP)
  that **auto-marks the lead read**. Functions: `openLandingModal`, `landingQuery`,
  `loadLandingMessages`, `viewLandingMessage`, `setLandingStatus`, `deleteLandingMessage`,
  `exportLandingCsv`. Full TR + EN i18n keys.

## Files modified / added
- **NEW** `landing.html`
- `backend/server.js` (landing route + `POST /api/landing/contact`)
- `backend/db.js` (`landing_messages` migration + indexes)
- `backend/routes/root.js` (`landingFilter` + 4 landing-message endpoints)
- `root.html` (topbar button + badge CSS, modal, JS, TR/EN i18n)
- `.claude/launch.json` (added a `hasaca-fork` dev-server entry)

## DB / API changes
- **DB:** new `landing_messages` table + 2 indexes (auto-migration, additive only).
- **API:** `GET /landing`, `GET /hasaca`, `POST /api/landing/contact` (public);
  `GET/POST/DELETE /api/root/landing-messages*` + `export.csv` (rootAuth).

## Verification (fork @ localhost:17888) — all passed
- **Existing site intact:** `/`, `/admin.html`, `/root`, `/robots.txt`, `/sitemap.xml`,
  `/manifest.json`, `/service-worker.js`, `/api/products|categories|site-config` all 200; `/` still
  renders the restaurant site (11 products, 90 menu markers); Phase 21 SEO still correct;
  **0 `dayikatik` leaks**. 0 console errors on index and root.
- **Migration:** fresh boot created the table cleanly; columns + both indexes present; existing data
  untouched (22 products, 2 tenants, 22 activity rows).
- **Contact API:** valid → 201 + row stored; bad email → 400; missing name → 400; empty body → 400.
- **Real browser submit:** filled and submitted the actual form → success toast, form cleared, row in
  DB with Turkish characters preserved (`Türkiye`), `logActivity` entry written.
- **Root API:** no token → 401; list/total/unread correct; search `q=Kahve` → 1; status filter works;
  mark-read and archive persist; bad status → 400; unknown id → 404; delete → 404 on repeat;
  CSV returns correct headers + BOM + rows. Full audit trail confirmed in `activity_log`.
- **Root UI:** badge auto-shows 2 unread; modal lists leads with tr-TR dates; detail panel opens and
  auto-marks read (badge 2→1); search, status filters and empty state all correct; TR↔EN toggle
  translates every label; Activity / Analytics / Health modals still work; 0 console errors.
- **Responsive:** 1920 / 1440 / 1280 / 1024 / 768 / 390 / 360 → **0 horizontal overflow** at every
  width. Testimonial carousel scrolls inside its own container (page never scrolls sideways).

## Bugs found & fixed during this phase
1. **Hero laptop shifted 184px off-screen** — the shared `floaty` keyframes animated `transform`,
   overriding the laptop's centring `translate(-50%,-50%)`. Fixed with dedicated `floaty-center`
   keyframes that carry the centring; caused real page overflow at ≥1024px.
2. **Nav overflowed at 768px** — nav collapsed only at 760px. Split the nav collapse into its own
   `max-width:900px` query.
3. **Nav overflowed at ~390–478px** — brand + lang + CTA + hamburger too wide. Below 620px the CTA
   moves into the collapsed menu (`.nav-cta-mobile`) and the brand/lang shrink.
4. **Content could be trapped at `opacity:0`** — reveal animations depended entirely on JS. Now gated
   behind a `.js-anim` class set by an inline `<head>` script (no JS → fully visible), plus an
   `IntersectionObserver` feature check and a 3s `revealAll()` safety net.

## Known issues / notes
- CSS transitions are frozen while the preview tab is `visibilityState:"hidden"`, so reveal
  animations can't be screenshotted here — verified instead via DOM assertions (class applied, fresh
  probe computes `opacity:1`) plus the safety net. Not a code defect.
- The landing page is served at `/landing`; making it the apex/marketing-domain root (while tenant
  subdomains keep the restaurant site) is a deployment follow-up.
- Stats, testimonials and pricing figures are placeholder marketing content — swap for real numbers
  before going public.
- Root-only inbox; there's no reply-from-panel flow (the detail panel offers a `mailto:` link).

## Next phase
Phase 23 — **full Admin/Root Panel UI/UX redesign** (sidebar + workspace shell, design tokens,
black/white/system themes, icon system, table/form redesign). UI only: no changes to DB, auth,
permissions, API routes, business logic or tenant isolation.
