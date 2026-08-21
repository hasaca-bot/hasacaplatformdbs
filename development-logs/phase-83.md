# Phase 83 — Müşteri menü sitesi (index.html) beyaz+mavi tasarıma geçiş

## Why
Task #20: müşteri menü sitesini eski koyu temadan Stitch'te tasarlanan beyaz + `#387AFF` mavi
tasarıma geçirmek. Bu turda keşfedilen durum: eşzamanlı çalışan başka bir AI aracı (Codex)
`index.html`'i zaten Tailwind-CDN tabanlı beyaz+mavi tasarıma dönüştürmüştü (yerel, commit
edilmemiş — orijinal 7485 satırlık koyu-tema hali `862fde7` commit'inde ve canlıda güvende).
Codex taslağı işlevsel olarak sağlamdı (multi-tenant fetch interceptor, çok-dil, sepet, checkout,
dine-in, canlı takip, rezervasyon korunmuş; uydurma özellik yok — search/profile/pickup/kurye
eklenmemiş). Bu faz o taslağı temel alıp gerçek gerilemeleri/bozuklukları düzeltti ve uçtan uca
tarayıcıda doğruladı.

## Değişen: index.html (7485 satır koyu tema → ~1460 satır Tailwind-CDN beyaz+mavi)

Not: satır düşüşü büyük ölçüde ~5000 satırlık inline `<style>` CSS'in Tailwind utility
class'larına dönüşmesinden; JS işlevselliği kaybolmadı, taşındı.

### Düzeltilen bozukluklar (kullanıcının bildirdiği "butonlar çalışmıyor / okunmayan yazı")
- **Kontrast (okunmayan yazı):** Tailwind token `on-primary-container` `#fefcff` (beyaz) idi ve
  `bg-primary-container` (`#dae2ff` açık mavi) üstünde kullanılıyordu (alt nav aktif "Menu"
  sekmesi) → beyaz üstüne beyaz. Token `#001d36` (koyu lacivert) yapıldı; başka hiçbir kullanımı
  bozmadı (tek kullanım yeri buydu). Tarayıcıda doğrulandı: renk artık `rgb(0,29,54)`.
- **Butonlar:** Tüm etkileşimler canlı test edildi (gerçek JWT + gerçek tenant `default`):
  sepete ekle → sepet dock → sepet drawer → checkout modal → ürün detay modal → dil değiştir →
  kategori filtre → rezervasyon → dine-in garson/hesap. Hepsi çalışıyor.

### Geri getirilen gerilemeler
- **SEO `<!--HEAD-->` placeholder** geri kondu (`sendTenantIndex` bunu arıyor,
  `server.js:3035`) + Search Console `google-site-verification` meta'sı geri (Codex silmişti).
  `<title>` yerine placeholder (custom domain'de server üretir, Netlify'de applySiteConfig
  doldurur — mevcut mimari, bkz. SEO-RENDERING vault notu).
- **`applySiteConfig` genişletildi:** eski hali sadece ad+hero_tr+telefon uyguluyordu. Artık:
  marka adı (iki dilde, `data-i18n="brand_name"` düğümleri dahil), hero başlık/alt-başlık (tr+en,
  i18nData'ya geri yazılıyor ki dil değişince tenant metni kalsın), hero arka plan görseli
  (`hero_images[0]`), footer metni, telefon (+ `tel:` linkleri), adres, Google Maps iframe.
- **Açılışta dil uygulanmıyordu:** `init()` artık `applyLanguage(currentLanguage)`'ı site-config
  sonrası çağırıyor — tarayıcısı EN olan müşteri artık sayfayı ilk boyada doğru dilde görüyor.
- **i18n eksikleri:** "Add to Order" TR'de bile İngilizceydi → `cart_add` TR "Sepete Ekle".
  "All"→"Tümü", ürün sayacı "Ürün"/"Items", dine-in badge "Masa:"/"Table:" dile bağlandı.

### Erişilebilirlik
- viewport'tan `user-scalable=no` kaldırıldı (kullanıcı yakınlaştırabilsin).

## Bilinçli basitleşmeler (Stitch tasarımına sadakat — gerileme değil, tasarım kararı)
- Koyu/monokrom tema seçici kaldırıldı (tasarım tek, beyaz+mavi).
- Sosyal medya footer'ı ve widget aç/kapa yok (Stitch tasarımında yok).
- Hero carousel yerine tek hero görseli (admin'in ilk hero görseli uygulanıyor).
- Porsiyon seçici uygulanmadı — veri modeli henüz yok (Task #19, ayrı iş; portion-pricing vault
  notuna bak). Ürün detayında tekil fiyat gösteriliyor.

## Verification
- Gerçek tenant `default` (12 ürün, 5 kategori) ile: menü render, kategori filtre (starters→4,
  all→12), sepet/checkout/detay modalları açılıp kapanıyor, dil TR⇄EN metinleri + marka kalıcılığı,
  dine-in gerçek masa token'ı (`/t/2Q9VUVWpLE`) ile badge+aksiyon bar+normal-nav gizleme, mobil
  375px'te yatay taşma YOK (`scrollWidth==clientWidth==375`), konsol hatasız, inline JS `new
  Function` ile parse OK.
- Görsel ekran görüntüsü bu ortamda compositing yapamadığı için alınamadı (bilinen kısıt) —
  doğrulama DOM/computed-style ölçümüyle yapıldı; son görsel onay gerçek cihazda kullanıcıya kaldı.

## Güvenlik ağı
Orijinal koyu-tema `index.html` `862fde7`'te ve canlıda; sorun çıkarsa `git checkout` ile döner.
`style.css` artık hiçbir HTML tarafından kullanılmıyor (index.html Tailwind CDN'e geçti) — ölü
dosya, ayrı bir temizlik konusu, bu commit'e dahil edilmedi.
