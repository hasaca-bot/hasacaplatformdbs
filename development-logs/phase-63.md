# Phase 63 — Rezervasyon sürükle-sil kaldırıldı + tüm onay dialogları glassmorphism'e çevrildi

## Why
Kullanıcı iki ayrı geri bildirim verdi:
1. Rezervasyonlar ekranındaki "silmek için sürükleyin" kutusu kafa karıştırıcı/gereksiz —
   doğrudan bir butonla silinebilsin istedi.
2. Onay dialoglarının (silme onayı vb.) görünümünü, gönderdiği bir One UI referans görseline
   (glassmorphism gradient arka plan, sol hizalı başlık/açıklama, ikon yok, alt satırda düz-metin
   buton + ince dikey ayırıcı) göre TÜM sitede değiştirmesini istedi.

## What changed

### Rezervasyon sürükle-sil kaldırıldı (`admin.html`)
Kod incelemesinde ilginç bir şey ortaya çıktı: sürükleme özelliği zaten TAM ÇALIŞMIYORDU —
`handleRezDragStart()` fonksiyonu tanımlıydı ama hiçbir rezervasyon kartında `draggable`/
`ondragstart` olarak GERÇEKTEN bağlanmamıştı, yani kullanıcı hiçbir zaman gerçekten bir kartı
sürükleyip bırakamıyordu; sadece görsel "silmek için sürükleyin" kutusu duruyordu. Her kartın
ZATEN kendi çöp kutusu butonu vardı (`.rez-action-btn.delete`, `deleteReservation(id)`'i
doğrudan çağırıyor, zaten `showCustomConfirm()` ile onay alıyor) — yani kullanıcının istediği
"doğrudan butonla silme" zaten mevcuttu, sadece kafa karıştıran/çalışmayan sürükleme arayüzü
kaldırılması gerekiyordu. Kaldırılanlar: `.admin-trash-zone` markup'ı + CSS'i,
`draggedRezId`/`handleRezDragStart`/`allowRezDragOver`/`handleRezDragLeave`/`handleRezDrop`
fonksiyonları + `dragend` event listener'ı, `admin_drag_delete` i18n anahtarı (TR+EN).

### Onay dialogları → One UI 8.5 Glassmorphism (`admin.html` + `index.html`)
`.custom-popup-card` (hem admin panelindeki `showCustomConfirm()` hem müşteri sitesindeki aynı
adlı sistem — iki ayrı dosyada aynı CSS class isimleri, aynı desen) tamamen yeniden tasarlandı:
- Arka plan: `linear-gradient(135deg, rgba(96,140,255,.30)..., rgba(18,18,26,.7))` + `backdrop-
  filter:blur(28px) saturate(1.6)` — mavi-tonlu camsı gradient (referans görseldeki mor yerine
  sitenin kendi `#387AFF` vurgusuna uyarlandı).
- `.custom-popup-icon{display:none;}` — referans görselde ikon yok, kaldırıldı (CSS-only, JS/
  markup dokunulmadı).
- Başlık + açıklama artık SOL hizalı (`text-align:left`), ortalanmış değil.
  `.custom-popup-actions-row` artık üstte ince bir ayırıcı çizgi (`border-top`), butonlar
  ARKA PLANSIZ düz metin (`background:transparent!important`), aralarında dikey bir ayırıcı
  (`border-right` ilk butonda) — referans görseldeki "Cancel | Apply" düzeni birebir.
- **Kasıtlı olarak TEK, tema-bağımsız görünüm** — hero mockup'ları/CTA şeritleriyle bu oturumda
  kurulan "bazı yüzeyler her iki temada da sabit koyu/camsı kalır" ilkesiyle tutarlı; artık ayrı
  açık/koyu tema override bloğu YOK (öncekiler tamamen kaldırıldı, kod da sadeleşti).
- `index.html`'de ek bir düzeltme gerekti: `body.theme-bw .checkout-card, .dt-card,
  .custom-popup-card{ background:#FFFFFF!important; ... }` PAYLAŞILAN bir kural `.custom-popup-
  card`'ı da zorla beyaz yapıyordu (checkout/detay kartlarıyla aynı listede) — dialog'u bu listeden
  çıkarıp `.checkout-card`/`.dt-card`'ı (onlar hâlâ haklı olarak beyaz kalmalı) etkilemeden
  ayırdım.

## Kullanıcı ekran görüntüsüyle bulunan gerçek bir hata: metin görünmüyordu
İlk sürüm canlıya alınmadan kullanıcı "bok gibi olmuş" diyerek bir ekran görüntüsü gönderdi —
dialog'un başlığı zar zor okunuyor, açıklama metni ise TAMAMEN GÖRÜNMÜYORDU. Kök neden:
`index.html`'de, benim düzenlediğim bloktan TAMAMEN AYRI bir yerde (satır ~2396-2403),
`.checkout-head h3`/`.dt-head h3` gibi seçicilerle PAYLAŞILAN başka bir `body.theme-bw` kuralı
`.custom-popup-title`/`.custom-popup-message`'ı da aynı listede `color:#0a0a0b !important` (siyah)
yapıyordu — koyu camsı kart üzerinde siyah metin neredeyse görünmez oluyordu. Düzeltme: bu iki
seçici paylaşılan listeden çıkarıldı (checkout/detay başlıkları hâlâ haklı olarak siyah kalıyor,
sadece dialog metni artık etkilenmiyor). Ayrıca arka plan gradienti daha "camsı" görünmesi için
güçlendirildi: düz `linear-gradient` yerine üstüne bir `radial-gradient` ışık parlaması bindirildi
(referans görseldeki sağ-üst köşe highlight'ına daha yakın), kenarlık/gölge biraz belirginleştirildi
— hem `admin.html` hem `index.html`'de birebir aynı değerlerle.

## Verification
Local preview, gerçek admin oturumu + gerçek tenant, taze-sayfa-yenileme:
- Rezervasyonlar: trash zone tamamen kalktı, 12 rezervasyon kartı normal render oluyor, silme
  butonu doğru ID ile `deleteReservation()`'ı çağırıyor, tüm sürükleme fonksiyonları gerçekten
  `undefined` (sadece referanssız değil).
- Dialog — admin.html: koyu VE açık panel temasında AYNI gradient arka plan (`linear-gradient(...
  rgba(96,140,255,.3)...)`), `border-radius:24px`, ikon `display:none`, başlık `text-align:left`
  + beyaz renk doğrulandı.
- Dialog — index.html: varsayılan koyu VE `theme-bw` (açık) modda AYNI gradient doğrulandı (önceki
  paylaşılan `!important` kuralı düzeltmeden önce açık modda zorla beyaza dönüyordu — şimdi
  dönmüyor).
- Faz 1'de bulunan `*/`-yorum-içi-kapanma hatasına karşı bu turda eklenen yorumlar admin.html VE
  index.html'de grep ile tarandı — temiz.
- Metin-görünmezliği düzeltmesi sonrası: `theme-bw` modunda `titleColor`/`msgColor` ikisi de
  `rgb(255,255,255)` (beyaz) doğrulandı, açıklama metni artık gerçekten DOM'da ve okunaklı.
  Gerçek ekran görüntüleriyle GÖRSEL olarak da doğrulandı — hem index.html (bulanık yemek fotoğrafı
  arkaplanı üzerinde) hem admin.html (koyu panel arkaplanı üzerinde), ikisinde de camsı gradient +
  köşe ışık parlaması + okunaklı beyaz metin + ayırıcılı buton satırı doğru görünüyor.

## Files changed
- `admin.html` — `.admin-trash-zone` markup+CSS silindi, 5 sürükleme fonksiyonu/değişkeni silindi,
  2 i18n anahtarı silindi, `.custom-popup-*` tamamen yeniden tasarlandı (glassmorphism, tema-
  bağımsız).
- `index.html` — `.custom-popup-*` aynı glassmorphism tasarımına çevrildi, paylaşılan
  `body.theme-bw` `!important` kuralından `.custom-popup-card` çıkarıldı.
