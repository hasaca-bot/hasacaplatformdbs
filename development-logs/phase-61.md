# Phase 61 — İki gerçek collapsed-sidebar/topbar hatası bulundu ve düzeltildi

## Why
Kullanıcı, admin panelinin daraltılmış (collapsed) sidebar'ının "çarpık bozuk" göründüğünü ve
hamburger/topbar ikonunun daraltılınca "sıkıştığını" bildirdi (iki ekran görüntüsüyle). İkisi de
gerçek, doğrulanabilir CSS hatasıydı — kozmetik tahmin değil.

## What changed

### Hata 1 — `.nbadge` sayı rozetleri daraltılmış sidebar'da sızıyordu
`#adminPanelOverlay .app-shell.collapsed .nav-item .nbadge{ display:none; }` kuralı vardı ama asla
işe yaramıyordu: her badge (`adminOrdersBadge`, `adminRezBadge`, `adminTableOrdersBadge`) JS
tarafından `style="display:flex"` gibi SATIR İÇİ bir stille gösteriliyor, ve satır içi stil her
zaman herhangi bir class-selector CSS kuralını (aynı `!important` olmadıkça) ezer. Sonuç: daraltılmış
74px'lik dar sütunda ikonun yanında/üstünde numara rozetleri (3, 4, 9) sıkışık, çakışık şekilde
görünüyordu — kullanıcının "çarpık bozuk" dediği şey buydu. Düzeltme: kuralı `!important` ile
yeniden yazdım. Canlı doğrulama: üç badge de artık `computedDisplay:"none"` (satır içi stilin
"display:flex" demesine RAĞMEN).

### Hata 2 — `.topbar-icon` (hamburger dahil) dar ekranda sıkışıp ovale dönüşüyordu
`.app-topbar{display:flex; gap:12px;}` bir flex konteyner, ama `.topbar-icon{width:40px;
height:40px;...}` kuralında `flex-shrink:0` YOKTU — varsayılan flex-shrink:1 ile, topbar'da yeterli
yer kalmayınca (ör. dar viewport'ta arama kutusu + "EN" dil seçici + avatar birlikte), tarayıcı bu
40x40'lık yuvarlak butonları KÜÇÜLTEREK sıkıştırıyordu (gerçek ölçüm: 40px yerine 22.85px genişlik)
— daire yerine sıkışık oval görünüyordu, "Panel" başlık metniyle neredeyse bitişik duruyordu.
Düzeltme: `.topbar-icon`'a `flex-shrink:0` eklendi (`admin.html` VE aynı bug'ı taşıyan `panel.css`
— root paneli — için de, aynı kök nedenle proaktif olarak). Canlı doğrulama: hamburger artık tam
40x40px.

## Verification
Local preview, gerçek admin oturumu, farklı viewport genişlikleri:
- 1280px genişlikte (gerçek masaüstü collapsed rail): 3 badge de `computedDisplay:"none"`.
- 755px genişlikte (mobil breakpoint, topbar hamburger+başlık modu): hamburger `getBoundingClientRect()`
  → tam `{width:40, height:40}`, önceden `{width:22.85, height:40}` idi.

## Files changed
- `admin.html` — `.nbadge` collapsed-hide kuralı `!important` aldı; `.topbar-icon` `flex-shrink:0`
  aldı.
- `panel.css` — aynı `.topbar-icon` `flex-shrink:0` düzeltmesi (root paneli, aynı bug, proaktif).
