# Phase 55 — One UI 8.5, Faz 2B: Restoran Sitesi (`index.html`)

## Why
Faz 2A'da Root Paneli + Giriş Sayfası One UI 8.5'e çevrildi. Bu faz (2B) müşterinin QR kod ile
gördüğü asıl restoran sitesini (`index.html` — menü, sepet, ödeme, rezervasyon, sipariş takibi)
kapsıyor. Bu, kullanıcının "herşeyi One UI yap" isteğinin en yüksek etkili parçası — gerçek
müşterilerin doğrudan gördüğü site.

## What changed

### Token bloğu (`:root`, `body.theme-bw`)
`--fire`/`--fire-text`/`--fire-rgb` (birincil vurgu) ve `--ember`/`--gold`/`--amber` (ikincil vurgu —
yıldız puanlama, fiyat metni, rozet arka planları) → One UI mavisi. Birincil `#387AFF`, ikincil
(daha açık) `#5c96ff` (koyu tema) / `#2f68d9` (açık tema) — her iki temada da aynı mavi aile, One UI
prensibiyle tutarlı. `body.theme-mono` (gerçek gri B&W tema) BİLEREK dokunulmadı — zaten kasıtlı
gri, plan bunu açıkça kapsam dışı bırakmıştı; canlı doğrulamada `--fire:#4A4A4A` hâlâ aynı, teyit
edildi.

**Bulunan gerçek bir hata**: `--cart-surface:#241009` (sepet/ödeme paneli arka planı) monokrom
rebrand öncesinden kalma sıcak-kahverengi bir renkti, ana `--dark2` tonuyla (`#0e0e11`) hiç
uyuşmuyordu. One UI panel tonuna (`#17171a`) nötrleştirildi. `--cart-surface2` de aynı şekilde
(`#F6EFE8` sıcak bej → `#F1F1F3` One UI açık arka plan).

### Bileşen köşe yuvarlaklıkları (One UI ölçeğine — pill butonlar, 20-28px kartlar/dialoglar)
Hero butonları (`.btn-main`/`.btn-secondary`), kategori dropdown, sepete-ekle ikon butonu, sepet
öğeleri/kapat/miktar kontrolü/checkout butonu/temizle butonu, ödeme bottom-sheet'i (`.checkout-card`
22→26px), form inputları (`.co-input` 12→14px), ödeme yöntemi seçici (`.co-pay` 12px→pill — chip
görünümü), sipariş takip sheet'i (`.dinein-track` 20→24px), dine-in aksiyon butonları, iletişim
ikon rozetleri/sosyal butonlar (12px→pill), rezervasyon formu inputları/gönder butonu (12/14px→14px/
pill), paylaşılan `.admin-btn` (onay dialogunun aksiyon butonları da bunu kullanıyor, 12px→pill).

### Onay/silme dialogu (`.custom-popup-card`, müşteri tarafı)
Admin.html'deki Dialog düzeltmesiyle aynı: nötr `rgba(0,0,0,.55)` scrim + 16px blur (öncesi sıcak
`rgba(10,5,3,.6)` + 12px), radius 24→28px. **`:has()` temaya-bağlama düzeltmesi burada GEREKMEDİ** —
admin.html'deki sorunun aksine, bu dialog doğrudan sitenin KENDİ `--dark2`/`--cream` token'larını
okuyor (cross-DOM-sibling sorunu yok), zaten doğru temaya bağlı.

### Beklenmedik bulgu — kapsam düzeltmesi
Plan, `index.html` içinde admin.html'in Faz 1'de modernize edilen `--ap-*`/Navigation-Rail sistemiyle
eşleşen "gömülü bir admin paneli kopyası" olduğunu varsaymıştı (senkronize edilecekti). Gerçekte
`#adminPanelOverlay` (index.html içinde) **eski, Phase-25-öncesi bir tabs-tabanlı düzen**
(`.admin-panel-tabs` vb.) — hiç `--ap-*` token'ı yok, admin.html'in güncel yapısıyla alakası yok.
Muhtemelen kullanılmayan/eski kod (gerçek admin erişimi `/admin` → `admin.html` üzerinden). Bunu
modern Navigation Rail'e çevirmek "senkronizasyon" değil, sıfırdan bir yeniden-tasarım olurdu —
plan dışı, bu fazda YAPILMADI. İkon stroke kuralı bu yüzden `svg:not(#adminPanelOverlay *)` ile bu
alanı bilerek dışarıda bırakacak şekilde yazıldı, o kısmın stiline dokunulmadı.

### İkonlar
`svg:not(#adminPanelOverlay *){ stroke-width:2.25; stroke-linecap:round; stroke-linejoin:round; }`
— admin.html/panel.css/login.html ile aynı mantık, legacy admin overlay hariç.

## Verification
Local preview, gerçek `default` tenant, `localStorage['theme']` ile taze-sayfa-yenileme yöntemiyle:
- Varsayılan (koyu): `--fire:#387AFF`, `.food-card` 20px, sepete-ekle butonu pill.
- `theme-bw` (açık): `--fire:#387AFF` (aynı mavi), `--dark:#f1f1f3`, `--cream:#000000`.
- `theme-mono` (gri B&W): `--fire:#4A4A4A` — DEĞİŞMEDİ, doğrulandı.
- Gerçek kullanıcı akışı: ürünü sepete ekle → sepeti aç (`.cart-item` 20px, checkout butonu pill +
  mavi gradient) → ödeme formunu aç (`.checkout-card` 26px, `.co-pay` pill, `.co-input` 14px).
- Onay dialogu programatik açıldı: 28px radius, `rgba(0,0,0,.55)` scrim.
- Rezervasyon formu: input 14px, gönder butonu pill.
- İkon: `stroke-width:2.25px` bir SVG üzerinde doğrulandı.
- Font-family: `"Samsung Sharp Sans"` DEĞİŞMEDİ.
- `git diff --stat`: `index.html` +72/-60 satır, tamamı görsel-only.

## Files changed
- `index.html` — token bloğu (`:root`, `body.theme-bw`, `--cart-*`), bileşen radius'ları, dialog,
  ikon stroke kuralı. `body.theme-mono` ve legacy `#adminPanelOverlay` bilerek dokunulmadı.
