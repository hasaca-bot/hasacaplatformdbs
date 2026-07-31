# Phase 35 — Hero Image Management, plain-text Hero editor, and a critical production hotfix

## Summary

Two things landed in this phase:

1. **HOTFIX (critical, production-down):** `index.html`'s last `<script>` block had a hard
   **SyntaxError** that prevented the entire block from parsing. Every function it defined —
   including `placeOrder()` — was `undefined` in production. Customers scanning a table QR could
   see the menu and their table name, but pressing "Sipariş Ver" failed with a
   `ReferenceError`. This is the reported "QR ordering fails online" bug.
2. **Feature (planned work):** Hero image management in the admin panel + a plain-text hero
   text editor, per the Phase 35 plan.

---

## 1. HOTFIX — dine-in QR ordering was completely broken

### Symptom
Customer scans the QR at table 3 → the page loads, the menu loads, the table badge does *not*
appear → pressing "Sipariş Ver" does nothing / reports a failure. Reported as
"works locally, fails online".

### Root cause
Commit `c4d5263` ("...adding dkDineinReady lock") refactored `dkInitDinein()` to wrap its body in a
`window.dkDineinReady = (async () => { ... })()` IIFE. The new IIFE and a closing `}` for
`dkInitDinein` were added at line 7094 — **but the old function body was never deleted.**

That left lines 7095–7142 (the previous implementation) stranded at the *top level* of the script,
followed by an orphan `}` at line 7143:

```js
async function dkInitDinein(){
  ...
  window.dkDineinReady = (async () => { ... })();
}                       // ← 7094, closes dkInitDinein
  try {                 // ← 7095, now TOP-LEVEL dead code
    ...
    res = await fetch(...);   // ← SyntaxError: await outside async function
    ...
  } catch(e){ ... }
}                       // ← 7143, orphan brace
```

`await` at top level in a classic (non-module) `<script>` is a **parse-time** SyntaxError, so the
browser discarded the whole block. Nothing in it was ever defined:

| Function | Before fix | Consequence |
|---|---|---|
| `placeOrder` | `undefined` | **`onclick="placeOrder()"` → ReferenceError → orders never sent** |
| `dkInitDinein` | `undefined` | table never resolved, no dine-in mode, no badge |
| `applySiteConfig` | `undefined` | tenant branding/logo/SEO/hero never applied |
| `dkCallService` | `undefined` | waiter / bill buttons dead |
| `dkToast`, `refreshCartUI` | `undefined` | cart UI + toasts dead |

Verified against the **live deployed** file, not just the local copy:
`curl https://hasacaplatform.netlify.app/menu` → extract script blocks → `node --check` reproduces
the identical SyntaxError at the same line.

### Note on "works locally"
It did **not** actually work locally either — the same SyntaxError was present in the local file and
in `git HEAD`. The local success was from an older/cached page. The fix repairs both environments.

### Fix
Deleted the 49 dangling lines (7095–7143). No logic change: the removed block was a byte-for-byte
older duplicate of what the `dkDineinReady` IIFE already does, only without the retry/lock handling.
Boundaries were asserted line-by-line before the deletion so it could not slip.

### Verification (local, real end-to-end flow)
- All script blocks parse (`node --check` clean; the only remaining "error" is the JSON-LD block,
  which is not JavaScript).
- `/t/nWgRhwtOXN` (Masa 3) → `dkDineinToken` set, `dinein-mode` active, badge rendered,
  order button enabled.
- `addToCart()` → `openCheckout()` → `placeOrder()` → cart cleared, no error message.
- DB confirms: `order_type=dinein`, `table_name="Masa 3"`, `status=received`, `total=62`,
  1 order item — a correct dine-in order.

---

## 2. Feature — Hero Image Management + plain-text Hero editor

### Discovery
A hero image carousel already existed in `index.html`, but was **not** tenant-configurable: 7 images
were hardcoded as base64 data URIs shared by every tenant, with slide count, dot count and the JS
all hardcoded to `7`. This was why `index.html` was 1.1 MB.

### Changes

**Extraction.** The 7 base64 blobs were decoded to real static files
`icons/hero-default-1.jpg` … `-7.jpg` and removed from the HTML.
`index.html`: **1.1 MB → ~295 KB**.

**`index.html` — data-driven carousel.** The carousel IIFE became
`window.__heroCarousel = { render(images) }`, rebuilding slides and dots from an array and
parameterising all width/transform math by `array.length` instead of the literal `7`. Falls back to
the 7 defaults when a tenant has none, so nothing changes visually for existing tenants. Degrades
gracefully at 1 image (static slide, no dots, no auto-advance) and 0 images.

**`index.html` — `formatHeroTitle(text, name)`.** Render-time only; storage stays plain text.
Wraps the last occurrence of the tenant's own name in `<br><em>…</em>`, falling back to wrapping the
last word. **Any value already containing `<` passes through untouched**, so Root's existing
raw-HTML branding path and all pre-existing seed data are unaffected.

```
Input:  "Welcome to My Restaurant"      → "Welcome to<br><em>My Restaurant</em>"
Input:  "Hoş Geldiniz My Restaurant"    → "Hoş Geldiniz<br><em>My Restaurant</em>"
```

**`backend/server.js` — `PUT /api/admin/website-content`.** One tenant-scoped endpoint
(`adminAuth`) for the whole Website Editor, following the existing `site-widgets`/`qr-style`
merge pattern: read `tenants.settings`, merge, write, `invalidateTenantCache()`, `logActivity()`.
- `hero_images`: must be an array, max 10, each entry must start with `/uploads/` or `/icons/`
  (same-origin only — never accepts arbitrary URLs).
- `hero_title_tr|en`, `hero_sub_tr|en`: HTML tags stripped server-side and capped at 200 chars, so
  "the panel only ever stores plain text" holds even against pasted markup.
- No schema change (existing `settings` JSON blob).

**`admin.html` — "Web Sitesi Editörü" view.** New nav item + view using the existing
`AP_VIEW_MAP`/`showAdminView` pattern:
- Thumbnail grid of the tenant's hero images with per-image remove (×) and ↑/↓ reorder
  (disabled at array bounds), pre-populated with the 7 defaults so admins see what is live.
- "Görsel Ekle" reuses the existing `POST /api/admin/upload-image` endpoint unchanged
  (FileReader → base64 → upload → append returned URL).
- 4 plain textareas for hero title/subtitle TR/EN. Existing HTML is stripped for display, so the
  editor never shows raw markup. Nothing in the UI mentions `<br>` or `<em>`.
- TR/EN i18n strings added for every new label.

### Verification
- Baseline (tenant with no `hero_images`): still exactly 7 slides + 7 dots, same order, same
  timing — design unchanged, now served as files instead of inline base64.
- Hero title renders `"Hoş Geldiniz<br><em>My Restaurant</em>"` — matches the requested example.
- Website Editor loads 7 default thumbnails and the current text values as clean plain text.
- 0 console errors on the customer site and the new admin view.

---

## Files changed
- `index.html` — hotfix (−49 lines); base64 hero images removed; data-driven carousel;
  `formatHeroTitle()` + call site in `applySiteConfig()`.
- `backend/server.js` — new `PUT /api/admin/website-content`.
- `admin.html` — Website Editor nav item, view, JS, i18n.
- `icons/hero-default-1..7.jpg` — new (extracted defaults).

## Not touched (flagged for a separate decision)
- `index.html` has a hardcoded Telegram `BOT_TOKEN` in client-visible JS — should be rotated and
  moved server-side.
- `GET /api/root/boost-auditrest` (`backend/routes/root.js`) inserts 650 fabricated orders on
  **every** call with no idempotency check, and mutates state from a `GET`.
- `development-status.md` / `AI-CONTEXT.txt` were stale from Phase 32 onward; Phase 33/34
  production work is still undocumented.
