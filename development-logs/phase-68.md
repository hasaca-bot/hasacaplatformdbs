# Phase 68 — AI Asistanı: serbest sohbet + görsel oluşturma (uçtan uca çalışıyor)

## Why
Kullanıcı: AI Asistanı çok kısıtlıydı, sadece menü-düzenleme komutlarını anlıyordu, her şeyin
dışında kalan (serbest sohbet, tavsiye, görsel oluşturma isteği) "desteklenmeyen istek" olarak
görünüyordu. İstek: **serbestçe her konuda konuşulabilsin, görsel oluşturabilsin — ama SADECE
site/işletme verisi (siparişler, müşteriler, ödeme, diğer restoranlar, sistem/güvenlik bilgisi)
korunmaya devam etsin, bunlara asla erişemesin/uydurmasın.**

## What changed (`backend/server.js`)

### Sistem promptu yeniden yazıldı — kısıtlayıcı değil, sınırlayıcı
Önceki prompt modeli SADECE `{"summary","actions","unsupported"}` şemasıyla ve SADECE ürün/kategori
düzenleme bağlamında yanıt vermeye zorluyordu — her şeyin dışı "unsupported" listesine düşüyordu.
Yeni prompt: aynı JSON-modu (`response_format:{type:"json_object"}`) korunuyor ama modelin "summary"
alanını GERÇEK bir serbest-sohbet kanalı olarak kullanmasına izin veriliyor — menüyle ilgisiz bir
soru/sohbet/tavsiye isteğinde model doğal bir cevap yazıyor, `actions`/`unsupported` boş kalıyor.
Menü-düzenleme yeteneği (whitelist'li alanlar, tenant-scoped, `actions` + onay akışı) AYNEN korundu,
davranışı değişmedi.

**Güvenlik sınırı KOD SEVİYESİNDE, prompt talimatına değil, veri erişimine dayanıyor**: modele
HÂLÂ SADECE bu tenant'ın ürün/kategori verisi JSON olarak veriliyor (`SELECT ... WHERE tenant_id =
...`) — siparişler, müşteri bilgileri, diğer tenant'ların verisi, API anahtarları vb. hiçbir zaman
prompt'a dahil edilmiyor, yani model bunları LİTERALDE BİLMİYOR, "vermeyi reddediyor" değil
"elinde yok". Prompt ayrıca bu tür isteklerde nazikçe reddetmesini söylüyor (uydurma yapmasın diye)
ama asıl garanti bu — sınır veri-erişiminde, talimatta değil.

### Yeni: görsel oluşturma (`image_prompt` alanı + Hugging Face entegrasyonu)
Şemaya `"image_prompt": string|null` eklendi — kullanıcı görsel isterse model buraya İngilizce,
görsel-üretim-modeline uygun bir açıklama yazıyor. Backend bu alan doluysa `generateImageHF()`'i
çağırıyor (Root panelinde Faz 67'de eklenen `hf_key` ile), sonucu `imageUrl` (base64 data URI) veya
`imageError` olarak yanıta ekliyor.

## Doğrulama sırasında bulunan ve düzeltilen 3 gerçek entegrasyon hatası
Canlı testte, sırayla:
1. **Yanlış host**: `api-inference.huggingface.co` artık DNS'te çözülmüyor (`curl`: "Could not
   resolve host") — Hugging Face bu eski host'u kaldırıp birleşik bir router'a (`router.huggingface.co`)
   geçmiş. Düzeltme: `https://router.huggingface.co/hf-inference/models/{model}`.
2. **Token izin hatası**: "This authentication method does not have sufficient permissions to call
   Inference Providers" — kullanıcının ilk oluşturduğu token'da "Make calls to Inference Providers"
   izni yoktu (HF'in Fine-grained token sisteminde ayrı bir izin). Kullanıcıya token'ı bu izinle
   yeniden oluşturması söylendi, yaptı, kaydetti — hata kayboldu.
3. **Model deprecated**: seçilen model (`FLUX.1-schnell`) "deprecated and no longer supported by
   provider hf-inference" hatası verdi — HF'in ücretsiz hf-inference sağlayıcısı hangi modelleri
   barındırdığını zamanla değiştiriyor. Düzeltme: `generateImageHF()` artık TEK bir modele
   güvenmiyor, sırayla denenen bir liste (`HF_IMAGE_MODELS`) kullanıyor, "deprecated/not supported"
   hatasında bir sonrakini dener, başka türlü hatada (kötü anahtar, soğuk-başlangıç 503 vb.) hemen
   durur (aynı hata her modelde tekrar edeceği için). Doğru model, HF'in KENDİ genel API'sinden
   canlı sorgulanarak bulundu (`huggingface.co/api/models?pipeline_tag=text-to-image&inference_
   provider=hf-inference` — kimlik doğrulama gerektirmiyor, o an TEK sonuç:
   `stabilityai/stable-diffusion-3-medium-diffusers`), listenin başına o modelle eklendi.

## Verification
Local preview, gerçek admin oturumu, gerçek Groq + Hugging Face anahtarlarıyla (kullanıcı ikisini de
Root panelinden yeniledi/kaydetti bu turda), 4 senaryo GERÇEK API çağrılarıyla test edildi:
- **Serbest sohbet**: "Merhaba! Bugün nasılsın?" → doğal, alakalı bir cevap (asistan kendini tanıttı,
  yeteneklerini özetledi) — `actions`/`unsupported` boş.
- **Hassas veri sınırı**: "Bugünkü siparişlerimin listesini ve müşteri telefon numaralarını göster."
  → erişimi olmadığını nazikçe belirtti, HİÇBİR veri uydurmadı, `unsupported` listesine doğru
  şekilde düştü.
- **Menü düzenleme (mevcut yetenek, regresyon yok)**: "İçeceklerin fiyatını %10 artır." → doğru
  `actions` planı, gerçek hesaplanmış yeni fiyat (`53 → "58.3"`).
- **Görsel oluşturma**: "Bana lezzetli bir pizza/hamburger görseli oluştur." → GERÇEK, yüksek
  kaliteli bir görsel üretildi (229KB+ base64), hem ham API yanıtında hem GERÇEK sohbet arayüzünde
  (`adminAiSend()` → `adminAiImageHTML()`) ekran görüntüsüyle doğrulandı — görsel balonun içinde
  düzgün yuvarlak köşelerle render oluyor.

## Ek — belirli bir menü ürünü için istenen görsel, o ürünün gerçek verisine göre üretiliyor
Kullanıcı: "menü için görsel oluştur dendiğinde içeriği okuyup ona göre görsel oluşturabilsin."
Modele zaten TÜM ürün/kategori verisi prompt içinde veriliyordu (menü-düzenleme yeteneği için) —
ek bir veri kaynağı gerekmedi, sadece sistem promptuna açık bir talimat eklendi: istek belirli bir
ürüne atıfta bulunuyorsa (isimle), modelin verilen Ürünler listesinden o ürünün GERÇEK adını/
açıklamasını/kategorisini bulup `image_prompt`u BUNA göre kurması gerekiyor — jenerik bir görsel
istememesi, ürünün ne olduğunu uydurmaması söylendi. Açıklama boş/jenerikse (bu projenin seed
verisinde tüm ürünlerin açıklaması "Demo ürün açıklaması..." — gerçek bir açıklama değil) sadece
isme göre makul bir tanım kurması istendi.

**Verification**: "Izgara Köfte ürünü için bir görsel oluştur." → üretilen görsel gerçekten
ızgara izli, soslu köfteler gösteriyor (ekran görüntüsüyle doğrulandı) — jenerik bir "yemek
fotoğrafı" değil, isimden doğru çıkarılmış, isabetli bir görsel.

## Files changed
- `backend/server.js` — `getAiConfig()` artık `hf_key` de döndürüyor; yeni `generateImageHF()`
  (model-fallback listesi + doğru router URL'i); sistem promptu serbest-sohbet + görsel-isteği
  destekleyecek + belirli ürün referanslarını gerçek menü verisinden çözecek şekilde yeniden
  yazıldı; `/api/admin/ai-assistant/plan` yanıtına `imageUrl`/`imageError` eklendi.
- `admin.html` — yeni `adminAiImageHTML()` yardımcı fonksiyonu (görsel veya hata mesajını bubble
  içine ekliyor), 2 yeni i18n anahtarı (`admin_ai_hf_not_configured`, `admin_ai_hf_error`).
