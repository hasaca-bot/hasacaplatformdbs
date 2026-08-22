# Faz 95 — AI çok-sağlayıcı optimizasyonu: TPM sorunu + işletme modülü erişimi

**Tarih:** 2026-08-21
**Commit:** `ea04533`

Kullanıcı: AI Asistanı'nda birkaç mesajdan sonra hakkın dolduğunu bildirdi, AI'ın yeni işletme
ekranlarına (stok/malzeme/tedarikçi/gider/hatırlatıcı) erişemediğini fark etti, varsayılan
modelin şimdilik Gemini olmasını istedi. Üç ayrı kök neden bulundu.

## Kök neden 1 — model Groq'ta kalmıştı

Faz 91'de Gemini anahtarı eklenmişti ama model hiç değiştirilmemişti; `ai_model` hâlâ Groq'un
`openai/gpt-oss-120b`'sine (8.000 token/dakika limit) işaret ediyordu. Varsayılan model
Gemini'ye çevrildi (`DEFAULT_AI_MODEL`, hem `server.js` hem `root.js`).

## Kök neden 2 — `gemini-2.5-flash` çağrılamıyor

Model `/v1beta/openai/models` listesinde görünüyor ve doğrulama çağrısından geçiyor, ama gerçek
sohbet isteğinde **404 "no longer available to new users"** veriyor. Faz 79'daki Groq model
kaldırma olayının aynısı. `gemini-flash-latest` takma adına (sürüm numarası taşımadığı için
eskimeyen) geçildi; `DEPRECATED_AI_MODELS` haritasına `gemini-2.5-flash`/`gemini-1.5-flash`/
`gemini-2.0-flash` → yeni takma ad eşlemeleri eklendi — kayıtlı eski model adı olan kurulumlar
bir sonraki okumada kendiliğinden düzeliyor (bu öz-iyileştirme deseni ilk kez Groq'un
`llama-3.3-70b-versatile` kaldırılışında kurulmuştu).

## Kök neden 3 — tüm menü her mesajda gönderiliyordu

Asıl TPM tüketiminin kaynağı buydu: "merhaba" gibi bir küçük-sohbet mesajında bile tüm
ürün+kategori listesi sistem promptuna gömülüyordu. `aiClassifyIntent()` eklendi — mesaj
metnindeki anahtar kelimelere göre `wantsMenu`/`wantsOps`/`wantsSettings` sınıflandırması yapıp
yalnızca ilgili veri prompt'a dahil ediliyor. `aiIsSmallTalk()` küçük-sohbeti ayırt edip hiçbir
veri yüklemiyor.

Ölçülen kazanç (12 ürünlük test menüsünde, kaba karakter/4 token tahminiyle):

| Mesaj | Önce | Sonra |
|---|---|---|
| "merhaba" | ~2028 token | 0 |
| "stokta ne az?" | ~2028 | ~75 |
| "pizza fiyatını 150 yap" | ~2028 | ~2028 (menü gerekli, aynı) |

## Yol üstünde bulunan iki Gemini tuzağı

**Düşünme-token bütçesi tuzağı.** Gemini'nin iç "düşünme" tokenları `max_tokens`'tan düşülüyor.
`max_tokens: 1024` (Groq'un 8K bütçesi için ayarlanmıştı) ile yanıt **tamamen boş** dönüyordu —
model düşünürken bütçeyi tüketiyordu. 20/1024/2048 token ile üç noktalı manuel deneme bunu
doğruladı (2048'de doğru JSON, altında boş içerik). `maxTokens` artık sağlayıcıya duyarlı:
Gemini 4096 (normal) / 16000 (toplu işlem), Groq eski değerlerinde (1024/4000) kaldı.

## AI'a işletme modülü erişimi

Yeni `ops` eylem tipi: malzeme/tedarikçi/gider/hatırlatıcı okuma + create/update/delete,
alan bazlı beyaz liste ile (`AI_OPS_WHITELIST`). İki güvenlik sınırı bilinçli olarak bırakıldı:
- **Stok bakiyesi** `ops` ile değiştirilemez (whitelist'te `stock_qty` yok) — stok yalnızca
  hareket kaydıyla değişmeli (bkz. `operations-data-model-decisions`). *(Not: bu kısıtlama
  Faz 96'da gevşetildi — bkz. o log.)*
- **Reçeteler** salt okunur bırakıldı (Faz 96'da yazılabilir yapıldı).

## Doğrulama

`test-ai.js` (scratchpad) 7 kontrolden 5'i ilk seferde geçti; kalan 2'si sunucu loglarında
`[AI] Groq error 503` (geçici sağlayıcı yoğunluğu, mantık hatası değil) ile ilişkiliydi.
Ayrı bir doğrulama scriptiyle "tedarikçi ekle" senaryosu izole çalıştırıldı: plan üretildi,
uygulandı, tedarikçi gerçekten oluştu, API ile doğrulandı, temizlendi — uçtan uca yazma yolu
sağlam.

## Değişen dosyalar

- `backend/server.js` — `aiClassifyIntent`, `aiIsSmallTalk`, `AI_OPS_WHITELIST`/`AI_OPS_LABELS`,
  `DEFAULT_AI_MODEL`, genişletilmiş `DEPRECATED_AI_MODELS`, koşullu `opsForPrompt` yükleme,
  `ops` eylem doğrulama + uygulama, sağlayıcıya duyarlı `maxTokens`.
- `backend/routes/root.js` — aynı `DEFAULT_AI_MODEL`/`DEPRECATED_AI_MODELS` (Root'un kendi AI
  sohbet yolu için ayrı ama eşleştirilmiş kopya).
- `root.html` — model ipucu metnindeki `gemini-2.5-flash` referansları güncellendi.
