# Phase 85 — Müşteri menü sitesi: logo + nav vurgusu düzeltmesi

**Tarih:** 2026-08-21
**Dosya:** `index.html` (henüz commit edilmedi)

## Bildirilen sorunlar

Kullanıcı iki ekran görüntüsüyle bildirdi:

1. Alt menüdeki "Menu" / "Rezerve" pilleri hiç değişmiyordu — "Menu" her zaman seçili/vurgulu,
   "Rezerve" her zaman soluk görünüyordu, sayfada nereye scroll edilirse edilsin.
2. Üst barda gerçek restoran logosu yerine jenerik bir `restaurant_menu` ikonu + "My Restaurant"
   yazısı vardı.

## Kök neden

- **Logo:** Üst bar hem masaüstü hem mobilde sabit bir Material Symbols ikonuydu — tenant'ın
  `settings.logo_url` değerini hiç okumuyordu.
- **Nav vurgusu:** Masaüstü ve mobil nav linkleri, aktif/pasif renk class'ları HTML'e sabit
  (hardcoded) yazılmıştı. Hangi bölümün görüntülendiğini takip eden hiçbir JS yoktu — "Menu" ilk
  yüklemede aktif göründüğü için öyle kalıyordu.

## Yapılan değişiklik

1. Üst bar (masaüstü + mobil): ikon `<span>` yerine `<img id="brandLogoWeb"/"brandLogoMobile">`,
   varsayılan `/icons/placeholder-logo.svg`, `onerror` ile kendine düşen güvenli fallback.
   `applySiteConfig()` içine `s.logo_url` varsa iki `<img>`'in `src`'sini set eden blok eklendi.
2. Masaüstü nav linkleri (`Menu`/`Rezervasyon`/`İletişim`) ve mobil alt nav linkleri
   (`Menu`/`Rezerve`) sabit renk class'larından arındırılıp `data-navlink="menu|rezervasyon|info"`
   attribute'u eklendi (Sepet butonu bilinçli olarak dokunulmadı — bir bölüme değil, modal'a açılan
   bir aksiyon butonu).
3. Yeni `setActiveNav(sectionId)` + `initNavScrollspy()` fonksiyonları: `IntersectionObserver`,
   viewport ortasında dar bir bant (`rootMargin: '-45% 0px -50% 0px'`) ile hangi bölümün (`#menu`,
   `#rezervasyon`, `#info`) o an "güncel" olduğunu tespit edip `[data-navlink]` elemanlarının
   aktif/pasif class'larını canlı günceller. `init()` içine `initNavScrollspy()` çağrısı eklendi.

## Doğrulama (tarayıcıda, localhost:12999, tenant=default)

- Logo: sayfa yüklendiğinde turuncu plaka ikonu (`placeholder-logo.svg`) doğru görünüyor, konsol
  temiz, `logo_url` set edilirse gerçek görsele geçeceği kod incelemesiyle doğrulandı.
- Mobil (375px): başlangıçta "Menu" pili mavi/aktif, "Rezerve" nötr. Rezervasyon bölümüne
  scroll edilince pil "Rezerve"ye geçti, "Menu" nötrleşti.
- Masaüstü (1280px): aynı davranış `getComputedStyle` ile doğrulandı —
  `menu: rgb(56,122,255)→rgb(66,70,84)`, `rezervasyon: rgb(66,70,84)→rgb(56,122,255)` geçişi
  scroll ile birebir eşleşti.
- Konsolda yeni hata yok (sayfada önceden var olan, bu değişiklikle ilgisiz bir 401 dışında).

## Push durumu

`2a1d128` ile commit edildi, `037a9be` ile birlikte push edildi (kullanıcı onayı: "pushla").

## Ek düzeltme (aynı gün, ikinci tur)

Kullanıcı bir ekran görüntüsüyle footer'da da aynı hatanın (jenerik `restaurant_menu` ikonu,
gerçek logo yerine) sürdüğünü fark etti — ilk turda sadece topbar (masaüstü+mobil) düzeltilmiş,
footer'daki aynı desen atlanmıştı. Düzeltme: footer'daki ikon `<span>` da `<img id="brandLogoFooter">`
oldu, `applySiteConfig()`'teki logo bloğuna üçüncü hedef eklendi. `grep restaurant_menu` ile dosya
genelinde başka kalan örnek olmadığı doğrulandı. Tarayıcıda footer'da doğru logonun göründüğü
teyit edildi. Bu tekrar eden desenin (bir yerde düzeltip aynı deseni başka yerde atlamak) bir daha
olmaması için `C:\HASACA-beyin\00_CORE\RULES.md`'e yeni bir kural eklendi (Kural 8: bir UI/UX
hatası düzeltilirken dosya genelinde aynı desen için grep at, tek noktada bırakma).

Kullanıcı ayrıca push politikasını değiştirdi: artık her push için ayrı onay istemeyeceğim,
doğrulanan her değişikliği otomatik push edeceğim (bkz. RULES.md Kural 1, güncellenmiş hali).
