# HASACA Platform — Development Status

> Living status doc. Any AI/dev can resume by reading this + the phase files in `/development-logs`.
> Release changelog lives in `README.md` (§ DEĞİŞİKLİK GÜNLÜĞÜ). This folder tracks in-progress phased work.

**Last updated:** 2026-07-21 (after Phase 03)

## Overall progress: ~80%

## Architecture summary
Multi-tenant restaurant SaaS. Node.js + Express (`backend/server.js`), dual DB layer (`backend/db.js`: PostgreSQL when `DATABASE_URL` set, else SQLite). Frontend = 3 static pages, no bundler: `index.html` (customer), `admin.html` (tenant admin, tabbed), `root.html` (platform owner). Auth = username + scrypt hash + HMAC token (`lib/auth.js`). Tenant resolution from subdomain (`lib/tenant.js`). SSE realtime (`lib/events.js`). Root API + tenant generation (`routes/root.js`), QR tables (`routes/tables.js`). Port **12999**. i18n = per-page `i18nData` (TR/EN) + `data-i18n` + `applyLanguage`.

## Completed (previous work)
- Phase A: Real multi-tenancy + username/password auth
- Phase B: Root panel + automatic tenant generation
- Phase C: QR table ordering (management, dine-in, live tracking, floor view)
- Phase D: Local dev env + START ADMIN.bat + docs
- Phase E: White-label branding + "My Restaurant" master template (default tenant is cloned for new tenants); Root-editable platform branding

## Current phased effort (this session)
| Phase | Title | Status |
|-------|-------|--------|
| 01 | Bug fixes & UI polish (brand text, placeholder logo, broken assets, favicon→logo) | ✅ DONE |
| 02 | Disable PWA / installability (re-enableable) — *pulled forward, stale SW blocked verify* | ✅ DONE |
| 03 | Image upload everywhere (file picker + preview, no URL inputs) | ✅ DONE |
| 04 | Residual branding cleanup (Safranbolu/Tantuni/Döner/real-map in index+admin) | ⏭️ NEXT |
| 05 | Remove "Send Notification" from tenant admin panels | TODO |
| 06 | Favicon = restaurant logo (auto-update) | PARTIAL (customer page done in P01) |
| 07 | Gemini AI Restaurant Setup Assistant | TODO (was "Phase G") |
| 08 | Consolidate changelog / final docs | TODO (was "Phase F") |
| 09 | Testing & final polish | TODO |

> Phase numbering was resequenced after P01: PWA-disable moved up to #02 because a leftover
> service worker was serving stale cached HTML and masking edits. See `phase-02.md`.

## Known bugs (open)
- **Residual branding** (→ P04): `index.html` + `admin.html` still show "Safranbolu / Tantuni /
  Döner", a hardcoded Google Maps embed of the real Dayı Katık location, stale og/twitter/schema
  meta, and a Tantuni/Döner JS fallback menu array. White-label defect.
- **Startup polling race** (→ P09): admin logs `Failed to fetch orders` / `loadTableOrders` /
  `loadServiceRequests` on first paint before the session token is restored (endpoints work once
  authed). Cosmetic console noise.

## Resolved bugs
- default tenant `name`/`display_name` stale = "hasaca" → now self-healed on every boot (P01).
- placeholder logo was an unrecognizable dark "DEMO" circle → redesigned clean emblem (P01).
- leftover service worker served stale cached pages → SW disabled + auto-cleanup (P02).
- product images stored as base64 blobs in the DB → now uploaded as files, stored as URLs (P03).
- manual image URL inputs (root branding) → upload-only with preview (P03).

## TODO / pending
- Residual branding cleanup in index.html + admin.html. (P04)
- Remove notification-send UI/API from tenant admin. (P05)
- Favicon = logo on admin/root pages too (customer page done). (P06)
- AI assistant (Gemini) — provider adapter, Root AI settings, per-tenant context, wizard, menu generation. (P07)
- Optional: tenant-side branding editor tab (logo/hero) — currently root-only.

## Important notes
- Gemini API key: store in `GEMINI_API_KEY` env or gitignored `data/ai_config.json`; NEVER commit or send to frontend.
- Category ids are global PRIMARY KEY → always tenant-suffixed (`starters-default`).
- Do not break existing features; verify after each phase; keep TR/EN i18n for all new UI.
