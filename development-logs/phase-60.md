# Phase 60 — Düzeltme: monokrom, admin değil müşteri tarafına aitmiş

## Why
Faz 59'da "masa siparişi" ve "uzaktan sipariş" ekranlarını monokroma çevirirken admin.html'in
KENDİ iç yönetim ekranlarını (`#adminTabTableOrdersCont`/`#adminTabOrdersCont`) hedeflemiştim.
Kullanıcı bu turda netleştirdi: "masa siparişi" ile kastı, müşterinin masadaki QR kodu okutarak
girdiği sipariş ekranıydı (`index.html`'in dine-in modu); "uzaktan sipariş" de aynı şekilde
müşterinin uzaktan (paket/teslimat) sipariş verdiği akış — ikisi de `index.html` (müşteri sitesi),
admin.html DEĞİL. Ayrıca açıkça belirtti: "bu admin paneli mavi kalsın."

## What changed
- `admin.html`: Faz 59'da eklenen `#adminTabOrdersCont`/`#adminTabTableOrdersCont` scoped
  monokrom override bloğu TAMAMEN KALDIRILDI — admin paneli artık her yerde (bu iki view dahil)
  yeniden One UI mavisi.
- `index.html`: `--fire`/`--fire-text`/`--fire-rgb` (hem `:root` hem `body.theme-bw`) Faz 2B'den
  önceki orijinal monokrom değerlerine geri döndürüldü (`--fire:#ffffff; --fire-text:#0a0a0b;
  --fire-rgb:255,255,255;`). Faz 58'de zaten `--ember`/`--gold`/`--amber` monokroma dönmüştü
  (ürün fiyatı/sepet ikonu için) — `--fire` ise butonlar için BİLEREK mavi bırakılmıştı. Şimdi o
  da monokroma döndü, çünkü `--fire`'ı kullanan HER ŞEY (hero butonları, checkout butonu, dine-in
  rozeti/aksiyon butonları, rezervasyon gönder butonu, pax-btn vb.) hem "masa siparişi" hem
  "uzaktan sipariş" akışının bir parçası — yani müşteri sitesinin TAMAMI artık yeniden monokrom.
  `.cart-fab`/`.food-card-cart-btn` (Faz 58'de --fire'dan bağımsız hardcoded beyaz yapılmıştı)
  değişmedi, zaten aynı sonucu veriyordu.

## Verification
Local preview, taze-sayfa-yenileme:
- Gerçek masa QR-giriş URL'i (`/t/2Q9VUVWpLE?tenant=default`, dine-in mod aktif): `--fire:#ffffff`,
  `.dinein-badge` arka planı beyaz gradient.
- Normal (uzaktan sipariş) tarama modu (`/tenant/default`, dine-in mod KAPALI): `--fire:#ffffff`,
  sepet FAB'ı ve sepete-ekle butonu beyaz gradient.
- `admin.html`: `#adminTabTableOrdersCont`, `#adminTabOrdersCont` ve `#adminPanelOverlay`'in
  KENDİSİ — üçü de `--fire:#387AFF` (mavi) — admin paneli artık tamamen ve tutarlı şekilde mavi.

## Files changed
- `admin.html` — Faz 59'un scoped override bloğu kaldırıldı (14 satır silindi).
- `index.html` — `--fire`/`--fire-text`/`--fire-rgb` iki token bloğunda da orijinal monokrom
  değerlerine döndürüldü.
