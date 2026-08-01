# Phase 41 — Admin panel AI Assistant redesigned as a chat UI (matches Root's Phase 39)

## Why
User: "now redesign the chatbot screen to match the site" — a follow-up to Phase 39, which redesigned
only the **Root panel's** AI Assistant into a chat interface. The **Admin (tenant) panel's** AI Assistant
(Phase 27 Part B) was still the original single-turn form: one textarea, a plan card that got wiped and
replaced on every new message, no history — visually inconsistent with the now-redesigned Root panel and
the rest of the monochrome-rebranded site.

## Design
Ported root.html's Phase 39 chat UI verbatim onto admin.html's `#adminPanelOverlay`-scoped `--ap-*` token
system (the same reuse pattern already established for the dashboard analytics chart in Phase 38) — same
HTML structure, same CSS class names (`.ai-chat*`, `.ai-msg`, `.ai-bubble`, `.ai-plan*`, `.ai-typing`),
same JS behavior, all under an `#adminPanelOverlay` selector prefix and reading `--ap-gold`/`--ap-card`/
`--ap-muted`/etc. instead of root.html's `--gold`/`--card`/`--muted`/etc., so it never touches the
customer-facing `:root` tokens.

One deliberate difference from Root's version: **no target selector**. Root's assistant can target either
the platform's own branding or one specific tenant's menu (Phase 30), so it needs a "Hedef" dropdown.
Admin's assistant is always scoped to the logged-in tenant's own products/categories — there's nothing to
select, so the chat header is just the title + description, no `.ai-chat-target-wrap`.

Renamed the JS functions from `aiAssistant*` (old single-turn design) to `adminAi*` (chat design) to avoid
confusion with the removed functions, while keeping the three still-useful helpers as-is: `aiT()` (i18n
lookup), `aiAsstEsc()` (HTML escaping), `aiAsstResolveLabel()` (resolves a friendly `"Ürün Adı · field"`
label for a plan action client-side, since — unlike Root's actions — admin's backend action objects don't
include a pre-built `label`, only `table`/`field`).

## A pre-existing bug found and fixed (same bug class as Phase 39)
`POST /api/admin/ai-assistant/plan` (`backend/server.js`) can return **HTTP 200 with a real error** in
`data.error` — e.g. `return res.json({ planId: null, ..., error: e.message })` when the Groq call throws
(bad key, provider error, etc.). The OLD frontend code (`aiAssistantSend()`) only ever read `data.error`
inside the `if (!r.ok)` branch, which never triggers since this endpoint always returns 200 — so a broken
key silently fell through to "İsteğinizden uygulanabilir bir değişiklik çıkaramadım" (misleading — a
broken key and a genuinely vague request need completely different next steps). This is the exact same bug
class Phase 39 found and fixed in root.html's equivalent endpoint; it existed independently here too and
had not been fixed yet. Fixed the same way: `if (!res.ok || data.error)` checked before the
no-actionable-change branch. Confirmed live with a real local request — see Verification below.

## Files changed
- `admin.html` — `#view-ai-assistant` HTML replaced with the chat shell (no target selector); ~65 lines of
  new `#adminPanelOverlay`-scoped `.ai-chat-*`/`.ai-msg`/`.ai-plan-*` CSS added (plus one extra rule not
  in Root's version, `.ai-msg-tag.err`, used for an inline execute-failure message — admin.html has no
  `toast()`/`alert()` convention to reuse, unlike root.html's `toast()`); the AI Assistant JS section
  rewritten (`aiAssistantSend/RenderPlan/Confirm/Cancel` → `adminAiSend/PlanHTML/Confirm/CancelBubble/
  Cancel` + message-bubble helpers), keeping `aiT`/`aiAsstEsc`/`aiAsstResolveLabel` unchanged; two new
  i18n keys (`admin_ai_empty_title`, `admin_ai_empty_sub`) added to both TR/EN — every other `admin_ai_*`
  key was reused as-is (send/thinking/confirm/cancel/applied/unsupported/not_configured/error_generic/
  conn_error/no_actions, plus the existing `ph_ai_asst` placeholder key).
- `backend/server.js` — **not modified**. The 200-with-error bug is real but lives entirely in a response
  shape the frontend now handles correctly; no backend change was needed (matches how Phase 39 fixed the
  identical bug in root.js purely on the frontend too).

## Verification
- No stale references remain to any of the removed old elements/functions (`aiAsstStatus`/
  `aiAsstPlanCard`/`aiAsstSummary`/`aiAsstActions`/`aiAsstUnsupported`/`aiAsstConfirmBtn`/
  `aiAsstResultCard`/`aiAsstResultSummary`/`aiAssistantSend`/`aiAssistantRenderPlan`/`aiAssistantConfirm`/
  `aiAssistantCancel`/`aiAsstInput`/`aiAsstSendBtn`) — confirmed via full-file grep, zero hits.
- All of admin.html's inline `<script>` blocks pass a syntax check (excluding the two pre-existing
  `application/ld+json` blocks, which are not JS).
- Logged into the real Admin panel locally (not curl) and drove the actual UI:
  - Empty state renders correctly (icon, "Nasıl yardımcı olabilirim?" title, tenant-appropriate subtitle
    about products/categories/prices — not Root's platform-branding wording).
  - Sent a real message through the chat composer. The local dev server's placeholder Groq key correctly
    triggered a real "Invalid API Key" provider error — confirmed it renders as a red-bordered error
    bubble with the actual message, **not** the misleading no-actionable-change text, proving the
    `data.error`-regardless-of-`res.ok` fix works correctly here (this is the same real-error condition
    that surfaced the identical bug during Phase 39's testing).
  - 0 console errors.
  - Verified both the site's dark theme and light theme render correctly (bubble alignment, colors,
    borders) at both mobile (349px) and desktop widths — no horizontal overflow, sidebar/composer layout
    intact.

## Not fully verified
Same caveat as Phase 39: the Confirm → Execute → "✓ Uygulandı" path and the plan-preview rendering
(`.ai-plan-row` diff rows, unsupported-list rendering) were verified by direct code review (a faithful,
minimally-adapted port of root.html's already-verified `rootAiPlanHTML`/`rootAiConfirm`) but not with a
live click-through against a real successful plan, since the local dev server's key is a placeholder.
Worth a real click-through once a valid Groq key is confirmed working against this tenant in production.
