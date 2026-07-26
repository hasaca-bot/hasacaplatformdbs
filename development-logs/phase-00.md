# Phase 00 — Fork into working copy (port 17888)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24

## Goal
Per user decision, fork the whole project to a separate folder used as the active workspace, leaving
the original folder untouched as a rollback snapshot. Run the working copy on port **17888**.

## What was done
- Copied `C:\Users\hasan_y4hfwna\Desktop\saas proje` → **`C:\Users\hasan_y4hfwna\Desktop\hasaca-platform`**
  via robocopy `/E` (all files incl. `backend/node_modules` (124 pkgs), `data/` (dayikatik.db,
  vapid.json, root_credentials.json), `uploads/`, `icons/`, `development-logs/`, `*.html`).
- Working copy `backend/server.js`: default `PORT` `12999` → **17888**; added `localhost:17888` /
  `127.0.0.1:17888` to CORS allowed origins.
- Added a `hasaca-working` launch entry (URL-attach form → `http://localhost:17888`) in the original
  `.claude/launch.json`. (The harness only starts servers by-name **inside** the project root, and the
  fork is a sibling folder, so the fork's server is started directly and the browser attaches to its URL.)

## Files modified (in the fork)
- `backend/server.js` — port + CORS.
- (original) `.claude/launch.json` — added `hasaca-working` URL-attach entry (harness config, not app code).

## Verification (fork @ localhost:17888)
- Server boots: `Port: 17888`, SQLite at the fork's `dayikatik.db`, migrations OK, self-heal ran
  (`default tenant name/display → "My Restaurant"`), 4 categories / 151 translations carried over.
- Customer page serves: `origin http://localhost:17888`, title `My Restaurant | HASACA`,
  `/api/site-config` → tenant `My Restaurant`, logo from `/uploads/*`, brand text `My Restaurant`.

## Known issues / notes
- Server console banner still prints `Dayı Katık Web App Server is running!` — a branding leftover in
  `backend/server.js`; fix during Phase 04 cleanup.
- Original folder (`saas proje`) is the frozen rollback; all subsequent edits target `hasaca-platform`.

## Next phase
Phase 04 (finish) — complete white-label cleanup (index fallback menu + admin.html) and make chrome
fully tenant-driven.
