# Phase 36 — Stop tenant-less routes from leaking into the "default" tenant

## Summary
On the single-domain production deployment (Netlify + Render, no per-tenant subdomains), the host
header never identifies a tenant. Any request with no `?tenant=` and no `x-tenant-id` — a bare visit
to `/admin`, the bare customer site, or any unmatched path — silently fell back to a tenant literally
named `"default"`. That id is **not** a placeholder: it's a fully real, seeded restaurant with a real
menu and real admin credentials (`dayikatik`/`dayikatik123`). Anyone hitting the bare production
domain could reach that one restaurant's admin login and public menu without ever specifying which
restaurant they meant.

The same overload was also why the Root panel hid the Disable/Delete buttons for that one tenant, and
why the backend auto-regenerated it after deletion — both existed only to guarantee something always
answered the host-fallback lookup. Once the fallback itself is removed, that protection is no longer
needed.

## Root cause
`slugFromHost()` (`backend/lib/tenant.js`) returned the *string* `'default'` for every case where the
host carried no real tenant information (bare host, IP, `localhost`, the platform's own domain,
`*.netlify.app`/`*.onrender.com`). By the time this reached `resolveTenant()`, "no tenant was
specified" and "the tenant literally named default was explicitly requested" were indistinguishable —
both looked up and found the same real row.

## Fix
1. **`backend/lib/tenant.js`** — `slugFromHost()` now returns `null`, not `'default'`, for every
   guessing/fallback branch. Applies identically in local dev and production (no `localhost`
   carve-out — confirmed with the user this must match production exactly). `resolveTenant()` now
   checks for `null` *before* querying the tenants table: if nothing was specified by query, header,
   or a real subdomain, it sets `req.tenantId = null` and calls `next()` without substituting any
   tenant and without 404ing at the middleware level. This is deliberately narrower than an initial
   draft that would have 404'd every route — that would have broken `/t/:token` (which resolves the
   correct tenant by table token alone, via its own DB lookup, independent of host guessing) and
   `/login`+aliases (a login form isn't tenant data; the real lookup happens at submit time).
   `errorPageHtml()` is now exported for reuse.

2. **`backend/server.js`** — `GET /admin`/`/admin.html` and the customer-facing catch-all (`*`, and
   the bare `GET /` handler) now check `req.tenantId === null` and serve the bilingual "Restaurant Not
   Found" page instead of a real tenant's admin panel or menu. The bare `/` handler's old logic (a
   separate `slugFromHost(host) === 'default'` re-derivation, gated by a stale `!process.env.DATABASE_URL`
   check that meant `?tenant=` silently didn't work on this one route in production) was replaced with
   a single `req.tenantId === null` check — one source of truth instead of two.

3. **`backend/routes/root.js`** — `DELETE /tenants/:id` no longer regenerates `'default'` specifically
   because it was the id being deleted. It still regenerates *a* default tenant if the platform would
   otherwise be left with **zero** tenants total (a distinct, still-valid safety net — an empty
   `tenants` table would break tenant resolution platform-wide). Confirmed via `backend/db.js` that
   new-tenant provisioning clones from the static `masterTemplate.js` file, never from `'default'`'s
   live data, so removing this protection doesn't affect future tenant creation.

4. **`root.html`** — removed the `t.id !== 'default'` guard that hid the Disable/Delete buttons for
   that one tenant card. It now gets the same actions as every other tenant. The existing
   type-to-confirm extra step for deleting `'default'` specifically (`deleteTenant()`) was left in
   place — deleting a well-established seeded restaurant still deserves the friction, even though the
   backend no longer structurally requires it.

5. **`backend/routes/tables.js`** — `buildTableUrl()` no longer omits `?tenant=` specifically for
   `'default'`. Every tenant's generated QR URL is now symmetric.

## Breaking change (acknowledged, not a regression)
Any QR code or bookmark already printed for the `'default'` tenant without `?tenant=` (relying on the
old fallback) will now show "Restaurant Not Found" instead of that tenant's page. They need
`?tenant=default` appended, or reprinting from the admin panel. Confirmed explicitly acceptable with
the user, since the platform is about to go live and this closes a real exposure.

## Verification (local — must match production exactly, no dev-only behavior)
- Bare `GET /admin` → `404`, "Restaurant Not Found" page. ✅
- Bare `GET /` → `200`, HASACA landing page (`landing.html`), not any tenant's menu. ✅
- Bare unmatched path → `404`, "Restaurant Not Found" page. ✅
- `GET /admin?tenant=default` (explicit) → `200`, `default` tenant's admin panel, unaffected. ✅
- `GET /login`, `/giris` → `200`, sign-in form renders normally (unaffected). ✅
- `GET /root` → `200`, Root panel renders normally (unaffected — intentionally cross-tenant). ✅
- Bare `GET /t/<real-token>` (no `?tenant=`) → `200`, correctly resolves to that table's actual
  tenant (`hacimustafa` in the test) via `GET /api/t/:token/context`'s own token-only lookup —
  confirmed unaffected. ✅
- `GET /api/tables/:id/qr` for a `default`-tenant table now returns a URL containing
  `?tenant=default`. ✅
- Root panel: `default` tenant card now shows "Devre Dışı" (Disable) and "Sil" (Delete) buttons like
  every other tenant. ✅
- All backend files (`node --check`) and all four HTML files' inline `<script>` blocks pass syntax
  checking (only the pre-existing JSON-LD false positive appears, as in every prior phase).

## Files changed
- `backend/lib/tenant.js` — `slugFromHost()` returns `null` instead of `'default'`; `resolveTenant()`
  handles the `null` case explicitly; `errorPageHtml` exported.
- `backend/server.js` — `/admin`, `/admin.html`, `GET /`, and the catch-all gate on
  `req.tenantId === null`.
- `backend/routes/root.js` — `DELETE /tenants/:id` no longer special-cases `'default'`.
- `root.html` — Disable/Delete buttons no longer hidden for `'default'`.
- `backend/routes/tables.js` — `buildTableUrl()` always includes `?tenant=`.

## Not yet pushed
Also present locally but not part of this phase and not yet pushed: a full monochrome color pass
across `admin.html`, `root.html`, `login.html`, `index.html`, and `panel.css` (removes the gold/amber
accent site-wide except `landing.html`/`marketing.html`), done at the user's explicit request but
awaiting their go-ahead to deploy. Not documented here since it's unrelated to tenant routing; will
get its own phase log when pushed.
