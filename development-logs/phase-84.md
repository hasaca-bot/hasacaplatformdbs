# Phase 84 — Render-only hosting geçişi (Netlify katmanı kaldırılıyor)

## Why
Kullanıcı kararı: site bundan sonra sadece `hasaca-api.onrender.com`'dan yayınlanacak,
`tadadigital.netlify.app` artık kullanılmayacak. Bu, projenin en temel mimari varsayımını
tersine çeviriyor: [[HOSTING-TOPOLOGY]] (vault) Netlify'nin statik dosyaları sunup sadece
`/api/*`'ı Render'a proxy'lediği bir ayrım üzerine kuruluydu; artık Render tek host.

## Bulgu: sanıldığından çok daha az eksik vardı
`_redirects`'teki pretty-URL eşlemelerinin çoğu zaten `backend/server.js`'te Express route
olarak MEVCUTTU (yerel geliştirme hep tek süreçle çalıştığı için) — `/root`, `/admin`, `/login`
+ takma adları, `/landing`, `/hasaca`, `/restoran-olustur`, 45 pazarlama sayfası (DİNAMİK,
`buildMarketingHead` ile — Netlify öncesinde bu route hiç çalışmıyordu, artık gerçekten çalışacak
ve custom-domain olmayan tenant'lara bile server-side SEO sağlayacak), `/robots.txt`,
`/sitemap.xml`. `admin.html`/`index.html`'in `SSE_BASE`/`API_BASE` mantığı zaten
`.endsWith('.onrender.com')` kontrolü yaptığı için **hiç değişiklik gerekmedi**.

## Gerçek eksikler — eklendi
- `app.get(['/menu','/menu/*'], ...)` → `sendTenantIndex` (server.js) — sadece `_redirects`'te
  vardı, Express'te hiç yoktu.
- `/gizlilik-politikasi` → `/gizlilik`, `/kvkk-aydinlatma-metni` → `/kvkk` (301 redirect) — eski
  takma ad URL'leri, marketing-data.js'in gerçek slug listesinde değiller.

## Domain sabitleri güncellendi (`tadadigital.netlify.app` → `hasaca-api.onrender.com`)
- `backend/server.js`: `PUBLIC_SITE_URL` varsayılanı, CORS `allowedOrigins` listesine
  `https://hasaca-api.onrender.com` eklendi (savunma amaçlı — asıl trafik artık aynı-origin).
- `backend/scripts/prerender-marketing.js`: varsayılan `BASE_URL`, script yeniden çalıştırılıp
  45 `pages/*.html` yeni domainle yeniden üretildi (bu dosyalar artık pratikte ölü kod —
  dinamik route route sırasında önce geliyor ve her zaman kazanıyor, ama tutarlılık için
  güncellendi).
- `landing.html`, `marketing.html`: canonical/OG/JSON-LD sabit URL'leri.
- `robots.txt`: statik dosyanın `Sitemap:` satırı + üst yorum tamamen yeniden yazıldı — bu dosya
  artık **tamamen ölü kod**: `server.js`'in kendi `/robots.txt` route'u `express.static`'ten önce
  tanımlı olduğu için her zaman önce cevap veriyor, bu statik dosyaya asla ulaşılmıyor.
- `backend/lib/marketingSeo.js`, `tenantSeo.js`: yorum satırları — `tenantSeo.js`'in yorumu ayrıca
  içerik olarak da güncellendi (artık "sadece custom domain'de çalışır" iddiası yanlış — Render
  tek host olunca bu route her istekte çalışıyor, paylaşılan domain dahil).

## ⚠️ Kritik risk — kod değişikliği bunu ÇÖZEMEZ, kullanıcının bilmesi/karar vermesi gerekiyor
[[robots-txt-render-coldstart-deindexing]] ve [[robots-txt-static-not-proxied]] kararı TAM OLARAK
bu riski önlemek için alınmıştı: Render ücretsiz plan ~15 dk boşta kalınca uyuyor, ilk istek
20-30 sn sürebiliyor/timeout olabiliyor. O zaman çözüm "statik dosyaları Netlify'den anında sun,
sadece /api/*'ı Render'a bırak" idi. **Render-only'e geçince bu koruma tamamen ortadan kalkıyor —
artık site TAMAMI (ana sayfa, menü, admin, pazarlama sayfaları, robots.txt, HER ŞEY) bu soğuk
başlangıç riskine maruz.** Sonuçları:
- Googlebot `robots.txt`'e tam soğuk anda denk gelirse yine tüm site indeksten düşebilir.
- Bir müşteri masadaki QR'ı okuttuğunda restoran 15 dk sipariş almadıysa 20-30 sn boş ekran
  görebilir.
- Netlify'nin küresel CDN'i gitti — tüm statik varlıklar (görseller, fontlar) artık tek bir
  Render origin'inden sunuluyor, coğrafi olarak uzak ziyaretçiler için daha yavaş + Render'ın
  bant genişliği/kullanım maliyeti artıyor.
- **Öneri kullanıcıya iletildi:** Render'ın ücretli (uyumayan) planına geçmek bu riski tamamen
  ortadan kaldırır. Ücretsiz planda kalınacaksa bu bilinçli bir trade-off olarak kabul edilmeli.

## Kullanıcının kendisinin yapması gereken (kod dışı)
- **Google Cloud Console**: OAuth Client'ın "Authorized JavaScript origins" listesine
  `https://hasaca-api.onrender.com` eklenmeli (Google girişi bu olmadan yeni domain'de çalışmaz).
  `GOOGLE_CLIENT_ID` zaten Render'da tanımlı, değişiklik gerekmiyor.
- Netlify sitesini (`tadadigital.netlify.app`) ister kapatsın ister öylece bıraksın — kod
  tarafında hiçbir bağımlılık kalmadı.
- Render env değişkenleri: `PUBLIC_SITE_URL` ayarlamak istemezse kod zaten doğru varsayılanla
  çalışır; istersen aynı değeri env'de de açıkça set edebilir (opsiyonel, kod değişikliği
  gerektirmez).

## Verification
Yerelde: `/`, `/menu`, `/menu/masa-1`, `/admin`, `/root`, `/login`, `/landing`, `/ozellikler`
hepsi 200; `/gizlilik-politikasi` 301 redirect; `/ozellikler`'ın gerçek `<title>`/canonical'ı
enjekte edildiği (placeholder değil) doğrulandı; `robots.txt` ve `sitemap.xml` (47 URL) doğru
host'u yansıtıyor; `node -c` ile tüm değişen dosyalar sözdizimi temiz; konsol hatasız.

## Push
Henüz push edilmedi — kullanıcı onayı bekleniyor (standing rule).
