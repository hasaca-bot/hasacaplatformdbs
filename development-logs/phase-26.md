# Phase 26 — Gemini AI Setup Assistant backend

**Status:** ✅ Done & verified | **Date:** 2026-07-25 | fork @ localhost:17888

## Goal
`root.html`'s AI Ayarları modal existed but called `/api/root/ai-settings`, which had **no backend
route at all** (confirmed by grep in Phase 25's audit) — the button was silently broken since it was
built. Built the missing backend; zero frontend changes needed (contract already matched).

## What was done — `backend/routes/root.js`
- `GET /api/root/ai-settings` → `{ai_enabled, ai_provider:'gemini', ai_model, key_set}` (key never returned).
- `PUT /api/root/ai-settings` → saves via existing `getPlatform()`/`savePlatform()`; only overwrites
  the stored key if a non-empty one is submitted; logs `ai_settings_updated` via existing `logActivity`.
- `POST /api/root/ai-settings/test` → validates a key with a lightweight `GET .../v1beta/models/{model}`
  call (no content generation/quota spent); returns `{ok, error?}`, never throws.
- Reuses: `getPlatform`/`savePlatform`, `rootAuth`, `logActivity`, `clientIp`. No new table — `ai_key`
  lives in the existing `platform_settings` JSON blob (a mask for it already existed at the
  `platform-settings` GET, anticipating this).

## Verification
- `GET` initial → `key_set:false`; `PUT` with a key → `{success:true}`; `GET` again → `key_set:true`,
  raw key never in the response.
- `POST /test` with the real Gemini endpoint → `{"ok":false,"error":"API key not valid..."}` — proves
  the request reaches Google's API and fails gracefully on a fake key (no crash).
  > Note (Phase 30): the stored key has since been replaced with a REAL one. It now returns a quota
  > error (`limit: 0`, free tier) rather than an auth error — so calls authenticate but cannot yet
  > return content. Later phases that said "fake key" were assuming this entry still held; they don't.
- `platform-settings` still masks `ai_key`; `/tenants`, `/activity`, `/analytics`, `/landing-messages`
  all unaffected (200); no-token → 401.
- Browser: Root Panel → AI Ayarları modal **now opens** (previously broken), shows model
  `gemini-2.0-flash`, enabled toggle, "Anahtar ayarlı ✓". 0 console errors.

## Files modified
`backend/routes/root.js` only. No DB/auth/tenant-isolation change.

## Next
Widget Management, then QR Designer (both still backlog, no code yet).
