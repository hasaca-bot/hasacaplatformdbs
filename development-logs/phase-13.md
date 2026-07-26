# Phase 13 — Root-editable per-tenant Contact & Social settings

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Give the platform owner (Root) a per-tenant "Contact & Social" section covering phone, WhatsApp,
email, address, Google Maps (embed + link), website, and social links (Instagram/Facebook/X/TikTok/
YouTube). These values drive the whole public site dynamically. Tenant admins can NOT edit them
(Root-only). TR/EN + URL/email validation. Reuse the existing settings/branding architecture.

## What was done
### Backend — `backend/routes/root.js` (extended the existing branding endpoint, no new system)
- `PUT /api/root/tenants/:id/branding` ALLOWED whitelist extended with: `contact_phone`, `whatsapp`,
  `contact_email`, `address`, `maps_embed`, `maps_link`, `website`, `instagram`, `facebook`,
  `twitter`, `tiktok`, `youtube` (all merged into `tenants.settings`).
- **Validation:** URL fields must be blank or `http(s)://...` (blocks `javascript:`/`data:`/typos → 400);
  email must be blank or a valid address (→ 400).
- **Column sync:** the legacy `tenants.contact_phone/contact_email/address` columns are updated from
  the merged settings so `/api/site-config`'s top-level fields stay correct.

### Root Panel — `root.html`
- Added a **"Contact & Social" section** to the per-tenant branding modal (`brandOverlay`): a 2-col
  grid (phone/WhatsApp/email/website), address, Maps link, Maps embed, and social URLs. `openBrandModal`
  populates them from settings (with column fallback); `saveBranding` sends them and surfaces the
  server's validation error in the toast. Added `.brand-section` / `.cs-grid` CSS + TR/EN i18n keys.

### Customer site — `index.html`
- `applySiteConfig()` now drives, entirely from tenant config: phone text + all `tel:` links; a
  WhatsApp row (`wa.me`), email row (`mailto:`), and Instagram row (shown only when set); the address
  line; the Google Maps iframe + "Open in Maps" link (explicit embed/link wins, else derived from the
  address — and it survives language switches via `window.__mapEmbed`/`__mapLink`); and a dynamic
  **social-buttons row** (`#socialLinks`) rendering Facebook/X/TikTok/YouTube/Website only when
  configured. Added the `#socialLinks`/rows markup, `.social-links`/`.social-btn` CSS, and
  `contact_email_lbl` i18n (TR/EN). No hardcoded phone/social/map values remain in the contact area.

## DB / API changes
- **API:** `PUT /api/root/tenants/:id/branding` accepts the new keys + validates them.
- **DB:** no schema change (uses `tenants.settings` JSON + existing columns).

## Verification (fork @ localhost:17888)
- **Save (API):** valid contact/social → 200; `/api/site-config` returns synced columns
  (phone/email/address) + settings (whatsapp/instagram/facebook/youtube/maps_link). Invalid
  `instagram: javascript:alert(1)` → **400**; invalid email → **400**.
- **Customer render:** phone `+90 555 111 2233` (tel `+905551112233`), WhatsApp `wa.me/905551112233`,
  email `mailto:hello@myrestaurant.com`, Instagram `@myrestaurant`, **5 social buttons**
  (facebook/x/tiktok/youtube/website), map link = explicit `maps_link` and **stays correct after a
  language switch**. No console errors.
- **Root modal:** "İletişim & Sosyal Medya" section opens fully populated; saves round-trip. No console errors.

## Known issues / notes
- **Tenant-admin read-only view** of these values is not yet added (optional per spec — the hard
  requirement "tenants must NOT modify" is already met since only Root has the branding endpoint).
  Can be added as a small read-only card in a later phase.
- The default (master-template) tenant now carries demo contact/social values, which is fine as
  placeholder demo content and is cloned into new tenants.

## Next phase
Phase 14 — Theme engine (token-based; warm default + Black & White) + emoji→icon sweep, OR continue
the remaining backlog (Widget Management, SEO Center, Activity Log, Analytics, QR Designer, Root
Notification Center) per user priority.
