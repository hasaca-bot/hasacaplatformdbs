# Phase 25 — Tenant Admin Panel redesign (sidebar shell + tokens + themes)

**Status:** ✅ Completed & verified (revised)
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Replace the Tenant Admin Panel's old horizontal `.admin-panel-tabs` navigation with the exact same
desktop-app sidebar shell used by the Root Panel — so the two panels look like pages of the same
product — while keeping everything else presentation-only: no DB/auth/API/business-logic/tenant-isolation/
customer-site changes.

## Approach (why not just link panel.css)
`admin.html` is not a standalone page — it's the live customer restaurant site with an admin *overlay*
(`#adminPanelOverlay`) layered on top. The customer's `:root` defines `--fire/--gold/--card/--dark`
that drive the hero/menu/food-cards, and `panel.css` reuses those same variable names. Linking it
would immediately repaint the customer site. So the sidebar shell is built as a **local, uniquely-
scoped port** of `panel.css`, using the Phase 25 `--ap-*` overlay-scoped tokens (introduced in the
earlier color-only reskin, unchanged here). Every new selector is under `#adminPanelOverlay …`, so
the customer site outside the overlay is guaranteed unchanged.

## What was done — all in `admin.html`

### Removed (throwaway navigation chrome)
- `.admin-panel-tabs` + 6 `.admin-tab-btn` + `.admin-tab-indicator` markup — gone.
- `.admin-tab-content-wrapper` / `.admin-tab-content-slider` wrapper divs (opening/closing only) — gone.
- Associated CSS (`.admin-panel-tabs`, `.admin-tab-btn*`, `.admin-tab-indicator`,
  `.admin-tab-content-wrapper`, `.admin-tab-content-slider`) plus the Phase 25 CSS overrides that had
  targeted them — gone. `.admin-tab-content` kept for backward-compat but restyled to behave as a
  plain `.view` pane (no slider sizing, no opacity toggling; `hidden` attribute controls visibility).
- Old `.admin-panel-header` outside the shell (which had a duplicate `#adminThemeSeg` + language +
  Kapat button) — removed to avoid duplicate IDs. Theme + language relocated into the new topbar.
- `#adminPanelOverlay.open`'s `!important` `padding:24px 20px` / `max-width:900px` / `overflow-y:auto`
  overrides — rewritten to make the overlay a true fullscreen shell container (`padding:0`,
  `overflow:hidden`, `width:100%`, `height:100vh`). Padding/scroll moved to `.app-content`.

### Added (sidebar shell)
- **Sidebar** with 7 nav groups, matching root.html's structure (`.app-shell`, `.app-sidebar`,
  `.side-brand`, `.nav-group`, `.nav-item`, `.side-foot`, `.collapse-btn`). Items ship **only where
  real functionality exists** (per user's direction — no dead links). Final structure:
  ```
  GENEL        → Dashboard
  ÜRÜNLER      → Ürün Yönetimi · Kategoriler (opens existing add-category panel)
  SİPARİŞLER   → Siparişler · Rezervasyonlar · Masa Yönetimi · Masa Sipariş Kontrolü
  ANALİTİK     → Analitik
  İLETİŞİM     → Bildirim Gönder
  WEB SİTESİ   → Siteyi Görüntüle  (real <a href="/" target="_blank">)
  AYARLAR      → Çıkış             (real logout — clears token via setAdminToken(''))
  ```
- **Topbar** (`.app-topbar`) with mobile hamburger, i18n page title, relocated Phase 25 theme switch
  (`#adminThemeSeg`), relocated language button (`#admin-lang-btn-text`), and a profile menu whose
  only item is Çıkış — same visual language as root.html's topbar.
- **Content area** (`.app-content`): 2 new `.view` panes (`#view-dashboard`, `#view-analytics`) plus
  the 6 reparented tab-content divs (`#adminTabProducts`, `#adminTabOrdersCont`, `#adminTabRezCont`,
  `#adminTabTablesCont`, `#adminTabTableOrdersCont`, `#adminTabPushCont`), all with `hidden` toggled
  by `showAdminView()`. Their internal markup + all render/load functions are **unchanged**.
- **Backdrop** (`.app-backdrop`) for the mobile drawer.
- Full CSS shell block scoped to `#adminPanelOverlay …` — a local port of `panel.css` using `--ap-*`
  tokens (never touches `:root`). Same 900px/560px/400px breakpoints as root.html, plus the drawer
  transform + backdrop pattern. `prefers-reduced-motion` kill-switch respected.

### Added (additive JS; existing loaders untouched)
- `showAdminView(view)` — hides all `.view`s, shows the target, sets `.nav-item.active`, updates the
  topbar page title (i18n), runs the same lazy-load calls the old `switchAdminPanelTab` did **plus**
  `loadReservations()` for the reservations view (the Explore pass found this was never called on
  tab-switch before — a real gap). Auto-closes the mobile drawer on navigate.
- `apToggleSidebar(force)` / `apToggleCollapse()` / `apToggleProfileMenu(event)` — direct ports of
  root.html's equivalents, `ap`-prefixed to avoid collisions. Sidebar collapse persists in
  `localStorage['hasaca_admin_panel_collapsed']`. Outside-click closes the profile menu.
- `adminLogout()` — new: `setAdminToken('')` (which clears both `localStorage` and `sessionStorage`,
  the Phase 23 fix) then redirects to `/`. Wired into the sidebar's Çıkış item and the profile menu.
  The old "Kapat" button (which merely navigated away, leaving the token valid) is gone.
- `loadAdminDashboard()` — 4 stat cards (Sipariş / Ciro / Ort. Sepet / Rezervasyon) + a recent-activity
  list — reuses **existing tenant-scoped endpoints** `GET /api/admin/analytics?days=30` and
  `GET /api/admin/activity?limit=6` (both were already implemented in backend/server.js but had zero UI
  callers today — wiring them to new UI is not new business logic).
- `loadAdminAnalytics()` — 5-card summary (Sipariş / Ciro / Ort. Sepet / Masa / Paket-Gel-al) + top
  products list, same endpoint.
- `openAdminPanel()` — default view is now `showAdminView('dashboard')` (mirrors root.html's
  `showShell()`); all other side effects (renderAdminProductList, renderAdminRezList,
  updateAdminRezBadge, loadOrders, loadTableOrders, loadServiceRequests, connectAdminEvents,
  site-config caching, apInitTheme) are unchanged.
- TR + EN i18n keys for every new label (nav groups, nav items, dashboard/analytics copy, profile).

## Files modified
- `admin.html` only. No other file changes.

## DB / API changes
**None.** No backend touched. Dashboard/Analytics simply use two already-implemented, tenant-scoped
endpoints (`/api/admin/analytics`, `/api/admin/activity`) that had no UI callers before.

## Verification (fork @ localhost:17888) — all passed
- **Old tab bar VERIFIABLY GONE:** `document.querySelector('.admin-panel-tabs')` → `null`; 0
  `.admin-tab-btn` in the DOM.
- **Sidebar renders:** 11 nav items across 7 groups; 8 `.view` panes; Dashboard active on open;
  page-title updates per view; every view switches (dashboard/products/orders/reservations/tables/
  table-orders/push/analytics all verified).
- **Existing tenant functionality intact:** as tenant `bfbfb`, Products view shows 11 rows;
  Dashboard shows real numbers (`orders:1, revenue:₺425, avgOrderValue:₺425`, 3 activity rows);
  Analytics shows the same plus dinein/delivery split (`dinein:1, delivery:0`, 4 top-products).
  As tenant `default` (no orders), all show 0 — **tenant isolation intact.**
- **Çıkış:** clears both `localStorage` and `sessionStorage` admin tokens (via `setAdminToken('')`),
  redirects to `/`; customer site loads clean; re-login works.
- **Customer site UNTOUCHED:** on `/`, `:root` computes `--fire:#D93B0A`/`--card:#3D1A0A`/
  `--dark:#1C0A00`, body bg `rgb(28,10,0)` — exactly the original values. `body.theme-bw` engine
  still flips `--card #3D1A0A ↔ #FFFFFF` correctly.
- **Root Panel unchanged:** `/root` still renders its own `.app-shell`/`.app-sidebar` (Phase 24).
- **Responsive:** 1920 / 1440 / 1280 / 1024 / 768 / 360 → **0 horizontal overflow**; sidebar becomes
  a working drawer with backdrop below 900px, closes on navigation.
- **Theme + language:** the relocated `#adminThemeSeg` and language button still function (theme
  dark/light/system persisted via `hasaca_panel_theme`; language toggles page title TR↔EN).
- **Auth unchanged:** `/api/admin/analytics` and `/api/admin/activity` both return **401 without a
  token**; tenant login unchanged.
- **0 console errors** throughout the whole interaction sequence.

## Known issues / notes
- CSS transitions freeze in this non-compositing preview pane (documented artifact from earlier
  phases): dark→light theme swap resolves to the correct tokens when transitions are forced to
  complete (`getAnimations().finish()`), verified.
- Kategoriler is an "add category" entry point, not a full CRUD list — there is no category list/edit/
  delete UI in the codebase today; the `DELETE /api/categories/:id` endpoint exists with no caller.
  Building a full CRUD is new business logic and out of scope per the user's instructions.
- Sidebar deliberately ships without: Müşteriler, Raporlar, İletişim Mesajları, AI Asistanı, AI
  Ayarları, Restoran Ayarları, Kullanıcılar, Profil — none of these have backend/tables/endpoints
  today (confirmed by direct code search). Per the user's decision, these are omitted rather than
  faked. They're documented in AI-CONTEXT.txt as future backlog items requiring new business logic.
- "QR Siparişleri" is not a separate entry — QR-generated orders show up in Masa Sipariş Kontrolü.

## Supersedes
This document replaces the earlier Phase 25 write-up (color-only reskin). The `--ap-*` overlay-scoped
token layer that reskin introduced is unchanged and still forms the foundation of this revision.

## Next phase
Phase 26 — backlog: **Gemini AI Setup Assistant backend** (root.html's AI modal expects
`/api/root/ai-settings`, which is unbuilt), then Widget Management, then QR Designer.
