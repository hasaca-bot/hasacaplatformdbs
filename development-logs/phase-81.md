# Phase 81 — NFC/QR masa kartı sistemi (basitleştirilmiş galeri), hero metin animasyonu, push-öncesi hata düzeltmeleri

## Why
Bu faz, Phase 80'den sonra tek bir oturumda birikip hiç loglanmamış üç ayrı iş parçasını kapsıyor:
(1) planlanan tam özellikli canlı kart editörünün kullanıcı tarafından iptal edilip çok daha basit
bir "hazır tasarım galerisi" modeliyle değiştirilmesi, (2) landing.html hero'sunun altındaki statik
sayaç bloğunun kullanıcı-sağladığı Stitch referanslarından esinlenen tek bir dinamik metin
animasyonuyla değiştirilmesi, (3) push öncesi kullanıcının bizzat bildirdiği 3 gerçek/algılanan hata.

## 1) NFC + QR masa kartı — basitleştirilmiş galeri modeli

**Terk edilen plan:** 8 şablon × 4 şekil × serbest renk × logo yükleme × yerleşim × QR çerçevesi ×
NFC köşesi'ni anında render eden tam bir canlı editör (`card-render.js` motoru, ~300 satır CSS
şablon sistemi). Kullanıcı bundan vazgeçti — gerekçe: gerçek QR/logo entegrasyonu zaten fiziksel
üretim sırasında elle yapılacak, canlı önizleme "sahte QR" izlenimi yaratıyor.

**Yeni model:** Sabit, genişleyebilir bir hazır-tasarım galerisi. Tek kaynak dosya
`card-gallery.js` (repo kökü, UMD, `HasacaGallery` global + `module.exports`) — `GALLERY` dizisi
(`{id, file, label:{tr,en}}`), `normalizeDesignId()` (bilinmeyen id için sessizce varsayılana
DÜŞMEZ, `null` döner — "hiç seçim yok" ile "geçersiz seçim" ayrımını korumak için kritik),
`imageUrl()`, `label()`. Görseller `assets/nfc-cards/*.png`, mevcut `express.static` ile servis
edilir. Yeni bir tasarım eklemek artık sadece: görseli klasöre koy + `GALLERY`'ye bir satır ekle —
admin panelinde, Root panelinde ve landing'de otomatik ve senkron görünür.

**Veri modeli:** `card_designs.design` / `card_orders.design` (zaten esnek TEXT/JSON, migration
YOK) artık yalnızca `{"designId":"..."}` saklıyor.

**Backend (`backend/routes/cards.js`, sadeleştirildi):**
- `GET/PUT /api/card-design`, `POST /api/card-design/approve` (`HasacaGallery.normalizeDesignId`
  ile doğrulama, geçersiz/boşsa `400` + `"Önce bir tasarım seçin."`), `POST
  /api/card-design/custom-request` (değişmedi).
- `ORDER_STATUSES` fonksiyon nesnesine özellik olarak dışa açıldı
  (`module.exports.ORDER_STATUSES = ...`) — `root.js` aynı diziyi import ediyor, kopyalamıyor.

**`backend/routes/root.js`:** 5 yeni uç — kart siparişleri (liste/detay/durum) ve özel tasarım
talepleri (liste/durum), `tenants.display_name`/`name` ile join'lenmiş.

**`admin.html`:** Editör tamamen galeri seçiciye indirgendi (`#cdGallery`, `.cd-gallery-item.on`
seçim durumu, `.cd-info-box` — "Logonuz otomatik olarak işlenip size bildirilecektir" bilgi
notu). Silinen: canlı önizleme sahnesi, "AI ile Tasarla" (hiç çalışan bir uca bağlı değildi),
renk/logo/yerleşim/QR-çerçeve/NFC-köşe kontrolleri. Korunan: "Özel Tasarım İsteyin" akışı,
teslimat/onay modalı (`cdOpenApprove`/`cdSubmitApprove`), `buildTableUrl()` kullanımı (masa
URL'leri değişmedi).

**`root.html`:** Yeni `showView('card-orders')` (hardcoded nav'a manuel eklendi — bu dosyada
map-driven bir sistem yok), "Landing Mesajları" modalının liste+detay+durum desenini birebir
tekrar kullanıyor.

**`landing.html`:** `#nfc` bölümündeki "Çok Yakında" rozeti kaldırıldı, yerine oturum-durumuna göre
`/admin` veya `/giris`'e giden CTA. Carousel artık hardcoded `NFC_CARDS` yerine
`HasacaGallery.GALLERY`'den besleniyor.

**Bulunan ve düzeltilen regresyon — mobil carousel taşması:** galeri 5→11 tasarıma çıkınca
yelpaze-döndürme matematiği (`(i-nfcIndex)*20°`) ölçeklenmedi, ±40°'den ±100°'ye çıkıp yatay
taşmaya yol açtı (ölçülen: `scrollWidth` vs `clientWidth`). Düzeltme: `NFC_MAX_STEP = 2` ile
etkin adım mesafesi galeri boyutundan bağımsız sabitlendi.

**Sonradan eklenen tasarımlar + görsel işleme:** kullanıcı 10 yeni görsel sağladı (6'sı galeriye
eklendi), Python/PIL ile otomatik kırpma (5 orijinal görselde alfa-kanalı `getbbox()`; 6 yeni
görselde opak arka planlar için köşe-piksel-renk-farkı yöntemi — yalnızca `lezzet-kosesi.png`
gerçek kırpma gerektirdi, %66→tam genişlik).

**NFC kart köşe yuvarlatma (bu sürecin sonunda, kullanıcı isteğiyle):** `.nfc-card`'ın
`border-radius:0` kuralı (önceki fazda "hayalet çerçeve" sorunu için bilinçli olarak sıfırlanmıştı)
`var(--radius)` (22px, sitenin genel kart standardı) yapıldı. `box-shadow` değil
`filter:drop-shadow` kullanıldığından (gerçek render edilmiş/kırpılmış alfa konturunu takip eder),
köşe yuvarlatma eski hayalet-çerçeve riskini geri getirmiyor.

**"Ölçeklenen bir platform" paneli — gerçek fotoğraf arka planı:** kullanıcının sağladığı masa-stant
mockup fotoğrafı (`assets/nfc-cards/masa-mockup.png`), `.panel-card`'ın tam-kaplayan
(`object-fit:cover`) arka planı yapıldı, okunabilirlik için güçlendirilmiş çok yönlü scrim
gradyanıyla.

## 2) Landing hero — trust sayaçları yerine tek dinamik metin animasyonu

Kullanıcı 5 adet Stitch-üretimi "premium metin animasyonu" örneği sağladı (siyah/beyaz temalı,
dikey kayan-kelime karuseli tekniği). İstek: hero altındaki `.trust` sayaç bloğunu (500+ Restoran /
150K+ Sipariş / %99.9 / %0 Komisyon) kaldır, yerine bu tekniği kullan; sonradan netleşti: 2 ayrı
(aydınlık/karanlık) versiyon yerine **tek** animasyon, site fontuyla aynı, kelime listesini kendim
seç.

**Çözüm:** `.trust`/`.counters`/`.counter*` tamamen silindi (CSS + i18n anahtarları
`tr_restaurants` vb.). Yerine `.feat-ticker` — `var(--text)`/`var(--gold)` token'larıyla yazıldığı
için sitenin MEVCUT `html.theme-mono` karanlık/aydınlık tema anahtarıyla otomatik doğru kontrasta
geçiyor (iki ayrı bileşen yazmaya gerek kalmadı); font-family hiç set edilmiyor, sayfanın global
`* { font-family:var(--font-primary) !important; }` kuralından miras alıyor (Hanken Grotesk import
edilmedi). Referans örneklerin zaten HASACA'ya özel hazırlanmış 16 kelimelik listesi 10'a
optimize edildi (yakın-anlamlı tekrarlar birleştirildi): qr sipariş sistemi, dijital mutfak ekranı,
garson çağırma sistemi, online rezervasyon, paket servis ve kurye yönetimi, işletme analitiği,
yapay zeka asistanı, özel alan adınız, anlık bildirim sistemi, çoklu dil desteği (+ İngilizce
karşılıkları). `applyI18n()`'e `renderFeatTicker()` adımı eklendi — dil değişince liste yeniden
kuruluyor. Eklenen, istenmemiş ama mantıklı özellik: `prefers-reduced-motion` desteği.

**Bulunan ve düzeltilen bug (kullanıcı ekran görüntüsüyle işaretledi):** `.ft-dynamic` kutusunun
`em` birimi kalıtılan ~16px body font-size'ına göre çözülüyordu (`2em` = 32px), oysa kelime 34px —
metin üstten/alttan kırpılıyordu. Kutuya kelimeyle aynı `font-size` verilerek `em`'in doğru tabana
(34px → 68px kutu) oturması sağlandı.

## 3) Push öncesi 3 hata düzeltmesi

1. **Login şifre alanı ikon çakışması** (`login.html`): kod kendisi hatalı değildi — Edge'in
   native `::-ms-reveal` ikonu, sitenin özel `.eye` butonuyla aynı köşede (`right:8px`) çakışıyordu
   (hiçbir yerde bastırılmamıştı). Düzeltme: `::-ms-reveal`/`::-ms-clear` gizlendi; ayrıca gerçek
   bir düzen kusuru da vardı — `.eye` butonunun genişliği (~33-41px) `14px` sağ padding'den fazlaydı,
   uzun şifrelerde metin butonun altında kalıyordu → padding 40px'e çıkarıldı.
2. **"Kart Tasarla" CTA'sı doğru sekmeye gitmiyordu** (`landing.html` + `admin.html` +
   `login.html`): kök neden, admin.html'de dışarıdan gelen bir hash'i okuyup `AP_VIEW_MAP`'teki
   ilgili sekmeyi açan hiçbir mekanizmanın olmamasıydı — panel açılışta her zaman sabit bir view'a
   gidiyordu. CTA artık `#table-card` hash'i taşıyor, `login.html`'in her iki başarı yolu da
   (`handleLoginSuccess`) bu hash'i `/admin` hedefine taşıyor, `openAdminPanel()` artık
   `location.hash`'i okuyup eşleşen view'ı açıp `history.replaceState` ile temizliyor.
3. **Tasarım seçmeden Onayla** (`admin.html`): araştırma sonunda backend (`Önce bir tasarım
   seçin.` 400) ve frontend (`cdSubmitApprove` hata gösterimi) zincirinde gerçek bir regresyon
   BULUNAMADI — ikisi de doğru çalışıyordu (test tenant'ları `bfbfb`/`hacimustafa` de zaten temiz
   çıktı, "eski test verisi" teorisi yanlıştı). Yine de gerçek eksik doğrulandı: "Tasarımı Onayla"
   butonu hiçbir zaman disable olmuyordu. Savunma katmanı eklendi: buton `cdDesignId` boşken
   `disabled`; `cdOpenApprove()`'a da ikinci bir erken kontrol eklendi.

## 4) Landing'e 2 yeni bölüm: marka-ürünleri slaytı + interaktif yelpaze kartlar

Kullanıcı iki referans daha sağladı: (a) daha önceki 5 metin-animasyonu setinin kullanılmayan
9-kelimelik listesi (ıslak mendil/kese kağıdı/karton bardak/kahve bardağı/kartvizit/magnet/tuzluk/
peçete/tepsi altı kağıdı — o zaman "alakasız yer tutucu" diye not edilmişti, bu turda gerçek yerini
buldu), (b) masaüstünde bir CSS-only `offset-path` yelpaze-kart hover demosu
(`fanned-cards-with-hover`). İstek: NFC bölümünün yakınına, biri marka-ürünleri tanıtan slaytlı bir
panel, biri de bu yelpazenin 90° sola döndürülmüş (pivot sağda, açılım solda) bir uyarlaması.

**Görsel akışı:** sohbete yapıştırılan görseller diske kaydedilemediği için kullanıcıdan önce
kendisinin masaüstüne kaydetmesi istendi (`mockup slayt/`, `kartvisit/`) — kullanıcı iki mockup
fotoğrafı + üç kart tasarımı (yeşil-altın suluboya mermer, kraft kağıt dokusu, kabartma yaprak logo)
sağladı. `lezzet & sanat.png` siyah zemin üzerine kart olarak geldi, Python/PIL ile alfa-olmayan
(non-black mask) bounding-box yöntemiyle karta kırpıldı (1280×1280→746×443); diğer ikisi zaten
tam-kadraj olduğu için sadece yeniden boyutlandırıldı. Sonuçlar `assets/slider/slide-1.png`,
`assets/slider/slide-2.png`, `assets/nfc-cards/kart-{lezzet-sanat,yaprak,kraft}.png`.

**Marka-ürünleri paneli (`.brand-slider`):** mevcut `.panel-card` kabuğu (hero/stats ile aynı mavi
yuvarlak çerçeve) yeniden kullanıldı. Sol tarafta bu turun `.feat-ticker` tekniğinin ikizi
(`.bt-*` sınıflarıyla) — 9 kelimelik liste + "Restoranınıza özel" öneki, altında başlık/metin/CTA.
Sağda `assets/slider/slide-1..14.png` görsellerinden otomatik (4.2sn) çapraz-geçişli bir slayt
(`.bs-slides`/`.bs-dots`), görsel yoksa `onerror` ile şık bir placeholder'a düşer. Kullanıcı 14 adet
"LEZZET & SANAT" markalı ürün mockup'ı sağladı (ıslak mendil pouch, peçete kabartma, kese kağıdı,
karton bardaklar, kahve kupası, tepsi altı kağıdı, kartvizit, sticker seti, paket vb.) — ticker'ın
kelime listesiyle birebir örtüşüyor; hepsi 1600px'e küçültülüp temaya uygun sırayla dizildi.

**Yelpaze kartlar (`.fan-cards`):** demonun `sibling-index()`/`offset-path` tekniği yerine —
güvenilirlik için — sabit 7 kart + `nth-child` tabanlı `--a` açı değişkeni (-48°..+48°,
`transform-origin:right center`) kullanıldı; pivot sağda, kartlar sola yatık açılıyor (kullanıcı:
"kartla sola yatık teker sağda"). Hover'da üzerine gelinen kart öne çıkar
(`scale(1.06) translateX(-16%)`), `~`/`:has()` selektörleriyle komşu kartlar yay boyunca aralanır —
demonun kendi `linear()` yay-easing fonksiyonu (`--spring`) birebir taşındı. 7 kart NFC galerisinden
4 mevcut tasarım (turk-lezzeti, olive-oak, zeytinlik, terra) + kullanıcının 3 yeni kartvizit
tasarımıyla dolduruldu; boş slot kalırsa `onerror` placeholder'a (`L&S` baş harfleri) düşer.
`prefers-reduced-motion` altında hover-yayılımı ve geçişler kapanır.

**Bulunan ve düzeltilen bug (bu turda):** `<img>` etiketlerine ilk yazımda `loading="lazy"` verildi;
ölçümde bu görsellerin (özellikle yeni eklenenlerin) `complete`/`naturalWidth` hiç dolmadığı,
`curl`/bağımsız `new Image()` testinde ise aynı URL'lerin sorunsuz 200 döndüğü görüldü —
`innerHTML` ile SONRADAN enjekte edilen `<img loading="lazy">` elemanlarının tarayıcının lazy-load
gözlemcisi tarafından güvenilir biçimde yakalanmadığı tespit edildi. `loading="lazy"` kaldırılıp
sitenin geri kalanının zaten kullandığı eager-load deseni izlendi; ardından tüm görseller
`complete:true` ile doğrulandı.

**Kullanıcı geri bildirimiyle düzeltilen 3 CSS özgüllük/responsive hatası (aynı tur, ayrı bir pass):**
1. *Masaüstü slayt bozuktu* — `.bs-inner{flex-direction:row}` (0,1,0), jenerik
   `.panel-section .panel-inner{flex-direction:column}` (0,2,0) tarafından eziliyordu; üstelik benim
   kuralım stylesheet'te panel-inner'dan ÖNCE olduğu için eşit özgüllükte olsa bile kaybediyordu.
   Slayt sağda 38px'e çöküyordu. Bileşik `.brand-slider .panel-inner.bs-inner` (0,3,0) ile kesin
   çözüldü; ardından mobil override'ın da AYNI (0,3,0) özgüllükte olması gerekti (yoksa mobilde de
   row kalıyordu — bu ikinci tuzak da ölçülerek yakalandı ve düzeltildi).
2. *Marka ticker'ı mobilde bozuktu* — `.bt-word` (sola hizalı, `left:0`) mobilde hero ticker'ının
   GLOBAL `@keyframes ftSlide` override'ını (ortalı hero kelimesi için `translate3d(-50%,…)`)
   miras alıp kutusunun dışına (ölçülen x=-32) kayıyordu. Marka ticker'ına kendi `btSlide`
   keyframe'i verilerek animasyon-adı sızıntısı kesildi.
3. *Hero ticker'ı mobilde uzun kelimeleri kırpıyordu* ("paket servis ve kurye yönetimi" 34px'te dar
   ekrana sığmıyordu) → mobilde font `clamp(18px,5.2vw,26px)`'e küçültüldü (289px < 339px kutu,
   ölçüldü). *Yelpaze mobilde çok küçüktü* (kullanıcı: "çok küçük ve alakasız") → kart genişliği
   ~97px'ten ~180px'e büyütüldü, açı yayı hafif kısıldı, taşma `scrollWidth==clientWidth==375` ile
   doğrulandı.

Bu pass'te ders: aynı özgüllük seviyesinde kaynak-sırası kazanır; yeni bir bileşene jenerik bir
kap kuralını override eden bir kural yazıldığında hem masaüstü hem de tüm responsive override'lar
aynı (yükseltilmiş) özgüllükte tutulmalı. Doğrulama sırası da önemliydi: bu ortamda `resize_window`,
`navigate`'ten SONRA sıfırlanıyor — doğru sıra **navigate → resize → ölç**.

## Verification
- NFC/QR sistem: tenant izolasyonu, geçersiz/boş designId reddi, onay akışı gerçek JWT'lerle uçtan
  uca test edildi (bu fazın erken bölümünde).
- Hero animasyonu: koyu + `theme-mono` (açık) temada renk kontrastı, TR⇄EN dil değişiminde kelime
  listesinin doğru yeniden kurulduğu, 375px'te yatay taşma olmadığı, konsol hatası olmadığı DOM
  ölçümüyle doğrulandı.
- 3 hata düzeltmesi: temiz bir tarayıcı sekmesinde (eski oturumdan gelen konsol log kalıntısı
  ayırt edilerek) gerçek JWT ile `/admin?tenant=bfbfb#table-card`'a gidildi — panel doğrudan
  "Masa Kartı Tasarla" sekmesinde açıldı, hash temizlendi, Onayla butonu tasarım seçilmeden
  disabled, seçilince aktif, modal doğru açılıyor doğrulandı; test sırasında tenant'a yazılan
  seçim script ile geri temizlendi.
- Marka-ürünleri paneli + yelpaze kartlar: koyu ve `theme-mono` (açık) temada renk kontrastı,
  TR⇄EN dil değişiminde 9-kelimelik listenin doğru yeniden kurulduğu, tüm görsellerin
  `complete:true` ile tam yüklendiği, 375px mobilde yatay taşma olmadığı (`scrollWidth`/
  `clientWidth`), `:has()` desteği ve konsol hatası olmadığı DOM ölçümüyle doğrulandı. Gerçek
  fare hover'ı (Browser pane bu ortamda compositing yapamadığından) görsel olarak doğrulanamadı —
  bu açıkça not düşüldü, "doğrulandı" diye iddia edilmedi.

## Files changed
`card-gallery.js` (yeni, `card-render.js`'in yerine), `assets/nfc-cards/*` (11 tasarım + 3 yeni
kartvizit tasarımı + `masa-mockup.png`), `assets/slider/*` (yeni klasör, 2 slayt görseli),
`backend/routes/cards.js`, `backend/routes/root.js`, `admin.html`, `root.html`, `landing.html`,
`login.html`. `backend/db.js` — değişiklik yok (şema zaten esnek).

## Push
Commit/push edilmedi — standing rule gereği kullanıcı onayı bekleniyor.
