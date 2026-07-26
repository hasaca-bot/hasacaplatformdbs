# Phase 31 — Root routing: "/" becomes the HASACA landing page

**Status:** ✅ Done & verified | **Date:** 2026-07-26 | fork @ localhost:17888

## Goal
`http://localhost:17888/` (and any bare-host access — no tenant subdomain) rendered the `default`
demo tenant's restaurant site instead of the HASACA marketing home. Fixed the platform's own entry
point without touching how real tenant subdomains resolve.

## Root cause
Tenant resolution (`lib/tenant.js`) is entirely host-based: `slugFromHost()` maps a real subdomain to
that tenant, and maps everything else (bare `localhost`, an IP, the platform's own apex domain,
`*.onrender.com`/`*.netlify.app`, or any unmatched host) to the fallback tenant id `'default'`.
`app.get('/', ...)` then unconditionally sent `index.html`, which renders whatever `req.tenant`
resolved to — on the bare host, that's always the `default` demo tenant.

## What was done — `backend/server.js`
- `app.get('/', ...)` now decides by the **raw host** (`slugFromHost`, imported from `lib/tenant.js`),
  not by `req.tenantId` — `req.tenantId` can't distinguish "true bare-host fallback" from an actual
  tenant whose id happens to be `default`. Real subdomains are unaffected; only the no-subdomain case
  now serves `landing.html` instead of `index.html`.
- The existing dev-only `?tenant=` override (`lib/tenant.js`'s `allowQueryOverride`, gated to
  `!process.env.DATABASE_URL`) is honored at this same route: an explicit `?tenant=<slug>` always
  serves `index.html` for that tenant, even when the slug is literally `default` — an explicit request
  for a tenant should never be redirected to the landing page.
- New `GET /tenant/:slug` — redirects to `/?tenant=<slug>`, reusing that same existing override end to
  end (the front-end fetch interceptor already in `index.html`/`admin.html` picks it up automatically).
  Zero new tenant-resolution logic; a path-based way to reach any tenant (including `default`) without
  subdomain DNS, for local dev / internal preview.
- New `GET /admin` and `GET /login` — clean aliases alongside the existing `/admin.html` and
  `/giris`/`/yonetici-girisi`/`/restoran-girisi`/`/root-girisi` (all kept; the marketing site and
  existing bookmarks link to the Turkish paths). `/root` already existed and needed no change.

## What was done — `admin.html`
- The sidebar's "Siteyi Görüntüle" (View Site) link was a bare `href="/"`. Once `/` stopped
  automatically showing a tenant's site, this would have broken the single most common case —
  administering the `default` tenant itself. Fixed: the link now gets its `href` set to
  `/tenant/<current tenant id>` as soon as `/api/site-config` resolves (same callback that already
  caches `window.__siteConfig`), so it opens the right tenant's site regardless of which tenant is
  loaded or what host the admin panel itself is on.

## Bug caught during verification (fixed before calling this done)
The first version of the `/` handler checked ONLY the host header, so `/tenant/default`'s redirect to
`/?tenant=default` still hit the bare-host branch and served the landing page — the tenant override was
being silently ignored at exactly the route that's supposed to honor it. Caught by actually following
the redirect and checking the served page, not just checking the redirect fired. Fixed by checking
`req.query.tenant` (under the same dev-only gate) before falling back to the host check.

## Verification
- `http://localhost:17888/` → HASACA landing page (`<title>HASACA — Komisyonsuz Dijital Restoran
  Platformu</title>`), not "My Restaurant".
- `http://localhost:17888/tenant/default` → redirects to `/?tenant=default` → serves the demo
  restaurant's own site (`<title>My Restaurant — Best Food</title>`) — proves it's still fully
  reachable, just no longer automatic.
- `http://localhost:17888/tenant/bfbfb` → that tenant's own site (`bffbbf | HASACA`) — proves the
  override path works generically, not just for `default`.
- `/admin` → tenant admin panel (same as `/admin.html`). `/login` → login page (same as `/giris`).
  `/root` → Root panel, unchanged.
- Logged in as the `default` tenant admin: "Siteyi Görüntüle" now points at
  `http://localhost:17888/tenant/default` (confirmed via the live DOM `href`), which was independently
  already confirmed to resolve correctly.
- `GET /api/site-config` on the admin panel still returns the correct tenant (`id:"default"`) —
  confirms tenant resolution and isolation are unaffected by any of the above; this phase only changed
  which static page is served at a handful of GET routes, never `/api/*` behavior.
- 0 new console errors (one pre-existing, unrelated polling artifact — documented in Phase 29 — is
  still present and not new to this phase).

## Explicitly out of scope (flagged, not silently built)
`/register` was in the requested target routing table, but there is no self-service tenant signup
anywhere in this codebase — new tenants are created only via the Root Panel (`POST
/api/root/tenants`, root-authenticated) today. Building real registration (public form, validation,
plan/payment selection) is a materially larger feature than a routing fix and was not built. The
closest existing equivalent is the landing page's "Demo Talep Et" lead-capture flow (`/demo-talep` →
`landing_messages` → Root reviews and manually provisions) — flagged for the user to decide whether to
alias `/register` to that, or to actually scope self-service signup as its own phase.

## Files modified
`backend/server.js`, `admin.html`. No DB/auth/tenant-isolation change. No existing route removed —
every change is either a new route or a host-based branch inside the existing `/` route. Real tenant
subdomains render exactly as before.

## Next
The B&W-theme tokenisation phase (in progress before this interrupted it — baseline computed-style
fingerprints already captured: default `991` warm hits, light `943`, B&W `106` leaking) resumes next,
unless redirected again. `/register` decision is pending the user's input.
