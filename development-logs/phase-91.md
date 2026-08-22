# Faz 91 — Root panel: ayrı Gemini API anahtarı alanı

**Tarih:** 2026-08-22
**Talep:** "gemini api key ekleme kısmı ekle root paneldeki ai ayarları na"

## Öncesi: tek anahtar, sağlayıcıya göre "doğru olması gereken" bir alan

AI sistemi zaten çok-sağlayıcılıydı (Groq + Gemini, sağlayıcı model adından belirleniyor —
`gemini*` → Google ucu, aksi halde Groq). Ama Root panelinde **tek bir** "API Anahtarı" alanı
vardı ve kodun kendi yorumu şöyleydi: *"Anahtar seçtiğiniz sağlayıcıya ait olmalı."* Yani Gemini'ye
geçmek isteyen biri, model adını değiştirdikten sonra anahtarı da elle değiştirmeyi unutursa,
Groq anahtarı Google'ın ucuna gidip sessizce başarısız oluyordu — iki sağlayıcıyı aynı anda
saklamanın bir yolu yoktu.

## Yapılan değişiklik

**Veri modeli:** `platform_settings.settings.ai_key` (Groq, dokunulmadı) yanına `ai_key_gemini`
eklendi — ikisi de aynı anda saklanabiliyor. Hangisinin kullanılacağı hâlâ modelin adından otomatik
seçiliyor, ama artık admin'in elle anahtar değiştirmesi gerekmiyor.

**Backend** (`backend/server.js`, `backend/routes/root.js`):
- Yeni `aiKeyFor(cfg)` yardımcı fonksiyonu (iki dosyada da, mevcut `aiIsGemini`/`aiChatUrl` ikiz
  fonksiyon deseniyle tutarlı) — modele göre doğru anahtarı döndürür.
- `getAiConfig()`, `GET/PUT /api/root/ai-settings`, `/ai-settings/test`, root'un kendi AI asistan
  sohbeti (`/ai-assistant/plan`) hepsi güncellendi.
- `GET /api/root/platform-settings`'teki "anahtarı asla sızdırma" maskesine `ai_key_gemini` de
  eklendi.
- Kaydetme mantığı bağımsız: Gemini anahtarı girilip kaydedilince Groq anahtarı silinmiyor
  (ve tersi) — her ikisi de yalnızca dolu gönderildiğinde üzerine yazılıyor.

**Root panel arayüzü** (`root.html`): tek alan ikiye ayrıldı — "Groq API Anahtarı" ve
"Gemini API Anahtarı", her birinin kendi durum satırı (ayarlı/ayarlı değil) ve kendi **"Bağlantıyı
Test Et"** butonu var. Test, o an kutuya yazılmış (henüz kaydedilmemiş) değeri test eder; kutu
boşsa sunucudaki kayıtlı anahtarı test eder — hangi sağlayıcıya ait olduğunu `provider` parametresi
belirtir, "Varsayılan Model" alanına ne yazıldığından bağımsız çalışır.

## Doğrulama (localhost:12999, root paneli)

- Modal açıldığında iki ayrı alan, iki ayrı durum metni görünüyor; kayıtlı gerçek Groq anahtarı
  "Anahtar ayarlı ✓" gösteriyor, Gemini "Henüz anahtar ayarlanmadı" gösteriyor (doğru başlangıç).
- Sahte bir Gemini anahtarı girilip kaydedildi → `GET /ai-settings` hem `key_set:true` hem
  `gemini_key_set:true` döndü — **Groq anahtarı silinmedi**.
- Anahtar seçim mantığı iki yönde de test edildi: `provider:'gemini'` + boş `ai_key` → kayıtlı
  (sahte) Gemini anahtarını Google'ın ucuna gönderdi, Google "Please pass a valid API key" dedi
  (yani doğru anahtar doğru uca gitti, sadece sahte olduğu için reddedildi). `provider:'groq'` +
  boş `ai_key` → kayıtlı **gerçek** Groq anahtarını kullandı, `{ok:true}` döndü.
- Arayüzdeki iki "Test Et" butonu gerçek tıklamayla denendi: Groq → "Bağlantı başarılı ✓", Gemini →
  "Bağlantı başarısız: Please pass a valid API key" — ikisi bağımsız ve doğru çalışıyor.
- Test verisi (sahte Gemini anahtarı) temizlendi.
- Sayfada başarısız istek yok (`performance.getEntriesByType('resource')` ile bu sayfa
  yüklemesine özel doğrulandı).
