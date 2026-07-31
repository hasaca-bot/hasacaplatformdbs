# Phase 35 — Production hotfixes (QR ordering, admin login) + Hero Image Management

## Summary

Investigating the reported "QR ordering fails online" bug uncovered **four** production defects,
three of them introduced by commit `c4d5263`. All were live on
`hasacaplatform.netlify.app`. Fixed alongside the planned Phase 35 feature work.

| # | Defect | Impact |
|---|---|---|
| 1 | SyntaxError in `index.html`'s last `<script>` block | QR page had **no menu and no `placeOrder`** — ordering impossible |
| 2 | `safeGetItem`/`safeSetItem` etc. called themselves (infinite recursion) | Admin sent **no auth header**, sessions never persisted, cart/theme never saved |
| 3 | `#adminLoginBackdrop { display:none !important }` | Login modal could **never** render → blank black `/admin` |
| 4 | `POST /api/auth/login` scoped only to the host-derived tenant | Correct passwords **rejected** for every non-`default` restaurant |

A fifth change removes `root.html`'s duplicate login screen so `/giris` is the single sign-in page.

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

### Also: the QR page had no menu at all
`index.html` defers the initial menu load on `/t/:token` paths:

```js
if (/^\/t\/[A-Za-z0-9]/.test(window.location.pathname)) {
  window.__dkDeferMenuLoad = true;   // dkInitDinein() will call loadMenuDatabase()
} else { loadMenuDatabase(); }
```

Since `dkInitDinein` was one of the functions the SyntaxError destroyed, nothing ever called
`loadMenuDatabase()` on a QR path. Confirmed on the deployed build: `window.menuData.length` was
`0` before the fix and `11` after.

---

## 1b. HOTFIX — recursive storage guards broke admin auth and all persistence

`admin.html` and `index.html` both shipped:

```js
function safeGetItem(key)      { try { return safeGetItem(key); } catch(e) { return null; } }
function safeSetItem(key, val) { try { safeSetItem(key, val); }  catch(e) {} }
```

Each guard called **itself**. Every call recursed until the stack overflowed; the `try/catch`
swallowed the `RangeError` and returned `null`. Introduced by `c4d5263`, whose stated intent was to
guard against Safari private mode throwing on `localStorage`.

Consequences:
- `getAdminToken()` always returned `''`, so the fetch interceptor **never attached an
  `Authorization` header** — every authenticated admin call 401'd.
- `setAdminToken()` stored nothing, so a session never survived a reload.
- On the customer site the cart, theme and language choices never persisted.

Fixed by pointing the guards at the real storage API, keeping the private-mode `try/catch` intact.

---

## 1c. HOTFIX — the admin login modal could never be shown

`admin.html`'s "standalone admin page overrides" block contained:

```css
#adminLoginBackdrop { display: none !important; }
```

An ID selector (specificity 100) always beat `.admin-modal-backdrop.open` (specificity 20).
`openAdminLogin()` added the `.open` class but the element stayed `display:none`, while
`document.body.style.overflow` was set to `hidden` — producing the reported blank black screen on
every direct visit to `/admin`. Only root impersonation (`/admin#imp=<token>`) worked, because that
path calls `openAdminPanel()` directly and never needs the modal.

Scoped to `#adminLoginBackdrop:not(.open)` — still hidden while closed, showable when opened.

---

## 1d. HOTFIX — tenant admins could not log in at all

`POST /api/auth/login` matched only:

```sql
WHERE username = ? AND (role = 'root' OR tenant_id = ?)   -- ? = host-derived tenant
```

Every restaurant answers on the same host (`hasacaplatform.netlify.app`), so `req.tenantId` is
always `'default'` and a **correct** password was rejected for every other tenant.

Added a fallback: when no tenant was requested explicitly and the scoped lookup misses, accept the
account only if **exactly one** account platform-wide carries that username. Ambiguous usernames are
refused, so a login can never land in the wrong restaurant; an explicit `?tenant=` is still honoured
strictly; the password is verified normally and the failure response is unchanged, so no information
about existing usernames leaks.

`adminAuth` already trusts the JWT's `tenant_id` when the host resolves to `'default'`, so once
logged in every request is scoped by the token — no `?tenant=` is needed anywhere.

`login.html` also now forwards `?tenant=` and redirects to `/admin?tenant=<slug>` using the
server-issued `tenant_id`.

Verified: `hacimustafa` signs in with no slug; the session survives a reload; `/api/auth/me` reports
tenant `hacimustafa`; the Tables view lists that tenant's 5 tables. Wrong passwords, unknown
usernames and an explicit mismatched `?tenant=` are all still rejected.

---

## 1e. Single sign-in page

`root.html` had its own login form — a second sign-in screen, when `/giris` already offers both the
restaurant panel and the root panel via its tab switcher. Removed `#loginView`, `rootLogin()`, and
the two `applyPlatformConfig()` references to the deleted branding nodes. An unauthenticated visit
to `/root` (or any 401/403 from `rootFetch`) now redirects to `/giris?panel=root`.

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
- Website Editor loads 7 default thumbnails and the current text values as clean plain text.
- 0 console errors on the customer site and the new admin view.

**Hero image round-trip** (tenant `hacimustafa`, via the real endpoints):
- Uploaded an image through the existing `POST /api/admin/upload-image` → saved a 3-image set
  (`hero-default-2.jpg`, the upload, `hero-default-5.jpg`) → customer site rendered exactly those
  three, in that order, with **3 dots** and `slidesWidth: 300%` (parameterised, not the old
  hardcoded `700%`).
- Reduced to 1 image → **1 slide, 0 dots, `100%` width**, no auto-advance, no console errors.
- Rejections confirmed: foreign URL → `invalid_hero_image_url`; 11 images → `too_many_hero_images`;
  no token → `401`; HTML in a title (`Hoş Geldiniz <b>Hacı Mustafa</b>`) → stored stripped.
- Tenant isolation: writes landed in `hacimustafa`'s settings only, authenticated by token alone.

**`formatHeroTitle()` — matches the spec exactly:**

| Input | Output |
|---|---|
| `Welcome to My Restaurant` | `Welcome to<br><em>My Restaurant</em>` |
| `Hoş Geldiniz My Restaurant` | `Hoş Geldiniz<br><em>My Restaurant</em>` |
| `Gerçek<br><em>Lezzet</em>` (pre-existing HTML) | unchanged |
| `Tek` (single word) / empty | unchanged |

A first implementation left a stray space before `<br>` (`Welcome to <br><em>…`) because the name's
preceding separator was kept. Now trimmed with `.replace(/\s+$/, '')` so the output matches the
requested format character for character.

---

## Files changed
- `index.html` — SyntaxError hotfix (−49 lines); recursive storage guards repaired; base64 hero
  images removed; data-driven carousel; `formatHeroTitle()` + call site in `applySiteConfig()`.
- `admin.html` — recursive storage guards repaired; login-modal CSS override scoped to
  `:not(.open)`; Website Editor nav item, view, JS, i18n.
- `login.html` — forwards `?tenant=`; redirects to `/admin?tenant=<slug>`.
- `root.html` — duplicate login screen removed; redirects to `/giris?panel=root`.
- `backend/server.js` — new `PUT /api/admin/website-content`; single-domain login fallback.
- `icons/hero-default-1..7.jpg` — new (extracted defaults).

## Still open
- **Live QR order not yet verified.** The production frontend is confirmed repaired (menu loads,
  `placeOrder` defined, invalid tables degrade correctly), but placing a real dine-in order online
  needs a valid production table token, which requires admin access. Local end-to-end passes.
- Local dev DB (`backend/dayikatik.db`, gitignored) was modified for testing: passwords reset for
  `dayikatik` and `hacimustafa`. Production/Neon untouched.

## Not touched (flagged for a separate decision)
- `index.html` has a hardcoded Telegram `BOT_TOKEN` in client-visible JS — should be rotated and
  moved server-side.
- `GET /api/root/boost-auditrest` (`backend/routes/root.js`) inserts 650 fabricated orders on
  **every** call with no idempotency check, and mutates state from a `GET`.
- `development-status.md` / `AI-CONTEXT.txt` were stale from Phase 32 onward; Phase 33/34
  production work is still undocumented.
