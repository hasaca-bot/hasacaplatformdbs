# Phase 46 — Live-feed self-healing, Google Sign-In loading feedback, favicon/logo consistency, landing B&W theme

## Why
Four separate reports from the platform owner after live-testing the Google Sign-In feature (Phases
42–45). Investigated all four before writing any code; none turned out to be what they first looked like:

1. **Admin panel needs a manual refresh to show new orders.** NOT a regression of Phase 40's SSE fix —
   that fix (bypassing Netlify's non-streaming proxy) is still fully intact and correct. The real,
   separate, pre-existing bug: `connectAdminEvents()`'s `onerror` handler was a no-op comment assuming
   "the browser auto-reconnects" — true only for network-level drops. Per the SSE spec, a *fatal* error
   (a 401 once the 24h session token expires, or the backend restarting mid-reconnect) puts the connection
   into `CLOSED` permanently with **no further automatic retry**, silently. A panel left open for a long
   shift is exactly the scenario this hits.
2. **"Google ile Giriş Yap" seems to do nothing on the first click, works ~10s after a second click.**
   Two real, compounding causes: Render's free hosting plan cold-starts (documented in this project's own
   Phase 35 log as "~30-60s") — today was this route's first-ever live traffic — and the click handlers
   showed **zero loading feedback**, so a slow-but-working first attempt looked like a dead click.
3. **Logo/favicon look "basık" (squashed).** Direct inspection found the actual served favicon files are
   a broken leftover — a flat orange square with no icon at all (pre-monochrome-rebrand debris). Separately,
   Root's own platform favicon setting had an accidentally-uploaded giant non-square image in it (visually
   confirmed — this alone fully explains "squashed", it was being crushed into a tiny square tab-icon
   slot). A correctly designed, currently-unused SVG icon (`icons/favicon.svg` — same triangle/layers mark
   already used in root.html's sidebar and landing.html's header, already has rounded corners baked in)
   was sitting in the repo the whole time, just never wired up as the actual favicon anywhere.
4. **No Black & White theme option on landing.html.** Confirmed: never built. The rest of the platform
   (customer site, admin panel, root panel) already has a working theme system; landing.html only ever had
   its one fixed dark-luxury look.

## Fixes

### 1. Admin live-feed self-heals (`admin.html`)
`connectAdminEvents()`'s `es.onerror` now checks `es.readyState === EventSource.CLOSED` and, if so,
schedules a real reconnect attempt 5 seconds later via `setTimeout`, always closing/nulling the previous
`EventSource` first so connections never pile up. Nothing about the SSE URLs, event names, or backend
routes changed — those were already confirmed correct; this is scoped purely to "what happens when the
connection dies."
**Verified live, end-to-end**: deliberately broke the session token, called `connectAdminEvents()`,
confirmed the resulting 401 set `readyState=CLOSED` and my handler scheduled a retry; waited past the
5s window and confirmed a *second* automatic retry fired (proving it doesn't give up after one attempt);
then fixed the token and confirmed the *next* automatic retry succeeded and opened a real, working
connection (`readyState: 1 = OPEN`) — all without any page reload.

### 2. Google Sign-In loading feedback + backend hygiene (`login.html`, `admin.html`, `backend/server.js`)
Both `onGoogleCredential` (login.html) and `onAdminGoogleCredential` (admin.html) now show an immediate
status message ("Giriş yapılıyor…"/"Signing in…") the instant the button fires, and ignore a second click
while one request is already in flight (`googleSigninInProgress`/`adminGoogleSigninInProgress` flags) —
verified live by calling each handler with a fake credential and confirming the message renders
synchronously (before the network response even arrives), and clears/shows a real error correctly once
the (intentionally fake) request fails. This does not — and cannot — eliminate Render's actual cold-start
delay itself (that's a hosting-plan characteristic the user can only change by upgrading the plan); it
fixes the "did my click even register?" confusion, which was the other half of the reported symptom.
Also hoisted `OAuth2Client` from a per-request `new OAuth2Client(...)` (inside the route handler) to a
single module-scope instance built once at startup, so Google's public-cert cache — which the library
attaches to the instance itself — actually persists across requests as intended, instead of being thrown
away and re-fetched on every single call.

### 3. Favicon + brand-mark consistency (6 HTML files, `backend/db.js`, `backend/server.js`, `admin.html`, `root.html`)
- Added `<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg">` as the primary favicon on
  every page (`index.html`, `admin.html`, `root.html`, `landing.html`, `login.html`, `marketing.html`) —
  zero new dependency, works in all modern browsers, already has rounded corners (`rx="6"`) and already
  matches the platform's real intended logo design. Old broken `.ico`/`.png` files kept only as a legacy
  fallback for the handful of contexts that don't support SVG favicons; regenerating those properly is
  explicitly out of scope here (needs either an external tool or a new image-processing dependency).
- Fixed the platform's own favicon default (`backend/db.js`'s fresh-install seed, `backend/server.js`'s
  `/api/platform-config` fallback) from `/favicon.ico` to `/icons/favicon.svg`.
- **Found and cleared real bad data while verifying**: the live `platform_settings` row already had an
  explicit `favicon_url` set — to a giant, clearly-wrong, non-square uploaded image (confirmed by viewing
  the actual file). This alone fully explained the "squashed" complaint for the Root panel specifically.
  Cleared it via the real API so it now correctly falls back to the new SVG default.
- Fixed `admin.html`'s sidebar brand mark — it was a plain hardcoded "H" letter (styled to fake a logotype
  via a gradient-text-clip trick), now the exact same inline SVG `root.html`'s sidebar already used, for
  visual consistency between the two panels. `landing.html`'s header already used the correct mark; no
  change needed there beyond its favicon link.
- Added a favicon **upload** field to both `admin.html`'s "Marka & Site" view and `root.html`'s tenant
  branding modal (`bFavicon`, mirroring the existing `bLogo` pattern) — the backend already accepted
  `favicon_url` in both endpoints' allowed-field lists (from Phase 44 and earlier), it just had no UI
  anywhere to actually set it for a TENANT's own customer-facing favicon. `index.html`'s existing runtime
  favicon-rewrite JS needed no changes — it already reads this field correctly once populated. Noted,
  not fixed (would need a new image-processing dependency): a tenant who uploads a non-square image will
  still see it look stretched — the fix here is giving them a place to upload a proper square image, not
  auto-correcting a bad one.
**Verified live**: confirmed via the real browser that both root.html's and admin.html's sidebar now show
the identical SVG mark; confirmed the favicon `<link>` tags on every page point to the SVG; confirmed the
new favicon upload fields exist in both UIs; confirmed clearing the bad platform favicon data via the real
API correctly falls through to the new default.

### 4. Landing page Black & White theme (`landing.html`)
Added a `--gold-rgb` companion token (the existing `--gold-soft` and 8 other component rules used a raw
`rgba(216,184,119,...)` literal rather than referencing a variable — same class of fix Phase 32 already
did for `index.html`'s own theme system) and a `body.theme-mono{ --gold:#9a9a9a; --gold-rgb:154,154,154; }`
override block that neutralizes the warm accent into gray everywhere it's used, site-wide, through the
existing token references — no need to touch each of the 9 usage sites individually beyond the one-time
token-ification. Added a toggle button (nav header + footer, next to the existing language switcher,
matching its visual style) calling `toggleLandingTheme()`, persisted under its own `landing_theme`
localStorage key — deliberately NOT the shared `theme` key the rest of the platform uses, since `'bw'`
already means something different (a *light* theme) elsewhere in this codebase's own documented naming
trap, and landing.html only ever has one look to toggle against, not a 3-way engine.
**Verified live**: toggled the theme via the real button function, confirmed `--gold` computed value
actually changes (`#d8b877` → `#9a9a9a`) and the `theme-mono` class applies; reloaded the page and
confirmed the choice persists.

## Files changed
- `admin.html` — SSE reconnect logic, Google loading state + guard flag, favicon `<link>`, sidebar SVG
  mark, new favicon upload field + JS + i18n keys in the branding view.
- `login.html` — Google loading state + guard flag, favicon `<link>`.
- `root.html` — favicon `<link>` (secondary, already had the SVG mark), new `bFavicon` field + JS +
  i18n keys in the tenant branding modal.
- `landing.html` — favicon `<link>`, `--gold-rgb` token + 9 usage sites converted to reference it,
  `theme-mono` override block, theme toggle button (×2) + CSS + JS + persistence.
- `index.html`, `marketing.html` — favicon `<link>` only.
- `backend/server.js` — `OAuth2Client` hoisted to module scope, `/api/platform-config`'s favicon fallback.
- `backend/db.js` — fresh-install platform favicon default.
