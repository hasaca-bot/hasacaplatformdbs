# HASACA Platform — Development Status

> Living status doc. Any AI/dev can resume by reading this + the phase files in `/development-logs`.
> Release changelog lives in `README.md` (§ DEĞİŞİKLİK GÜNLÜĞÜ). This folder tracks in-progress phased work.

**Last updated:** 2026-08-01 (after Phase 39)

> A living **AI-CONTEXT.txt** hand-off file is maintained in this folder (overwritten every phase).

> **Workspace:** active work happens in **`C:\Users\hasan_y4hfwna\Desktop\saas proje`**, which is
> the git checkout of `github.com/hasaca-bot/hasacaplatformdbs` (branch `main`) and the single source
> of truth. Local dev runs on **port 17888**. The old `hasaca-platform` fork is stale and unused.
> Production = Netlify (static) + Render (API) + Neon (Postgres).

## Overall progress: ~76% of the new multi-wave scope (Wave 5/6 in progress)

## Architecture summary
Multi-tenant restaurant SaaS. Node.js + Express (`backend/server.js`), dual DB layer (`backend/db.js`: PostgreSQL when `DATABASE_URL` set, else SQLite). Frontend = 6 static pages, no bundler: `index.html` (a tenant's restaurant site — served at `/` only on a real tenant subdomain, or via `/tenant/:slug` in dev; see P31), `admin.html` (tenant admin, tabbed — also `/admin`), `root.html` (platform owner — redesigned Phase 24 — also `/root`), `landing.html` (HASACA marketing home — **now the default `/`** on the bare host as of P31; also `/landing`), `marketing.html` (shared shell rendering all 45 marketing sub-pages from `marketing-data.js`), `login.html` (`/login`, `/giris`, `/root-girisi`). `panel.css` = shared design-token system + Black/White/System themes + desktop shell (linked by `root.html`; `admin.html` next). Auth = username + scrypt hash + HMAC token (`lib/auth.js`). Tenant resolution from subdomain (`lib/tenant.js`). SSE realtime (`lib/events.js`). Root API + tenant generation (`routes/root.js`), QR tables (`routes/tables.js`). Port **12999** (original) / **17888** (this fork). i18n = per-page `i18nData` (TR/EN) + `data-i18n` + `applyLanguage`.

## Completed (previous work)
- Phase A: Real multi-tenancy + username/password auth
- Phase B: Root panel + automatic tenant generation
- Phase C: QR table ordering (management, dine-in, live tracking, floor view)
- Phase D: Local dev env + START ADMIN.bat + docs
- Phase E: White-label branding + "My Restaurant" master template (default tenant is cloned for new tenants); Root-editable platform branding

## Completed earlier this session (pre-fork, ported into the fork)
- P01 brand text/logo/favicon fixes · P02 PWA disabled (re-enableable) · P03 image upload everywhere.

## Current phased effort (new multi-wave plan)
| Phase | Wave | Title | Status |
|-------|------|-------|--------|
| 00 | 0 | Fork to `hasaca-platform` @ port 17888 | ✅ DONE |
| 04 | 1 | Complete white-label cleanup (index+admin+seed+DB) | ✅ DONE |
| 05 | 1 | Floating-action overlap + z-index system | ✅ DONE |
| 06 | 1 | Fix blank Tenant-Admin after login + header rendering | ✅ DONE |
| 07 | 1 | Responsive / overflow audit + custom scrollbar (all pages) | ✅ DONE |
| 12 | 4 | Delete any tenant (incl. default) + auto-regenerate default | ✅ DONE |
| 13 | 4 | Root-editable per-tenant Contact & Social settings | ✅ DONE |
| 14 | 4 | Emoji → professional icon / plain-text sweep | ✅ DONE |
| 15 | 4 | Theme engine (warm default + Black & White) + Root theme selector | ✅ DONE* |
| 16 | 4 | Platform Health Dashboard (cloud-safe) | ✅ DONE |
| 17 | 4 | Activity Log (tenant-isolated audit trail) | ✅ DONE |
| 18 | 4 | Restaurant Analytics (tenant + platform aggregate) | ✅ DONE |
| 19 | 4 | Global custom font (Samsung Sharp Sans) + AI-CONTEXT.txt | ✅ DONE |
| 20 | 4 | Tenant-isolated push + Root Notification Center + push-only SW | ✅ DONE |
| 21 | 4 | SEO Management Center (per-tenant meta + dynamic robots/sitemap) | ✅ DONE |
| 22 | 5 | HASACA landing page (marketing site) + Root Landing Messages inbox | ✅ DONE |
| 23 | 5 | Marketing site: 45 pages + login page + enterprise footer (0 dead links) | ✅ DONE |
| 24 | 5 | Root Panel redesign (panel.css tokens, sidebar shell, dashboard, B/W/System themes) | ✅ DONE |
| 25 | 5 | Tenant Admin Panel redesign — sidebar shell replaces horizontal tabs; --ap-* tokens; dashboard/analytics; real logout | ✅ DONE (revised) |
| 25.2 | 5 | Remove all legacy orange/brown from admin.html (html.admin-page token neutralization, category modal, notif preview dynamic) | ✅ DONE |
| 26 | 6 | Gemini AI Setup Assistant backend (/api/root/ai-settings + /test) — Root AI modal now functional | ✅ DONE |
| 27 | 6 | In-shell Category/Product forms + AI Assistant (plan/execute, Root + Tenant) | ✅ DONE |
| 28 | 6 | Widget Management (tenant/root widget on-off, settings.widgets, new tenant self-service endpoint) | ✅ DONE |
| 29 | 6 | QR Designer (color/margin/ECC via settings.qr_style, tenant self-service) | ✅ DONE |
| 30 | 6 | Root AI Assistant: tenant-targeted menu editing (target selector + scoped plan/execute) | ✅ DONE |
| 31 | 6 | Root routing: "/" is host-aware — HASACA landing page on the bare host, tenant sites unchanged on real subdomains, `/tenant/:slug` + `/admin` + `/login` aliases | ✅ DONE |
| 32 | 4 | Zero legacy orange platform-wide — B&W theme tokenised (index.html + admin.html), root.html dead-code fixed, seeded demo display_name genericised, unused legacy files deleted (user instruction) | ✅ DONE |
| 33 | 7 | Production Deployment (Netlify + Render + Neon), Netlify Root Routing & SVG Logo Branding | ✅ DONE |
| 34 | 10 | Production Fixes: Tenant Impersonation, Netlify 45 Marketing Sub-pages, Root Pwd Sync & SVG Logo | ✅ DONE |
| 35 | 10 | Production hotfixes (QR-ordering SyntaxError, recursive storage guards, admin login modal, single-domain tenant login, single sign-in page) + Hero Image Management & plain-text Hero editor | ✅ DONE |
| 36 | 10 | Tenant-less `/admin`/bare-site routes no longer fall back to the `'default'` tenant; `'default'` is now a fully normal, deletable tenant like any other (Root panel + QR URL symmetry) | ✅ DONE |
| 37 | 10 | Monochrome rebrand shipped (was held back); Root dashboard "Son Aktivite" replaced with an interactive analytics chart (vanilla SVG, no dependency); contrast bug found+fixed | ✅ DONE |
| 38 | 10 | AI Assistant swapped from Gemini to Groq — Gemini's real generation quota needs billing linked even for the "free tier" and the user has no card; Groq needs none. Same plan/execute contract, only the HTTP call changed. Same-phase addendum: Admin panel dashboard "Son Aktivite" → analytics chart, same treatment as Root panel (Phase 37), verified on two real tenants | ✅ DONE — real Groq generation confirmed against production, deployed |
| 39 | 10 | Root panel AI Assistant redesigned as a real chat UI (transcript, typing indicator, inline plan bubbles with confirm/cancel-in-place). Found+fixed a real bug while testing: the plan endpoint can return HTTP 200 with a real error, which the old (and my first-draft new) code silently mislabeled as "no actionable change" | ✅ DONE (Confirm→Execute path verified by code review + local UI test; live click-through with a real key pending deploy) |


| 32+ | 5 | Backlog: fast-follows only (menu-generation wizard; QR logos/frames; widget permission tier; `/register` decision; unused legacy files flagged) | ⏭️ NEXT |

*P15: engine + per-tenant theme + B&W complete. The `.pax-btn` residual noted here was fixed by P25.2
(`!important` overrides); P32 finished the job — tokenised the ~90 remaining hardcoded warm literals
across index.html + admin.html so B&W is now verified genuinely orange-free (0 hits, was 106).
Default/light themes unaffected (byte-identical before/after, verified via computed-style fingerprint).

### Still open from the original wave plan
| Phase | Wave | Title | Status |
|-------|------|-------|--------|
| 08 | 2 | Dynamic content model + Tenant-Admin "Website Content" editor | 🟡 PARTIAL (P35 shipped hero images + hero text; other sections TODO) |
| 09 | 2 | Hide technical values from Tenant Admin | TODO |

> Old rows 10–14 were superseded: push/Notification Center shipped in P20, theme engine in P15,
> Contact & Social in P13, analytics in P18, Widget Mgmt in P28, QR Designer in P29.

## Known bugs (open)
- ~~Live QR order unverified~~ **RESOLVED**: verified end-to-end on production against table
  "Test2" — POST /api/orders returned 201, tracking card rendered, 0 console errors.
- `PLATFORM_ORIGIN` is not set on Render, so QR URLs rely on the Referer fallback. Existing
  printed QR codes still encode the old `hasaca-api.onrender.com` host (they work, but are
  unbranded and cold-start prone) and would need reprinting.
- **Hardcoded Telegram `BOT_TOKEN` in `index.html`**, in client-visible JS. Anyone can read it.
  Should be rotated and moved server-side.
- **`GET /api/root/boost-auditrest`** (`backend/routes/root.js`) inserts 650 fabricated orders on
  *every* call with no idempotency check, and mutates data from a `GET`. Showcase-only code.
- Phase 33/34 production work is documented in their phase files but was never folded into this
  status doc at the time; Phase 35 is the first entry to catch up.
- **Breaking change from Phase 36**: any QR code/bookmark printed for the `'default'` tenant that
  relied on the old bare-URL fallback now shows "Restaurant Not Found." Needs `?tenant=default`
  appended or reprinting from the admin panel.
- ~~Monochrome color pass not pushed~~ **RESOLVED (Phase 37)**: shipped, with a contrast bug it
  exposed found and fixed in the same phase.
- **User-reported, not yet reproduced**: hero image edits (Website Editor) not appearing updated
  locally. Full cycle (upload/reorder/remove/save/reload, admin + customer site) re-verified working
  via the actual admin UI in Phase 37 — could not reproduce. Needs exact repro steps.
- ~~AI Assistant reported not working~~ **RESOLVED (Phase 38)**: root cause was Gemini's real
  generation quota requiring billing linked to the key's Google Cloud project, which the user
  can't do (no credit card). Swapped the provider to Groq (genuinely free, no card ever). Two
  different Gemini keys and one Groq key were pasted in chat during diagnosis — all must be
  treated as compromised/rotated; the user was told each time to enter credentials only in the
  Root panel's AI setup screen, never through chat. Real-key end-to-end generation not yet
  confirmed — verify once the user's Groq key is saved.
- ~~Admin panel dashboard chart~~ **RESOLVED (Phase 38 addendum)**: same treatment as Root panel
  (Phase 37), verified working on two real tenants (empty-state + real-data cases), 0 console
  errors.
- Root panel chatbot/AI Assistant UI modernization requested (align visually with current site UI) —
  not yet started, intentionally held until AI generation is confirmed working end-to-end.
- **Render deploy pending** for Phase 38's commits — pushed but not yet confirmed live at time of
  writing. Should complete on its own now that the health-check-path misconfiguration is fixed;
  worth a dashboard check if it's taking more than a few minutes.

## Credentials (dev fork)
- Root: `root` / `bunudabullan12A`. Tenant admin: `dayikatik` / `dayikatik123` (reset in P04).

## Resolved bugs
- default tenant `name`/`display_name` stale = "hasaca" → now self-healed on every boot (P01).
- placeholder logo was an unrecognizable dark "DEMO" circle → redesigned clean emblem (P01).
- leftover service worker served stale cached pages → SW disabled + auto-cleanup (P02).
- product images stored as base64 blobs in the DB → now uploaded as files, stored as URLs (P03).
- manual image URL inputs (root branding) → upload-only with preview (P03).
- blank Tenant-Admin after login → standalone admin now auth-gates via `openAdminLogin()`; startup
  loaders skip when unauthenticated (P06).
- new tenant `PUT /api/admin/site-widgets` (P28) returned success but the customer site didn't reflect
  the change → missing `invalidateTenantCache()` call after the write (the tenant resolver caches the
  row); fixed by adding the same call every other tenant-mutation route already uses.

## TODO / pending
- Residual branding cleanup in index.html + admin.html. (P04)
- Remove notification-send UI/API from tenant admin. (P05)
- Favicon = logo on admin/root pages too (customer page done). (P06)
- AI assistant (Gemini) — provider adapter + Root AI settings (P26), plan/execute for Root+Tenant (P27),
  Root tenant-targeted menu editing (P30) DONE. Still open: per-tenant menu-generation wizard (create
  products, not just edit); Root editing a tenant's *branding* by AI (P30 covers menu only — branding
  fields carry URL/email validation that the AI path would have to replicate).
- **Gemini quota:** the stored API key is real and authenticates, but its project has `limit: 0` on the
  free tier, so no AI call can return content yet. Enable billing/quota to exercise the assistants
  end-to-end. (Earlier logs called this a "fake key" — that was wrong; corrected in P30.)
- QR logos/frames on the generated code (P29 shipped color/margin/ECC only) — needs an image-
  compositing dependency (sharp/canvas), so it's a dependency decision, not a config tweak.
- Optional: tenant-side branding editor tab (logo/hero) — currently root-only.

## Important notes
- Gemini API key: store in `GEMINI_API_KEY` env or gitignored `data/ai_config.json`; NEVER commit or send to frontend.
- Category ids are global PRIMARY KEY → always tenant-suffixed (`starters-default`).
- Do not break existing features; verify after each phase; keep TR/EN i18n for all new UI.
- `backend/.env` must have `PORT=17888` for this fork (P27: found it stale at `12999`, a leftover from
  the original `saas proje` copy, and corrected it) — if the server ever starts on the wrong port,
  check this file first before assuming a code problem.
