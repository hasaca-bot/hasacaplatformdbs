# 🌐 HASACA — Multi-Tenant Restaurant SaaS Platform

Bir restoran web sitesini, **binlerce restorana hizmet verebilen çok kiracılı (multi-tenant) SaaS platformuna** dönüştüren proje. Her restoran kendi subdomain'inde (`restaurant1.hasaca.com`) kendi menüsü, rezervasyonları, teslimat siparişleri, QR masa siparişleri, admin paneli ve markasıyla çalışır; veriler kiracılar arasında tamamen izoledir.

> Bu README aynı zamanda **değişiklik günlüğü**dür. Her önemli değişiklik aşağıdaki **DEĞİŞİKLİK GÜNLÜĞÜ** bölümüne tarih damgasıyla eklenir.

---

## 📋 Genel Bakış

| Alan | Değer |
|------|-------|
| **Mimari** | Çok kiracılı (subdomain bazlı tenant çözümleme) |
| **Frontend** | Saf HTML/CSS/JS (bundler yok) — `index.html` (müşteri), `admin.html` (restoran yönetimi), `root.html` (platform sahibi) |
| **Backend** | Node.js + Express (`backend/server.js` + `backend/lib/*` + `backend/routes/*`) |
| **Veritabanı** | `backend/db.js` — çift modlu: `DATABASE_URL` varsa **PostgreSQL** (prod), yoksa **SQLite** (yerel, sıfır kurulum) |
| **Kimlik doğrulama** | Kullanıcı adı + `scrypt` hash'li şifre + HMAC imzalı oturum token'ı (`lib/auth.js`) |
| **Diller** | Türkçe / İngilizce (tüm arayüzler i18n) |

## 🧩 Modüller
- **Menü & Kategori yönetimi** (restoran admin)
- **Rezervasyon sistemi**
- **Teslimat siparişi** (sepet + adresli checkout + localStorage)
- **QR Masa Siparişi** — kalıcı QR kodları, masada sipariş, canlı durum takibi (SSE), garson/hesap çağrısı, salon görünümü, arşiv
- **Root (Süper Admin) Paneli** — tenant CRUD, otomatik demo içerikli site üretimi, marka yönetimi, tenant olarak giriş
- **Web Push bildirimleri** + PWA

---

## 🚀 Hızlı Başlangıç (Yerel Geliştirme)

**Tek tıkla:** proje kökündeki **`START ADMIN.bat`** dosyasına çift tıklayın — bağımlılıkları kurar, migration + seed çalıştırır, tarayıcıda admin panelini açar ve sunucuyu başlatır.

**Elle:**
```bash
cd backend
npm install        # 1) bağımlılıklar (ilk kurulumda)
npm run migrate    # 2) veritabanı şeması (SQLite otomatik)
npm run seed       # 3) demo veri (demo tenant: menü, masa, rezervasyon, siparişler)
npm run dev        # 4) sunucuyu başlat
```

| Sayfa | URL |
|-------|-----|
| Müşteri sitesi (Dayı Katık) | http://localhost:12999 |
| Restoran admin | http://localhost:12999/admin.html |
| Root paneli | http://localhost:12999/root |
| Demo restoran | http://localhost:12999/?tenant=demo |

**Giriş bilgileri (yerel):**
- Dayı Katık admin: `dayikatik` / `dayikatik123`
- Demo restoran admin: `demo` / `demo1234`
- Root (platform sahibi): `root` / `data/root_credentials.json` içinde (ilk çalıştırmada üretilir)

> Yerel çoklu-tenant testi: `http://localhost:12999/?tenant=<slug>` veya `restaurant1.localhost:12999` (modern tarayıcılar `*.localhost`'u otomatik çözer).

## ⚙️ Ortam Değişkenleri (`backend/.env`)
`backend/.env.example` dosyasını `backend/.env` olarak kopyalayın. Tümü isteğe bağlıdır; boş bırakılırsa yerel-güvenli varsayılanlar kullanılır.

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | Boş → yerel SQLite. Dolu → PostgreSQL (prod). |
| `AUTH_SECRET` | Oturum imzalama sırrı. Boş → `data/secret.json`'a otomatik üretilir. |
| `ROOT_PASSWORD` | Root şifresini sabitler (boş → otomatik üretilir). |
| `PORT` | Sunucu portu (varsayılan 12999). |
| `PLATFORM_DOMAIN` / `PLATFORM_ORIGIN` | Prod'da subdomain çözümleme + QR URL'leri için. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push. Boş → `data/vapid.json`'a otomatik üretilir. |

Prod (Render) bu değişkenleri gerçek ortam değişkeni olarak alır; `.env` dosyası yalnız yereldir ve **gitignore**'ludur.

## 📁 Kod Yapısı
```
backend/
  server.js              Express app + tüm ana API'ler + statik servis
  db.js                  Çift modlu DB katmanı + migration + seed
  seedData.js            Dayı Katık menü/çeviri seed verisi
  seedDev.js             Demo tenant seed (npm run seed)
  migrate.js             Migration-only (npm run migrate)
  lib/
    auth.js              scrypt hash + HMAC token
    tenant.js            subdomain → tenant çözümleme middleware
    events.js            SSE pub/sub (tenant başına)
    env.js               .env yükleyici (paketsiz)
  routes/
    root.js              Root paneli API + otomatik tenant üretimi
    tables.js            QR masa yönetimi + QR üretimi + servis istekleri
index.html               Müşteri sitesi (menü, sepet, teslimat, QR dine-in)
admin.html               Restoran yönetim paneli (6 sekme)
root.html                Platform sahibi paneli
icons/placeholder-*.svg  Yeni tenant demo görselleri
START ADMIN.bat          Tek tıkla yerel başlatıcı
```

---

## 🔒 Güvenlik Notları
- **Tenant izolasyonu:** her sorgu `tenant_id` ile filtrelenir; token'ın tenant'ı istek host'uyla eşleşmezse 401 (root hariç). Bir tenant asla başka bir tenant'ın verisine erişemez.
- Şifreler `scrypt` ile hash'lenir; oturumlar HMAC imzalı token.
- Sipariş toplamları **sunucuda** yeniden hesaplanır (istemciye güvenilmez).
- Müşteri girdileri admin panelinde HTML-escape edilir (XSS).
- `data/`, `backend/`, `logs/` gibi özel yollar statik servisten engellenir (private anahtarlar sızmaz).

## ☁️ Prod Dağıtımı (kullanıcı adımları)
Aşağıdaki işlemler platform sahibinin erişimini gerektirir (ben otomatik yapmam):
1. **Neon**'da PostgreSQL veritabanı oluştur, bağlantı adresini al.
2. **Render**'da Node servisi: `backend/` build+start, env değişkenlerini (`DATABASE_URL`, `AUTH_SECRET`, `PLATFORM_DOMAIN`, `PLATFORM_ORIGIN`, `ROOT_PASSWORD`) ekle.
3. **DNS**: `*.hasaca.com` wildcard kaydını Render servisine yönlendir; Render'da özel alan adını ekle.
4. İlk açılışta migration'lar otomatik çalışır; root hesabı `data/root_credentials.json`'a değil, `ROOT_PASSWORD` env'ine göre kurulur.

> **Ölçek notu:** SSE canlı bildirimleri tek sunucu instance'ı için bellek-içidir. Çoklu instance'a geçilirse ortak bir yayın-abone (örn. Redis pub/sub) gerekir.

---

## 📜 Çalışma Kuralları
1. **Değişiklik günlüğü zorunlu** — her değişikliği aşağıdaki bölüme tarih damgasıyla ekle.
2. **Mevcut işlevi bozma** — geriye dönük uyumluluğu koru.
3. **Hiçbir metni sabit-kodlama** — tüm arayüz metinleri i18n sistemine (`i18nData` + `data-i18n`) girer.
4. Neon / Render / GitHub Secrets / DNS gibi erişim gerektiren işlemleri **kullanıcıya adım adım tarif et**, kendin yapmaya çalışma.

---

# 📝 DEĞİŞİKLİK GÜNLÜĞÜ

## 2026-07-21 16:07 — FAZ E: White-Label Marka + "My Restaurant" Master Şablonu

**Yapılan işlem:** Platform tamamen white-label yapıldı — tüm Dayı Katık markası kaldırıldı. `default` tenant artık her yeni restoranın klonlandığı generic **"My Restaurant" master şablonu**. Platform markası (logo/favicon/giriş logosu) Root panelinden kod değiştirmeden düzenlenebilir. (Port 12000 → **12999** olarak değiştirildi.)

**Yeni dosyalar:**
- `backend/masterTemplate.js` — generic "My Restaurant" demo verisi (4 kategori, 11 ürün, yerel placeholder görseller, generic marka ayarları). Hem default tenant hem yeni tenant klonlaması bunu temel alır.
- `icons/favicon.svg` + yeniden üretilen nötr placeholder PNG'ler (logo.png, favicon-16/32, apple-touch-icon, icon-192/512, badge.png, favicon.ico).

**Değişen dosyalar:**
- `backend/db.js` — `platform_settings` tablosu; `seedTemplateMenu()` (tenant-suffixed kategori/ürün id'leri); `runSeeds` menüyü menu.json yerine master şablondan seed'ler; `seedPlatform` default'u "My Restaurant" yapar + **tek seferlik rebrand migration**'ı (mevcut Dayı Katık default'unu generic şablona çevirir, marka metnini çevirilerden temizler).
- `backend/routes/root.js` — `createTenant` artık DEMO_* dizileri yerine **default tenant'ı klonluyor** (kategoriler/ürünler/çeviriler/ayarlar); yeni uçlar: `GET/PUT /api/root/platform-settings`, `POST /api/root/upload-asset` (logo/favicon yükleme).
- `backend/server.js` — public `GET /api/platform-config` (sır içermez).
- `index.html` + `admin.html` — tüm Dayı Katık metin/asset referansları generic'e çevrildi (title, meta, og/twitter, Schema.org, logo img, favicon, telefon/adres, manifest); `applySiteConfig` artık default tenant için de çalışıyor; `API_BASE` her yerde same-origin.
- `manifest.json`, `service-worker.js` — generic marka.
- `root.html` — platform logosu/adı `platform-config`'den; **Platform Markası** düzenleyici modalı (yükleme dahil) + AI Ayarları modalı (backend Faz G'de).
- Silinen: eski `admin/` ve `yonetici/` Dayı Katık site kopyaları.

**DB migration:** `platform_settings` tablosu eklendi; default tenant menüsü + markası master şablonla değiştirildi (tek seferlik, `default_template_applied` bayrağıyla).

**Doğrulama:** default = My Restaurant (4 kategori/11 ürün, placeholder logo); yeni tenant şablonu klonluyor (4/11); platform-settings düzenlenebilir; servis edilen sayfalarda 0 Dayı Katık referansı; mevcut admin girişi + demo tenant verisi korundu; tarayıcıda konsol hatası yok.

**Not:** Kategori id'leri global PRIMARY KEY olduğundan tenant-suffix'lidir (`starters-default`), çapraz-tenant çakışması engellenir. Test tenant'ı `proofcafe` temizlendi.

**Bilinen sınır:** Menü içeriğindeki bazı Türkçe demo açıklama metinleri (kategori açıklamaları) "realistic demo data" olarak bilinçli bırakıldı — restoran sahibi kendi içeriğini (Faz G'de AI ile de) girecek.

## 2026-07-21 07:05 — FAZ D: Geliştirme Ortamı + START ADMIN.bat + Dokümantasyon

**Yapılan işlem:** Sıfır kurulumlu yerel geliştirme ortamı, tek tıkla başlatıcı ve kapsamlı dokümantasyon eklendi. Prod bulut yapılandırması aynen korundu.

**Yeni dosyalar:**
- `backend/lib/env.js` — paketsiz `.env` yükleyici (gerçek ortam değişkenlerini ezmez). `server.js`, `migrate.js`, `seedDev.js` en başta çağırır.
- `backend/migrate.js` — yalnız migration (`npm run migrate`).
- `backend/seedDev.js` — demo tenant seed (`npm run seed` / `seed:force`): 4 kategori, 11 ürün, 5 masa+QR, 2 rezervasyon, 2 teslimat + 2 masa siparişi, 1 servis isteği, admin hesabı (`demo`/`demo1234`). İdempotent (varsa atlar). 'default' tenant'a dokunmaz.
- `backend/.env.example` — tüm env değişkenleri şablonu (kimlik bilgisi sabit-kodlanmaz).
- `START ADMIN.bat` (proje kökü) — Node kontrolü → `npm install` (ilk kez) → migrate → seed → tarayıcıda admin aç → sunucu başlat. Tek tıkla tam ortam.

**Değişen dosyalar:**
- `backend/server.js` — en başta `.env` yükleme.
- `backend/package.json` — ad `hasaca-backend` v3.0.0; `migrate`, `seed`, `seed:force` script'leri.
- `.gitignore` — `.env`, `data/secret.json`, `data/root_credentials.json`, `data/vapid.json`, db yedekleri eklendi.
- `README.md` — HASACA platform dokümantasyonuna dönüştürüldü: mimari, modüller, hızlı başlangıç (install/migrate/seed/start), env tablosu, kod yapısı, güvenlik, prod dağıtım adımları.

**Env ile ortam değişimi:** `DATABASE_URL` boş → SQLite (yerel); dolu → PostgreSQL (prod). Otomatik algılama korundu; sabit kimlik bilgisi yok.

**Doğrulama:** `.env` oluşturuldu → yüklendi (SQLite modu); `npm run migrate` → şema güncel; `npm run seed` → demo tenant tüm verilerle (11 ürün, 4 kategori, 5 masa, 2 rezervasyon, 2+2 sipariş, 1 servis isteği); demo admin girişi OK; default tenant korundu (53 ürün); seed tekrar → idempotent atladı.

---

## 2026-07-21 06:40 — FAZ C: QR Masa Siparişi Modülü (Table Ordering)

**Yapılan işlem:** Uçtan uca QR masa sipariş sistemi eklendi — masa yönetimi + kalıcı QR kodları, masada sipariş (adres sormadan), durum akışı, müşteri tarafında canlı takip (SSE), garson/hesap çağrısı, salon (floor) görünümü, arşiv. Her şey tenant-izole ve tam TR/EN.

**Yeni paket:** `qrcode` (^1.5.4) — sunucu tarafı QR PNG/SVG üretimi. PDF için ek paket YOK (yazdırma sayfası + tarayıcı "PDF kaydet").

**Yeni dosyalar:**
- `backend/lib/events.js` — in-memory SSE pub/sub (tenant başına admin kanalı + sipariş başına takip kanalı, 25 sn heartbeat). Tek instance için yeterli; çoklu instance'ta Redis pub/sub gerekir.
- `backend/routes/tables.js` — Masa CRUD + toplu üretim, `GET /api/tables/:id/qr` (PNG+SVG+URL), `GET /api/tables-qr` (toplu), `GET /api/t/:token/context` (public, tenant-izole), garson/hesap istekleri (`POST /api/t/:token/service`, `GET /api/service-requests`, resolve).

**Değişen dosyalar:**
- `backend/db.js` — (Faz A'da eklenen) `tables`, `service_requests` tabloları + `orders`'a order_type/table_id/table_name/archived kolonları bu fazda kullanıldı.
- `backend/server.js` — tables router montajı, `GET /t/:token` müşteri sayfası, SSE uçları (`/api/events/admin` query-token doğrulamalı, `/api/events/track/:orderId` public). `POST /api/orders` dine-in genişletmesi (table_token → order_type='dinein', adres zorunlu değil, status='received', admin'e SSE order_new). `GET /api/orders?type=dinein&archived=` filtreleri (delivery listesi dine-in'i dışlar). `PUT /api/orders/:id/status` (5 adımlı akış: received→preparing→ready→serving→delivered; delivered→arşiv; admin+müşteri SSE).
- `admin.html` — 2 yeni sekme (slider 4→6): "Masa Yönetimi" (liste, tekli/toplu ekle, QR göster/indir/yazdır, tekli+toplu yazdırma şablonu logo+ad+masa ile, yeniden adlandır token'ı korur, sil) ve "Masa Sipariş Kontrolü" (salon görünümü renk durumlarıyla, dine-in kartları durum ileri/geri + arşiv, garson/hesap bildirim çubuğu + ses). SSE ile anlık; giriş sonrası bağlanır. Tam i18n.
- `index.html` — `/t/:token` algılama → dine-in modu (masa rozeti, rezervasyon gizli, checkout'ta adres alanları gizli), garson çağır/hesap iste/siparişe devam butonları, sipariş sonrası **canlı takip kartı** (ilerleme çubuğu + lokalize durum, SSE). `placeOrder` dine-in farkındalıklı.

**Doğrulama (tarayıcı, iki sekme):** Masa oluştur (tekli+toplu 5); QR üret (PNG data-uri + doğru URL); yeniden adlandır → token değişmedi; `/t/<token>` → dine-in modu (rozet, rezervasyon gizli, adres gizli); sipariş ver (adressiz) → takip kartı; admin'de "preparing"e ilerlet → **müşteri ekranı SSE ile anında "Hazırlanıyor" (yenileme yok)**; garson çağır → admin bildirim çubuğu + salon "waiter"; deliver → arşive düştü, aktiften kalktı; cross-tenant token 404. Konsol hatası yok. Test verileri temizlendi (default tenant: 0 masa, 53 ürün korundu).

## 2026-07-21 05:55 — FAZ B: Root (Süper Admin) Paneli + Otomatik Tenant Üretimi

**Yapılan işlem:** Platform sahibine özel `/root` paneli ve tek tıkla demo içerikli restoran sitesi üretimi eklendi.

**Yeni dosyalar:**
- `root.html` — bağımsız Root Paneli (TR/EN, aynı data-i18n deseni): tenant listesi (arama/filtre/durum), oluştur/düzenle/marka/detay modalları, devre dışı bırak/sil, tenant olarak giriş, admin şifresi sıfırlama. Giriş yalnız `root` rolüne açık.
- `backend/routes/root.js` — Root API (`/api/root/*`, tümü rootAuth): tenant CRUD + status + branding + impersonate + tables + reset-admin-password. `createTenantWithDemoContent` servisi: tenant satırı + 151 baz çeviri kopyası + 4 demo kategori + 11 demo ürün (rastgele fiyat, yerel placeholder SVG görseller) + 3 masa (kalıcı QR token'lı) + tenant admin hesabı (şifre yanıtta BİR KEZ döner).
- `icons/placeholder-logo.svg`, `icons/placeholder-dish-1..4.svg` — dış servissiz demo görseller.

**Değişen dosyalar:**
- `backend/server.js` — `/api/root` montajı (rootAuth), `GET /root` sayfa route'u, `GET /api/site-config` (public, tenant marka verisi). **GÜVENLİK:** `data/`, `backend/`, `logs/` vb. özel dosyaların statik servisten sunulması engellendi (data/vapid.json özel anahtarı, data/secret.json ve root_credentials.json HERKESE AÇIKTI — kapatıldı).
- `index.html` — `applySiteConfig()`: default olmayan tenant'larda logo/hero/başlık/telefon/SEO'yu site-config'den uygular (i18n boru hattı üzerinden, dil değişiminde korunur). Default site (Dayı Katık) hiç etkilenmez.
- `admin.html` — `#imp=<token>` impersonation handoff (Root Panelinden "Tenant Girişi").

**Doğrulama:** Root girişi (yanlış şifre reddi + rol kontrolü); restaurant1 oluşturuldu → 151 çeviri + 4 kategori + 11 ürün + 3 masa + admin hesabı; demo site markasıyla açılıyor (başlık/hero/logo/sepet); tenant admin token'ı cross-tenant 401; impersonation restaurant1'de 200, default'ta 401; disable → 403 site kapalı; default site değişmedi (53 ürün); özel dosyalar 404.

**Not:** Sipariş sırasında bir kolon/placeholder sayısı hatası bulunup düzeltildi (products INSERT 23 kolon / 22 placeholder).

## 2026-07-21 05:25 — FAZ A: Gerçek Multi-Tenancy Temeli + Yeni Kimlik Doğrulama

**Yapılan işlem:** Platform (HASACA) gerçek çok-kiracılı mimariye geçirildi. Tüm veriler artık tenant'a (restorana) bağlı; kimlik doğrulama kullanıcı adı + hash'li şifre + imzalı oturum token'ına taşındı.

**Yeni dosyalar:**
- `backend/lib/auth.js` — scrypt şifre hash'i (Node yerleşik crypto, yeni paket YOK), HMAC-SHA256 imzalı 24 saatlik oturum token'ları. Secret: `AUTH_SECRET` env yoksa otomatik üretilip `data/secret.json`'a yazılır.
- `backend/lib/tenant.js` — subdomain → tenant çözümleme middleware'i (`restaurant1.hasaca.com`, `restaurant1.localhost:12999`), 5 dk cache, bilinmeyen tenant → 404 sayfası, devre dışı tenant → 403 sayfası. Yerel geliştirmede `?tenant=slug` override.

**Değişen dosyalar:**
- `backend/db.js` — Yeni tablolar: `tenants`, `admin_users`, `tables`, `service_requests` (Faz C için hazır). Migration: products/categories/reservations/subscriptions/notifications tablolarına `tenant_id` kolonu (+indeks); `translations` tablosu UNIQUE(tenant_id, key) olacak şekilde yeniden kuruldu (SQLite'ta tablo rebuild); `orders` tablosuna `order_type`, `table_id`, `table_name`, `archived`, `archived_at` kolonları. Seed: 'default' tenant (Dayı Katık), `root` hesabı (şifre `data/root_credentials.json`), `dayikatik` tenant admin'i.
- `backend/server.js` — `resolveTenant` middleware monte edildi; `adminAuth` token doğrulamalı yeniden yazıldı (sabit şifre KALDIRILDI); `rootAuth` eklendi; `POST /api/auth/login` + `GET /api/auth/me`; TÜM endpoint'ler tenant-scoped. Güvenlik düzeltmeleri: rezervasyon GET/PUT/DELETE, ürün POST/PUT/DELETE/reset, kategori POST/PUT/DELETE, çeviri POST artık adminAuth istiyor (eskiden HERKESE AÇIKTI).
- `admin.html` + `index.html` — Giriş modalına kullanıcı adı alanı; `submitAdminLogin` artık `/api/auth/login` çağırıyor; token `localStorage`; fetch interceptor token'ı otomatik ekliyor + dev `?tenant=` override taşıyor; tüm sabit `Bearer dayikatik123` başlıkları kaldırıldı; `API_BASE` yalnız Netlify'da cross-origin (subdomain tenancy için aynı-origin varsayılan); oturum geri yükleme (`/api/auth/me`); yeni i18n anahtarları (TR+EN).

**Giriş bilgileri:** Restoran admin'i: `dayikatik` / `dayikatik123` (değişmedi, artık kullanıcı adı da gerekiyor). Root: `root` / `data/root_credentials.json` içinde.

**Rollback:** `backend/dayikatik.db.bak-20260721` yedeği geri kopyalanır; server.js/db.js/HTML değişiklikleri git'siz ortamda README'deki bu kayda göre elle geri alınır. Migration'lar mevcut veriyi silmez (yalnız kolon ekler + translations kopyalayarak taşır).

**Doğrulama:** Migration temiz geçti (log'lu); curl: eski sabit şifre → 401, yanlış şifre → 401, tenant/root login → token, bilinmeyen tenant → 404 (API+sayfa); tarayıcı: yanlış giriş hatası, doğru giriş → panel, interceptor ile ürün oluştur/sil (201/200), token'sız mutasyon → 401, halka açık rezervasyon/sipariş POST → 201; mevcut menü/sepet/sipariş akışları bozulmadı.

## 2026-07-20 23:43 — Sipariş Sistemi (Food Ordering) eklendi

**Yapılan işlem:** Mevcut menü + rezervasyon sistemini bozmadan, uçtan uca (müşteri + yönetim) bir sipariş sistemi eklendi. Tam i18n (TR/EN), tenant-hazır (tek restoran).

**Değişen dosyalar:**
- `backend/db.js` — `orders` ve `order_items` tabloları eklendi (hem PostgreSQL hem SQLite DDL'i), `tenant_id` kolonu + indeksler.
- `backend/server.js` — Orders API bloğu eklendi: `getTenantId()`, `mapOrderRow()`, `POST /api/orders` (public, sunucu-taraflı fiyat hesabı), `GET/PUT/DELETE /api/orders` (adminAuth, tenant-scoped).
- `index.html` — Sipariş i18n anahtarları (TR+EN); menü kartlarına Sepete Ekle butonu; yüzen sepet + çekmece + checkout modalı + toast (HTML/CSS/JS); `applyLanguage` içine sepet yenileme kancası.
- `admin.html` — Sipariş i18n anahtarları (TR+EN); "Siparişler" sekmesi (buton idx 2, Bildirimler idx 3'e kaydı); sekme kaydırıcı CSS'i 3→4 sekmeye göre güncellendi (`switchAdminPanelTab` artık yüzdeyi sekme sayısından hesaplar); Orders paneli + JS mantığı (yükle/render/badge/filtre/sırala/ara/okundu/sil/ses/poll); girişte `loadOrders()`.

**Eklenen dosya:** yeni `README.md` (bu dosya).
**Silinen dosyalar:** eski `README.md`, `logs/changelog.md` (kullanıcı talebiyle).

**Etkilenen modüller:** Veritabanı şeması, backend REST API, müşteri arayüzü, yönetim paneli, i18n.

**Rollback yöntemi:**
- DB: `orders` ve `order_items` tabloları `DROP TABLE` ile kaldırılabilir; migration `CREATE TABLE IF NOT EXISTS` olduğu için mevcut veriyi etkilemez.
- Kod: `backend/server.js` içindeki "ORDERS API" bloğu, `backend/db.js` içindeki iki "ORDERS" DDL bloğu, `index.html` ve `admin.html` içindeki sipariş HTML/CSS/JS/i18n blokları silinerek eski davranış geri gelir. Sekme kaydırıcı için `admin.html`'de genişlik `400%→300%`, panel `25%→33.333%` yapılmalı ve Bildirimler sekmesi tekrar idx 2 olmalı.

**Doğrulama:** `node --check` ile `db.js` ve `server.js` sözdizimi doğrulandı; yerel sunucuda sipariş verme → admin panelinde görme → okundu/sil akışı test edildi.

**Sade açıklama:** Artık müşteriler menüden ürünleri sepete ekleyip adres/ödeme bilgisiyle sipariş verebiliyor; işletme de yönetim panelindeki Siparişler sekmesinden bunları görüp yönetebiliyor. Her şey seçili dile (TR/EN) göre görünüyor.
