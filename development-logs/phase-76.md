# Phase 76 — Landing page: hero + panel yapısı referans tasarıma göre yeniden kuruldu

## Why
Kullanıcı landing page'in görünümünü beğenmedi ve beğendiği bir referans landing page'in (Land-book'ta
bulduğu "Norma") **yapısının** birebir aynısını istedi — mevcut metin içeriği korunarak, sadece
görsel/yapısal düzen değişecek şekilde.

Önceki turda sadece renk/köşe ince ayarları yapılmıştı; asıl fark **yapısaldı**: referansın hero'su
kenarlardan içeri girmiş dev bir yuvarlak kart ve nav onun üstünde yüzüyor, bizimki ise düz iki
sütunlu (sol metin / sağ CSS-çizimi laptop) bir düzendi.

Ölçüler tahminle değil, referansın **canlı sitesinden** (nor.ma) DevTools üzerinden computed-style
okunarak alındı. Referansın kaynak dosyaları/görselleri KOPYALANMADI — sadece layout metrikleri
(radius, tipografi skalası, grid oranları, cam reçetesi) eşleştirildi, işaretleme ve içerik
HASACA'nın kendisi.

## What changed (`landing.html`)

### Hero — tamamen yeniden kuruldu
- `<section class="hero">` artık 16px sayfa inset'i olan, 28px radius'lu, `min-height:72vh` bir
  `.hero-card` içeriyor (`.hero-scrim` overlay + gradyan zemin).
- Nav `position:sticky` → **`fixed` (top:28px)**: layout'ta yer kaplamıyor, hero kartının üstünde
  yüzüyor.
- İçerik kartın ÜSTÜNE sabitlendi (dikey ortalanmadı): hap rozet (`.hero-badge`, 36px,
  `rgba(255,255,255,.15)`), altında 1.15fr/0.85fr grid — solda başlık, sağda açıklama + CTA'lar +
  3 mini istatistik.
- Başlık: 56px / 600 / `line-height:1.02` / `letter-spacing:-.03em`; ilk satır `rgba(255,255,255,.55)`,
  ikinci satır tam beyaz.
- Butonlar: 36px yükseklik, pill, 14px/500 — primary beyaz zemin+koyu metin, ghost `white/10` zemin +
  `white/30` kenarlık.
- Hero kartı **her iki temada da koyu** (fotoğraf-benzeri panel olduğu için), tüm hero metni sabit beyaz.
- CSS ile çizilmiş sahte laptop/telefon/chip mockup'ı hero'dan tamamen kaldırıldı (gerçek ekran
  görüntüsü kendi bölümüne gelecek) — ilgili ~60 satır CSS, `theme-mono` override'ları,
  `prefers-reduced-motion` kuralları ve 6 i18n anahtarı temizlendi.

### Stats — yuvarlak panele çevrildi
- Hero ile aynı panel reçetesi (`.panel-section`/`.panel-card`/`.panel-scrim`/`.panel-inner`),
  `min-height:62vh`.
- 4 ayrı kart yerine TEK cam kart: 16px radius, `rgba(255,255,255,.1)` zemin,
  `rgba(255,255,255,.15)` kenarlık/ayraçlar, `backdrop-filter:blur(12px)`.
- `.panel-inner` flex kolon + `space-between`: başlık panelin üstünde, cam kart altında.

### Yeni bölüm — "Tek platform, her ekran" (`#screens`)
- `.mockup-duo`: tarayıcı (%74) + telefon (%20) yan yana, **alttan hizalı** (köşe bindirmesi değil —
  referansın gerçek düzeni bu).
- Çerçeveler `.browser-mockup` (aspect 1440/930, 20px radius) ve `.phone-mockup` (aspect 1180/2556,
  24px radius); içleri şimdilik `.mockup-ph` gradyan placeholder ("Yönetim Paneli" / "QR Menü"),
  gerçek ekran görüntüleri gelince `<img>` ile değişecek.
- TR+EN i18n anahtarları eklendi (`scr_title`, `scr_sub`, `scr_ph_admin`, `scr_ph_menu`, `hero_badge`).

### Diğer (aynı turda, referans ölçümlerine göre)
- Karşılaştırma tablosu: HASACA sütunu boydan boya koyu dolgu + beyaz onaylar; 24px radius,
  `0 24px 60px -24px rgba(0,0,0,.3)` gölge.
- SSS: her soru ayrı kart yerine tek gruplu kart (16px radius) + iç ayraçlar.
- "Nasıl çalışır": bağlantı-çizgili liste yerine 3'lü kart grid (36px radius, 28px düz numara rozeti);
  **6 adımın metni aynen korundu**, 2 satıra sarıyor.
- Fiyat kartları 28px radius'a çekildi.

## Bugs found & fixed
1. **`.stat-card` 1132px yerine 584px'e çöküyordu.** `.wrap`'in `margin:0 auto`'su flex-column bir
   konteynerde cross-axis auto margin olduğu için `stretch`'i iptal ediyor ve öğeyi fit-content'e
   düşürüyor. `.hero-inner`/`.panel-inner`'a `width:100%` eklendi. Hero'da içerik zaten max-width'e
   ulaştığı için bu hata orada görünmüyordu.
2. **Mobilde nav, hero rozetini ve başlığın üstünü kesiyordu.** `@media (max-width:560px)` içindeki
   `.wrap{ padding:0 18px }` KISAYOLU `padding-top`'u sıfırlıyordu; eşit specificity (her iki seçici de
   tek sınıf) olduğu için sonra gelen kural kazanıyordu. Seçiciler `.hero .hero-inner` /
   `.panel-section .panel-inner` olarak kapsandı → artık 42px boşluk var.
3. **Nav açık temada koyu hero kartının üstünde görünmez oluyordu.** Sayfa başında her iki temada da
   beyaz cam tonu kullanılıyor; koyu tona sadece `.scrolled` durumunda (hero geçildikten sonra)
   dönülüyor.

## Verification
Local preview (1280x900 ve 375x812), koyu + `theme-mono` açık tema:
- Ölçümler referansla birebir: kart 28px/16px inset, başlık 56px-600-57.12px-(-1.68px), rozet 36px
  `rgba(255,255,255,.15)`, grid 32px gap, nav fixed top:28px.
- Mockup en-boy oranları hedefle birebir (1.548 / 0.462); mobilde `.mockup-duo` dikey diziliyor.
- Bölüm çakışması yok, yatay taşma yok (docWidth 1270 ≤ viewport 1280), konsol hatası yok.
- Açık temada hero başlığı ve istatistik rakamları beyaz kalıyor (panel her iki temada koyu olduğu için).

Not: preview paneli kaydırılmış içerikte aralıklı olarak siyah kare döndürdü; alt bölümler, üstteki
kardeş öğeler geçici olarak gizlenip bölüm sayfa başına taşınarak görsel olarak doğrulandı (sonra
geri alındı).

## Kalan iş
Hero kartının alt yarısı ve showcase/duo mockup'ları hâlâ placeholder — gerçek ürün ekran
görüntüleri (yönetim paneli dashboard/siparişler/masa yönetimi/AI asistanı + müşteri QR menüsü,
siyah-beyaz temada, dolu veriyle) geldiğinde yerleştirilecek.

## Files changed
- `landing.html` — hero yeniden kuruldu, stats panele çevrildi, yeni `#screens` bölümü, ölü mockup
  CSS/i18n temizliği, 3 hata düzeltmesi.
