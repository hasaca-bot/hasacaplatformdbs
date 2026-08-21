# Faz 88 — Ayarlar: eksik alanlar + müşteri sitesine yansıtma (+ veri kaybı hatası)

**Tarih:** 2026-08-22
**Görevler:** #17 (Ayarlar'a eksik alanları ekle) ve #18 (Ayarları müşteri sitesine yansıt)

## Denetim — üç katman karşılaştırıldı

Backend'in kabul ettiği alanlar (`ADMIN_BRANDING_ALLOWED`, 28 anahtar), panelin gönderdiği alanlar
(22) ve müşteri sitesinin okuduğu alanlar tek tek karşılaştırıldı. İki ayrı boşluk çıktı.

## #17 — Panelde giriş alanı olmayan ayarlar

Backend bunları zaten kabul ediyor ve `tenantSeo.js` bir kısmını zaten okuyordu, ama panelde
girilecek yer yoktu (yani ayar fiilen erişilemezdi):

| Alan | Nereye eklendi | Ne işe yarıyor |
|---|---|---|
| `banner_text_tr` / `banner_text_en` | Marka & Site → Ana Sayfa | Sitenin en üstündeki duyuru bandı |
| `og_image` | Marka & Site → SEO | WhatsApp/Facebook'ta link paylaşılınca çıkan görsel |
| `seo_canonical` | Marka & Site → SEO | Kendi alan adı olanlar için canonical URL |
| `seo_robots` | Marka & Site → SEO | Google'da görünsün / gizlensin (açılır liste) |

`logo_url` ve `favicon_url` zaten kendi yükleme alanlarına sahipti, eksik değildi.

## #18 — Kaydedilen ama sitede hiç görünmeyen ayarlar (Faz 83 kaybı)

Eski koyu temalı `index.html` bunların hepsini basıyordu; Faz 83'teki beyaz+mavi yeniden yazımda
**tamamı düşmüştü** (`git show 862fde7:index.html` içinde 12 eşleşme, yeni dosyada 0). Restoran
paneline giriyor, kaydediyor, sitede hiçbir şey değişmiyordu. Geri getirilenler:

- **Duyuru bandı** — üst barın altında, yalnızca metin girilmişse görünür. Metin `i18nData`'ya
  yazılıyor (footer_text ile aynı desen), böylece dil değişince bant da kendi güncelleniyor.
- **WhatsApp / E-posta / Instagram** iletişim satırları — yeni tasarımın kart diline uyarlandı,
  varsayılan gizli, sadece değer girilmişse açılıyor. Instagram'da URL'den `@kullanıcıadı`
  çıkarılıyor, WhatsApp'ta numara `wa.me` için rakama indirgeniyor.
- **Sosyal medya butonları** (facebook, twitter, tiktok, youtube, website) — yalnızca dolu ve
  geçerli `http(s)` olanlar basılıyor.
- **Widget aç/kapa bayrakları** (`settings.widgets`, Faz 28) — her satır/buton için ayrı ayrı
  uygulanıyor. Anahtar yoksa **açık** sayılıyor; bu ayara hiç dokunmamış restoranlar eskisi gibi
  görmeye devam etsin diye (eski dosyadaki davranışın birebir aynısı).
- **Harita** — panelden girilen `maps_embed` artık kazanıyor; yoksa adresten türetiliyor. `maps`
  widget'ı kapatılırsa harita kutusu tamamen gizleniyor.
- **Favicon** — `favicon_url` artık sekme simgesine uygulanıyor.

> Not: `theme` ayarı (koyu/açık/siyah-beyaz) bilerek bağlanmadı — yeni müşteri sitesi Faz 83'te
> tek bir beyaz+mavi tasarıma sabitlendi, tema seçici o tasarımda yok. Panelde alan duruyor ama
> müşteri sitesinde karşılığı yok; ileride tema desteği istenirse ayrı bir iş.

## Yol üstünde bulunan GERÇEK VERİ KAYBI HATASI (bu turda düzeltildi)

Test sırasında Marka & Site formunu kaydedince restoranın **telefonu ve adresi silindi**.
Sebep — benim eklediğim koddan değil, öteden beri var olan bir hata:

`contact_phone`, `contact_email`, `address` hem `settings` JSON'unda hem de `tenants` tablosunun
kendi sütunlarında duruyor. Restoran bu değerleri "Restoran Bilgileri" ekranından girdiyse (ya da
kurulumda geldiyse) **yalnızca sütunda** olabiliyor. `loadBranding()` bu alanları sadece
`settings.*`'tan okuduğu için form **boş** açılıyor, `saveBranding()` ise her alanı koşulsuz
gönderdiği için Kaydet'e basıldığı anda gerçek telefon/adres **sessizce siliniyordu**.

**Düzeltme:** `loadBranding()` artık `s.contact_phone || cfg.contact_phone` şeklinde sütun
değerine düşüyor (e-posta ve adres için de aynısı). Backend tarafında değişiklik gerekmedi —
`/api/admin/restaurant-info` zaten hem sütunu hem `settings`'i birlikte yazıyor (kodda bu senkronu
açıklayan yorum da mevcut), boşluk yalnızca formun **yükleme** tarafındaydı.

## Doğrulama (localhost:12999, tenant=default)

- **#17 gidiş-dönüş:** Beş yeni alan panele girildi → kaydedildi → `/api/site-config` yanıtında
  beşi de doğru değerlerle döndü. `seo_robots` açılır listesi `index`'e doğru varsayılıyor.
- **#18 site tarafı:** Duyuru bandı doğru metinle çıkıyor; WhatsApp `https://wa.me/905551112233`
  linkiyle, e-posta `mailto:` ile, Instagram `@ornekrestoran` olarak görünüyor; 3 sosyal buton
  basıldı (boş olan twitter/tiktok doğru şekilde atlandı); harita adresten türetildi.
- **Dil değişimi:** Bant TR→EN geçişinde "Pazar günleri kapalıyız" ↔ "Closed on Sundays" olarak
  doğru değişiyor.
- **Widget bayrakları:** `instagram:false` → satır gizlendi, `maps:false` → harita kutusu gizlendi,
  `facebook:false` → buton listeden çıktı, `whatsapp:true` → görünmeye devam etti. Test sonrası
  hepsi tekrar açık duruma alındı.
- **Veri kaybı düzeltmesi:** `settings` içinde iletişim alanları YOKken form artık sütun
  değerleriyle doluyor (telefon/e-posta/adres üçü de doğru geldi) — yani kaydetmek artık silmiyor.
- **Mobil (375px):** yatay taşma yok (sayfa genişliği = ekran genişliği), bant 44px, renkleri
  `#dae2ff` zemin üzerine `#001d36` yazı (Faz 83'te düzeltilen kontrast tokeni).
- Sayfada başarısız istek yok.
