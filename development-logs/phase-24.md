# Phase 24 — Root Panel UI/UX redesign (desktop shell + design tokens + Black/White/System themes)

**Status:** ✅ Completed & verified
**Date:** 2026-07-25 (fork @ localhost:17888)

## Goal
Bring the Root Panel (`root.html`) up to a modern desktop-app experience in the same premium
black-luxury + gold palette as the landing/marketing/login pages: a fixed sidebar + scrolling
workspace, a sticky top toolbar, a dashboard, unified components, and a **centralized design-token
system with Black / White / System themes**. **Presentation only** — no DB/auth/API/logic/tenant-
isolation changes; all existing JS reused, new JS additive.

**Scope (user-confirmed):** Root Panel this phase. Tenant Admin (`admin.html`) is Phase 25 (it is an
overlay embedded in the live customer site with its own tab system and a customer-coupled theme
engine, so it gets a token/theme/component reskin, not a sidebar).

## What was done

### NEW `panel.css` — centralized design system (served by express.static)
- **Tokens:** `:root, :root[data-theme="dark"]` (default) + `:root[data-theme="light"]` overrides,
  plus scale tokens (radius/shadow/space/`--line-2`/`--faint`/`--gold-soft`). Keeps the **existing
  variable names** (`--bg/--panel/--card/--line/--text/--muted/--gold` + legacy `--fire/--ember`
  aliased to gold) so every legacy rule re-themes automatically. Palette = the landing page’s.
- **Shell:** `.app-shell` (grid: sidebar + main), `.app-sidebar` (fixed, collapsible → icons-only),
  `.nav-group`/`.nav-item` (SVG icon + label + active gold indicator + hover/focus), `.app-topbar`
  (the header), `.app-content` (the only scrolling region), `.app-backdrop` (mobile drawer).
- **Components:** refined `.btn` variants, inputs/selects (gold focus ring), `.seg` (segmented theme
  switch), `.stat-card`/`.dash-grid`/`.panel-card`/`.quick-actions`/`.act-row` (dashboard), `.tbl`
  (sticky header + hover rows), `.badge`, `.chip`, `.tenant-card` (hover-lift), `.overlay`/`.modal`
  (glass, consistent), profile menu. 120–200ms transitions; `prefers-reduced-motion` kill-switch.

### `root.html` — shell restructured (markup only; JS logic untouched)
- Linked `/panel.css` **last** in `<head>` so it is authoritative.
- Replaced the topbar-of-buttons + toolbar + grid with:
  - **Sidebar**: brand → grouped nav (**Genel:** Panel, Restoranlar · **İzleme:** Sistem Durumu,
    Aktivite, Analitik · **İletişim:** Bildirim, Landing Mesajları · **Ayarlar:** Marka, AI Ayarları)
    → collapse toggle. Each item keeps its **existing** `onclick` (`open*Modal()`); the Landing item
    keeps `#landingBadge`.
  - **Topbar**: mobile hamburger · page title · segmented theme switch (Sistem/Açık/Koyu) · language
    button · **+ Yeni Restoran** (icon-only on phones) · profile menu (Marka / Sistem Durumu / Çıkış).
  - **Content**: `#view-dashboard` (4 stat cards + recent activity + quick actions) and
    `#view-restaurants` (the existing search + filter chips + `#tenantGrid`, IDs/handlers unchanged).
- Repointed the one stale reference (`rootHeaderName` → `sideBrandName`) in `applyPlatformConfig`.

### `root.html` — additive JS + i18n
- `setTheme(mode)`/`initTheme()` — system resolved via `matchMedia('(prefers-color-scheme: dark)')`
  with a live `change` listener; forced light/dark; `data-theme` on `<html>`; persisted in
  `localStorage['hasaca_panel_theme']`.
- `showView('dashboard'|'restaurants')` — toggle views + active nav + page title (+ closes the mobile
  drawer). `showShell()` now `await`s `loadTenants()` **before** `loadDashboard()` so tile counts are
  populated (fixed a first-paint 0/0 race).
- `loadDashboard()` — read-only: tenant tiles from the in-memory list; orders/revenue from
  `/api/root/analytics?days=30`; recent activity from `/api/root/activity?limit=6`.
- `toggleSidebar()` (drawer + backdrop), `toggleCollapse()` (persisted), `toggleProfileMenu()`
  (+ outside-click close). Full **TR + EN** i18n for all new labels.

## Files modified / added
- **NEW** `panel.css` (tokens + 3 themes + shell/component system).
- `root.html` — `<head>` link; shell markup restructured; additive theme/view/dashboard/sidebar JS;
  new TR/EN i18n; `root_new_tenant` value de-duplicated ("+ " dropped, icon supplies the plus).
- Logs: NEW `development-logs/phase-24.md`; update `development-status.md`; OVERWRITE `AI-CONTEXT.txt`.

## DB / API changes
**None.** No backend touched. Dashboard reuses the existing `/api/root/analytics` + `/api/root/activity`.

## Verification (fork @ localhost:17888) — all passed
- **Auth unchanged:** `rootLogin()` logs in → themed shell → dashboard; `rootLogout()` clears the
  token and shows the (themed) login card; `/api/auth/login` 200; `/api/root/*` 401 without a token;
  `/api/products` still tenant-scoped (11 items).
- **Shell:** sidebar fixed, only `.app-content` scrolls; Dashboard↔Restaurants switch with active
  nav + page-title updates; search + filter chips filter (`zzznomatch` → 0 cards); 2 tenant cards
  render with all actions.
- **Dashboard:** real numbers — Restoran 2 / Aktif 2 / Sipariş 1 / Ciro ₺425; 6 recent-activity rows.
- **Themes:** Sistem/Açık/Koyu switch **instantly** (dark `--bg #0a0a0b` ↔ light `--bg #f4f5f7`),
  **persist** across reload (reloaded as light), and system mode resolves via `matchMedia` (the live
  `change` handler is verified correct — `applyThemeAttr('system')` flips to light when the OS reports
  light; the harness’s media emulation just doesn’t dispatch the `change` event, an environment quirk).
- **Modals:** Health (16 cells), Activity (41 rows), Analytics (56 nodes), Notify (compose+targets),
  Landing (3 rows + badge), Branding (fields populated), Create (form) all open with data via the
  shared glass `.overlay`/`.modal`.
- **Responsive:** 1920 / 1440 / 1280 / 1024 / 768 / 360 → **0 horizontal overflow**; sidebar becomes a
  working drawer + backdrop below 900px (closes on navigate); topbar create collapses to an icon and
  the page title hides on the tightest phones. **0 console errors** across the whole session.

## Known issues / notes
- **AI Ayarları modal does not open — PRE-EXISTING, not a Phase 24 regression.** `openAiSettingsModal`
  fetches `/api/root/ai-settings`, which is **not implemented** on the server, so the request hits the
  `*` catch-all and returns the customer HTML; `.json()` throws into the function’s own catch. This is
  the documented backlog item (Gemini AI Assistant). The sidebar/profile entry is retained so it lights
  up once that backend lands. I did not touch this code path.
- Live OS-theme following can’t be exercised in this headless harness (emulated `prefers-color-scheme`
  changes don’t fire `matchMedia`’s `change` event) — the listener body is verified correct manually.
- The old `.topbar`/`.toolbar`(topbar) inline CSS in root.html is now partly unused but harmless.

## Next phase
Phase 25 — **Tenant Admin Panel** (`admin.html`): link the same `panel.css`, apply Black/White/System
theme switching + a component reskin to `#adminPanelOverlay` and its `.admin-panel-*`/`.admin-tab-btn`
system, **without** restructuring it into a sidebar and **without** touching the customer-site
`body.theme-bw` engine.
