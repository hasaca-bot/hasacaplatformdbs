# Faz 94 — Marka & Site ekranı sadeleştirildi + adres Maps linkinden otomatik

**Tarih:** 2026-08-21
**Commit:** `09cd2ce`

Kullanıcı Marka & Site ekranının kalabalık olduğunu belirtti: SEO alanları kullanılmıyor,
favicon yükleme özelliği çalışmıyor, tema seçici gereksiz, adres/Maps kurulumu üç ayrı alana
yayılmış, hero metni etiketleri anlaşılmıyor. Hepsi tek tek ele alındı.

## Yapılanlar

**SEO alanları kaldırıldı.** Başlık/açıklama/anahtar-kelime alanları arayüzden çıkarıldı;
backend alanları (`seo_title` vb.) dokunulmadan kaldı. Kullanıcı bunun yerine AI'ın içerikten
otomatik SEO metni üretmesini istiyor — bu ileri bir AI-optimizasyon adımı, backlog'a eklendi
(bkz. görev "SEO metinlerini AI ile otomatik üret").

**Favicon yükleme UI'ı kaldırıldı.** Kullanıcı "zaten işe yaramıyor" dedi. `favicon_url` backend
alanı dokunulmadı, sadece yükleme arayüzü kaldırıldı (HTML'de neden kaldırıldığını açıklayan
yorum bırakıldı).

**Tema seçici kaldırıldı.**

**Adres kurulumu tek alana indirildi.** Önceden adres metni + Maps linki + Maps embed kodu olmak
üzere 3 ayrı alan vardı. Artık tek bir "Google Maps linki" alanı var; kullanıcı linki yapıştırıp
"Adresi Getir"e basınca backend linki çözüp adres metnini otomatik dolduruyor
(`POST /api/maps/resolve`, bkz. aşağı).

**Hero metni etiketleri sadeleştirildi.** Önceki etiketler teknik/anlaşılmazdı; düz Türkçe'ye
çevrildi, İngilizce varyantlar bir `<details>` içine toplanarak varsayılan görünüm sadeleşti.

## Yeni endpoint: `POST /api/maps/resolve`

`backend/routes/operations.js` içinde. Google Maps linkinden adres metni çıkarır:
- `/maps/place/<adres>/` yol parçasını veya `?q=`/`?query=` parametresini ayrıştırır.
- Kısaltılmış linkler (`maps.app.goo.gl`) için **sunucu tarafında** HTTP yönlendirmesini takip
  eder (tarayıcı CORS yüzünden bunu yapamaz).
- **SSRF koruması:** yalnızca `google.com`/`*.google.com`/`goo.gl`/`maps.app.goo.gl` host'larına
  izin verilir — kullanıcı rastgele bir URL yapıştırıp sunucuyu iç ağa istek attıramaz.

## Tekrar eden hata sınıfı: kaldırılan alan kayıt sırasında veri siliyor

Faz 88'de bir kez yaşanmış aynı hata burada da pusuya yatmıştı: bir form alanı arayüzden
kaldırılınca, `saveBranding()` içindeki kaydetme payload'ında o alanın anahtarı hâlâ
**koşulsuz** duruyorsa, `get(id)` olmayan elemandan `''` döner ve backend her gönderilen
anahtarı yazdığı için önceki değer sessizce boşla eziliyor. Bu kez önceden yakalandı: SEO/tema/
favicon anahtarları `saveBranding()`'in payload nesnesinden **tamamen çıkarıldı**, boş değerle
bırakılmadı. Doğrulama: SEO test değerleri API ile yazıldı → form üzerinden kaydedildi →
veritabanı doğrudan okunarak `seo_title`/`seo_description`/`theme` değerlerinin bozulmadığı
teyit edildi.

## Değişen dosyalar

- `admin.html` — `view-branding`: favicon/SEO/tema blokları kaldırıldı (yorumla açıklanarak),
  adres bölümü `brMapsLink` + "Adresi Getir" + `brMapsStatus` + `brAddress` olarak yeniden kuruldu,
  hero metni etiketleri sadeleştirildi.
- `admin.js` — `loadBranding()`/`saveBranding()` kaldırılan alanları okumayı/yazmayı bıraktı
  (yeniden eklenmesin diye açık uyarı yorumu var); yeni `brResolveMapsLink()`.
- `backend/routes/operations.js` — `POST /maps/resolve`, `addressFromMapsUrl()` yardımcı
  fonksiyonu, host beyaz listesi.
