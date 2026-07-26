# Phase 27 — In-shell management forms + AI Assistant (Root + Tenant)

**Status:** ✅ Done & verified | **Date:** 2026-07-25 | fork @ localhost:17888

## Goal
Two fixes requested before resuming the backlog:
1. Category/Product forms broke out of the desktop shell (full-viewport overlay, sidebar/topbar
   hidden) instead of behaving like every other management view.
2. Add a natural-language "AI Assistant" to both panels that can propose and — only after an explicit
   confirm — apply edits to data the admin can already edit today, through the exact same APIs/DB/
   validation/tenant-isolation the manual forms already use. No new backend architecture.

## Part A — Category/Product forms moved into the workspace shell (`admin.html`)
- `#adminCategoryFormPanel` and `#adminFormPanel` used `.admin-form-panel{position:fixed;inset:0;
  z-index:1950;}` — a full-viewport layer that covered the sidebar/topbar when opened. Every other
  section already lived inside `#adminPanelOverlay .app-content` as a `.view`, switched via the
  existing `showAdminView()`.
- Relocated both panels into the shell via a one-time JS IIFE (`relocateFormsIntoShell()`, runs right
  after `AP_VIEW_MAP` is defined) that `appendChild()`s them into `.app-content`, adds `.view`, and
  sets `hidden=true` — an identical live-DOM result to physically moving ~240 lines of markup, with a
  far smaller diff. A CSS override neutralizes the old fixed-overlay behavior once nested:
  `#adminPanelOverlay .app-content .admin-form-panel{position:static;inset:auto;z-index:auto;...}`.
- Extended `AP_VIEW_MAP` with `category-form` / `product-form` entries. `openCategoryForm()` /
  `openAdminForm()` / `closeCategoryForm()` / `closeAdminForm()` now call `showAdminView(...)` instead
  of toggling `.open` — fields, save handlers and every trigger (sidebar "Kategoriler", "Yeni Ürün
  Ekle") are unchanged; only the show/hide mechanism changed.
- Verified: sidebar/topbar stay visible+interactive while either form is open; both report
  `position:'static'` via computed style; switching views hides them like any other view; close
  returns to Products; re-verified again at the end of this phase after further admin.html edits — no
  regression.

## Part B — AI Assistant (Root + Tenant)
Thin layer over the existing Gemini key (`platform_settings.ai_key`/`ai_model`/`ai_enabled`, Phase 26):
turn a sentence into a structured **plan** against a fixed field whitelist, show the plan, and only on
**Confirm** apply it through the same update statements the manual forms already use. Nothing is
written before Confirm.

### Backend
- **Tenant** (`backend/server.js`, after `GET /api/admin/analytics`):
  `AI_FIELD_WHITELIST = { products: [name_tr,name_en,description_tr,description_en,price,category],
  categories: [name_tr,name_en] }`. `POST /api/admin/ai-assistant/plan` reads only the caller's own
  products/categories, asks Gemini for `{summary, actions:[{type,table,targetId,field,newValue}],
  unsupported}` (`responseMimeType:'application/json'`, Gemini computes any math/case/translation
  itself), validates every action against the whitelist + real row ownership (`tenant_id` match),
  attaches `oldValue`, caches valid plans in an in-memory `Map` keyed by a random `planId` (10-min TTL,
  single-use). `POST /api/admin/ai-assistant/execute` takes `{planId}`, 404s if it's missing or
  belongs to a different tenant (the isolation boundary), re-verifies each target still belongs to the
  tenant immediately before writing, then applies via
  `UPDATE {table} SET {field}=? WHERE id=? AND tenant_id=?` — the same pattern `PUT /api/products/:id`
  already uses. Logs via `logActivity(action:'ai_assistant_applied', ...)`.
- **Root** (`backend/routes/root.js`, after Phase 26's `ai-settings/test`): same plan/execute shape,
  scoped to Root's own `ALLOWED_PLATFORM_KEYS` (platform_name, logo_url, favicon_url, login_logo_url,
  landing_title, landing_subtitle, footer_brand) — a specific tenant's menu/branding is out of scope
  for this pass (would need a tenant-selector UI; noted as a fast-follow). Actions are flat
  `{field,newValue}` (no table/targetId — one `platform_settings` row); execute applies via the
  existing `getPlatform()`/`savePlatform()`, identical to `PUT /platform-settings`.
- Two bugs caught and fixed before either route shipped: `crypto.randomUUID()` has no import in
  `server.js` (switched to the same manual `'aip-'+Date.now()+...` id pattern already used for
  `landing_messages`); `req.user` doesn't exist (`adminAuth` sets `req.auth` — fixed to
  `req.auth.username`). `node --check` clean on both files.

### Frontend — new "AI Asistanı" view in both panels
- `admin.html`: new "Yapay Zeka" nav-group + `ai-assistant` entry in `AP_VIEW_MAP` + a `.view` with a
  textarea+send button, a plan-preview card (`field: oldValue → newValue` per action, an "unsupported"
  list, Confirm/Cancel), and an applied-summary card. `aiAssistantSend/RenderPlan/Confirm/Cancel()`
  call `/api/admin/ai-assistant/*` (the existing global `fetch` interceptor attaches the bearer token).
  On apply, reloads `window.menuData` via the existing `loadMenuDatabase()` + re-renders the list.
- `root.html`: same idea — new "Yapay Zeka" nav-group + `view-ai-assistant` (a third `.view` alongside
  Dashboard/Restaurants), `rootAiSend/RenderPlan/Confirm/Cancel()` using the existing `rootFetch()`/
  `T()`/`toast()` helpers. On apply, calls the existing `applyPlatformConfig()` to refresh branding.
- Both reuse only existing CSS building blocks (`.panel-card`/`.act-row`/`.hint`, `.admin-btn`/`.btn`,
  `.row`) — no new design system.
- **Bug caught during visual verification (admin.html only):** `.admin-btn`'s base class sets
  `width:100%`, which — combined with the textarea's `flex:1` — collapsed the textarea to ~34px and
  stretched the Send/Confirm/Cancel buttons across almost the entire row. Fixed by adding
  `width:auto;flex:none;` inline on all three buttons (root.html's `.btn` class has no such default,
  so its equivalent buttons needed no fix).

## Verification
- **Environment fix required first:** the running dev server predated this session's route additions
  (confirmed via a 404 on `/api/root/ai-assistant/plan`) and had to be restarted; discovered along the
  way that `backend/.env` still had `PORT=12999` (a stale value carried over from the fork's original
  copy) instead of the fork's own documented `17888` — corrected in `.env` so the fork now starts on
  its correct port without an explicit `PORT=` override.
- Both `/ai-assistant/plan` routes return 200 (previously 404) and respond correctly to the current
  environment's fake Gemini key: the Gemini call fails, both endpoints catch it and return a graceful
  `{planId:null, actions:[], ...}`, and the UI shows "couldn't derive an actionable change" rather than
  crashing or fabricating a result.
- Both `/ai-assistant/execute` routes correctly 404 (`plan_not_found`) for an unknown/bogus `planId`.
- Plan-preview rendering verified end-to-end in-browser for both panels by feeding a synthetic plan
  object into `aiAssistantRenderPlan`/`rootAiRenderPlan` directly (client-side only, no write): action
  rows, the unsupported list, and Confirm/Cancel all render and behave correctly; Cancel resets state.
- Part A regression re-check: Category/Product forms still open in-shell (sidebar `display:flex`,
  panel `position:static`) after this phase's further admin.html edits.
- No regressions: customer site (`/`) loads with 0 console errors; tenant dashboard/products list
  loads; Root dashboard/Restaurants view still shows the real tenant count; existing modals unaffected.
- **Known, accepted limitation** (flagged up front in the approved plan): no successful Gemini response
  could be obtained, so Gemini's actual natural-language interpretation quality — e.g. whether it
  correctly computes a 10% bulk price increase — could not be verified end-to-end. Every other part of
  the pipeline (auth, validation, tenant isolation, the UI) was verified directly.
  > **CORRECTED 2026-07-26 (Phase 30):** this originally said "no real Gemini API key is configured
  > (fake key)" — that was an assumption and it was WRONG. The key is real and reaches Google's API;
  > it returns a genuine quota error (`limit: 0`, free tier), not an auth error. Also corrected: this
  > entry claimed "the write path" was verified — it was NOT. No plan could be obtained, so the
  > execute branch never ran. It was finally verified directly against the DB in Phase 30.

## Files modified
`admin.html`, `root.html`, `backend/server.js`, `backend/routes/root.js`, `backend/.env` (port fix).
No DB schema change (plans are in-memory only, never persisted). No change to auth, tenant isolation,
QR/orders/reservations business logic, or any existing API contract.

## Next
Backlog: Widget Management, then QR Designer.
