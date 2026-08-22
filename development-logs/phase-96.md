# Faz 96 — AI stok hareketi + reçete yönetebiliyor, TPM daha da inceltildi, model kotası düzeltildi

**Tarih:** 2026-08-21/22
**Commit:** `c538153`

Kullanıcı Faz 95'teki "AI stoğa dokunamaz" kısıtlamasına itiraz etti: "ai yapsın o işi de,
optimize et tpm ye vurmasın." Kısıtlama yeniden gözden geçirildi.

## Stok kısıtlaması gevşetildi — kural yeniden yorumlandı

Faz 95'te "AI stok bakiyesini değiştiremez" kararı vardı. Bu fazla kısıtlayıcıydı; gerçek kural
`operations-data-model-decisions`'da zaten şu: **stok yalnızca stok hareketiyle (append-only
defter) değişir, doğrudan alan güncellemesiyle değil.** AI'ın bir stok hareketi *oluşturması* bu
kurala tam uyuyor — kısıtlanması gereken şey "stok" alanının `ops`/update ile doğrudan
ezilmesiydi, AI'ın hiç yazamaması değil.

Yeni `stock` eylem tipi eklendi: `{ingredient_id, op: in|out|adjust, qty, note}`.
- `in` = giriş, `out` = çıkış, `adjust` = sayım (qty = **yeni toplam** miktar).
- Bakiye ve defter kaydı **aynı istekte** yazılıyor — Faz 92'deki `POST /stock-movements`
  ile birebir aynı kural, AI de bu yoldan geçiyor, ikisini ayıramaz.
- Elde olandan fazla çıkış **planlama aşamasında** reddediliyor; kullanıcı onaylamadan önce
  gerekçeyi görüyor ("stokta 52 kg var, 900 kg çıkış yapılamaz").

## Reçete yazma açıldı

Yeni `recipe` eylem tipi: create/update/delete. Kalemlerdeki (`items[].ingredient_id`) malzeme
id'leri **gerçek malzeme listesine karşı doğrulanıyor** — AI var olmayan bir malzeme uydurursa
`unsupported`'a düşüyor, action üretilmiyor.

## TPM daha da inceltildi — alt-alan ayrımı

Faz 95'te tek bir `wantsOps` bayrağı tetiklendiğinde **beş koleksiyon birden** (malzeme,
tedarikçi, gider, reçete, hatırlatıcı) prompt'a giriyordu. "Stokta ne var?" sorusunda tedarikçi/
gider/hatırlatıcı listeleri boşuna token harcıyordu. Artık her alt-alan (`wIngredients`,
`wSuppliers`, `wExpenses`, `wReminders`, `wRecipes`) ayrı anahtar kelimelerle tetikleniyor ve
yalnızca sorulan koleksiyon sorgulanıp gönderiliyor (reçete soruları malzeme fiyatını da
gerektirdiği için istisna: ikisi birlikte gider). Ölçüm: önceden hep 5 koleksiyon, şimdi
tipik soruda 1 (bazen 2).

## Yol üstünde bulunan iki gerçek hata

**Gemini hata gövdesi dizi dönüyor, kod nesne bekliyordu.** Groq hata gövdesi
`{error:{message}}` şeklinde nesne, Gemini ise `[{error:{message}}]` şeklinde **dizi**
dönüyor. Kod yalnızca nesne biçimini okuduğu için her Gemini hatası log'a kodsuz
(`http_429` gibi) düşüyor, gerçek sebep kayboluyordu. `server.js` ve `root.js`'te iki
yerde (hem `callAiJSON` hem `callAiJSONRoot`, hem de root.js'in ayrı bir hata-gövdesi
okuma noktası) düzeltildi. Bu düzeltme sayesinde ikinci hata ortaya çıktı.

**Varsayılan model yanlış seçilmişti.** `gemini-flash-latest` aslında `gemini-3.7-flash`'e
çözümleniyor ve o modelin ücretsiz katman kotası çok dar (limit 20 istek) — birkaç istekte
doluyor. Doğrudan Gemini API'ye karşı ölçüldü: düz sürümde 8 ardışık istekten sonra 429,
`gemini-flash-lite-latest` ile 8/8 sorunsuz. Varsayılan `gemini-flash-lite-latest` yapıldı;
`DEPRECATED_AI_MODELS` haritası da bu yeni hedefe yönlendirecek şekilde genişletildi
(`gemini-2.5-flash-lite`, `gemini-2.0-flash-lite` girdileri eklendi).

## Doğrulama

Yeni bir test scripti (`test-ai-stock.js`, scratchpad) 12 kontrol içeriyor, hepsi geçti:
- "50 kg domates geldi" → stok 10→60, **deftere de yazıldı** (append-only kayıt doğrulandı).
- "8 kg kullandık" → 60→52.
- "900 kg çıkış yap" → **uygulanmadı**, kullanıcıya gerekçe verildi (güvenlik kuralı çalışıyor).
- "Domates Çorbası reçetesi oluştur, 2 kg domates, 4 porsiyon" → reçete gerçekten oluştu,
  kalem gerçek malzemeye bağlandı, maliyet doğru hesaplandı.
- 8 ardışık Gemini isteği kota hatası vermeden tamamlandı (model değişikliği sonrası).

## Değişen dosyalar

- `backend/server.js` — `aiClassifyIntent` alt-alan ayrımına genişletildi (`ops.ingredients/
  suppliers/expenses/reminders/recipes`), koşullu koleksiyon sorgulama, `stock`/`recipe` eylem
  tipleri (doğrulama + uygulama), hata gövdesi dizi/nesne ayrıştırma düzeltmesi,
  `DEFAULT_AI_MODEL` → `gemini-flash-lite-latest`, genişletilmiş `DEPRECATED_AI_MODELS`.
- `backend/routes/root.js` — aynı hata gövdesi ayrıştırma düzeltmesi (iki nokta), aynı model
  değişikliği.
- `root.html` — model ipucu metni `gemini-flash-lite-latest`'e güncellendi.
