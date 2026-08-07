# Phase 59 — Masa Siparişi + Uzaktan Sipariş: monochrome'a geri döndürüldü

## Why
User feedback: admin panelindeki "Masa Siparişi" (dine-in table order control) ve "Uzaktan Sipariş"
(remote/delivery order) ekranları, Faz 1'in One UI mavi vurgusundan önceki monokrom (beyaz/siyah)
görünümüne dönsün — ama panelin GERİ KALANI (dashboard, sidebar, dialoglar, diğer ekranlar) mavi
kalmaya devam etsin. Bu, sadece 2 spesifik ekranı hedefleyen kapsamlı bir renk geri alma isteği.

## What changed
`admin.html`'in mevcut token-remap mimarisi (`--fire:var(--ap-gold); --ember:var(--ap-gold-2);
--gold:var(--ap-gold); --amber:var(--ap-gold-2);` — Faz 1'den beri var, `#adminPanelOverlay`
kapsamında tanımlı) bu iş için ideal bir kanca sağladı: CSS custom property'ler DOM ağacı boyunca
miras alınır, yani bu değişkenleri sadece belirli bir CONTAINER üzerinde yeniden tanımlarsam, o
container'ın İÇİNDEKİ her şey (ve SADECE o) yeni değeri alır.

`showAdminView()`'daki `AP_VIEW_MAP`'ten iki view container ID'si bulundu: `'orders'` →
`#adminTabOrdersCont`, `'table-orders'` → `#adminTabTableOrdersCont`. Bu iki container'a, Faz
1'den ÖNCEKİ (`git show <Faz1-commit>~1:admin.html` ile doğrulanan) tam orijinal `--ap-gold`
değerleriyle bir CSS değişkeni override bloğu eklendi:
```css
#adminTabOrdersCont, #adminTabTableOrdersCont{
  --fire:#ffffff; --ember:#e6e6ea; --gold:#ffffff; --amber:#e6e6ea;
  --ap-gold:#ffffff; --ap-gold-2:#e6e6ea; --ap-gold-soft:rgba(255,255,255,.14); --ap-gold-text:#0a0a0b;
}
html[data-theme="light"] #adminTabOrdersCont, html[data-theme="light"] #adminTabTableOrdersCont{
  --fire:#15171c; --ember:#565c69; --gold:#15171c; --amber:#565c69;
  --ap-gold:#15171c; --ap-gold-2:#565c69; --ap-gold-soft:rgba(21,23,28,.12); --ap-gold-text:#ffffff;
}
```
Bu, bu iki container'ın içindeki HER ŞEYİ (`.admin-order-card`, `.aoc-*`, `.dinein-card`,
`.floor-cell`, `.dc-*`, `.tbl-*` — hepsi `--fire`/`--ember`/`--gold`/`--amber` veya doğrudan
`--ap-gold`/`--ap-gold-2` okuyor) otomatik olarak monokroma çevirdi, TEK bir merkezi değişiklikle —
her bir bileşeni tek tek elle değiştirmeye gerek kalmadı. Panelin geri kalanı (dashboard stat
kartları, sidebar, `--ap-gold` kullanan onay dialogları vb.) bu iki container'ın DIŞINDA olduğu
için hiç etkilenmedi.

Köşe yuvarlaklığı/pill şekli (Faz 1'de yapılan diğer değişiklikler) BİLEREK dokunulmadı — kullanıcı
sadece "monochrome" (renk) dedi, şekil değil.

## Verification
Local preview, gerçek yerel oturum, hem koyu hem açık temada, doğrudan CSS değişken çözümlemesi
kontrol edilerek:
- Koyu tema: `#adminTabOrdersCont`/`#adminTabTableOrdersCont` → `--fire:#ffffff`; aynı anda
  `#adminPanelOverlay` (panelin geri kalanı) → `--fire:#387AFF` (hâlâ mavi, İZOLASYON doğrulandı).
- Açık tema: aynı iki container → `--fire:#15171c` (siyah/koyu, orijinal); panelin geri kalanı hâlâ
  mavi.
- Gerçek DOM elemanları üzerinde de doğrulandı: `.dinein-card` sol-kenar rengi → `rgb(230,230,234)`
  (monokrom `--ember`); `.aoc-total .val` (uzaktan sipariş toplam tutarı) rengi → `rgb(255,255,255)`
  (beyaz, mavi değil).

## Files changed
- `admin.html` — 14 satırlık, tek bir yeni CSS bloğu (iki container'a scoped değişken override'ı).
  Başka hiçbir dosya/bileşen değişmedi.
