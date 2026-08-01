# Phase 43 — Google Sign-In: backend route + login buttons

## Why
Second piece of the approved "Google ile Giriş + Restoran Sahiplerine Kendi Kendine Yönetim Paneli" plan
(`C:\Users\hasan_y4hfwna\.claude\plans\evet-plan-haz-rla-composed-walrus.md`), built on Phase 42's
foundation (DB columns + shared tenant-provisioning module). This phase is the first one with real,
user-facing behavior: a working "Google ile Giriş Yap" button that either logs an existing tenant admin
into their own restaurant, or — for someone with no account at all — auto-creates a brand-new restaurant
for them and drops them straight into its admin panel.

## Backend (`backend/server.js`)
- New dependency: `google-auth-library` (Google's own ID-token verification library).
- New env var `GOOGLE_CLIENT_ID` (documented in `.env.example`; the platform owner's real Client ID —
  `679295497183-...apps.googleusercontent.com`, obtained 2026-08-01 — was added to the local `.env` for
  testing; it is not a secret and safe to keep there).
- `POST /api/auth/google` — takes `{ credential }` (the Google ID token from Google Identity Services),
  verifies it exactly once via `OAuth2Client.verifyIdToken()`, then:
  - Looks up `admin_users` by `google_sub` ONLY (never by email) — this is what makes "one Google account,
    one tenant, ever" actually hold: a returning user always lands back in the exact same tenant.
  - If nothing is found, auto-provisions a brand-new tenant via Phase 42's shared
    `createTenantWithDemoContent()` (same seeding Root's manual form uses), naming it from the person's
    Google first name (e.g. "Ahmet'in Restoranı", per the owner's explicit choice), generating a free slug
    via `generateSlugCandidate()` + a collision-retry loop reusing Root's own `SLUG_RE`/`RESERVED_SLUGS`.
    The new admin_users row carries the Google identity (`email`, `google_sub`, `avatar_url`) and an
    unusable random password hash — this account can never log in with a password, only Google.
  - A concurrent first-time sign-in (e.g. two browser tabs) that loses the unique-index race is caught and
    re-resolved to whichever request won, instead of surfacing a raw DB error — documented, accepted
    residual risk of a rare orphaned demo tenant, matching the plan's own reasoning (this codebase doesn't
    use DB transactions anywhere; adding one just for this path would be inconsistent).
  - Issues a normal session token via the EXISTING `signToken()` (`lib/auth.js`) — nothing about the app's
    actual session/auth format changed; Google's own token is verified once and never stored or reused.
  - `rateLimiter(15)` applied, same limiter `/api/auth/login` already uses.
- `GET /api/auth/me` now re-reads the `admin_users` row (not just the token payload) and returns
  `display_name`/`email`/`avatar_url` too — needed by Phase D's profile-avatar work, and generally so a
  changed name/photo shows up without forcing a re-login.
- `GET /api/platform-config` now exposes `google_client_id` (empty string when unset). Client IDs are not
  secret — safe to expose publicly, same as any real "Sign in with Google" website does. The frontend uses
  an empty value to hide the button entirely rather than showing a broken one.

## Frontend
- **`login.html`** — added the Google Identity Services script tag, a "Google ile Giriş Yap" button +
  "veya" divider, shown **only on the "Restoran" tab** (`apply()` now toggles `#googleWrap` based on
  `PANEL === 'tenant'` — the Root tab never shows it, Root login stays password-only). Refactored the
  existing password-login success path into a shared `handleLoginSuccess(d, provisioned)` function so both
  the password form and the new `onGoogleCredential()` handler use identical token-storage/redirect logic;
  a first-time (auto-provisioned) sign-in shows a distinct "Restoranınız oluşturuldu..." message instead
  of the generic "Giriş başarılı...".
- **`admin.html`** — same Google button added inside the existing embedded login modal
  (`#adminLoginBackdrop`), lazily initialized the first time the modal is actually opened
  (`initAdminGoogleButton()`, called from `openAdminLogin()`) rather than eagerly on every page load.
- Both pages poll for `window.google.accounts.id` (the `gsi/client` script loads `async defer`) with a
  capped retry loop (~5–7.5s max) rather than assuming it's ready immediately.
- New i18n keys added to both languages in both files (`login.html`'s local `I` object and `admin.html`'s
  `i18nData`) — these are two genuinely separate translation stores in this codebase, so the strings are
  duplicated rather than unified, matching how every other login-page string already works.

## Verification
- `node --check` passes on `server.js`; both HTML files' inline `<script>` blocks parse cleanly.
- Real requests against the actual local server (not just code review):
  - `GET /api/platform-config` correctly returns the real Client ID.
  - `POST /api/auth/google` with no `credential` → `400`.
  - `POST /api/auth/google` with a fake credential string → `401 invalid_google_token` — proves
    `verifyIdToken()` is making a real call against Google's own verification service, not a stub (same
    "fake key correctly rejected by the real API" pattern used to validate the Groq integration in
    Phase 38).
  - `GET /api/auth/me` (real root token) now returns `display_name`/`email`/`avatar_url` as expected
    (`email`/`avatar_url` correctly empty for a password-only account).
- Real browser walkthrough (not just curl):
  - `/giris` → "Restoran" tab shows a genuine Google-rendered button ("Google ile oturum açın") above a
    "veya" divider, above the existing username/password form.
  - Switching to the "Root Panel" tab correctly hides the Google button entirely — confirmed via page text
    extraction showing no Google-related content on that tab.
  - `/admin` with no session token → login modal opens automatically; confirmed via direct DOM inspection
    that `#adminGoogleWrap` is `display:block` and `#adminGoogleBtn` contains real Google Identity Services
    markup (genuine `nsm7Bb-HzV7m-LgbsSe`-style CSS classes only Google's own script generates) — the
    button is genuinely rendered, not a placeholder.
  - Zero Google-related console errors on either page.
- **Not automatable, deliberately deferred**: a full real click-through (choosing a real Google account in
  the popup, confirming a brand-new tenant gets created end-to-end, confirming a second sign-in with the
  same account returns to the same tenant) requires a real interactive Google consent screen — this cannot
  be scripted/faked by design (that's the whole point of ID-token verification). This is the same
  limitation the approved plan already documented and accepted; worth doing once deployed, or on request
  now if the platform owner wants to try it locally.

## Not yet built (subsequent phases, per the approved plan)
- Phase C: tenant self-service "Restoran Bilgileri" / "Marka & Site" full-screen views + endpoints.
- Phase D: "Tehlikeli Bölge" (self-pause via `settings.self_paused` + self-delete) and the real
  Google-photo profile avatar in admin.html's top-right corner (the `/api/auth/me` fields this phase added
  are the prerequisite for that, not yet consumed by any UI).

## Files changed
- `backend/package.json` — added `google-auth-library`.
- `backend/.env.example` — documented the new `GOOGLE_CLIENT_ID` var.
- `backend/.env` (local, gitignored) — real Client ID added for local testing.
- `backend/server.js` — new `POST /api/auth/google`, extended `GET /api/auth/me`, extended
  `GET /api/platform-config`, new top-level `crypto`/`OAuth2Client`/`createTenantProvisioner` requires and
  a provisioner instance shared by the new route.
- `login.html` — Google button (Restoran tab only), shared success handler, new i18n keys.
- `admin.html` — Google button inside the embedded login modal, new i18n keys.
