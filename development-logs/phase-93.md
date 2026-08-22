# Faz 93 — Referans projeye hizalama: POS, Mutfak, Uyarılar, Hatırlatıcılar, Raporlar + düzeltmeler

**Tarih:** 2026-08-22
**Commit'ler:** `92c1eed`, `dfe8396`, `b605950`, `2127bfb`, `db2f45b`, `da4977f`, `09b98bd`

Faz 92'de altyapı ve 6 işletme modülü kurulmuştu. Bu fazda kalan ekranlar tamamlandı ve
kullanıcının bildirdiği sorunlar düzeltildi. Referans proje (*Yasas SaaS*) yeniden, bu kez
**ekran ekran** okundu — kullanıcı "yapı olarak takip et, tasarım sistemimizi koru" dedi.

## Referanstan alınan yerleşim deseni

Referansın her ekranı aynı iskeleti izliyor ve bu bizim ekranlarımıza da uygulandı:
**başlık + birincil eylem butonu → KPI kartları → arama/filtre çipleri → liste/tablo → modal'lar.**
Görsel dil tamamen bizim (`--ap-*` token'ları, `panel-card`, `admin-btn`); referansın renkleri
veya bileşenleri kopyalanmadı.

Referansın header'ında **dil butonu yoktu** (arama + zil + dişli) ve Ayarlar'ında
**"Locale & Region"** bölümü vardı — kullanıcının isteği de bu yöndeydi, ikisi de uygulandı.

## Eklenen ekranlar

| Ekran | Notlar |
|---|---|
| **Kasa (POS)** | Elle sipariş girme. Fiyat **sunucuda** çözülür, istemciye güvenilmez. Masa seçilirse masa siparişi, seçilmezse paket — backend'in zaten uyguladığı kural. Porsiyonlu üründe boyut seçtirilir. |
| **Mutfak Ekranı (KDS)** | 3 sütunlu pano: Yeni / Hazırlanıyor / Servise Hazır. **Hem masa hem uzaktan** siparişler düşer. 15 dk'yı geçen sipariş kırmızı. Fiş yazdırma ve panodan kaldırma. |
| **Uyarılar** | Faz 92'de hazır olan `/api/alerts` ekrana bağlandı. Türetilir, saklanmaz — sorun çözülünce kaybolur. |
| **Hatırlatıcılar** | Yeni tablo + CRUD. Kullanıcının kendi görevleri (uyarılardan farkı bu). |
| **İşletme Raporu** | Ayrı ekran **açılmadı**; mevcut Analitik'in devamı olarak eklendi. |

## Önemli davranış kararları

**Tekrarlayan hatırlatıcı tamamlanınca kapanmaz, ötelenir.** "Her hafta stok say" görevi
tamamlandığında listeden kaybolmamalı; bir sonraki tarihe taşınır ve kullanıcıya bildirilir
(yoksa "tamamladım ama hâlâ listede" diye kafası karışır).

**Mutfakta "kaldır" siparişi silmez, arşivler.** Yanlışlıkla basılan bir tuş ciro ve analitik
verisini bozmamalı.

**Kupon/indirim ve vergi eklenmedi.** Referansta ikisi de var ama bizim sistemde bu kavramlar
yok. Dış referanstan ürün özelliği uydurulmaz (bkz. `external-reference-boundary`). Backend'de
`tax` zaten 0 ve "ileride tenant bazlı yapılandırılacak" notu taşıyor — oraya sahte bir vergi
hesabı koymak yanlış veri üretirdi.

**Kâr marjı 0 ciroda `null` döner.** Sıfıra bölme yerine "hesaplanamaz" demek doğrusu.

## POS fiş altyapısı (ileride POS cihazına bağlanacak)

Yeni uç: `GET /api/orders/:id/receipt?width=32|42`

Fişi hem **yapısal veri** hem de **yazıcıya hazır düz metin** olarak döndürür. Sabit genişlikli
hizalama (58mm kağıt = 32 sütun, 80mm = 42); taşan ürün adı kırpılır — fiş satırı asla alt
satıra düşmez. Gerçek bir termal/POS cihazına bağlanınca **aynı uç** kullanılacak: cihaz `text`
alanını olduğu gibi basar ya da `lines` dizisinden kendi formatını üretir. Şu an tarayıcının
yazdırma penceresi üzerinden basılıyor (`@media print` ile sadece fiş görünür).

## Kullanıcının bildirdiği sorunlar ve kök nedenleri

**1. Dil karışıklığı** — iki ayrı gerçek neden bulundu:
- Admin panelinde **13 alan** `data-i18n` etiketi taşıyordu ama sözlükte karşılığı yoktu.
  Bunlar Faz 88/89'da **benim eklediğim** alanlardı; İngilizce modda Türkçe görünüyorlardı.
- Müşteri sitesinde **17 metin** HTML'e sabit yazılmıştı, hiç etiketi yoktu: 7 hafta günü,
  6 kişi-sayısı butonu, "Sepeti Gör", "Sepet", "Sipariş", "Siparişiniz Alındı".

Müşteri sitesi sözlüğü artık TR/EN tam eşit (63/63), eksik anahtar yok.

**2. Üst çubuktaki TR/EN butonu** kaldırıldı; dil Ayarlar > "Dil & Bölge"ye taşındı.

**3. Ürün formu çok karmaşıktı** (~30 alan). **Hiçbir alan silinmeden** sadeleştirildi:
varsayılan görünümde Ad/Fiyat/Kategori/Görsel; gerisi 3 katlanabilir bölümde
(Açıklama & Diller / Porsiyon / Besin Değerleri & Alerjenler). Bütünlük doğrulandı:
52 alan, 7 alerjen butonu, 40 dil paneli — öncesi ve sonrası aynı.

**4. Görsel alanında kontrast hatası** (kullanıcı ekran görüntüsü gönderdi): açık temada kutu
siyah kalıyordu. Sebep: önizlemede sabit `#1c1c1c`, butonda ise **müşteri sitesi** token'ı
(`--fire`) kullanılıyordu — ikisi de panel temasıyla değişmiyordu. Panel token'larına çevrildi
ve aynı hata sınıfı için panel geneli tarandı (7 satır daha düzeltildi).

**5. Mutfak ekranı butona basınca yanıp sönüyordu.** Sebep: her tazelemede pano
"Yükleniyor…" ile sıfırlanıp baştan çiziliyordu. Artık yükleme ekranı yalnızca ilk açılışta;
basılan kart sunucu cevabı beklenmeden yumuşakça soluyor, yeni içerik tek seferde beliriyor.
Tazeleme hatası artık dolu panoyu silmiyor. `prefers-reduced-motion` destekli.

**6. Uzaktan siparişler mutfak ekranına düşmüyordu.** Ekran sadece `?type=dinein` sorguluyordu.
Online siparişler `new`, masa siparişleri `received` durumuyla başlıyor; ikisi de artık
"Yeni Siparişler" sütununda toplanıyor, kartlarda MASA/UZAKTAN rozeti var.

## Doğrulama

- **API testleri:** Hatırlatıcılar 19/19, İşletme raporu 13/13 — hepsi geçti. Rapor testi
  bilinen sayılarla yapıldı (stok 10kg×100=1000, reçete 2kg×100=200, net kâr = ciro − gider).
- **POS uçtan uca:** gerçek sipariş oluşturuldu; sepette gösterilen ₺156 ile sunucunun
  hesapladığı 156 birebir aynı. Sipariş **otomatik olarak mutfak ekranına düştü**.
- **Fiş:** gerçek siparişle test edildi, hizalama doğru.
- **Mutfak:** sipariş Yeni→Hazırlanıyor taşındı (4→3, 1→2); "kaldır" arşivledi (`archived=true`),
  kayıt silinmedi.
- **Dil:** 17 metnin de iki dilde doğru çevrildiği tek tek kontrol edildi.
- **Regresyon:** **18 ekranın tamamı** açılıyor, doğru başlık, sıfır başarısız istek.

## Kalan / yapılmayanlar

- Referanstaki **Team & RBAC, Billing & Tax, KOT & Printers** ayar bölümleri eklenmedi —
  bunlar bizde olmayan ürün kavramları (rol yönetimi, abonelik faturalandırma, yazıcı donanımı).
- `push_*` i18n anahtarları hâlâ yalnızca TR'de; ilgili arayüz gizli olduğu için ertelendi.
- POS'ta indirim/kupon ve vergi yok (yukarıdaki gerekçe).
