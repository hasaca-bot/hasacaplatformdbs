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

## Not done this phase (explicitly deferred by the user — "tomorrow")
- Porting the Root dashboard analytics chart to the tenant Admin panel (same "Son Aktivite" →
  chart treatment). One prerequisite step already landed: `GET /api/admin/analytics` now also
  breaks `ordersByDay` down by `delivery`/`dinein` per day (previously totals only), matching the
  same backend change already made for Root's endpoint in Phase 37. The admin.html HTML/CSS/JS
  port itself has not started.
- Chatbot UI modernization.
- Confirming a real Groq response end-to-end once the user's key is saved.
