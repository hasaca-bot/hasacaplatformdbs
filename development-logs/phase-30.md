# Phase 30 — Root AI Assistant: tenant-targeted menu editing

**Status:** ✅ Done & verified (with one honest gap, below) | **Date:** 2026-07-26 | fork @ localhost:17888

## Goal
Complete the feature Phase 27 shipped half-scoped. Root's AI assistant could only edit the platform's
own `ALLOWED_PLATFORM_KEYS` (platform name, logos, landing copy); editing a specific restaurant's menu
was explicitly deferred as needing "a tenant-selector UI". This phase adds that selector and the
tenant-scoped path behind it.

## What was done
- **`backend/routes/root.js`** — `POST /ai-assistant/plan` now takes an optional `targetTenant`:
  - empty/absent → **platform scope**, behavior completely unchanged from Phase 27.
  - a tenant id → **tenant scope**: verifies the tenant exists (404 `tenant_not_found` otherwise),
    loads THAT tenant's products+categories, and uses the same menu system-prompt and the same field
    whitelist the tenant-side assistant enforces (`products: name_tr/name_en/description_tr/
    description_en/price/category`, `categories: name_tr/name_en`).
  - Both branches were refactored behind a shared `resolveActions(plan, unsupported)` closure so the
    Gemini call, unsupported handling, caching and response shape stay in ONE place, not forked.
  - Each action now also carries a `label` (`"Günün Çorbası · price"` for rows, the field name for
    platform) purely for display — the Root panel has no client-side copy of a tenant's menu to
    resolve names from, unlike admin.html.
  - The plan cache entry records its `scope`; `POST /ai-assistant/execute` branches on it — platform
    plans go through `savePlatform()` exactly as before, tenant plans re-verify each row still belongs
    to that tenant immediately before writing and then use the same
    `UPDATE {table} SET {field}=? WHERE id=? AND tenant_id=?` statement `PUT /api/products/:id` uses.
    `logActivity` records the real `tenantId` for tenant-scoped applies.
- **`root.html`** — a "Hedef" (Target) `<select>` above the message box, populated from the existing
  `tenants` global when the AI view opens; a scope-specific hint line under it; `targetTenant` sent
  with the plan request; `rootAiRenderPlan` prefers `a.label`. **Switching target clears any pending
  plan preview** (`rootAiTargetChanged()` calls `rootAiCancel()`) — a cached plan belongs to the scope
  it was built for, so leaving a stale preview on screen next to a different target would invite
  applying it against the wrong restaurant. TR+EN for all new strings.

## Verification
- Target select populates with `Platform (HASACA markası)` + both real tenants; hint text swaps
  correctly per selection.
- `targetTenant:'no-such-tenant'` → **404 `tenant_not_found`** (the new branch's guard, hit before any
  Gemini call).
- Both scopes reach the Gemini call and degrade gracefully on failure — no crash, no fabricated plan,
  error surfaced to the UI.
- Tenant-scoped preview rendering verified with a synthetic plan object (client-side only, writes
  nothing): the action row shows the human-readable `Günün Çorbası · price` label, and switching the
  target afterward correctly hid the plan card and nulled `rootAiPlanId`.
- **The tenant-scoped execute SQL was verified directly against the real dev database** with a
  throwaway script (`scratchpad/verify_exec.js`, not part of the repo): the ownership `SELECT` finds
  the row for the correct tenant, the `UPDATE` writes, the SAME statement run with a *different*
  tenant id reports **0 changes and leaves the value untouched**, and the test value was reverted to
  the original. This is the first time this write path has actually been executed — Phase 27 shipped
  the equivalent tenant-side branch without ever running it (no plan could be obtained), so this
  retroactively covers that too.
- Regression: Restaurants + Dashboard views, and the Branding modal (incl. Phase 28's widget
  checkboxes) all still work.

## Correction to earlier logs
Phases 27 and 29 recorded that "no real Gemini API key is configured (verified against a fake key)".
That was an assumption, and it is **wrong**. The configured key is real and reaches Google's API — it
currently returns a genuine quota error (`limit: 0` on the free tier, i.e. the key's project has no
free-tier allowance), not an auth error. So the request/auth path to Gemini is proven working
end-to-end; what remains unproven is only the *content* of a successful response.

## Known gap (not papered over)
Because no successful Gemini response can be obtained under a zero quota, the full
`natural language → plan → confirm → execute` round trip still has not run start-to-finish. Verified
instead: every stage independently (input validation, tenant lookup, prompt construction, Gemini
transport, action validation, preview rendering, and — new this phase — the actual write statement
plus its isolation guard against the real DB). Enabling billing/quota on the Gemini key is all that
stands between this and a complete end-to-end test.

## Files modified
`backend/routes/root.js`, `root.html`. No DB schema change, no new endpoint, no change to auth, tenant
isolation rules, or the tenant-side assistant.

## Next
No major backlog item remains. Fast-follows: menu-generation wizard (create, not just edit); QR
logos/frames (needs an image-compositing dependency); Root-force-disable widget tier.
