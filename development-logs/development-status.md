# HASACA Platform — Development Status

> Living status doc. Any AI/dev can resume by reading this + the phase files in `/development-logs`.
> Release changelog lives in `README.md` (§ DEĞİŞİKLİK GÜNLÜĞÜ). This folder tracks in-progress phased work.

**Last updated:** 2026-08-07 (after Phase 63)

> A living **AI-CONTEXT.txt** hand-off file is maintained in this folder (overwritten every phase).

> **Workspace:** active work happens in **`C:\Users\hasan_y4hfwna\Desktop\saas proje`**, which is
> the git checkout of `github.com/hasaca-bot/hasacaplatformdbs` (branch `main`) and the single source
> of truth. Local dev runs on **port 17888**. The old `hasaca-platform` fork is stale and unused.
> Production = Netlify (static) + Render (API) + Neon (Postgres).

## Overall progress: ~76% of the new multi-wave scope (Wave 5/6 in progress)

## Architecture summary
Multi-tenant restaurant SaaS. Node.js + Express (`backend/server.js`), dual DB layer (`backend/db.js`: PostgreSQL when `DATABASE_URL` set, else SQLite). Frontend = 6 static pages, no bundler: `index.html` (a tenant's restaurant site — served at `/` only on a real tenant subdomain, or via `/tenant/:slug` in dev; see P31), `admin.html` (tenant admin, tabbed — also `/admin`), `root.html` (platform owner — redesigned Phase 24 — also `/root`), `landing.html` (HASACA marketing home — **now the default `/`** on the bare host as of P31; also `/landing`), `marketing.html` (shared shell rendering all 45 marketing sub-pages from `marketing-data.js`), `login.html` (`/login`, `/giris`, `/root-girisi`). `panel.css` = shared design-token system + Black/White/System themes + desktop shell (linked by `root.html`; `admin.html` next). Auth = username + scrypt hash + HMAC token (`lib/auth.js`). Tenant resolution from subdomain (`lib/tenant.js`). SSE realtime (`lib/events.js`). Root API + tenant generation (`routes/root.js`), QR tables (`routes/tables.js`). Port **12999** (original) / **17888** (this fork). i18n = per-page `i18nData` (TR/EN) + `data-i18n` + `applyLanguage`.

## Completed (previous work)
- Phase A: Real multi-tenancy + username/password auth
- Phase B: Root panel + automatic tenant generation
- Phase C: QR table ordering (management, dine-in, live tracking, floor view)
- Phase D: Local dev env + START ADMIN.bat + docs
- Phase E: White-label branding + "My Restaurant" master template (default tenant is cloned for new tenants); Root-editable platform branding

## Completed earlier this session (pre-fork, ported into the fork)
- P01 brand text/logo/favicon fixes · P02 PWA disabled (re-enableable) · P03 image upload everywhere.

## Current phased effort (new multi-wave plan)
| Phase | Wave | Title | Status |
|-------|------|-------|--------|
| 00 | 0 | Fork to `hasaca-platform` @ port 17888 | ✅ DONE |
| 04 | 1 | Complete white-label cleanup (index+admin+seed+DB) | ✅ DONE |
| 05 | 1 | Floating-action overlap + z-index system | ✅ DONE |
| 06 | 1 | Fix blank Tenant-Admin after login + header rendering | ✅ DONE |
| 07 | 1 | Responsive / overflow audit + custom scrollbar (all pages) | ✅ DONE |
| 12 | 4 | Delete any tenant (incl. default) + auto-regenerate default | ✅ DONE |
| 13 | 4 | Root-editable per-tenant Contact & Social settings | ✅ DONE |
| 14 | 4 | Emoji → professional icon / plain-text sweep | ✅ DONE |
| 15 | 4 | Theme engine (warm default + Black & White) + Root theme selector | ✅ DONE* |
| 16 | 4 | Platform Health Dashboard (cloud-safe) | ✅ DONE |
| 17 | 4 | Activity Log (tenant-isolated audit trail) | ✅ DONE |
| 18 | 4 | Restaurant Analytics (tenant + platform aggregate) | ✅ DONE |
| 19 | 4 | Global custom font (Samsung Sharp Sans) + AI-CONTEXT.txt | ✅ DONE |
| 20 | 4 | Tenant-isolated push + Root Notification Center + push-only SW | ✅ DONE |
| 21 | 4 | SEO Management Center (per-tenant meta + dynamic robots/sitemap) | ✅ DONE |
| 22 | 5 | HASACA landing page (marketing site) + Root Landing Messages inbox | ✅ DONE |
| 23 | 5 | Marketing site: 45 pages + login page + enterprise footer (0 dead links) | ✅ DONE |
| 24 | 5 | Root Panel redesign (panel.css tokens, sidebar shell, dashboard, B/W/System themes) | ✅ DONE |
| 25 | 5 | Tenant Admin Panel redesign — sidebar shell replaces horizontal tabs; --ap-* tokens; dashboard/analytics; real logout | ✅ DONE (revised) |
| 25.2 | 5 | Remove all legacy orange/brown from admin.html (html.admin-page token neutralization, category modal, notif preview dynamic) | ✅ DONE |
| 26 | 6 | Gemini AI Setup Assistant backend (/api/root/ai-settings + /test) — Root AI modal now functional | ✅ DONE |
| 27 | 6 | In-shell Category/Product forms + AI Assistant (plan/execute, Root + Tenant) | ✅ DONE |
| 28 | 6 | Widget Management (tenant/root widget on-off, settings.widgets, new tenant self-service endpoint) | ✅ DONE |
| 29 | 6 | QR Designer (color/margin/ECC via settings.qr_style, tenant self-service) | ✅ DONE |
| 30 | 6 | Root AI Assistant: tenant-targeted menu editing (target selector + scoped plan/execute) | ✅ DONE |
| 31 | 6 | Root routing: "/" is host-aware — HASACA landing page on the bare host, tenant sites unchanged on real subdomains, `/tenant/:slug` + `/admin` + `/login` aliases | ✅ DONE |
| 32 | 4 | Zero legacy orange platform-wide — B&W theme tokenised (index.html + admin.html), root.html dead-code fixed, seeded demo display_name genericised, unused legacy files deleted (user instruction) | ✅ DONE |
| 33 | 7 | Production Deployment (Netlify + Render + Neon), Netlify Root Routing & SVG Logo Branding | ✅ DONE |
| 34 | 10 | Production Fixes: Tenant Impersonation, Netlify 45 Marketing Sub-pages, Root Pwd Sync & SVG Logo | ✅ DONE |
| 35 | 10 | Production hotfixes (QR-ordering SyntaxError, recursive storage guards, admin login modal, single-domain tenant login, single sign-in page) + Hero Image Management & plain-text Hero editor | ✅ DONE |
| 36 | 10 | Tenant-less `/admin`/bare-site routes no longer fall back to the `'default'` tenant; `'default'` is now a fully normal, deletable tenant like any other (Root panel + QR URL symmetry) | ✅ DONE |
| 37 | 10 | Monochrome rebrand shipped (was held back); Root dashboard "Son Aktivite" replaced with an interactive analytics chart (vanilla SVG, no dependency); contrast bug found+fixed | ✅ DONE |
| 38 | 10 | AI Assistant swapped from Gemini to Groq — Gemini's real generation quota needs billing linked even for the "free tier" and the user has no card; Groq needs none. Same plan/execute contract, only the HTTP call changed. Same-phase addendum: Admin panel dashboard "Son Aktivite" → analytics chart, same treatment as Root panel (Phase 37), verified on two real tenants | ✅ DONE — real Groq generation confirmed against production, deployed |
| 39 | 10 | Root panel AI Assistant redesigned as a real chat UI (transcript, typing indicator, inline plan bubbles with confirm/cancel-in-place). Found+fixed a real bug while testing: the plan endpoint can return HTTP 200 with a real error, which the old (and my first-draft new) code silently mislabeled as "no actionable change" | ✅ DONE (Confirm→Execute path verified by code review + local UI test; live click-through with a real key pending deploy) |
| 40 | 10 | Fixed real-time order-status updates not reaching the customer's tracking screen in production: Netlify's `_redirects` proxy does not support SSE streaming at all. Added `window.SSE_BASE` (index.html + admin.html) to route `EventSource` connections directly to Render, bypassing the proxy; fixed the resulting tenant-auth break on `GET /api/events/admin` by trusting the JWT's own `tenant_id`. Also fixed the same bug for admin's own live dashboard feed (found proactively, not user-reported) | ✅ DONE — tenant isolation re-verified with a real spoofed-tenant test |
| 41 | 10 | Admin panel AI Assistant redesigned as a chat UI, matching Root's Phase 39 — ported onto admin.html's `--ap-*` token scope, no target selector (always tenant-scoped). Found+fixed the same "HTTP 200 with a real error" bug Phase 39 found in Root's endpoint, independently present in admin's `/api/admin/ai-assistant/plan` too | ✅ DONE — verified live in local UI (real error correctly surfaced, not misleadingly labeled "no actionable change"), dark+light theme, mobile+desktop |
| 42 | 11 | **Google Sign-In + tenant self-service (in progress, multi-phase, plan approved).** Phase A/42: DB migration (`admin_users.email/google_sub/avatar_url` + unique index) + extracted Root's tenant-creation logic into a shared `backend/lib/tenantProvisioning.js` module (both Root's manual creation and the future Google self-signup route will call the same tested code). No user-facing behavior yet | ✅ DONE (Phase A only) — real create/impersonate-add-table/delete cycle re-verified through the actual API |
| 43 | 11 | Phase B: real `POST /api/auth/google` (verifies a real Google ID token, finds-or-auto-provisions a tenant, issues a normal session token), `GET /api/auth/me` now returns display_name/email/avatar_url, `GET /api/platform-config` exposes `google_client_id`. "Google ile Giriş Yap" button added to `login.html` (Restoran tab only, never Root) and `admin.html`'s embedded login modal | ✅ DONE — real Google button rendered + verified in browser on both pages, fake-token correctly rejected by Google's real verification service; full real-account click-through still needs a real interactive Google consent screen (can't be scripted) |
| 44 | 11 | Phase C: tenant self-service "Restoran Bilgileri" (name/phone/email/address + read-only membership status) and "Marka & Site" (25-field branding, mirrors Root's own modal subset, widgets excluded, HTML-stripped for safety) — two new full-screen views in admin.html's new "Restoranım" sidebar group, `PUT /api/admin/restaurant-info` + `PUT /api/admin/branding` | ✅ DONE — found+fixed a real cross-endpoint sync bug during testing (a restaurant-info save could be silently reverted by an unrelated branding save; same latent issue exists in Root's own two-modal design, left untouched there); verified live via real UI clicks + cross-checked against Root's own panel |
| 45 | 11 | Phase D (FINAL — feature complete): "Tehlikeli Bölge" — `settings.self_paused` (NEW, separate from Root's `tenants.status`, which also blocks the tenant's own login; self-pausing here never does) blocks only new orders/reservations; real self-delete (`DELETE /api/admin/self`, blocks `default`); shared `deleteTenantData()` helper now used by Root's own delete + regenerateDefaultTenant too; real Google profile photo/name in admin.html's top-right corner | ✅ DONE — real 403-while-paused/200-admin-still-works/201-after-resume sequence verified via live requests (delivery + dine-in + reservation paths); real throwaway-tenant delete verified end-to-end without touching `default`; profile avatar verified live in browser |
| 46 | 12 | 4 fixes from live testing: (1) admin live-feed self-heals after a fatal SSE error instead of dying silently until manual refresh; (2) Google Sign-In shows immediate "signing in…" feedback + `OAuth2Client` hoisted to module scope (does not eliminate Render free-tier cold starts, which are a hosting-plan characteristic); (3) real favicon (`icons/favicon.svg`, previously unused) wired up everywhere + admin.html's sidebar logo now matches root.html's + tenant favicon upload field added to both panels; (4) landing.html gets a real Black & White theme toggle | ✅ DONE — SSE self-heal proven with a real break-token→retry→fix-token→reconnect-succeeds sequence; Google loading state confirmed to render synchronously; found+cleared a real giant non-square image accidentally set as the platform's own favicon (the literal cause of "squashed logo"); landing theme toggle confirmed to change computed styles and persist across reload |


| 47 | 12 | Landing B&W theme redone as a REAL white theme (Phase 46's gray-swap was too subtle to register as a theme change) — full token override + fixed 6 hardcoded-color spots that would have gone dark-on-dark/white-on-white; kept the hero device mockup + showcase screen mockups intentionally dark in both themes (they're meant to look like static product screenshots). Fixed a real admin panel bug: profile avatar was a squashed non-square circle because `.av` (a flex item) had no `flex-shrink:0`, so `object-fit:cover` had nothing correctly-shaped to work with. Favicon re-confirmed already correct+live in production; remaining appearance is almost certainly browser favicon cache, not a code issue | ✅ DONE — both fixes verified with the correct fresh-navigation test method (a documented quirk of this project's own testing environment makes runtime-toggle-then-read-computed-style checks unreliable, per Phase 32's prior note) |
| 48 | 12 | Landing page nav CTA is now dynamic ("Kayıt Ol"/`/giris` for a logged-out visitor, "Giriş Yap"/`/admin` for a verified session, checked via a real `/api/auth/me` call); pricing simplified to 2 tiers (removed the ₺0 plan, the ₺749 plan now shows "İlk 14 gün ücretsiz" and links straight to `/giris`); new tenants (`masterTemplate.js`) now seed `subscription_status:'trial'` + `trial_started_at`, and admin.html's membership card shows real days-remaining ("Deneme Sürümü — N gün kaldı" / "Deneme Süresi Doldu") | ✅ DONE — nav CTA verified for logged-out + invalid-token cases; pricing plan count/copy/links verified live; trial-days pill logic verified with mocked 5-day and 15-day-elapsed cases; existing pre-phase tenants confirmed to keep their unchanged "Aktif" fallback |
| 49 | 12 | Admin/root sidebar logo badge (`.side-brand .mark`) fixed to adapt to the white theme (was a permanently dark badge, unreadable once the icon itself turned dark); landing page's fake testimonials section + fake client-logo strip removed entirely (fabricated quotes/brand names); landing page's dark-theme ambient background glows removed (`body::before`) for a flat black; one real leftover unconverted icon badge found+fixed (`.feat .fi` on the 16-card feature grid, found via an exhaustive computed-style scan); pricing cards updated with the real final feature lists, Kurumsal now a real ₺1499/ay tier instead of "contact sales" | ✅ DONE — all fixes verified live (dark theme confirmed byte-for-byte unchanged where not in scope, light/mono theme confirmed correctly adapted); visual/copy only, no billing logic added per explicit instruction |
| 50 | 13 | Multi-restaurant Google accounts: a Gmail can now own N restaurants (no longer a unique `google_sub`→tenant lock); 2+ linked restaurants land on a new "Restoranlarım" hub (real combined stats, restaurant picker, "Yeni Restoran Ekle" self-provisioning); "Çıkış Yap" inside any restaurant's panel returns to the hub (keeps the Google session), full logout only from the hub itself; sessions independent per device for free (separate localStorage per browser). New endpoints `select-tenant`/`my-restaurants`/`create-restaurant`. Found+fixed a real pre-existing bug during testing: the `/admin` route 404'd whenever no tenant was resolved — broke the hub outright (bare `/admin` is exactly what a multi-restaurant login lands on) and was independently reported live by the user. **Same-day follow-up**: each restaurant's hub row became a wide card showing its own real Sipariş/Satış totals plus the existing single-restaurant dashboard's Masa/Paket area chart (reused verbatim, not reimplemented) for a shared, re-fetchable 7/30/90-day range; "Ciro" renamed to "Satış" | ✅ DONE — backend fully verified with real HTTP requests against a synthetic 2/3-restaurant test account (my-restaurants totals, select-tenant incl. a rejected foreign tenant_id, create-restaurant, single-tenant backward compatibility by code path); hub UI + per-restaurant charts verified live in both themes with real seeded order data across two tenants and both a 30-day and 7-day range; full hub→open→logout→hub loop verified; all test data cleaned up afterward |
| 51 | 14 | Real SEO: found+fixed a significant pre-existing bug — Netlify's `_redirects` only proxies `/api/*`/`/uploads/*` to Render, so `robots.txt`/`sitemap.xml` and all 45 marketing pages were serving static placeholders/generic content in production, meaning almost none of Phase 21/23's SEO work was ever actually live. Fixed via `_redirects` (robots.txt/sitemap.xml now proxy to Render) + a new build-time prerender script (`backend/scripts/prerender-marketing.js`) that bakes real per-page title/description/canonical/OG/JSON-LD (incl. new BreadcrumbList + FAQPage schema) into 45 static files instead of round-tripping every visitor through Render. Tenant sites (`index.html`) now get real per-tenant SEO server-side too (was JS-only before, invisible to non-JS crawlers) via a new shared `tenantSeo.js` — takes effect once a tenant has a real domain pointed at Render, not on the shared Netlify demo path yet. landing.html's canonical fixed (was hardcoded to an unregistered domain) + new FAQPage/pricing JSON-LD. Favicon: found every raster icon file (favicon.ico, both favicon PNGs, apple-touch-icon.png, icons/icon-192/512.png, logo.png) was a leftover pre-rebrand solid orange/red square — regenerated all of them from the real triangle mark | ✅ DONE — verified via live `curl` of raw (non-JS) HTML for a real tenant, landing.html, robots.txt/sitemap.xml; spot-checked prerendered pages incl. FAQPage/BreadcrumbList JSON-LD validity; every regenerated favicon file visually re-confirmed |
| 52 | 14 | Consistent Black & White theme across landing.html AND all 45 marketing pages: `marketing.html` had zero theme code at all, so choosing white on landing.html and navigating to e.g. "Özellikler" silently reverted to dark with no way to switch it back there. Ported landing.html's whole theme system (same `localStorage['landing_theme']` key, so a choice on either carries over to the other) — CSS token overrides, `.theme-switch` button in nav+footer, `applyLandingTheme()`/`toggleLandingTheme()`. Also: absent any saved choice, both pages now follow the device's system light/dark preference (landing.html previously hardcoded dark as the fallback) — reused the pattern index.html already had. Found one more real bug while porting: the comparison-table checkmark (`.yes`) had the same near-white-on-white contrast issue landing's own had before Phase 47; fixed the same way. Re-ran the marketing prerender script (Phase 51) afterward — required, or the change would silently never reach the live site | ✅ DONE — verified live: toggling from inside a marketing page persists to landing.html and other marketing pages both directions; system-preference fallback verified for both light and dark with no saved choice; new light-theme colors (comparison checkmark, status badge, form messages, step-number badges) confirmed legible; default dark theme confirmed unchanged |
| 63 | 15 | Rezervasyonlar ekranındaki çalışmayan "sürükle-sil" özelliği (kod incelemesinde `draggable`/`ondragstart` hiçbir karta hiç bağlanmamış olduğu, yani zaten işlevsiz olduğu ortaya çıktı) kaldırıldı — her kartın zaten var olan çöp kutusu butonu (`deleteReservation()`, `showCustomConfirm()` ile onaylı) artık tek silme yolu. Ayrıca hem `admin.html` hem `index.html`'deki TÜM onay dialogları (`.custom-popup-card`) kullanıcının gönderdiği referans görsele göre glassmorphism'e çevrildi: mavi-tonlu gradient + blur arka plan, ikon kaldırıldı, sol hizalı başlık/açıklama, alt satırda düz-metin buton + dikey ayırıcı — artık her temada aynı (tema-bağımsız) görünüm, `index.html`'de paylaşılan bir `!important` kuralının dialog'u zorla beyaz yaptığı bir çakışma da bulunup düzeltildi | ✅ HAZIR, KULLANICI ONAYI BEKLENİYOR — henüz commit edilmedi |
| 62 | 15 | Faz 3A — Admin Paneli Çoklu Ekran Bölme: `showAdminView()`/`AP_VIEW_MAP` mimarisi üzerine, mevcut `.view` elemanları klonlanmadan panolara TAŞINARAK (appendChild) en fazla 4 panoya bölünebilen split-mode eklendi (Dashboard/Uzaktan Sipariş/Masa Siparişi/Rezervasyon/Analitik arasından seçilebilir), "Bottom Container" kart deseninde pano başlıkları (görünüm-değiştirme dropdown + kaldır butonu), localStorage kalıcılığı, sidebar tıklaması split-mode'dan çıkarıyor. Doğrulama sırasında 2 GERÇEK hata bulundu+düzeltildi: (1) `grid.innerHTML=''` panolardaki taşınmış `.view` elemanlarını KALICI OLARAK SİLİYORDU (klon değil taşıma olduğu için) — bir görünüm değiştirmede "Masa Siparişi" ekranı tamamen kayboluyordu, düzeltildi (önce güvenli yere taşı, sonra boşalt); (2) kullanıcının ekran görüntüsüyle bildirdiği, split-mode'dan çıkışta üstte kalan boşluk — `.ap-split-grid`'in `display:grid` kuralı `[hidden]`'in varsayılan `display:none`'unu eziyordu, düzeltildi + tüm görünüm geçişlerinde kaydırma konumu sıfırlanacak şekilde genel bir düzeltme eklendi. Ayrıca kullanıcı isteğiyle: admin.html'in eski/stilsiz gömülü giriş modalı kaldırıldı, artık root.html ile tutarlı şekilde `/giris`'e (tam One UI login.html) yönlendiriyor | ✅ HAZIR, KULLANICI ONAYI BEKLENİYOR — tüm düzeltmeler gerçek DOM/computed-style kontrolleriyle doğrulandı, henüz commit edilmedi |
| 61 | 15 | Admin paneli (+ root paneli) collapsed sidebar/topbar'da 2 gerçek CSS hatası bulundu+düzeltildi: (1) `.nbadge` sayı rozetleri JS'in satır-içi `style="display:flex"` ataması yüzünden daraltılmış sidebar'da sızıyordu (class-selector kural satır-içi stili ezemiyordu) — `!important` eklendi; (2) `.topbar-icon` (hamburger dahil) flex konteynerde `flex-shrink:0` olmadığı için dar ekranda 40px yerine ~23px'e sıkışıp oval görünüyordu — `flex-shrink:0` eklendi (`admin.html` + aynı bug'ı taşıyan `panel.css`) | ✅ DONE — gerçek ölçümlerle (getBoundingClientRect, computedDisplay) hem 1280px hem 755px viewport'ta doğrulandı |
| 60 | 15 | Düzeltme: Faz 59 yanlış anlaşılmıştı — "masa siparişi"/"uzaktan sipariş" admin.html'in kendi ekranları değil, müşteri sitesinin (`index.html`) QR/dine-in ve uzaktan sipariş akışlarıymış. Faz 59'un admin.html scoped override'ı kaldırıldı (admin tekrar tamamen mavi), `index.html`'in `--fire` token'ı (Faz 2B'de bilerek mavi bırakılmıştı) da monokroma döndürüldü — bu, --ember/--gold/--amber'ın zaten monokrom olduğu Faz 58 ile birleşince müşteri sitesinin TAMAMINI (hem dine-in hem uzaktan sipariş, aynı paylaşılan bileşenler) yeniden tam monokrom yapıyor | ✅ DONE — gerçek QR-giriş URL'i + normal tarama modu + admin panelinin kendisi ayrı ayrı doğrulandı |
| 59 | 15 | Admin panelinde "Masa Siparişi" + "Uzaktan Sipariş" ekranları monokroma (Faz 1 öncesi beyaz/siyah) geri döndürüldü, panelin geri kalanı (dashboard, sidebar, dialoglar) mavi kalmaya devam ediyor — mevcut `--fire`/`--ember`/`--gold`/`--amber` remap mimarisi kullanılarak sadece bu 2 view container'ına scoped CSS değişkeni override'ı eklendi (`#adminTabOrdersCont`/`#adminTabTableOrdersCont`), tek merkezi değişiklik, bileşen bazında elle düzenleme gerekmedi | ✅ DONE — hem koyu hem açık temada, hem CSS değişken çözümlemesi hem gerçek DOM elemanları üzerinde doğrulandı; panelin geri kalanının hâlâ mavi kaldığı ayrıca teyit edildi (izolasyon çalışıyor) |
| 58 | 15 | Kullanıcı geri bildirimiyle kısmi geri alma: restoran sitesindeki (`index.html`) ürün fiyatı yazıları (`--ember` tabanlı) ve market sepeti ikonu (`.cart-fab`, `.food-card-cart-btn`) eski beyaz haline döndürüldü — `--fire` (diğer tüm butonlar) mavi kalmaya devam ediyor, bu tam bir geri alma değil, sadece bu iki spesifik öğe için | ✅ DONE — gerçek bir masa QR-giriş URL'i (`/t/<token>?tenant=default`) üzerinden canlı doğrulandı, önizleme kullanıcının kontrolü için açık bırakıldı |
| 57 | 15 | One UI polish, kullanıcı geri bildirimiyle: site logosu/marka rozeti tam yuvarlak (999px) değil, yumuşak köşeli kare (14px) olmalı; metin girilebilen inputlar/textarea'lar ise tam pill (999px) olmalı — 5 sayfada (`admin.html`, `panel.css`, `login.html`, `index.html`, `landing.html`) küçük, hedefli düzeltme | ✅ DONE — her sayfada canlı computed-style ile doğrulandı |
| 56 | 15 | **One UI 8.5 redesign, Faz 2C (SON) — Landing Page.** Bu turun en büyük yapısal parçası. Kullanıcının somut istekleri: (1) referans bir siteye (Uifry) benzer bölüm akışı — mevcut içerik korunarak One UI'a giydirildi, yeni testimonial bölümü eklenmedi (Faz 49'daki sahte-yorum kaldırma kararıyla tutarlı); (2) telefon mockup'ı kaldırılıp bilgisayar ekranı (`.laptop`, zaten var olan CSS dashboard mockup'ı) ana görsel yapıldı; (3) dil seçme butonu (TR/EN) tamamen kaldırıldı, yerine `navigator.language` ile otomatik algılama geldi (`I18N` altyapısı korunarak) — TR dışı her dil İngilizce gösterilir, kullanıcı tarayıcısının kendi çevirisini kullanabilir; (4) landing'in TAMAMEN AYRI bir tasarım sistemi olduğu ortaya çıktı (`--gold:#d8b877` sıcak-altın, index/admin/panel.css'in `--gold`'undan bağımsız) — o da mavi `#387AFF`'e çevrildi, açık temada ÖNCEDEN siyah olan vurgu artık koyu temayla aynı mavi. Yeni bir "Hemen Başlayın" CTA şeridi eklendi (SSS ile İletişim formu arasına, sahte istatistik içermeyen, hero mockup'larıyla aynı ilkeyle her iki temada da kasıtlı koyu). `marketing.html` + 45 sayfa bilerek kapsam dışı bırakıldı (kullanıcı sadece landing page dedi bu turda) | ✅ DONE — dil algılama gerçek `navigator.language` + 4 farklı sahte dille test edildi, tam sayfa görsel geçiş yapıldı (12 bölüm), font değişmedi, mobilde overflow yok |
| 55 | 15 | **One UI 8.5 redesign, Faz 2B — Restoran Sitesi (`index.html`, müşterinin QR ile gördüğü site).** Ana + `body.theme-bw` token blokları mavi `#387AFF` vurguya çevrildi (`body.theme-mono` gerçek gri B&W BİLEREK dokunulmadı, plan gereği). Bulunan gerçek bir hata: `--cart-surface:#241009` monokrom-öncesi sıcak-kahverengi bir kalıntıydı, ana panel tonuna nötrleştirildi. Hero/kart/sepet/ödeme/rezervasyon/takip bileşenleri One UI pill/20-28px ölçeğine çekildi, onay dialogu admin.html'deki Dialog düzeltmesiyle aynı muameleyi gördü (bu sefer `:has()` bağlama düzeltmesi gerekmedi — dialog zaten doğrudan sitenin kendi token'larını okuyor). Planın "gömülü admin paneli kopyasını senkronize et" varsayımı yanlış çıktı — o kopya aslında Phase-25-öncesi eski bir tabs-düzeni, `--ap-*` sistemi hiç yok, muhtemelen kullanılmayan kod; senkronize edilecek bir şey olmadığı için dokunulmadı, ikon kuralı o alanı bilerek hariç tuttu | ✅ DONE — koyu/açık/gri-mono üç temada da gerçek kullanıcı akışıyla (sepete ekle→sepet aç→ödeme aç) doğrulandı, font değişmedi |
| 54 | 15 | **One UI 8.5 redesign, Faz 2A — Root Paneli + Giriş Sayfası.** Kullanıcı kapsamı genişletti: "herşeyi One UI yap" (root, giriş, restoran sitesi, landing dahil). Root paneli tek bir paylaşılan `panel.css`'ten besleniyor ve zaten bir Navigation Rail benzeri sidebar'a sahipti — admin.html'in Faz 1'deki AYNI token/radius/Dialog/pill-switch deseni doğrudan uygulandı (mavi `#387AFF` vurgu her iki temada sabit, `--radius` 16→20px, pill butonlar/switch'ler, One UI Dialog scrim). `login.html` (bağımsız, kendi token bloğu) aynı şekilde restyle edildi, ana submit butonu sabit-kodlanmış beyazdan mavi vurguya geçti. Widget aç/kapa checkbox'ları CSS-only pill switch'e çevrildi; bildirim-hedefi tenant çoklu-seçim listesi (`.nf-ten`, gerçek checkbox semantiği) BİLEREK pill YAPILMADI, yuvarlak-köşeli kare check deseni aldı — toggle-switch ile gerçek-checkbox semantiği arasındaki ayrım netleştirildi | ✅ DONE — koyu+açık temada gerçek local oturumla doğrulandı (nav/marka/buton/dialog/switch radius+renkleri computed style ile), font değişmedi, `git diff` görsel-only kaldığını doğruladı |
| 53 | 15 | **One UI 8.5 redesign, Faz 1 — Admin Panel only** (visual/CSS only, no JS/logic change, font unchanged). User wants the whole site restyled to Samsung's One UI 8.5 language (buttons/icons/cards/bars/charts), starting with the admin panel; the 4-way split-screen "Bottom Container" feature and every other page are deferred to later phases. Reused admin.html's existing `--ap-*` token architecture — only values changed: accent → One UI blue `#387AFF` (constant both themes), large corner radii (cards 20-28px, buttons/switches/nav items full pill 999px). Sidebar → Navigation Rail (solid filled-pill selected state, removed the old left accent-bar). Confirm dialogs → One UI Dialog look + fixed a real pre-existing bug: `#customConfirmOverlay` is a DOM sibling of `#adminPanelOverlay` (not descendant), so it never inherited the panel's theme remap and always followed the customer site's `theme-bw` class instead — fixed via `body:has(#adminPanelOverlay.open)` binding. Checkbox toggles converted to visual pill switches (CSS-only, `appearance:none`). Icon stroke style bumped via one global rule instead of hand-redrawing hundreds of glyphs (explicit user "don't waste tokens" instruction). Masa siparişi/uzaktan sipariş card radii bumped to match. Found+fixed a real parser bug during verification: a code comment containing the literal text `.tbl-*/.floor-*` closed early (the `*/` inside it), corrupting the next CSS rule | ✅ DONE — verified live in both admin themes (fresh-navigation methodology): nav/brand/dialog/button/card radii and colors all confirmed via computed styles; dialog theme-binding fix confirmed independent of customer-site theme; font-family confirmed unchanged; full diff reviewed, no stray old hardcoded values left |


| 32+ | 5 | Backlog: fast-follows only (menu-generation wizard; QR logos/frames; widget permission tier; `/register` decision; unused legacy files flagged) | ⏭️ NEXT |

*P15: engine + per-tenant theme + B&W complete. The `.pax-btn` residual noted here was fixed by P25.2
(`!important` overrides); P32 finished the job — tokenised the ~90 remaining hardcoded warm literals
across index.html + admin.html so B&W is now verified genuinely orange-free (0 hits, was 106).
Default/light themes unaffected (byte-identical before/after, verified via computed-style fingerprint).

### Still open from the original wave plan
| Phase | Wave | Title | Status |
|-------|------|-------|--------|
| 08 | 2 | Dynamic content model + Tenant-Admin "Website Content" editor | 🟡 PARTIAL (P35 shipped hero images + hero text; other sections TODO) |
| 09 | 2 | Hide technical values from Tenant Admin | TODO |

> Old rows 10–14 were superseded: push/Notification Center shipped in P20, theme engine in P15,
> Contact & Social in P13, analytics in P18, Widget Mgmt in P28, QR Designer in P29.

## Known bugs (open)
- **Google Sign-In feature (Phases 42–45) is code-complete and locally verified but NOT live yet** —
  `GOOGLE_CLIENT_ID` only exists in the local `.env`; needs to be added as a real Render environment
  variable before deploying, and a real click-through with an actual Google account (through the real
  consent popup — this cannot be scripted/automated by design) is still needed once deployed. Everything
  else (the backend logic, both new login buttons, both new tenant self-service screens, the danger zone,
  the profile avatar) has been verified with real requests/real browser sessions locally.
- ~~Live QR order unverified~~ **RESOLVED**: verified end-to-end on production against table
  "Test2" — POST /api/orders returned 201, tracking card rendered, 0 console errors.
- `PLATFORM_ORIGIN` is not set on Render, so QR URLs rely on the Referer fallback. Existing
  printed QR codes still encode the old `hasaca-api.onrender.com` host (they work, but are
  unbranded and cold-start prone) and would need reprinting.
- **Hardcoded Telegram `BOT_TOKEN` in `index.html`**, in client-visible JS. Anyone can read it.
  Should be rotated and moved server-side.
- **`GET /api/root/boost-auditrest`** (`backend/routes/root.js`) inserts 650 fabricated orders on
  *every* call with no idempotency check, and mutates data from a `GET`. Showcase-only code.
- Phase 33/34 production work is documented in their phase files but was never folded into this
  status doc at the time; Phase 35 is the first entry to catch up.
- **Breaking change from Phase 36**: any QR code/bookmark printed for the `'default'` tenant that
  relied on the old bare-URL fallback now shows "Restaurant Not Found." Needs `?tenant=default`
  appended or reprinting from the admin panel.
- ~~Monochrome color pass not pushed~~ **RESOLVED (Phase 37)**: shipped, with a contrast bug it
  exposed found and fixed in the same phase.
- **User-reported, not yet reproduced**: hero image edits (Website Editor) not appearing updated
  locally. Full cycle (upload/reorder/remove/save/reload, admin + customer site) re-verified working
  via the actual admin UI in Phase 37 — could not reproduce. Needs exact repro steps.
- ~~AI Assistant reported not working~~ **RESOLVED (Phase 38)**: root cause was Gemini's real
  generation quota requiring billing linked to the key's Google Cloud project, which the user
  can't do (no credit card). Swapped the provider to Groq (genuinely free, no card ever). Two
  different Gemini keys and one Groq key were pasted in chat during diagnosis — all must be
  treated as compromised/rotated; the user was told each time to enter credentials only in the
  Root panel's AI setup screen, never through chat. Real-key end-to-end generation not yet
  confirmed — verify once the user's Groq key is saved.
- ~~Admin panel dashboard chart~~ **RESOLVED (Phase 38 addendum)**: same treatment as Root panel
  (Phase 37), verified working on two real tenants (empty-state + real-data cases), 0 console
  errors.
- ~~Root panel chatbot/AI Assistant UI modernization~~ **RESOLVED (Phase 39)**: redesigned as a chat
  UI. ~~Admin panel's own AI Assistant~~ **RESOLVED (Phase 41)**: same chat-UI treatment ported onto
  admin.html's `--ap-*` tokens, no target selector (always tenant-scoped). Both also had the same
  "HTTP 200 with a real error" bug independently — both now fixed.
- **Render deploy pending** for Phase 38's commits — pushed but not yet confirmed live at time of
  writing. Should complete on its own now that the health-check-path misconfiguration is fixed;
  worth a dashboard check if it's taking more than a few minutes.
- ~~Real-time order-status updates not reaching the customer's tracking screen~~ **RESOLVED
  (Phase 40)**: Netlify's `_redirects` proxy doesn't support SSE streaming at all; fixed via
  `window.SSE_BASE` routing `EventSource` connections directly to Render. Also fixed the same bug
  for admin's own live dashboard feed, found proactively during the same investigation.
- **In-memory SSE pub/sub (`backend/lib/events.js`) only works for a single server instance** —
  would need Redis pub/sub (or similar) to support horizontally scaled backend instances. Not a
  regression, just a scaling limit worth knowing about if Render is ever moved to multiple instances.
- **User-reported "orange card" on the customer tracking screen** — investigated thoroughly in
  Phase 40 (source CSS, computed styles, production's actually-served HTML) and found everything
  already monochrome. No code change made. Awaiting a screenshot from the user if the issue
  persists after a hard refresh.

## Credentials (dev fork)
- Root: `root` / `bunudabullan12A`. Tenant admin: `dayikatik` / `dayikatik123` (reset in P04).

## Resolved bugs
- default tenant `name`/`display_name` stale = "hasaca" → now self-healed on every boot (P01).
- placeholder logo was an unrecognizable dark "DEMO" circle → redesigned clean emblem (P01).
- leftover service worker served stale cached pages → SW disabled + auto-cleanup (P02).
- product images stored as base64 blobs in the DB → now uploaded as files, stored as URLs (P03).
- manual image URL inputs (root branding) → upload-only with preview (P03).
- blank Tenant-Admin after login → standalone admin now auth-gates via `openAdminLogin()`; startup
  loaders skip when unauthenticated (P06).
- new tenant `PUT /api/admin/site-widgets` (P28) returned success but the customer site didn't reflect
  the change → missing `invalidateTenantCache()` call after the write (the tenant resolver caches the
  row); fixed by adding the same call every other tenant-mutation route already uses.

## TODO / pending
- Residual branding cleanup in index.html + admin.html. (P04)
- Remove notification-send UI/API from tenant admin. (P05)
- Favicon = logo on admin/root pages too (customer page done). (P06)
- AI assistant (Gemini) — provider adapter + Root AI settings (P26), plan/execute for Root+Tenant (P27),
  Root tenant-targeted menu editing (P30) DONE. Still open: per-tenant menu-generation wizard (create
  products, not just edit); Root editing a tenant's *branding* by AI (P30 covers menu only — branding
  fields carry URL/email validation that the AI path would have to replicate).
- **Gemini quota:** the stored API key is real and authenticates, but its project has `limit: 0` on the
  free tier, so no AI call can return content yet. Enable billing/quota to exercise the assistants
  end-to-end. (Earlier logs called this a "fake key" — that was wrong; corrected in P30.)
- QR logos/frames on the generated code (P29 shipped color/margin/ECC only) — needs an image-
  compositing dependency (sharp/canvas), so it's a dependency decision, not a config tweak.
- Optional: tenant-side branding editor tab (logo/hero) — currently root-only.

## Important notes
- Gemini API key: store in `GEMINI_API_KEY` env or gitignored `data/ai_config.json`; NEVER commit or send to frontend.
- Category ids are global PRIMARY KEY → always tenant-suffixed (`starters-default`).
- Do not break existing features; verify after each phase; keep TR/EN i18n for all new UI.
- `backend/.env` must have `PORT=17888` for this fork (P27: found it stale at `12999`, a leftover from
  the original `saas proje` copy, and corrected it) — if the server ever starts on the wrong port,
  check this file first before assuming a code problem.
