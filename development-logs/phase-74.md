# Phase 74 — Faz C tamamlandı: belirsiz ürün eşleşmesinde kullanıcıya seçtirme

## Why
Görsel-oluşturma yol haritasının Faz C'si: "Hamburger menünün görselini değiştir" gibi bir istek
birden fazla gerçek ürüne uyabiliyorsa, AI en iyi tahminini kendi seçmek yerine kullanıcıya
sormalı.

## What changed

### Backend (`backend/server.js`)
Şemaya `"image_target_candidates": [string]|null` eklendi. Sistem promptu: istek belirsizse (isim
birden fazla GERÇEK ürüne uyabiliyorsa) modelin `image_target_product_id`'yi null bırakıp
`image_target_candidates`'e olası ürünlerin id'lerini yazmasını istiyor. Backend bu id'leri
`productsById`'ye karşı doğruluyor (aynı güven sınırı — modelin uydurabileceği bir id'ye
güvenilmiyor) — 2+ geçerli aday varsa ve açık bir `image_target_product_id` YOKSA, **görsel HENÜZ
oluşturulmuyor** (Hugging Face çağrısı yapılmıyor — boşuna bir tahmine API çağrısı harcanmıyor),
bunun yerine `imageCandidates:[{id,name}]` döndürülüyor.

### Frontend (`admin.html`)
`adminAiImageHTML()` artık `data.imageCandidates` varsa (2+) görsel yerine ürün adı butonlarından
oluşan bir seçim satırı gösteriyor. Bir butona tıklamak YENİ bir state/endpoint gerektirmiyor —
sadece "[Ürün Adı] için görsel oluştur" şeklinde AÇIK bir mesaj olarak yeniden gönderiliyor, mevcut
tekli-görsel akışı (artık kesin bir eşleşmeyle) aynen tekrar çalışıyor.

## Verification
Local preview, gerçek admin oturumu:
- Mevcut demo verisinde ürün isimleri zaten belirgin (doğal bir belirsizlik senaryosu yok) —
  frontend'i sahte bir `imageCandidates` verisiyle doğrudan test ettim: seçim satırı ("Ev Burger" /
  "Izgara Köfte" butonları) doğru render oldu, "Ev Burger"a tıklamak GERÇEKTEN "Ev Burger için
  görsel oluştur" mesajını gönderdi, bu da normal akıştan geçip GERÇEK, temiz (yazısız, büyük) bir
  hamburger görseli üretti — regresyon yok.
- Backend doğrulama mantığı (adayların gerçek ürün id'lerine karşı kontrolü) dikkatli kod
  incelemesiyle doğrulandı, mevcut `actions`/`image_target_product_id` doğrulama deseniyle birebir
  aynı.

## Files changed
- `backend/server.js` — şemaya `image_target_candidates` eklendi, sistem promptu güncellendi,
  doğrulama + erken-return (görsel oluşturmadan önce) mantığı eklendi.
- `admin.html` — `adminAiImageHTML()`'e aday-seçim dalı, yeni `adminAiPickImageCandidate()`
  fonksiyonu, 1 yeni i18n anahtarı (TR+EN).
