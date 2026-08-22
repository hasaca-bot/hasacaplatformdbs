# Faz 92 — İşletme Yönetimi modülleri (Stok, Malzeme, Reçete, Tedarikçi, Gider, Müşteri)

**Tarih:** 2026-08-22
**Commit'ler:** `4dd42d0` (altyapı) + `ce6f69a` (arayüz)
**Kaynak:** Kullanıcı bir referans proje paylaştı — *Yasas SaaS Restaurant Business Management
System (Community)*, `C:\Users\hasan_y4hfwna\Desktop\...` (Figma export'u, React + mock veri).

## Referans nasıl kullanıldı (ve nasıl kullanılMADI)

Referans proje **yalnızca işlev kapsamı** için incelendi: hangi ekranlar var, her ekran ne işe
yarıyor, kullanıcı hangi bilgileri görüyor. **Kodu, bileşenleri, renkleri, yerleşimi kopyalanmadı.**
Kullanıcının talimatı da buydu; ayrıca kasadaki [[external-reference-boundary]] kuralı da bunu
zorunlu kılıyor.

Referansta 13 ekran vardı. Bunlardan **7'si bizim sistemde kavram olarak hiç yoktu** ve bu fazda
sıfırdan kuruldu. Referansta olup burada **bilinçli olarak kurulmayan** kavramlar da var —
aşağıdaki "Yapılmayanlar" bölümüne bakın.

## Veri modeli (6 yeni tablo)

Hepsi mevcut `tenant_id` desenini birebir izler; her sorgu tenant ile kısıtlanır.

| Tablo | Ne tutar | Önemli not |
|---|---|---|
| `suppliers` | Tedarikçi firmaları | — |
| `ingredients` | Hammadde: birim, stok, kritik eşik, birim maliyet | `stock_qty` tek doğruluk kaynağı |
| `stock_movements` | Giriş/çıkış/sayım defteri | **Sadece eklenir**, satır güncellenmez/silinmez |
| `recipes` | Ürün ↔ malzeme bağı | Kalemler JSON dizide (`portions` ile aynı gerekçe) |
| `expenses` | Gider kayıtları | — |
| `customers` | Müşteri kaydı | Doğal anahtar **telefon** |

## Üç mimari karar (ve nedenleri)

**1. Stok bakiyesi yalnızca hareket üzerinden değişir.** `PUT /api/ingredients/:id` bilerek
`stock_qty` alanını güncellemez. Stok değiştirmenin tek yolu `POST /api/stock-movements`, ve bu uç
bakiye ile defteri **aynı istekte** yazar. Böylece "stok neden azaldı?" sorusunun cevabı her zaman
vardır; bakiye ile geçmiş birbirinden ayrılamaz. Malzeme düzenleme formunda kullanıcıya bunu
açıklayan bir not gösteriliyor.

**2. Reçete maliyeti saklanmaz, hesaplanır.** `GET /api/recipes` her çağrıda malzemelerin güncel
`unit_cost` değerinden toplam/porsiyon maliyetini ve (ürüne bağlıysa) kâr marjını üretir. Saklansaydı
malzeme fiyatı değiştiğinde bayat kalırdı — restoran için en tehlikeli veri türü yanlış maliyettir.

**3. Müşteri eşleştirmesi telefon numarasıyla.** Sistemde müşteri girişi/hesabı **yok** (sipariş
yalnızca isim+telefon+adres taşıyor), dolayısıyla tekrar eden müşteriyi eşleştiren tek doğal anahtar
telefondur. `GET /api/customers` kaydedilmiş müşterileri **sipariş geçmişinden türetilen** özetle
birleştirir; kayıt hiç açılmamış olsa bile sipariş vermiş herkes listede görünür ("KAYITSIZ" rozetiyle).
Ziyaret sayısı ve toplam harcama **elle girilemez**, siparişlerden hesaplanır.

## Güvenlik / veri bütünlüğü

- Tüm uçlar `adminAuth` arkasında; kiracı izolasyonu ayrıca test edildi (başka tenant'ın token'ı
  `default`'un verisini göremiyor — boş dönüyor).
- Sıralama sütunu **beyaz listeden** seçilir (sütun adı SQL'e parametre olarak bağlanamaz).
- Tüm metin girdileri HTML'den arındırılır ve uzunluk sınırına tabidir.
- Stok negatife düşüremez: eldekinden fazla çıkış isteği **reddedilir** (sessizce sıfıra çekmek,
  gerçekte olmayan bir tüketimi kaydetmek olurdu).
- Kullanımdaki malzeme/tedarikçi silinemez → `409` + nerede kullanıldığı bilgisi.
- Sayfa boyutu üst sınırı 200 (bozuk/kötü niyetli istek sunucuyu zorlayamaz).

## Arayüz

Sidebar'a **"İşletme"** grubu eklendi (6 giriş). **Mevcut sidebar yapısı ve stili değiştirilmedi** —
yalnızca yeni bir grup eklendi. `showAdminView` **değiştirilmedi, sarmalandı**: özgün davranış aynen
çalışıyor, üzerine yalnızca yeni ekranların veri yüklemesi ekleniyor.

**Tasarım sistemi korundu:** Yeni renk veya ölçü icat edilmedi; tamamı mevcut `--ap-*` token'larını
ve `panel-card` / `admin-btn` / `admin-input` dilini kullanıyor. İki temada da doğrulandı.

Her ekranda: gecikmeli arama, filtre çipleri, sayfalama, yükleniyor/boş/hata durumları, CRUD
modalları, form validasyonu. **Ham hata kodu kullanıcıya asla gösterilmiyor** — `humanError()`
bunları Türkçe cümleye çeviriyor (örn. `ingredient_in_use` → "Bu malzeme bir reçetede kullanılıyor,
önce reçeteden çıkarın.").

`admin-operations.js` ayrı dosya olarak tutuldu: `admin.js` zaten 6.500 satır (bkz. phase-87.md) ve
bu modüller kendi içinde bağımsız.

## Doğrulama

**Backend — 37 uçtan uca HTTP testi, hepsi geçti:** CRUD, validasyon, arama, filtreleme, stok
matematiği (giriş/çıkış/sayım), yetersiz stok reddi, silme korumaları, türetilmiş reçete maliyeti
(2 kg × 24,5 + 0,1 L × 180 = ₺67, porsiyon başı ₺16,75 — birebir doğrulandı), telefonla müşteri
tekilleştirme, türetilmiş uyarılar, tokensiz erişimin 401 dönmesi.

**Arayüz — tarayıcıda gerçek tıklamalarla:** 6 ekranın hepsi doğru başlık ve vurguyla açılıyor;
gerçek veri yükleniyor (stok değeri ₺592,75 matematiği doğrulandı); filtre/arama/boş-durum
çalışıyor; modalla tedarikçi eklendi ve liste yenilendi; validasyon hatası Türkçe gösterilip modal
açık kaldı; stok hareketi 9,5 → 12 kg doğru işledi; müşteri ekranı sipariş geçmişinden 20 gerçek
müşteri türetti; her iki temada renkler tasarım sistemine uyuyor; mobilde (375px) yatay taşma yok;
sayfada başarısız istek yok.

Test verileri sonrasında temizlendi.

## Bu fazda YAPILMAYANLAR (dürüst kapsam)

Referans projede olup burada **kasten** kurulmayanlar:

- **POS (elle sipariş girme)** — mevcut sipariş altyapısına yeni bir giriş yolu gerektiriyor,
  ayrı faz.
- **Kitchen (mutfak ekranı)** — mevcut "Masa Sipariş Kontrolü" ekranıyla işlevi büyük ölçüde
  örtüşüyor; ayrı bir ekran açmadan önce gerçekten neyi farklı yapacağına karar verilmeli.
- **Reports** — mevcut "Analitik" ekranı var; yeni modüllerin (gider, stok değeri, reçete kârlılığı)
  oraya eklenmesi ayrı bir iş.
- **Reminders (hatırlatıcılar)** — `GET /api/alerts` ucu **hazır ve çalışıyor** (kritik stok,
  bekleyen sipariş, görselsiz ürün, ödenmemiş gider) ama henüz bir ekrana bağlanmadı.
- **Sadakat/puan sistemi (tier, points)** — referansta vardı; bizde böyle bir ürün kararı yok,
  uydurulmadı.
- **Alış emri (purchase order) akışı** — referansta yoktu, burada da yok.

Ayrıca: yeni modüller **AI asistanının** düzenleyebileceği alanlar arasına eklenmedi (mevcut
whitelist ürün/ayar alanlarını kapsıyor) — istenirse ayrı iş.
