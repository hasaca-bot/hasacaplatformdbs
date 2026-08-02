# Phase 48 — Landing page CTA becomes "Kayıt Ol"/"Giriş Yap", pricing simplified to a 14-day-free trial, admin membership card shows trial days left

## Why
User request (3 parts, verbatim): the landing page's top-right "Ücretsiz Demo" button should instead say
"Kayıt Ol" (Register) for a new visitor, or "Giriş Yap" (Log In) if they're already signed in; the ₺0
pricing tier should be removed and the ₺749 tier should show "first 14 days free"; and the admin panel's
membership-status area should surface this trial info (not just a static "Aktif"/"Deneme" label).

## 1. Landing page nav CTA — dynamic Kayıt Ol / Giriş Yap
`landing.html`'s two CTA buttons (`#navCtaBtn` desktop, `#navCtaBtnMobile` mobile) no longer link to
`/demo-talep`. On load, a small IIFE checks `localStorage.hasaca_admin_token` (the same key admin.html
itself uses) and, if present, verifies it with a real `GET /api/auth/me` call — mirroring the exact
trust-but-verify pattern admin.html's own login restore already uses, so a stale/invalid token doesn't
falsely show "Giriş Yap". Verified: an invalid token correctly falls back to "Kayıt Ol" → `/giris`; the
logged-out default state also correctly shows "Kayıt Ol" → `/giris`; both re-render on language switch
via `updateNavCta()`, called from `setLang()`.

## 2. Pricing — no more ₺0 tier, ₺749 tier is a 14-day free trial
Removed the `p_start` (₺0 "Başlangıç") entry from `landing.html`'s `PLANS` array entirely. The remaining
`p_pro` (₺749) plan gained a `trial:true` flag, rendered as a new `.trial-note` line ("İlk 14 gün ücretsiz"
/ "First 14 days free") under the price. Its CTA now links to `/giris` (was `/demo-talep`), matching the
new "sign up directly" flow. Also fixed a dangling reference this removal exposed: `p_pro.feats` used to
include `pf_all_start` ("Everything in Starter"), which pointed at a plan that no longer exists — replaced
with the actual concrete features (`pf_qr`, `pf_menu`) directly.

## 3. Admin panel — real trial-days-remaining display
`backend/masterTemplate.js`'s `defaultSettings()` (used by every new tenant, both Root's manual creation
and Google self-signup — both already flow through the shared `tenantProvisioning.js`) now seeds
`subscription_status: 'trial'` and `trial_started_at: Date.now()` instead of a bare `'active'`. This is a
lightweight, real-but-not-billing-integrated trial marker, consistent with Phase 42's original plan to
prepare-but-not-build actual billing.

`admin.html`'s `loadRestaurantInfo()` now branches on this: if `subscription_status === 'trial'` and
`trial_started_at` is set, computes days elapsed and shows "Deneme Sürümü — N gün kaldı" (or "Deneme
Süresi Doldu" once expired); otherwise falls back to the existing status-pill behavior unchanged (so
existing tenants without `trial_started_at` — seeded before this phase — keep showing "Aktif" exactly as
before, no regression). New i18n keys `admin_membership_trial_days`/`admin_membership_trial_ended` added
to both TR and EN blocks, next to the existing `admin_membership_status_trial` key.

Verified directly by calling `loadRestaurantInfo()` with a mocked `window.__siteConfig`: a 5-days-elapsed
trial correctly shows "9 gün kaldı"; a 15-days-elapsed trial correctly shows "Deneme Süresi Doldu". The
existing `default` tenant (seeded before this phase, no `trial_started_at`) confirmed to still fall back
to the unchanged `'active'` path with zero regression.

## Files changed
- `landing.html` — nav CTA buttons + login-check IIFE + `updateNavCta()`, `PLANS` array (removed ₺0 tier,
  added trial note to ₺749 tier), `renderPlans()` trial-note rendering + CTA href, new i18n keys
  (`nav_cta_register`, `nav_cta_login`, `p_trial_note`), new `.trial-note` CSS.
- `backend/masterTemplate.js` — `defaultSettings()` now seeds `subscription_status:'trial'` +
  `trial_started_at:Date.now()` for all new tenants.
- `admin.html` — `loadRestaurantInfo()` trial-days-aware membership pill logic, new i18n keys
  `admin_membership_trial_days`/`admin_membership_trial_ended` (TR+EN).
