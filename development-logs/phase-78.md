# Phase 78 — Küçük düzeltmeler: login placeholder, tema ikonu yayılımı, kısaltma çevirisi, yerel para birimi

## Why
Bir önceki turun devamında, kullanıcı gerçek ekran görüntüleriyle birkaç küçük ama gerçek sorun
işaretledi: (1) login.html'de kullanıcı adı input placeholder'ı İngilizce dilde bile Türkçe
"kullanici_adi" yazıyordu, (2) `.ai-cta-inner` bölümünde metin kenarlara yapışıyordu (aynı
`.wrap`+padding-kısayolu hatasının üçüncü tekrarı — ayrı ele alındı), (3) yeni güneş/ay tema
ikonu sadece landing.html'e uygulanmıştı, diğer sayfalarda eski ikon kalmıştı, (4) "5 dk" gibi
kısaltmalar otomatik tarayıcı çevirisinin doğru çalışmasını engelliyordu, (5) landing sayfasındaki
mockup/istatistik/fiyat alanlarındaki ₺ değerleri her ziyaretçiye sabit gösteriliyordu — ülke
koduna göre yerel para birimine çevrilmesi istendi.

## Değişiklikler

### `login.html` — kullanıcı adı placeholder
`placeholder="kullanici_adi"` HTML'de sabitti, `apply()` i18n fonksiyonu tarafından hiç
güncellenmiyordu. Yeni `userPh` i18n anahtarı (TR: "kullanici_adi", EN: "username") eklendi,
`apply()`'a `document.getElementById('username').placeholder = T('userPh');` satırı eklendi.

### Tema ikonu yayılımı
Önceki turda sadece landing.html'e eklenen güneş/ay ikon-değişim sistemi (`THEME_ICON_SUN`/
`THEME_ICON_MOON`, `applyLandingTheme()` içinde `.theme-switch-icon`'un `innerHTML`'ini
değiştiriyor) artık `marketing.html`, `login.html`, `restoran-olustur.html`'de de aynı şekilde
çalışıyor — dördü de aynı ikon çiftini, aynı mantıkla kullanıyor.

### "5 dk" → "5 dakika"
Hero mini-istatistiklerdeki `<b>5 dk</b>` `data-i18n` ile yönetilmiyordu, EN dile geçilince
çevrilmeden kalıyordu. `data-i18n="hero_m3v"` eklendi (TR: "5 dakika", EN: "5 minutes") — artık
tarayıcının otomatik çevirisi de düzgün "5 minutes" üretebiliyor. Sitenin geri kalanında aynı
kısaltma deseni taranıp başka örnek bulunmadı.

### Landing page — yerel para birimi
`navigator.languages`'tan ülke/dil koduna bakan `detectCurrency()` eklendi (TR/US/GB/AB
ülkeleri haritalı, tanınmayan her şey USD'ye düşüyor). Gerçek zamanlı kur API'si YOK (statik
dosya) — 2026-08-09 tarihinde canlı kurlardan alınan yaklaşık bir anlık görüntü kullanılıyor
(USD≈47.7, EUR≈55.13, GBP≈64.35 TL), `FX_TRY_PER_UNIT` sabitinde belgeli, periyodik güncelleme
gerekiyor. `Intl.NumberFormat` ile hem sembol hem sayı biçimi ziyaretçinin para birimine göre
doğru çıkıyor. TR ziyaretçisi için tamamen no-op — orijinal ₺ değerleri hiç dokunulmadan kalıyor.

Kapsanan yerler: hero+"her ekran" mockup'larındaki satış/sipariş rakamları, showcase
tile'larındaki ortalama sepet/tahmin değerleri, "Yıllık Hacim" istatistik sayacı (animasyonlu
sayaç `data-count`/`data-suffix`'i animasyon başlamadan ÖNCE güncelleniyor), fiyatlandırma
kartları (₺749/₺1499 → tam sayıya yuvarlanmış yerel fiyat, ondalıklı "$15.7" gibi görünmesin diye
ayrıca `maximumFractionDigits:0` uygulandı).

## Bulunan gerçek hatalar
1. **`.ai-cta-inner` kenar boşluğu** — bu oturumda ÜÇÜNCÜ kez aynı hata: `.wrap` sınıfı taşıyan
   bir elemana `padding:64px 0` KISAYOLU verilmiş, `.wrap`'in yan boşluğunu (`padding:0 24px`)
   sıfırlıyordu. `padding-top`/`padding-bottom` olarak ayrıştırıldı (hem masaüstü hem mobil medya
   sorgusunda).
2. **`detectCurrency()` bare "tr" hatası** — bu ortamın gerçek tarayıcısı `navigator.language`'ı
   sadece `"tr"` (bölge kodu YOK) olarak döndürüyor; eski mantık bunu atlayıp listedeki ikinci
   dile (`en-US`) bakıp yanlışlıkla USD seçiyordu — ev pazarımız (TR) için en kritik senaryo.
   Düzeltme: her dil girdisinde hem dil kodu hem bölge kodu birlikte kontrol ediliyor, bare "tr"
   artık doğrudan TRY veriyor.
3. **Fiyatlandırma ondalık hatası** — ilk haliyle dönüştürülen fiyatlar "$15.7" gibi tek
   ondalıklı garip görünüyordu; fiyatlandırma için `maximumFractionDigits:0` ile tam sayıya
   yuvarlandı ("$16"), diğer (istatistik/mockup) değerler 2 ondalık hassasiyetinde kaldı.

## Verification
- login.html: EN dile geçilince placeholder "username" oluyor, doğrulandı.
- 4 sayfada (landing, marketing, login, restoran-olustur) tema ikonu gerçek tıklamayla
  güneş↔ay geçişi doğrulandı.
- "5 dk" → EN'de "5 minutes" olduğu doğrulandı.
- Para birimi: `detectCurrency()` gerçek fonksiyon çağrılarıyla 7 farklı locale kombinasyonunda
  test edildi (en-US→USD, en-GB→GBP, de-DE→EUR, fr-FR→EUR, ja-JP→USD fallback, tr-TR→TRY,
  bare "tr"→TRY). TR ziyaretçisi (bu ortamın gerçek locale'i) için no-op davranışı canlı DOM'da
  doğrulandı. USD dönüşüm matematiği ve DOM seçicileri, aynı mantığın gerçek DOM üzerinde
  birebir çalıştırılmasıyla doğrulandı (canlı tarayıcı locale'ini spoof etmek mümkün olmadığından
  — `navigator.language` salt-okunur — ama `detectCurrency()` fonksiyonunun kendisi gerçek
  çağrılarla test edildi).
- Animasyonlu "Yıllık Hacim" sayacının 0'da takılı kalması ayrı bir hata OLARAK görünüp
  araştırıldı — sebebi `document.hidden:true` (bu ortamın bilinen panel-görünürlük sorunu,
  `requestAnimationFrame`'i durduruyor), dokunulmamış diğer sayaçlarda da aynı davranış
  doğrulandı — benim değişikliğimden kaynaklanmıyor, gerçek (görünür) bir sekmede sorun
  olmayacağı statik mantık simülasyonuyla teyit edildi.
- Konsol hatası yok (tüm sayfalarda tekrar kontrol edildi).

## Files changed
- `login.html` — placeholder i18n.
- `marketing.html`, `restoran-olustur.html` — tema ikonu güneş/ay sistemi.
- `landing.html` — "5 dakika" i18n, `.ai-cta-inner` padding düzeltmesi, para birimi
  lokalizasyon sistemi (`detectCurrency`, `formatMoneyFromTRY`, `formatCompactFromTRY`,
  `localizeCurrency`), ilgili `data-try`/`data-try-compact` işaretlemeleri, `renderPlans()`
  güncellemesi, yıllık hacim sayacı markup restructure.

## Push
Hâlâ commit/push edilmedi — "pushlama ben diyene kadar" talimatı geçerli.
