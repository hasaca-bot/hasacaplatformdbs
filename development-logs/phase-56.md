# Phase 56 — One UI 8.5, Faz 2C: Landing Page (structural + dil algılama)

## Why
Faz 2A/2B'de Root Paneli, Giriş Sayfası ve Restoran Sitesi One UI 8.5'e çevrildi. Bu son alt-faz
(2C), Faz 2'nin en büyük ve tek YAPISAL parçası: kullanıcı, gönderdiği bir referans site (Uifry —
fintech app landing page) örneğine benzer bir bölüm akışı istedi, telefon yerine bilgisayar ekranı
mockup'ı istedi, dil seçme butonunun kaldırılıp tarayıcı diline göre otomatik açılmasını istedi, ve
tabii her şeyin One UI mavi/pill diline çevrilmesini istedi. Netleştirme turunda testimonial bölümü
eklenmemesi kararlaştırıldı (proje daha önce sahte yorumları tam bu yüzden kaldırmıştı, Faz 49).

## What changed

### Token bloğu
`--gold` (landing'in kendi ayrı tasarım sistemi, sıcak-altın `#d8b877` idi — index.html/admin.html/
panel.css'in `--fire`/`--gold`'undan TAMAMEN FARKLI bir değişkendi) → One UI mavisi `#387AFF`, hem
koyu hem `html.theme-mono` (açık) temada sabit. Işık temasında ÖNCEDEN vurgu rengi siyahtı
(`--gold:#0a0a0b` — "monokrom" tasarım niyeti), artık diğer her sayfayla tutarlı şekilde AYNI mavi.
`.btn-primary` (hem koyu hem açık) ve `html.theme-mono .btn-primary` sabit-kodlanmış beyaz/siyah
yerine `var(--gold)` kullanıyor artık.

### Dil algılama (kullanıcının en somut isteği)
Nav'daki ve footer'daki `.lang` TR/EN buton çiftleri TAMAMEN KALDIRILDI. `DOMContentLoaded`
içindeki `localStorage.getItem('hasaca_landing_lang')` okuması yerine:
```js
LANG = (navigator.language || navigator.userLanguage || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
```
`I18N`/`T()`/`applyI18n()`/`setLang()` altyapısı KORUNDU (silinmedi) — sadece manuel seçim yolu
kaldırıldı. TR dışındaki her dil İngilizce gösterilir; kullanıcı isterse tarayıcısının kendi Google
Çeviri özelliğini kullanabilir (tam istenen davranış). Canlı doğrulamada gerçek `navigator.language`
('tr') → 'tr' doğru algılandı; algılama fonksiyonu `en-US`/`ja-JP`/`de-DE` girdileriyle de ayrı ayrı
test edildi, hepsi doğru şekilde 'en'e düştü.

### Hero — telefon mockup kaldırıldı, bilgisayar ekranı ana görsel oldu
`.devices` içindeki `.phone` (QR menü telefon mockup'ı) markup'ı TAMAMEN SİLİNDİ. `.laptop` mockup'ı
(zaten var olan, sahte tarayıcı çerçeveli CSS dashboard'u) tek/ana görsel oldu: genişlik 520→580px,
köşe yuvarlaklığı One UI ölçeğine (`screen` 16→20px, `.ui`/`.ui-card`/`.ui-chart` 8-9px→14px),
`.ui-side` çizgileri artık pill. `.phone` CSS kuralı kasıtlı olarak SİLİNMEDİ (zararsız ölü kod,
token tasarrufu için bırakıldı).

### Showcase mockup'ları + diğer bölümler
3 showcase satırının `.mock` çerçeveleri (web sitesi, mutfak ekranı, AI asistan) zaten
`var(--radius-lg)` kullanıyordu; içindeki `.tile`/`.kcol`/`.kcard`/`.chatline .av`/`.bubble` One UI
ölçeğine çekildi. `.bubble.me` (AI sohbet mockup'ındaki "kullanıcı" balonu) sabit-kodlanmış
beyaz→`var(--gold)` (mavi) oldu — `html.theme-mono .bubble.me` override'ı DEĞİŞMEDİ (mono tema
kasıtlı gri/siyah kalıyor). Features grid ikon rozetleri, "nasıl çalışır" adım numaraları, FAQ
genişlet/daralt ikonu, iletişim bölümü ikon rozetleri, form inputları, footer sosyal ikonları → pill/
One UI ölçeği. FAQ'ın mevcut akordeon yapısı KORUNDU (referans sitedeki 2-kolon kart grid'ine
zorlamak `renderFaq()` JS render mantığına dokunmayı gerektirirdi — görsel-only kural gereği
akordeon deseni bırakıldı, zaten One UI'ın kendi genişletilebilir liste öğesi desenine uygun).

### Yeni: CTA şeridi ("Hemen Başlayın")
Referans sitedeki koyu "Ready To Get Started?" bölümüne benzer, SSS ile İletişim formu arasına yeni
bir bölüm eklendi — başlık + kısa açıklama + "Ücretsiz Demo Talep Et" pill butonu (`/demo-talep`'e
gider, zaten var olan route). **Sahte istatistik/müşteri iddiası YOK** (testimonial kararına uygun,
güvenli içerik). Hero/showcase mockup'larıyla aynı ilke uygulandı: bölüm KASITLI OLARAK her iki
temada da koyu kalıyor (referans sitenin kendi tasarımıyla aynı, ayrıca `html.theme-mono` override'ı
gerektirmiyor). Yeni `cta2_title`/`cta2_sub`/`cta2_btn` i18n anahtarları hem TR hem EN `I18N`
bloklarına eklendi.

### Kapsam dışı bırakılanlar (plan gereği)
- Newsletter (bülten) formu — backend endpoint'i gerektirir, eklenmedi.
- `marketing.html` + 45 pazarlama alt-sayfası — hâlâ eski görsel dil + kendi `.lang` butonuna sahip,
  BİLEREK bu fazın dışında (kullanıcı sadece landing page'i belirtti bu turda).
- Testimonial bölümü — kullanıcı kararıyla eklenmedi.

## Verification
Local preview, taze-sayfa-yenileme yöntemiyle:
- `.lang` buton sayısı: 0 (hem nav hem footer'dan kaldırıldı).
- `navigator.language` gerçek değeri ('tr') → `document.documentElement.lang === 'tr'` doğru.
- Dil algılama fonksiyonu ayrı test edildi: `tr-TR`→tr, `en-US`/`ja-JP`/`de-DE`→en.
- `.phone` mockup DOM'dan tamamen kaldırıldı, `.laptop` genişliği 580px.
- CTA şeridi bulundu, arka planı koyu gradient — hem varsayılan koyu hem `theme-mono` (açık) temada
  AYNI koyu kaldığı doğrulandı (kasıtlı, hero mockup'larıyla aynı ilke).
- `--gold`/`.btn-primary` arka planı: koyu temada `rgb(56,122,255)`, `theme-mono`'da da AYNI mavi
  (öncesi: açık temada siyahtı) — hem `document.documentElement` üzerinde hem gerçek butonlarda
  doğrulandı.
- Mobil görünümde (375px) `.nav-right` overflow'a neden olmuyor (dil butonları kaldırıldıktan sonra
  layout kontrolü).
- Tam sayfa görsel geçişi (screenshot) yapıldı: hero, trust, showcase (3 satır), features grid, how-
  it-works, comparison, stats, pricing, FAQ, yeni CTA şeridi, contact, footer — hepsi tutarlı One UI
  görünümünde, kırık layout yok.
- Font-family: `"Samsung Sharp Sans"` DEĞİŞMEDİ.
- Faz 1'de bulunan `*/`-yorum-içi-kapanma hatasına karşı bu fazda eklenen tüm yeni yorumlar grep ile
  tarandı — temiz.
- `git diff --stat`: `landing.html` +70/-55 satır.

## Files changed
- `landing.html` — token bloğu, dil algılama mantığı + `.lang` markup kaldırma, hero (telefon
  kaldırma + laptop büyütme), showcase/features/how-it-works/FAQ/contact/footer radius'ları, yeni
  CTA şeridi bölümü + i18n anahtarları.

---

## Faz 2 (Root + Giriş + Restoran Sitesi + Landing) — TAMAMLANDI
Faz 2A (Phase 54), 2B (Phase 55), 2C (Phase 56) ile kullanıcının "herşeyi One UI yap" isteğinin bu
turdaki tüm kapsamı bitti. Kalan, bilinçli olarak ERTELENMİŞ işler: `marketing.html` + 45 pazarlama
sayfası (aynı One UI + dil-algılama muamelesini görmedi), "4'e bölünebilen ekran" (Bottom Container
widget sistemi, Faz 1'den beri ayrı bırakılmıştı), `index.html`'in ölü tema-toggle JS'i, `index.html`
içindeki eski/muhtemelen kullanılmayan gömülü admin paneli kopyası.
