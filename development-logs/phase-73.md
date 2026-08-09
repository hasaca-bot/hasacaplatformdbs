# Phase 73 — 2 gerçek görsel-oluşturma sorunu düzeltildi: gövdeye yazı yazma + küçük boyut

## Why
Kullanıcı canlı kullanırken 2 gerçek sorun bildirdi:
1. Üretilen görselin İÇİNE yazı/metin render oluyordu (yemeğin adı/açıklaması gibi) — istenmeyen,
   sadece yemeğin fotoğrafı olması gerekiyordu.
2. Sohbetteki ürün görseli çok küçük görünüyordu, "kocaman" (büyük) görünmesi isteniyordu.

## What changed

### Görsele metin gömülmesi — daha güçlü negatif/pozitif prompt (`backend/server.js`)
Bu, difüzyon modellerinde bilinen bir hata modu — modern SD checkpoint'leri, prompt'ta menü/etiket
kavramına yakın herhangi bir şey olduğunda okunaklı metin render etmeye oldukça meyilli. Önceki
negatif prompt'ta sadece tek kelime "text" vardı — yetersiz kaldı. Güçlendirilenler:
- `HF_IMAGE_NEGATIVE_PROMPT`: "text" tek kelime yerine kapsamlı bir liste — words, letters, writing,
  typography, font, caption, label, title, menu card, signage, sign, subtitle vb.
- `HF_IMAGE_QUALITY_SUFFIX`: artık POZİTİF bir karşı-talimat da içeriyor ("plain photograph only, no
  text, no writing, no words, no letters, no labels, no captions...") — bazı ücretsiz hf-inference
  pipeline'ları `negative_prompt` parametresini zayıf ağırlıklandırıyor, pozitif prompttaki açık bir
  "sadece düz fotoğraf" talimatı ek bir güvence sağlıyor.

### Görsel boyutu büyütüldü (`admin.html`)
`adminAiImageHTML()`'deki `<img>` etiketi `max-width:100%` (belirsiz/küçük sonuçlanabiliyordu) yerine
artık `width:100%; max-width:360px; aspect-ratio:1; object-fit:cover;` kullanıyor — net, büyük,
kare bir ürün fotoğrafı görünümü, balonun kendisini de doğal olarak genişletiyor.

## Verification
Local preview, gerçek admin oturumu, gerçek Hugging Face anahtarıyla: "Margherita Pizza için bir
görsel oluştur" → üretilen görsel ekran görüntüsüyle doğrulandı — büyük, net, İÇİNDE HİÇ YAZI/ETİKET
OLMAYAN bir margherita pizza fotoğrafı (mozzarella, domates sosu, fesleğen, odun ateşinde pişmiş
kabuk — önceki turlarda doğrulanan isim-doğruluğu regresyon olmadan korunuyor).

## Files changed
- `backend/server.js` — `HF_IMAGE_QUALITY_SUFFIX`/`HF_IMAGE_NEGATIVE_PROMPT` genişletildi.
- `admin.html` — `adminAiImageHTML()`'deki `<img>` boyutlandırması büyütüldü.
