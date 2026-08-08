# Phase 66 — AI Asistanı sohbet ekranı yeniden tasarlandı (referans görsele göre, siyah/beyaz)

## Why
Kullanıcı bir referans ekran görüntüsü (genel bir "CHAT A.I+" arayüzü — başlık, numaralı/kalın
biçimli cevap metni, cevabın altında thumbs up/down + kopyala + yeniden oluştur ikon satırı, alt
kısımda yuvarlak avatar + input + gönder butonundan oluşan hap şeklinde bir composer) ve indirdiği
bir "Chatbot Ekranı" HTML dosyası gönderip bunu siteye eklemesini istedi. AskUserQuestion ile
netleştirildi: bu, admin.html'de ZATEN VAR olan "AI Asistanı" (ürün/kategori/fiyat yönetimi için
doğal dil komutları, Faz 27/41) ekranının YENİ arayüzü olacak — mevcut plan/onayla/uygula mantığı
korunacak, sadece görsel dil referans görsele göre değişecek, ayrıca panelin geneli mavi kalmaya
devam ederken BU EKRAN özel olarak siyah/beyaz'a uyarlanacak.

## What changed (`admin.html`)

### Skoplu monokrom accent — panelin geneli mavi kalıyor
`.ai-chat` elemanına yerel `--ai-accent`/`--ai-accent-text` CSS custom property'leri tanımlandı
(koyu temada beyaz/siyah, `html[data-theme="light"]` altında siyah/beyaz ters çevrilmiş) — panelin
GENEL `--ap-gold` (mavi `#387AFF`) token'ına DOKUNULMADI, bu değişken sadece `.ai-chat` alt
ağacında kullanılıyor. Kullanıcı bu oturumda daha önce "admin paneli mavi kalsın" demişti (masa/
uzaktan sipariş ekranları tartışması) — o kural bozulmadı, sadece BU ekran için AÇIKÇA istenen
siyah/beyaz istisnası ayrı bir token ailesiyle uygulandı.
- Kullanıcı balonu arka planı/metni, gönder butonu, composer avatarı, plan diff'indeki yeni değer
  rengi, "Onayla ve Uygula" butonu → hepsi artık `var(--ap-gold)` yerine `var(--ai-accent)` okuyor.

### Composer — hap şeklinde konteyner + avatar ikonu (referans görsele göre)
Önceden düz bir textarea + ayrık yuvarlak buton, üstte ince bir çizgiyle ayrılmıştı. Şimdi: tüm
composer tek bir hap şeklinde (`border-radius:999px`) konteyner (`background:var(--ap-bg-2)`,
kenarlık, `:focus-within` halka efekti), İÇİNDE küçük yuvarlak bir avatar ikonu (mevcut boş-durum
ikonuyla aynı SVG, tutarlılık için), şeffaf/kenarlıksız bir textarea, ve sağda `--ai-accent`
renkli yuvarlak gönder butonu — referans görseldeki "[avatar][input][gönder]" tek-hap düzeniyle
birebir.

### Yeni: mesaj eylem satırı (thumbs up/down, kopyala, yeniden oluştur)
Önceden hiç yoktu — `adminAiActionsRowHTML()` yeni bir yardımcı fonksiyon, her BAŞARILI asistan
cevabının (hem düz metin hem "plan" balonu) altına ekleniyor (hata/typing balonlarına eklenmiyor,
kapsam dışı bırakıldı). Dört ikon buton:
- **Thumbs up/down** (`adminAiFeedback`): salt istemci-taraflı görsel bir toggle (birbirini
  dışlar, tıklanan yeşil/kırmızı vurgulanır) — bunu saklayan bir backend YOK, öyle bir endpoint
  icat edilmedi; sadece referans görseldeki mikro-etkileşimi görsel olarak karşılıyor.
  Gelecekte gerçek bir geri bildirim backend'i istenirse ayrı bir iş.
- **Kopyala** (`adminAiCopyMsg`): `navigator.clipboard.writeText()` ile balonun gerçek metnini
  panoya kopyalıyor, kısa bir yeşil "kopyalandı" durumu gösteriyor.
- **Yeniden oluştur** (`adminAiRegenerate`): yeni bir `adminAiLastUserMsg` modül değişkeni (her
  `adminAiSend()` çağrısında güncelleniyor) sayesinde SON gerçek kullanıcı mesajını input'a geri
  yazıp `adminAiSend()`'i tekrar tetikliyor — mevcut hata/plan işleme mantığının tamamı yeniden
  kullanılıyor, tekrar yazılmadı.
- 4 yeni i18n anahtarı (`admin_ai_fb_up/down`, `admin_ai_copy`, `admin_ai_regenerate`, TR+EN).

## Kapsam dışı bırakılan (kullanıcının ikinci sorusuna cevaben, netleştirme turunda)
Görsel oluşturma (image generation) yeteneği bu turda KODLANMADI — kullanıcının kendi ücretsiz API
anahtarını alması gerekiyor (hesap açma/kimlik bilgisi girme AI'ya bırakılamayan bir eylem), bu
yüzden önce kullanıcıya yönlendirme/rehberlik verildi, anahtar elde edilince ayrı bir iş olarak
backend'e (yeni bir `/api/admin/ai-assistant/generate-image`-tarzı endpoint + sohbet akışına "resim
oluştur" niyeti tanıma) bağlanacak.

## Verification
Local preview, gerçek admin oturumu, hem koyu hem `html[data-theme="light"]`:
- Kullanıcı balonu + composer avatarı + gönder butonu doğru şekilde tema başına ters çevrilmiş
  monokrom renkte (koyu: beyaz, açık: siyah) — panelin geri kalanının (sidebar, diğer ekranlar)
  mavi kaldığı ayrıca doğrulandı.
- Gerçek `adminAiSend()` çağrısıyla uçtan uca test edildi ("test mesajı") — backend gerçekten
  "Invalid API Key" hatası döndürdü (Gemini kotasının hâlâ $0 olduğu bilinen sorunuyla tutarlı,
  bu turun konusu değil) — hata balonunun eylem satırı ALMADIĞI doğrulandı (kasıtlı).
  `adminAiLastUserMsg` doğru güncellendi.
- Thumbs up tıklaması: yeşil aktif duruma geçti. Kopyala tıklaması: kısa yeşil geri bildirim.
- Sahte bir "plan" balonu (`adminAiPlanHTML`) render edilip diff renklerinin (`₺49.50` vb.) ve
  "Onayla ve Uygula" butonunun artık monokrom olduğu, "İptal"in etkilenmediği doğrulandı — hem
  koyu hem açık temada ekran görüntüsüyle.
- Font-family değişmedi, sadece `.ai-chat` alt ağacı değişti.

## Files changed
- `admin.html` — `.ai-chat` CSS'i (skoplu `--ai-accent` token'ları, composer hap/avatar, yeni
  `.ai-msg-actions` stilleri), composer markup'ına avatar div'i, yeni `adminAiActionsRowHTML()`/
  `adminAiFeedback()`/`adminAiCopyMsg()`/`adminAiRegenerate()` fonksiyonları, `adminAiSend()`'e
  `adminAiLastUserMsg` takibi + eylem satırı ekleme, 4 yeni i18n anahtarı (TR+EN).

## Ek — mesaj listesinin altındaki keskin kesim, blur+fade geçişe çevrildi
Kullanıcı ekran görüntüsüyle: mesaj listesi composer'ın hemen üstünde keskin bir çizgiyle
kesiliyordu, bunun yerine "yavaşça bulanıklaşarak kaybolmasını" istedi. Kök neden basit bir
`overflow-y:auto` kesimiydi, fade/mask hiç yoktu. Düzeltme scroll ile birlikte KAYMAYAN ayrı bir
overlay gerektiriyordu (mesaj kutusunun kendi içine konursa scroll'la birlikte kayardı) — bu yüzden
`#aAiMessages`'ı yeni bir `.ai-chat-body-wrap` (`position:relative`) içine aldım, kardeş olarak
`position:absolute;bottom:0` bir `.ai-chat-fade` div'i ekledim: `backdrop-filter:blur(6px)` +
kendi üzerine bindirilmiş bir `mask-image` gradyanı (üstte tamamen şeffaf/görünmez → altta tam
opak) — bu, blur'un KENDİSİ sabit olsa da GÖRÜNÜRLÜĞÜNÜN üstten alta kademeli artması sayesinde
gerçek bir "yavaşça bulanıklaşma" hissi veriyor (yaygın "progressive blur" tekniği), üstüne bir de
`var(--ap-panel)`'e doğru düz bir renk gradyanı bindirilerek composer'ın arka planına gerçekten
"eriyip kaybolma" hissi eklendi. `pointer-events:none` — scroll/tıklama engellemiyor.

**Verification**: 6 test mesajı eklenip kaydırma alanı doldurulduktan sonra, hem tam altta hem
kısmi kaydırılmış (son satır fade bölgesinin ortasında) durumda, hem koyu hem `data-theme="light"`
temada ekran görüntüsüyle doğrulandı — son mesajın metni artık keskin kesilmeden, bulanıklaşıp
arka plana karışarak kayboluyor.
