# Phase 16 — Platform Health Dashboard (cloud-safe)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
A Root-only Platform Health Dashboard that works on any host (Render, Railway, Fly.io, Docker, VPS)
— using ONLY information the running app can read itself (process + a DB query + its own files),
with no provider-specific APIs. Designed so provider adapters can be layered on later.

## What was done
### Backend — `backend/routes/root.js`
- New endpoint **`GET /api/root/health`** (rootAuth). Returns:
  - **db**: status + response time (times a `SELECT 1`) + engine (SQLite/PostgreSQL).
  - **metrics**: tenants, products, orders (total / today / month), reservations, push subscriptions,
    QR tables — each best-effort (a failing count returns `null`, never a 500).
  - **runtime**: `process.uptime()`, `process.version`, environment, `process.platform`,
    memory (RSS / heapUsed MB) — host-agnostic.
  - **storage**: SQLite DB file size (skipped on PG) + uploads dir size/file-count (its own files only).
  - **version**: from `package.json` (proxy for deployment version). Plus overall `status`
    (`ok`/`degraded`) and `checkMs`.

### Root Panel — `root.html`
- Added a **"Sistem Durumu / Health"** button to the topbar and a **Platform Health modal** that
  fetches `/api/root/health` and renders it as stat cards (app/db status dots, uptime, version;
  business metrics; runtime; storage). `.hstat` grid CSS + full TR/EN i18n. A "Refresh" button
  re-fetches.

## Files modified
- `backend/routes/root.js` (health endpoint), `root.html` (button, modal, CSS, JS, i18n).

## DB / API changes
- **API added:** `GET /api/root/health` (root-only).
- **DB:** none (read-only counts).

## Verification (fork @ localhost:17888)
- **Endpoint:** `status:"ok"`, `db:{ok, 1ms, SQLite}`, metrics (tenants 2, products 22, ordersToday 1,
  qrTables 3, …), runtime (node v25.8.2, RSS 59.3MB, uptime), storage (db 0.27MB, uploads 3 files
  2.41MB), version `3.0.0`, `checkMs:3`.
- **UI:** modal opens with title "Platform Sağlık Durumu", **16 stat cards** rendered with TR labels
  ("Uygulama: Çalışıyor", "Veritabanı: SQLite …ms", "Sürüm: v3.0.0"). No console errors.

## Known issues / notes
- Cloud-safe by design: on PostgreSQL/managed hosts, the SQLite file-size stat is simply omitted;
  everything else still works. Provider-specific metrics (e.g., Render instance stats) can be added
  later behind an adapter without changing this endpoint.

## Next phase
Phase 17 — next backlog feature (Activity Log, or Widget Management / SEO Center / Analytics / QR
Designer / Root Notification Center).
