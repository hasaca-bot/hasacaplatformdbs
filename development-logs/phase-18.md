# Phase 18 — Restaurant Analytics (tenant + platform)

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Analytics dashboards: each restaurant sees ONLY its own numbers; Root sees the platform aggregate.
Revenue, orders, reservations, average order value, delivery-vs-dine-in split, orders-by-day trend,
top products (tenant) / top restaurants (root). Date-range filter.

## What was done
### Backend (aggregate in JS for SQLite/PostgreSQL portability)
- **`GET /api/admin/analytics?days=30`** (`server.js`, adminAuth, **tenant-isolated**) — pulls the
  tenant's orders in range and returns: summary (orders, revenue, avgOrderValue, reservations),
  `typeSplit` (delivery/dinein), `statusBreakdown`, `ordersByDay` (gap-filled daily series), and
  `topProducts` (top 8 by quantity from `order_items`, tenant-scoped).
- **`GET /api/root/analytics?days=30`** (`routes/root.js`, root-only) — platform-wide aggregate:
  summary (tenants, orders, revenue, avgOrderValue, reservations), `typeSplit`, `ordersByDay`, and
  `topTenants` (top 8 by order count with revenue).
- Range capped to 365 days; `total` amounts come from `orders.total`; time series keyed by ISO date.

### Root Panel — `root.html`
- "Analitik / Analytics" topbar button + modal: a range `<select>` (7/30/90/365 days), summary stat
  cards, a **CSS bar chart** of orders-by-day (`.bars`/`.bar`, no external chart lib → CSP-safe), and
  a top-restaurants list. `openAnalyticsModal()` + `loadAnalytics()`; localized number formatting; TR/EN i18n.

## Files modified
- `backend/server.js` (`/api/admin/analytics`), `backend/routes/root.js` (`/api/root/analytics`),
  `root.html` (button, modal, bar-chart CSS, JS, i18n).

## DB / API changes
- **API added:** `GET /api/admin/analytics` (tenant), `GET /api/root/analytics` (root). No DB change
  (read-only aggregation over existing `orders` / `order_items` / `reservations`).

## Verification (fork @ localhost:17888)
- **Root aggregate:** `{tenants:2, orders:1, revenue:425, avgOrderValue:425, reservations:0}`,
  `typeSplit {delivery:0, dinein:1}`, 30-day series, 1 top tenant.
- **Tenant isolation:** the one existing order belongs to a non-default tenant → `default` tenant's
  `/api/admin/analytics` returns `orders:0` (does NOT see the other tenant's order), while root sees
  the platform total of 1. **Isolation confirmed.**
- **UI:** modal "Platform Analitiği" renders 6 stat cards (Sipariş=1, Ciro=₺425, Ort. Sepet=₺425,
  Masa=1, …), a **30-bar daily chart**, and the top-tenants list. No console errors.

## Known issues / notes
- CSV/PDF export and a tenant-admin analytics UI panel are follow-ups (the tenant endpoint already
  exists and is isolation-safe, ready to wire into the admin panel).
- Charts use pure CSS bars (no chart library) to stay dependency-free and CSP-safe.

## Next phase
Phase 19 — next backlog feature (Widget Management, SEO Center, QR Designer, or Root Notification Center).
