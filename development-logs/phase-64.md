# Phase 64 — Onay dialogları v2: kullanıcının kendi verdiği referans koda göre, siyah/beyaz temaya uyarlanmış

## Why
Faz 63'te onay dialogları (`.custom-popup-card`) mavi-tonlu gradient bir glassmorphism tasarımına
çevrilmişti. Kullanıcı bu sefer TAM, çalıştırılabilir bir HTML/CSS referans kodu gönderip
"bunu kullan siyah beyaz temaya uyarlayarak" dedi — yani mavi gradient değil, NÖTR beyaz-tonlu buzlu
cam (`rgba(255,255,255,.12)`, `blur(24px) saturate(140%)`), çok daha büyük `border-radius` (40px),
belirgin biçimde büyük tipografi, `flex:1` spacer ile alta sabitlenmiş buton satırı, butonlar arası
ince dikey ayırıcı — ve bunun sitenin kendi siyah/beyaz tema sistemine (koyu ⇄ açık) uyarlanmasını
istedi.

## What changed

### `.custom-popup-card` tamamen yeniden yazıldı (`admin.html` + `index.html`)
Kullanıcının verdiği referans değerleri birebir kullanıldı: `background:rgba(255,255,255,.12)`,
`backdrop-filter:blur(24px) saturate(1.4)`, `border-radius:40px`, `padding:32px`,
`display:flex;flex-direction:column`. Başlık `1.375rem`/700 (referanstaki 30px'e göre sitenin
mevcut tipografi ölçeğine oranlı büyütüldü, `font-family` DEĞİŞMEDİ — 'Syne' kalıyor), açıklama
`1rem`/`rgba(255,255,255,.72)` + `flex:1` (referanstaki spacer div yerine mesaj elemanının kendisi
esnetildi — markup'a yeni bir boş spacer div eklemek yerine mevcut 3 elemanlı yapı [`title`, `message`,
`actions-row`] korunarak aynı sonuç elde edildi). Buton satırı `justify-content:space-around` +
gerçek bir `<div class="custom-popup-divider">` (yeni, referanstaki ayırıcı div'in birebir karşılığı —
hem `admin.html` hem `index.html`'in `#customConfirmOverlay` markup'ına Cancel/OK butonları arasına
eklendi; tek butonlu `#customAlertOverlay`'a dokunulmadı, ona gerek yok).

### Siyah/beyaz tema uyarlaması
Referans kod tek bir (koyu backdrop varsayan) görünüm veriyordu; kullanıcının "siyah beyaz temaya
uyarlayarak" isteği üzerine iki varyant yazıldı:
- **Koyu tema (varsayılan)**: referansla birebir aynı — beyaz-tonlu cam + beyaz metin.
- **Açık tema**: `admin.html`'de `html[data-theme="light"] .custom-popup-card{...}` (kök `<html>`
  elemanındaki öznitelik, `#adminPanelOverlay`'in dışında bir dialog için bile ekstra bir
  scope-bağlama hilesi gerektirmiyor — dosyada zaten var olan `html[data-theme="light"] #adminPanelOverlay`
  deseniyle aynı mantık), `index.html`'de `body.theme-bw .custom-popup-card{...}` (sitenin AÇIK
  temasının gerçek class'ı — `theme-mono`, koyu-gri olduğu için kasıtlı olarak dokunulmadı, varsayılan
  koyu görünümü kullanmaya devam ediyor) — daha opak beyaz cam (`rgba(255,255,255,.6)`) + koyu metin
  (`#0a0a0b`/`rgba(10,10,11,.68)`), iOS/One UI'ın açık-mod buzlu cam konvansiyonuyla tutarlı (koyu
  arkaplanda açık cam+açık metin, açık arkaplanda açık cam+koyu metin — camın kendisi HER İKİ TEMADA
  DA "açık/beyaz" kalıyor, sadece metin kontrastı ve camın opaklığı tersine dönüyor).

## Doğrulama sırasında bulunan gerçek bir hata: ikinci buton görünmüyordu
İlk canlı testte (admin.html, koyu tema) sadece "Vazgeç" butonu görünüyordu, "Evet" butonu ekranın
çok dışına taşmıştı (`getBoundingClientRect()` ile doğrulandı: `x:781, width:354` — kartın kendisi
`max-width:420px`). Kök neden: genel `.admin-btn{width:100%;...}` kuralı hâlâ geçerliydi;
`.custom-popup-actions-row .admin-btn{flex:none}` sadece `flex-grow`/`flex-shrink`'i sıfırlıyor,
`flex-basis:auto` genel kuralın `width:100%`'üne düşüyor — yani flex item'ın "auto" ana-boyutu yine
100% genişlik oluyordu, `justify-content:space-around` da bu iki "tam-genişlik" öğeyi konteynerin
çok dışına itiyordu. Düzeltme: `.custom-popup-actions-row .admin-btn`'e `width:auto !important;`
eklendi (hem `admin.html` hem `index.html`) — artık butonlar içerik kadar dar, gerçekten yan yana,
aralarında ayırıcı ile ortalanmış duruyor.

## Verification
Local preview, gerçek admin oturumu + gerçek tenant sitesi, taze-sayfa-yenileme, gerçek
`showCustomConfirm()` çağrılarıyla (silme/rezervasyon-iptal senaryoları):
- `admin.html`, koyu tema: beyaz cam + beyaz metin, iki buton + ayırıcı doğru konumda, "Evet"
  kırmızımsı (`#ff9f92`).
- `admin.html`, `html[data-theme="light"]`: koyu metin, daha opak beyaz cam, doğru kontrast.
- `index.html`, `body.theme-bw` (açık): koyu metin, opak beyaz cam — ekran görüntüsüyle doğrulandı.
- `index.html`, varsayılan (koyu, food-photo hero arkaplanı üzerinde): beyaz metin, camsı efekt
  arkaplandaki bulanık fotoğrafı net şekilde gösteriyor — ekran görüntüsüyle doğrulandı.
- Font-family hiçbir yerde değişmedi (Syne/DM Sans korundu, referans kodun generic sans-serif'i
  KULLANILMADI — projenin süregelen "font değişikliği yok" kuralı).
- Markup değişikliği sadece iki dosyadaki `#customConfirmOverlay` içine birer `<div class=
  "custom-popup-divider">` eklenmesiyle sınırlı tutuldu; render/JS mantığına dokunulmadı.

## Files changed (v2 — ilk sürüm)
- `admin.html` — `.custom-popup-card` ve alt elemanları tamamen yeniden yazıldı (nötr beyaz cam,
  40px radius, büyük tipografi, flex spacer, `justify-content:space-around` buton satırı + yeni
  `.custom-popup-divider`), açık tema override bloğu eklendi, `#customConfirmOverlay` markup'ına
  ayırıcı div eklendi, `width:auto!important` düzeltmesi.
- `index.html` — aynı değişikliklerin birebir karşılığı, açık tema override'ı `body.theme-bw`
  seçicisiyle.

## Ek 1 — tek butonlu uyarılar da aynı dile getirildi
Kullanıcı: "harika şimdi bunun tek butonlu halini diğer tek butonlu uyarıar için uygula". Tek butonlu
`#customAlertOverlay`'in butonu (`.custom-popup-actions .admin-btn`) önceden eski dolgu/`width:100%`
stiliyle kalmıştı (iki-butonlu versiyon restyle edilirken atlanmıştı) — artık aynı şeffaf/pill/ortalı
buton dili (`width:auto!important`, `border-radius:999px`, transparent + hover) uygulandı, hem
`admin.html` hem `index.html`'de, açık tema override'ı dahil. Markup'ta gereksiz `width:100%` inline
stili de temizlendi (artık CSS `!important` kuralı zaten genişliği yönetiyor).

## Ek 2 — diğer gerçek "tek/çift butonlu uyarı" örnekleri bulunup aynı tasarıma getirildi
Kod taraması yapıldı ("örnekleri ayarla" isteği üzerine), iki GERÇEK (canlı, kullanıcıya ulaşan)
örnek daha bulundu ve aynı `.custom-popup-*` diline çevrildi:
- **`index.html` — `#pushPromptBackdrop`** (müşteri sitesindeki push-bildirim izin isteği, "Kampanyalardan
  Haberdar Olun"): tamamen ayrı, satır-içi stillerle yazılmış eski bir kart (koyu kahverengi ton,
  zil ikonlu, `border-radius:12px` butonlar) — artık `.custom-popup-card`/`-title`/`-message`/
  `-actions-row` + yeni ayırıcı `div` kullanıyor, ikon kaldırıldı (yeni tasarımın "ikonsuz" kuralıyla
  tutarlı). Backdrop'un kendi göster/gizle mekanizması (`style.display`/`opacity`/`transform`, 3sn
  gecikme + 2 gün "sonra hatırlat" mantığı) DOKUNULMADAN korundu — sadece kartın içi class tabanlı
  hale getirildi.
- **`admin.html` — `#pushConfirmModal`** (Bildirim Gönder ekranının "Onayla ve Gönder" onay adımı):
  eski, ayrı bir modal sistemindeydi (`.admin-modal-backdrop`/`.admin-modal-card`, 24px radius, dolu
  arka plan) — `.custom-popup-overlay`/`-card`/`-title` + YENİ bir `.custom-popup-summary` sınıfına
  çevrildi (Başlık/Mesaj/Hedef Kitle/URL/Görsel-Önizleme özet satırları için — `.custom-popup-message`
  kasıtlı olarak KULLANILMADI çünkü onun %72 opaklığı gönderilecek bildirimin önizleme verisini
  okunaksız kılıyordu; `.custom-popup-summary` tam opaklıkta ayrı bir sınıf). Show/hide zaten aynı
  `.classList.add/remove('open')` mekanizmasını kullandığı için `.custom-popup-overlay`'e drop-in
  geçiş güvenliydi.
- **Bilinçli olarak DOKUNULMADI**: `index.html`'in KENDİ gömülü admin-panel kopyasındaki
  `#pushConfirmModal`/`#adminLoginBackdrop` (satır ~3086/~2967) — bu kopya `window.isStandaloneAdmin
  = false` olarak sabitlenmiş (sadece `admin.html` bunu `true` yapıyor), yani index.html bağlamında
  bu ekranlar HİÇBİR ZAMAN açılmıyor; ölü kod, düzeltmek zaman kaybı olurdu (Faz 55'te de aynı kopya
  için aynı sonuca varılmıştı). `addTableBackdrop`/`bulkTableBackdrop`/`qrModalBackdrop` (`admin.html`)
  de bilinçli olarak dışarıda bırakıldı — bunlar gerçek form/QR-görüntüleme ekranları, basit
  başlık+mesaj+buton dialog kalıbına uymuyor.

## Files changed (Ek 1 + Ek 2)
- `admin.html` — `.custom-popup-actions .admin-btn` (+ açık tema) eklendi; yeni `.custom-popup-summary`
  sınıfı (+ açık tema) eklendi; `#pushConfirmModal` markup'ı `.custom-popup-*` sistemine çevrildi.
- `index.html` — `.custom-popup-actions .admin-btn` (+ `body.theme-bw`) eklendi; `#pushPromptBackdrop`
  markup'ı `.custom-popup-*` sistemine çevrildi (ikon kaldırıldı, eski satır-içi stiller silindi).

## Ek 3 — kalan native `alert()`/`prompt()` çağrıları da yeni tasarıma taşındı
Kullanıcı: "sitede bunun bütün ekrana çıkan uyarılarını kontrol et ve yeni hale çevir eski tasarımda
kalan varsa". `admin.html` içinde grep ile TÜM native `alert()`/`confirm()`/`prompt()` çağrıları
tarandı, 2 GERÇEK canlı örnek bulundu — ikisi de gerçekten tarayıcının kendi çirkin/stilsiz kutusunu
gösteriyordu:
- **Danger Zone — "restoranı sil" akışı** (`confirmDeleteMyRestaurant()`): isim-eşleştirme
  `window.prompt()` ile yapılıyordu; eşleşmezse `typeof toast === 'function'` kontrolü hep `false`
  dönüyordu (proje genelinde `toast()` diye bir fonksiyon YOK — grep ile doğrulandı), yani native
  `alert()` dalı HER SEFERİNDE çalışıyordu — kozmetik bir "yedek" değil, gerçek ve her zaman tetiklenen
  bir hataydı.
- **Masa "Yeniden Adlandır"** (`renameTablePrompt()`): native `window.prompt(mesaj, mevcutAd)`.

Bu ikisini düzeltmek, mevcut `.custom-popup-card` mimarisine YENİ bir üçüncü dialog tipi eklemeyi
gerektirdi — kodda text-input alan bir onay kutusu hiç yoktu (`showCustomAlert`/`showCustomConfirm`
sadece metin+buton). Eklenenler:
- `#customPromptOverlay` — `showCustomAlert`/`showCustomConfirm` ile birebir aynı markup deseni
  (`.custom-popup-card` > başlık + mesaj + YENİ `.custom-popup-input` + `.custom-popup-actions-row`).
- `.custom-popup-input` — sitenin "text kutuları tam pill (999px)" kuralına uygun yeni bir CSS sınıfı
  (bu overlay `#adminPanelOverlay`'in DOM kardeşi olduğu için panelin `input{border-radius:pill}`
  kapsam-içi kuralını miras alamıyor — Faz 1'de bulunan aynı "sibling, descendant değil" mimari
  gerçeğiyle tutarlı bir sebep), açık tema varyantıyla birlikte.
- `showCustomPrompt(message, title, defaultValue)` — `showCustomConfirm`'ün Promise deseninin birebir
  aynısı, `window.prompt()` ile AYNI sözleşmeyle (OK'ta yazılan metni, İptal/Esc'te `null` döndürür —
  mevcut `if (typed === null) return;` çağıran-taraf kontrolleri değişmeden çalışmaya devam ediyor),
  ek olarak Enter=Onayla/Escape=Vazgeç klavye desteği, otomatik focus+select.
- İki çağrı-yeri güncellendi: `confirmDeleteMyRestaurant()`'ta artık silinecek restoran adı mesaj
  içinde `<strong>` ile vurgulanıyor (native prompt'ta iki satırlık düz metne sıkıştırılmıştı);
  `renameTablePrompt()`'ta başlık "Yeniden Adlandır" (zaten var olan `admin_tbl_rename` i18n anahtarı),
  mesaj "Yeni masa adı:" (`admin_tbl_rename_prompt`) — yeni i18n anahtarı EKLENMEDİ, mevcutlar
  yeniden kullanıldı.

**Bilinçli olarak dışarıda bırakıldı**: `root.html` (platform sahibi paneli) 5 native
`confirm()`/`alert()`/`prompt()` çağrısı içeriyor ve `.custom-popup-*`/`showCustomConfirm` sisteminin
KENDİSİ o dosyada hiç yok (grep ile doğrulandı, sıfır sonuç) — bu, mevcut bir bileşeni yeni stile
taşımak değil, üçüncü bir dosyaya sıfırdan bir dialog sistemi PORTLAMAK anlamına gelir, kapsamı bu
turun çok üzerinde; ayrı bir görev olarak flaglendi, kullanıcıya bildirilecek.

## Verification (Ek 3)
Local preview, gerçek admin oturumu, hem koyu hem `html[data-theme="light"]`: `showCustomPrompt()`
doğrudan çağrılarak hem masa-yeniden-adlandırma senaryosu (mevcut ad ön-dolu, seçili) hem restoran-
silme isim-onay senaryosu (`<strong>` vurgulu mesaj) ekran görüntüsüyle doğrulandı — pill input, başlık,
buton satırı + ayırıcı hepsi tutarlı. `grep` ile admin.html'de sıfır kalan native `alert/confirm/prompt`
çağrısı doğrulandı. Konsol hatası taraması yapıldı — bulunan hatalar (`ERR_BLOCKED_BY_CLIENT`,
"Failed to fetch" çeviri/kategori/menü istekleri) bu değişiklikten bağımsız, ortama özgü ağ/oturum
gürültüsü (yeni fonksiyonlarla ilgili hiçbir referans/syntax hatası yok).

## Files changed (Ek 3)
- `admin.html` — yeni `#customPromptOverlay` markup'ı, yeni `.custom-popup-input` sınıfı (+ açık
  tema), yeni `showCustomPrompt()` fonksiyonu; `confirmDeleteMyRestaurant()` ve `renameTablePrompt()`
  artık native `prompt()`/`alert()` yerine bunu kullanıyor.
