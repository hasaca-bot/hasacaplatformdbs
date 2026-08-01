# Phase 39 — Root panel AI Assistant redesigned as a chat UI

## Why
The AI Assistant (Root panel) worked correctly (confirmed end-to-end in Phase 38 — a real Groq
request returned a valid, applicable plan) but its interface was a single-turn form: one textarea,
one plan card that got wiped and replaced on every new message, no history. The user asked for a
proper chat interface that fits the rest of the site's design.

## Design
Rebuilt `#view-ai-assistant` as a scrollable message transcript with a fixed composer at the
bottom, using the same design tokens (`--gold`, `--card`, `--panel`, `--line`, `--muted`, `--ok`,
`--bad`) the rest of root.html already uses — no new dependency, no separate component library.

- **User messages**: right-aligned bubbles, `--gold` background.
- **Assistant messages**: left-aligned bubbles, `--card` background/border.
- **Sending**: appends the user bubble immediately, then an animated "typing…" placeholder bubble
  (three pulsing dots) that gets replaced in place once the real response arrives — no separate
  status line.
- **A plan** (the AI's proposed field changes) renders **inside** the assistant bubble: a summary
  line, one row per changed field showing `oldValue → newValue` (old value struck through, new
  value in `--gold`), and inline Confirm/Cancel buttons — not a separate card below the chat.
- **Confirming** a plan updates that same bubble in place (removes the buttons, adds a green
  "✓ Uygulandı" tag) rather than opening a third card, matching how a real chat shows a message's
  resolved state.
- **Only one plan is ever actionable at a time** (matches the backend's single-in-flight-plan
  design — confirmed by reading `/api/root/ai-assistant/plan|execute`). Sending a new message or
  switching the target tenant automatically marks any still-pending plan bubble as "İptal edildi"
  in place — but unlike the old design, earlier messages stay visible in the transcript instead of
  being wiped. This required moving from a single global `rootAiPlanId` to also tracking which
  specific `.ai-msg` DOM node the pending plan belongs to (`rootAiPendingBubble`), since multiple
  plan bubbles can now coexist in history even though only the latest is actionable.
- **Empty state**: a centered icon + "Nasıl yardımcı olabilirim?" placeholder before the first
  message, matching the target's current hint text.
- Composer: auto-growing textarea (caps at 120px), Enter to send / Shift+Enter for a newline,
  circular send button — standard chat-app conventions.
- Fully responsive: header stacks vertically under 640px, target selector goes full-width, bubbles
  widen to 92% max-width. Verified via actual viewport resize (375×812), not just CSS review — no
  horizontal overflow, target selector correctly reflows.

## A real bug found and fixed while testing
`/api/root/ai-assistant/plan` can return **HTTP 200 with a real error** in `data.error` (e.g. an
invalid API key) — the old code (and my first draft of the new code, which faithfully ported the
same logic) only ever read `data.error` inside the `if (!res.ok)` branch. Since this endpoint
returns 200 even on failure, a bad key silently fell through to the "I couldn't derive an
actionable change from your request" message — actively misleading, since a broken key and a
genuinely vague request need completely different next steps from the user. Caught this by testing
locally: the local dev server still had a placeholder key from earlier structural testing, so real
requests reliably failed and surfaced the mislabeling immediately. Fixed by checking `data.error`
regardless of `res.ok`.

## Verification
- All of root.html's inline `<script>` blocks pass `node --check` (only the pre-existing JSON-LD
  false positive, as in every prior phase).
- No stale references remain to any of the removed old elements/functions
  (`rAiStatus`/`rAiPlanCard`/`rAiSummary`/`rAiActions`/`rAiUnsupported`/`rAiConfirmBtn`/
  `rAiResultCard`/`rAiResultSummary`) — confirmed via full-file grep, zero hits.
- Logged into the real Root panel (not curl) and drove the actual UI:
  - Empty state renders correctly with the right hint text and full target list (Platform + all 4
    real tenants).
  - Sent 3 different real messages through Groq — two came back "no actionable change" (real LLM
    variance, rendered correctly as a plain assistant bubble) and confirmed via the raw network
    response that a well-formed action plan **is** returned by the same backend for the same kind
    of request (verified in Phase 38's production test) — the UI correctly renders whichever shape
    comes back.
  - Triggered a real "Invalid API Key" error (local dev key is a placeholder) — confirmed it now
    renders as a red-bordered error bubble with the actual message, not the misleading
    no-actionable-change text.
  - 0 console errors throughout.
  - Mobile viewport (375×812): no horizontal overflow, header reflows to a column, target selector
    goes full-width — confirmed via actual resize + computed-style checks, not just CSS review.

## Not fully verified
The Confirm → Execute → "✓ Uygulandı" path was verified by direct code review (a faithful,
minimally-changed port of the original `rootAiConfirm()`'s network call, now scoped to a specific
bubble instead of a single fixed DOM section) and by confirming `rootAiPlanHTML()` renders the
correct structure — but not with a live click-through against a real successful plan, since the
local dev server's key is a placeholder and the user's real key lives only in production (which
does not yet have this redesign deployed). Worth a real click-through once deployed.

## Files changed
- `root.html` — `#view-ai-assistant` HTML replaced with the chat shell; ~90 lines of new
  `.ai-chat-*`/`.ai-msg`/`.ai-plan-*` CSS added to the existing inline `<style>` block; the six
  `rootAi*` JS functions rewritten (message-bubble helpers, per-bubble plan state, the `data.error`
  fix); two new i18n keys (`root_ai_asst_empty_title`, `root_ai_asst_platform_hint2`) added to both
  TR/EN — every other AI-assistant i18n key was reused as-is.
