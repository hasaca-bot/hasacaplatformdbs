# Phase 69 — AI Asistanı: düşünme animasyonu, composer temizliği, görseli ürüne atama

## Why
Kullanıcı üç ayrı isteği tek mesajda topladı:
1. Kendi verdiği bir canvas "ThinkingOrb" animasyon kodunu sohbete ekle, 3-nokta "yazıyor" göstergesinin
   YERİNE bunu kullan.
2. Composer'daki (metin kutusu) profil/avatar ikonunu kaldır.
3. "Bu menü için görsel oluştur" dendiğinde, üretilen görseli doğrudan o ürüne fotoğraf olarak atama
   SEÇENEĞİ sunulsun ("ayarlansın mı?" tarzı).

## What changed

### 1 — 3 nokta yerine ThinkingOrb (`admin.html`)
Kullanıcının verdiği `ThinkingOrb` sınıfı + `STATE_CONFIGS` birebir (state config değerlerine
dokunulmadan) admin.html'e eklendi (`AI_ORB_STATE_CONFIGS` adıyla, olası global isim çakışmasını
önlemek için). `adminAiTypingHTML()` artık 3 `<span>` yerine `<canvas id="aAiThinkingOrb">`
döndürüyor. Yeni `adminAiStartThinkingOrb()`/`adminAiStopThinkingOrb()` — `adminAiSend()`'de pano
eklenir eklenmez `start`, cevap geldiğinde (başarı/hata/plan farketmeksizin, TÜM dallardan önce tek
bir noktada) `stop` çağrılıyor. Bu önemliydi: `requestAnimationFrame` döngüsü durdurulmadan
`typingBubble.innerHTML` değiştirilirse canvas DOM'dan kopar ama RAF döngüsü arka planda sonsuza
kadar çalışmaya devam eder (bellek sızıntısı) — `stop()`'un HER yanıt yolunda (başarı/`res.ok` false/
network catch) çağrıldığı doğrulandı. Eski `.ai-typing`/`@keyframes apAiTyping` CSS'i kaldırıldı,
yerine `.ai-thinking-bubble` (ortalanmış, dar padding) eklendi.

### 2 — Composer avatar ikonu kaldırıldı (`admin.html`)
`.ai-chat-composer-avatar` div'i + CSS'i tamamen silindi (Faz 66'da eklenmişti). Composer'ın
padding'i simetrikleştirildi (`6px 6px 6px 8px` → `6px 8px`), textarea'nın sol padding'i biraz
artırıldı (`10px`) — avatar'ın bıraktığı boşluk telafi edildi, hap şeklindeki konteynerin kendisi
değişmedi.

### 3 — Görseli doğrudan ürüne atama (`backend/server.js` + `admin.html`)
Sistem promptuna yeni bir alan eklendi: `"image_target_product_id": string|null`. İstek belirli bir
ürüne atıfta bulunuyorsa (isimle) model bu alana o ürünün GERÇEK id'sini yazıyor — backend bunu
`productsById`'ye karşı doğruluyor (`actions` doğrulamasıyla AYNI güven modeli: modelin söylediğine
körü körüne inanılmıyor, sadece bu tenant'a GERÇEKTEN ait bir id ise kabul ediliyor).

Üretilen görsel artık base64 olarak JSON'da taşınmıyor — `saveGeneratedImageFile()` (yeni yardımcı,
`POST /api/admin/upload-image`'in AYNI dosyaya-yaz-URL-döndür deseninin bir kopyası) onu `/uploads`
altına gerçek bir dosya olarak kaydedip `imageUrl`'i küçük bir hosted URL yapıyor — hem JSON yanıtı
küçülüyor hem de bu proje genelinde zaten var olan "görseller asla DB'ye base64 gömülmez, dosya +
URL" kuralına uyuyor.

Yanıta `imageProductId`/`imageProductName` eklendi. Frontend'de `adminAiImageHTML()` artık görselin
altına, hedef bir ürün varsa, "Ürün görseli olarak ayarla — [Ürün Adı]" butonu ekliyor. Tıklanınca
YENİ, KASITLI OLARAK DAR bir endpoint'e (`PUT /api/admin/ai-assistant/apply-image`) gidiyor —
`PUT /api/products/:id` (genel ürün formu) KASITLI OLARAK KULLANILMADI çünkü o endpoint TAM SATIR
DEĞİŞTİRME yapıyor (`name_tr = body.name_tr || ''` — sadece `{image: url}` gönderilse ürünün adı
BOŞALIRDI). Yeni endpoint SADECE `image` sütununu güncelliyor, tenant-scoped, ve sadece bu sunucunun
kendi `/uploads/...` altında barındırdığı bir URL'i kabul ediyor (regex ile doğrulanıyor) — rastgele
bir dış URL'i "ürün görseli" diye kaydetmeye açık bir kapı değil.

## Verification
Local preview, gerçek admin oturumu, gerçek Groq + Hugging Face anahtarlarıyla:
- **Orb**: `adminAiSend()` çağrıldığında `#aAiThinkingOrb` canvas'ının oluştuğu, yanıt geldiğinde
  (serbest sohbet senaryosunda) kaldırılıp yerine gerçek metin geldiği DOM üzerinden doğrulandı;
  konsol hatası taraması temiz (önceki turdan kalan 2 hata benim kendi hatalı test `fetch`'imden
  kaynaklanıyordu — `/api/menu` diye var olmayan bir endpoint'e attığım istekti, gerçek uygulama
  akışında AYNI senaryo tekrar test edildiğinde network log'u tamamen temiz/200 OK).
- **Composer**: avatar div'i DOM'da yok, hap şeklindeki input çubuğu bozulmadan duruyor.
- **Görseli ürüne atama — uçtan uca**: "Izgara Köfte ürünü için bir görsel oluştur." → gerçek görsel
  üretildi, buton doğru ürün id'sini (`tpl-grill-default`) ve doğru ürün adını (`Izgara Köfte`)
  taşıyor şekilde render oldu → butona tıklandı → `PUT /api/admin/ai-assistant/apply-image` başarılı
  → buton "Ürün görseli güncellendi ✓" durumuna geçti, devre dışı kaldı → `window.menuData` yeniden
  yüklendi ve GERÇEKTEN o ürünün `image` alanının yeni URL'e güncellendiği doğrulandı → üretilen
  dosyanın `/uploads/` altında GERÇEKTEN geçerli bir 1024×1024 JPEG olarak servis edildiği ayrıca
  doğrudan navigasyonla doğrulandı.
- Bu turda ekran görüntüsü alınamadı (Browser pane bu oturumda görüntülenemedi) — tüm doğrulamalar
  DOM/network sorgularıyla ve dosyanın gerçek boyutunu/formatını gösteren tarayıcı sekme başlığıyla
  yapıldı, görsel (piksel) doğrulama değil.

## Files changed
- `admin.html` — `ThinkingOrb` sınıfı + `AI_ORB_STATE_CONFIGS` eklendi; `adminAiTypingHTML()` canvas
  döndürüyor; yeni `adminAiStartThinkingOrb()`/`adminAiStopThinkingOrb()`, `adminAiSend()`'in her
  yanıt dalına `stop()` çağrısı eklendi; eski `.ai-typing` CSS'i silindi, `.ai-thinking-bubble`
  eklendi; composer avatar div'i + CSS'i silindi, composer padding'i ayarlandı; `adminAiImageHTML()`
  hedef-ürün butonunu render ediyor; yeni `adminAiApplyProductImage()` fonksiyonu; 3 yeni i18n
  anahtarı (TR+EN).
- `backend/server.js` — sistem promptuna `image_target_product_id` alanı eklendi; yeni
  `saveGeneratedImageFile()` yardımcı fonksiyonu; `/api/admin/ai-assistant/plan` artık base64 yerine
  hosted URL döndürüyor + `imageProductId`/`imageProductName` ekliyor; yeni, kasıtlı dar
  `PUT /api/admin/ai-assistant/apply-image` endpoint'i.
