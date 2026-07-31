# Phase 38 — Swap AI provider from Gemini to Groq (no billing/card required)

## Why
The AI Assistant (Root + tenant) was fully implemented (Phase 26/27/30) but had never actually
worked end-to-end. Diagnosed by running a real request through it: the configured Gemini key
(new, correctly-formatted `AIzaSy...` key) authenticated fine, but every real `generateContent`
call failed with:

```
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0
```

A cheap key-validation call (`GET /v1beta/models/{model}`) succeeds regardless, which is why the
Root panel's "Test Connection" reported success while real messages still failed — the two calls
hit different quota classes. Root cause: Gemini's real generation quota is `0` until a billing
account is linked to the underlying Google Cloud project, even to use the nominal "free tier" —
and the user has no credit card, so Google's prepaid-card billing setup was a dead end.

**Fix: swap providers**, not just keys. [Groq](https://groq.com) offers a genuinely free tier
(fast Llama/Gemma models) that never requires billing information. Groq's API is OpenAI-compatible,
so only the request/response shape changes — the systemPrompt-plus-JSON-schema contract this
codebase already built (whitelisted fields, plan/execute, tenant isolation) is provider-agnostic
and untouched.

## Changes
- `backend/server.js` — `callGeminiJSON()` → `callAiJSON()`: now POSTs to
  `https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer <key>`, a
  `messages` array (system + user), and `response_format:{type:"json_object"}`. Extracts the
  generated JSON from `choices[0].message.content` instead of Gemini's
  `candidates[0].content.parts[0].text`. Default model → `llama-3.3-70b-versatile`.
- `backend/routes/root.js` — same swap for the Root-side `callGeminiJSONRoot()` →
  `callAiJSONRoot()`. `POST /ai-settings/test` now validates a key via Groq's cheap
  `GET /openai/v1/models` (Bearer auth) instead of Gemini's key-in-query-param model lookup.
  `ai_provider` in `GET`/`PUT /ai-settings` changed from `'gemini'` to `'groq'`.
- **Both files**: added `cleanAiModel()` — any model value saved *before* this phase
  (`gemini-2.0-flash`) is not a valid Groq model name. Rather than silently sending a doomed
  request, any stored value starting with `gemini` is now treated as unset and falls through to
  the new default. Caught this by testing locally: the already-saved platform settings still had
  the old Gemini model name, which the AI settings modal would have silently resubmitted even
  after the user pasted a new Groq key.
- `backend/db.js` — fresh-install default `platform_settings` seed updated to
  `ai_provider:'groq'`, `ai_model:'llama-3.3-70b-versatile'`.
- `root.html` — UI labels/placeholders updated ("AI Ayarları (Gemini)" → "(Groq)", key input
  placeholder `AIza...` → `gsk_...`, model placeholder → `llama-3.3-70b-versatile`).

## Verification
- All backend files pass `node --check`; all four HTML files' inline scripts pass (only the
  pre-existing JSON-LD false positive).
- Structural test (no real key needed): submitted an obviously-fake `gsk_...`-shaped key to
  `POST /api/root/ai-settings/test` — got back Groq's own real API error (`"Invalid API Key"`),
  confirming the request URL, headers, and auth scheme are correctly wired to Groq's real service,
  not a network/format error.
- Confirmed `GET /api/root/ai-settings` now correctly cleans a locally-stored stale
  `gemini-2.0-flash` value to `llama-3.3-70b-versatile` instead of resubmitting it.
- **Not yet verified**: an actual successful generation with the user's real Groq key. The user
  entered their key directly in the Root panel (never shared with the assistant), and this needs
  a follow-up check once deployed.

## Addendum — Admin panel dashboard chart (same session, continued)
Ported the Root dashboard analytics chart (Phase 37) to the tenant Admin panel — same "Son
Aktivite" → chart treatment, tenant-scoped instead of platform-wide.
- `admin.html` — the dashboard's "Son Aktivite" `panel-card` (`#adDashActivity`) replaced with an
  "Analitik" card: 7/30/90-day range `<select>`, a Masa/Paket legend (reusing the existing
  `admin_analytics_dinein`/`admin_analytics_delivery` i18n keys already used elsewhere in this
  file), and the chart mount point (`#adDashChartWrap`).
- `renderDashAreaChart()`/`dcSmoothPath()`/`dcAreaPath()` ported verbatim from root.html — these
  were written generically in Phase 37 (no root-specific assumptions baked in) except for which
  CSS custom properties they read for color. Added a `tokenPrefix` parameter (`'ap'` here vs `''`
  on root.html) so the same function works against admin.html's independent `--ap-gold`/
  `--ap-muted` token system instead of root.html's plain `--gold`/`--muted`.
  `loadAdminDashboardAnalytics()` calls the tenant-scoped `/api/admin/analytics` (its per-day
  delivery/dinein split landed earlier in this same phase) instead of Root's platform-wide
  endpoint.
- New CSS: `.dash-chart-*` classes duplicated into admin.html's own `#adminPanelOverlay`-scoped
  stylesheet (admin.html does not link `panel.css`, so root.html's chart CSS isn't reachable here
  — same reason the two files needed the `tokenPrefix` parameter above).
- Two new i18n keys added: `admin_dash_empty`, `admin_dash_err` (the chart's own empty/error
  states — `dash_empty`/`root_err` don't exist in admin.html's i18n table, those are root.html
  keys, caught and fixed before commit).

### Verification
- All four HTML files' inline scripts pass `node --check` (only the pre-existing JSON-LD false
  positive).
- Logged in as two different tenants through the real admin UI (not direct API calls):
  - `default` (no recent orders in range) → chart renders its empty-safe state correctly, legend
    and range selector present, 0 console errors.
  - `hacimustafa` (has real dine-in/delivery orders from earlier in this session) → chart renders
    with real data; hovering found a real day showing `Masa: 2, Paket: 2`, matching actual orders
    in the local DB.
- Range selector (7/30/90) re-fetches and re-renders correctly on both tenants.
- 0 console errors in both cases.

## Still open
- **Not yet verified**: an actual successful generation with the user's real Groq key. The user
  entered their key directly in the Root panel (never shared with the assistant) — needs a
  follow-up check once Render finishes deploying this phase's commits.
- **Render deploy pending** at time of writing — pushed but `hasaca-api.onrender.com` was still
  serving pre-Phase-38 code when last checked. The Render health-check-path misconfiguration from
  earlier this session (`/api/healt` missing the h) was already fixed by the user, so this is
  expected to complete on its own; worth a quick dashboard check if it's been more than a few
  minutes.
- Chatbot UI modernization — still not started; intentionally held until AI generation is
  confirmed working end-to-end, so the redesign fits real response shapes.
