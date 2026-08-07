# Phase 54 — One UI 8.5, Faz 2A: Root Paneli + Giriş Sayfası

## Why
Faz 1'de admin paneli One UI 8.5'e çevrildi. Kullanıcı kapsamı genişletti: "herşeyi One UI yap" —
Root Paneli, Giriş Sayfası, Restoran Sitesi ve Landing Page dahil. Bu faz (2A) Root Paneli ve Giriş
Sayfası'nı kapsıyor; ikisi de admin panelinde kanıtlanmış desenin (mavi `#387AFF` vurgu, büyük pill
köşe yuvarlaklığı, Navigation Rail, One UI Dialog, tek satırlık ikon stil kuralı) doğrudan
uygulanmasıydı — yapısal değişiklik yok, sadece görsel.

## What changed

### `panel.css` (root.html'i besleyen tek, paylaşılan token dosyası)
- Koyu+açık token bloklarını admin.html'in Faz 1'de yazdığı AYNI One UI değerleriyle güncellendi:
  `--gold`/`--gold-2`/`--gold-soft`/`--gold-text` ve `--fire`/`--ember`/`--fire-text` → mavi
  `#387AFF` tabanlı, her iki temada sabit vurgu; arka plan/çizgi/metin renkleri One UI'ın nötr
  ölçeğine (koyu: `#000000`/`#17171A`, açık: `#F1F1F3`/`#FFFFFF`).
- `--radius:16→20px; --radius-sm:11→14px; --radius-lg:22→28px;` (`--radius-pill` zaten 999px'ti).
- `.nav-item` pill radius + `.nav-item.active` artık dolgulu mavi arka plan (eski sol-çizgi
  göstergesi kaldırıldı) — admin.html'in Navigation Rail düzeltmesiyle birebir aynı.
- `.side-brand .mark`/`.collapse-btn`/`.topbar-icon`/`.stat-card .st-ic`/`.act-row .act-ic` → pill
  radius; `.profile-menu`/`.quick-actions button`/`.dash-chart-tooltip` → `--radius-sm`.
- `.btn`/`.btn.secondary`/`.btn.danger` → pill; `input,select,textarea` → `--radius-sm`.
- `.overlay`/`.modal` → One UI Dialog: nötr `rgba(0,0,0,.55)` scrim + 16px blur (öncesi:
  `rgba(0,0,0,.62)` + 5px blur — admin.html'deki Dialog düzeltmesiyle aynı yaklaşım).
- Yeni bölüm: `svg{stroke-width:2.25; stroke-linecap:round; stroke-linejoin:round;}` — admin.html'in
  ikon-stil kuralıyla aynı mantık, panel.css sadece root.html'de kullanıldığı için global güvenli.
- Yeni bölüm: One UI pill switch (`input[type=checkbox]:not(.nf-ten)`, CSS-only `appearance:none` +
  pseudo-element thumb tekniği — widget aç/kapa (`#bWidgetsGrid`, 8 adet) ve AI etkinleştir
  (`#aiEnabled`) checkbox'ları için) + rounded-square check (`input.nf-ten` — bildirim hedefi tenant
  çoklu-seçim listesi, GERÇEK checkbox semantiği olduğu için pill değil, yuvarlak-köşeli kare).
  Karar: toggle/switch semantiğindeki checkbox'lar pill, gerçek çoklu-seçim checkbox'ları kare —
  root.html'deki 3 checkbox grubu (`grep`'le doğrulandı, başka checkbox yok) bu ayrıma göre
  sınıflandırıldı.

### `root.html` (kendi inline `<style>` bloğu, panel.css'in kapsamadığı bileşenler)
`.login-card`(18→28px), `.asset-thumb`(8→14px), `.seo-preview`(12→14px), `.hstat`(12→14px),
`.toast`(12px→999px pill), `.ai-chat`(16→20px), `.ai-bubble`(16→18px), `.cred-box`(12→16px), ve iki
inline-`style` container (`#lmDetail`, `#nfTenantList`, ikisi de 10→14px — inline stil olduğu için
panel.css tarafından ezilemiyordu, doğrudan HTML'de düzeltildi). `.btn`/`input` gibi panel.css
tarafından zaten "inert" olarak işaretlenmiş (yorumda belirtilmiş) satırlara dokunulmadı.

### `login.html` (bağımsız, kendi token bloğu — panel.css/admin.html ile paylaşımı yok)
- `--gold:#ffffff→#387AFF`, `--gold-soft` mavi tonlu, arka plan/metin renkleri One UI koyu nötr
  ölçeğine, `--radius:22→26px`.
- `.brand .mark`(11→999px pill), `.field input`(13→14px), `.eye`(8→999px pill), `.msg`(12→14px).
- Ana submit butonu (`.btn`) sabit-kodlanmış beyaz (`#fff`/`#0a0a0b`) idi — artık `var(--gold)` (mavi)
  kullanıyor, site genelindeki yeni vurgu rengiyle tutarlı.
- Ambient arkaplan baloncuklarından biri hafif mavi tonlandı (`rgba(56,122,255,.18)`, öncesi düz
  beyaz) — marka rengini yansıtan ince bir dokunuş.
- `.tabs`/`.lang` (Restoran/Root Panel sekmeleri, TR/EN dil switch'i) zaten pill'di, DOKUNULMADI —
  kullanıcının "sadece landing page'in dil butonu kaldırılsın" ayrımı gereği login.html'in kendi dil
  switch'i kalıyor, sadece görsel olarak zaten One UI'a uygundu.
- İkon stroke kuralı (`svg{stroke-width:2.25;...}`) eklendi.
- `.box` (gerçek "beni hatırla" checkbox'ı, 6px köşe) BİLEREK dokunulmadı — zaten yuvarlak-köşeli
  kare, gerçek checkbox semantiği (pill değil, doğru desen zaten buydu).

## Verification
Local preview (`localhost:12999`), gerçek yerel-imzalı JWT'lerle (`backend/lib/auth.js`
`signToken()`, sadece dev):
- `login.html`: buton `rgb(56,122,255)` bg + `999px` radius, kart `26px`, marka rozeti `999px`, font
  `"Samsung Sharp Sans"` DEĞİŞMEDİ.
- `root.html` koyu tema: nav-item aktif `rgb(56,122,255)` bg + `999px`, marka rozeti `999px`, font
  değişmedi.
- `root.html` açık tema: `--bg:#f1f1f3`, `--gold:#387AFF` (koyu ile aynı mavi), nav aktif hâlâ mavi.
- Widget aç/kapa checkbox'ı (`#bWidgetsGrid`): `appearance:none`, `999px` pill, işaretliyken mavi.
- Bildirim hedefi tenant listesi checkbox'ı (`.nf-ten`): `appearance:none`, `6px` (yuvarlak kare,
  pill DEĞİL — doğru desen).
- Bildirim modalı (`#notifyOverlay .modal`): `28px` radius (One UI Dialog ölçeği).
- `git diff --stat`: `panel.css` +93/-49 satır, `root.html` +20/-20, `login.html` +24/-24 — hepsi
  görsel-only, JS/mantık dosyalarına dokunulmadı.

## Files changed
- `panel.css` — token bloğu, Navigation Rail, buton/input/dialog radius, pill-switch/rounded-check
  sistemi, ikon stroke kuralı.
- `root.html` — kendi bileşen radius'ları (panel.css kapsamı dışındaki), 2 inline-style container.
- `login.html` — kendi token bloğu, buton/input/mark radius, submit butonu artık mavi.
