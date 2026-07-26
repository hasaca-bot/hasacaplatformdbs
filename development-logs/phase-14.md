# Phase 14 — Emoji → professional icon / plain-text sweep

**Status:** ✅ Completed & verified
**Date:** 2026-07-24 (fork @ localhost:17888)

## Goal
Remove pictographic (color) emojis project-wide so the platform reads as a commercial SaaS product,
replacing them with inline SVG icons or plain text.

## What was done
Project-wide scan (all HTML pages + `manifest.json` + backend `seedData.js` / `masterTemplate.js` /
`server.js` / `db.js` / `routes/root.js`) — pictographic emojis were found only in `index.html` and
`admin.html`. Replaced (identically in both files):
- **📞 phone-order button** → inline SVG phone icon.
- **📍 "Open in Google Maps" button** → inline SVG map-pin icon.
- **⚠️ "menu failed to load" message** → clean text (emoji removed).
- **Reservation notification labels** (🍽️ YENİ REZERVASYON, 👤 Ad Soyad, 📞 Telefon, 📅 Tarih,
  🕐 Saat, 👥 Kişi, 📝 Not) → plain professional text (emojis stripped).
- Bonus: the phone-order button's hardcoded "123 456 789" text was given `id="orderPhoneNum"` and is
  now driven dynamically from the tenant phone in `applySiteConfig()` (no hardcoded phone left there).

## Files modified
- `index.html`, `admin.html` (emoji → SVG/plain text; dynamic order-phone number).

## DB / API changes
- None.

## Verification (fork @ localhost:17888)
- **Customer page:** the only remaining glyph in visible text is `✕` (close button); phone/maps
  buttons render SVG icons; `orderPhoneNum` shows the dynamic tenant phone (`+90 555 111 2233`).
  No console errors.
- **Admin panel:** `0` visible emojis; panel renders normally. No console errors.

## Deliberate decision (documented)
- Kept the monochrome **typographic glyphs `✕` (close) and `✓` (status "Uploaded ✓" / "configured ✓")**.
  These are NOT color/pictographic emojis — they render as plain monochrome glyphs and are standard in
  commercial UIs. If the user wants these swapped for SVGs too, it's a quick follow-up.

## Known issues / notes
- The token-based **theme engine (warm default + Black & White)** — the other half of the original
  Phase 14 scope — is split out into its own phase (below) since it's a large, self-contained effort.

## Next phase
Phase 15 — Theme engine (token-based; warm "Modern Minimal" default + Black & White; per-tenant
selected theme; instant switch), then the remaining feature backlog (Widget Management, SEO Center,
Activity Log, Health Dashboard, Analytics, QR Designer, Root Notification Center).
