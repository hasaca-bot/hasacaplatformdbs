# Phase 71 — Faz A tamamlandı: stüdyo-kalite prompt + "Kendi Görselimi Ekle" + 2 UI düzeltmesi

## Why
Görsel-oluşturma özellik listesinin Faz A'sını (kullanıcı onayıyla, "sen istediğin şekilde yol
haritası çıkar sonra ilerle") uyguladım: stüdyo-kalite fotoğraf prompt'u + kullanıcının kendi
görselini yükleyip bir ürüne atayabilmesi. Kullanıcı "stilimi koru" ve otomatik kalite kontrolünü
(Faz E) plandan çıkarmamı istedi — belirsiz/riskli kısımlar olarak kaldırıldı. Uygulama sırasında
kullanıcı 2 gerçek UI sorunu daha bildirdi (aynı ekran görüntüsü turunda), ikisi de düzeltildi.

## What changed

### Stüdyo-kalite prompt (`backend/server.js`)
Sistem promptu artık modelin SADECE yemeğin/görselin kendisini (malzemeler, sunum) tarif etmesini
istiyor — stüdyo/ışık/kalite talimatları YAZMAMASI söyleniyor, çünkü bunlar artık DETERMİNİSTİK
olarak backend'de ekleniyor: `HF_IMAGE_QUALITY_SUFFIX` (pozitif kalite tanımlayıcıları, her istekte
otomatik ekleniyor) + `HF_IMAGE_NEGATIVE_PROMPT` (bulanıklık/bokeh/plastik yemek görünümü/
deformasyon/düşük çözünürlük/artefakt — `negative_prompt` parametresi olarak gönderiliyor). Modele
her seferinde hatırlatmaya güvenmek yerine kod-seviyesinde garanti edilen bir tutarlılık.

### "Kendi Görselimi Ekle" (`admin.html`)
Composer'a bir ataç ikonu eklendi (gizli bir `<input type="file">`'ı tetikliyor). Dosya seçilince:
`FileReader` ile base64'e çevrilip mevcut `/api/admin/upload-image` endpoint'ine (tenant-scoped,
zaten var olan, dosya-yaz+URL-döndür) yükleniyor, kullanıcı balonunda küçük bir önizleme gösteriliyor,
ardından asistan balonunda "Hangi ürüne ait olduğunu seçin" + ürün seçici + "Bu ürüne ata" butonu
render ediliyor. Atama, AI-üretilen görsellerle AYNI dar `PUT /api/admin/ai-assistant/apply-image`
endpoint'ini kullanıyor (sadece `image` sütunu, tam satır değiştirme riski yok).

## Kullanıcı ekran görüntüsüyle bulunan 2 gerçek UI sorunu

### 1 — "Ürün görseli güncellendi ✓" butonu panel arka planına uymuyordu
Buton `.admin-btn:not(.secondary)` kapsamındaydı, bu da `--ai-accent` (koyu temada beyaz) arka plan
alıyordu — "uygulandı" durumunda sadece metin/kenarlık rengi yeşile dönüyordu ama arka plan beyaz
kalıp panel içinde parlak bir yama gibi duruyordu. Düzeltme: `.ai-apply-img-btn.applied` artık
`background:transparent!important` alıyor — sadece yeşil kenarlıklı/metinli bir rozet gibi, panelle
uyumlu.

### 2 — Ürün seçici native `<select>` kullanıyordu, açılan liste tarayıcı-native görünüyordu
Tarayıcının kendi native `<select>` açılır listesi CSS ile giydirilemiyor (platform kısıtı) —
kullanıcı "yemek seçme kısmında açılan pencereyi siteye uygun tasarla" dedi. Düzeltme: sitenin
ZATEN VAR OLAN `.custom-select-container`/`.custom-select-trigger`/`.custom-select-options` deseni
(kategori filtresi, ürün formu vb. ile birebir aynı, tamamen CSS ile giydirilebilir kendi açılır
listesi) kullanılarak yeniden yazıldı — her yüklenen görsel kendi benzersiz seçici örneğini alıyor
(`aiOwnImgPick_<random>`), dışarı tıklayınca kapanması için ayrı bir document click-outside handler'ı
eklendi (mevcut sabit-ID'li handler'a dokunulmadı, ayrı ve toplu bir `.ai-own-img-select.open`
temizleyicisi eklendi).

## Verification
Local preview, gerçek admin oturumu, sahte bir dosya (`File`/`DataTransfer` API'siyle, gerçek bir
1x1 PNG) ile uçtan uca test edildi:
- Yükleme → önizleme balonu → ürün seçici (artık site-native açılır liste, native değil) → seçim
  değiştirme → "Bu ürüne ata" → "Ürün görseli güncellendi ✓" (artık panelle uyumlu, beyaz yama yok)
  → `window.menuData` yeniden yüklendi ve ürünün `image` alanının GERÇEKTEN güncellendiği
  doğrulandı (iki farklı ürünle, iki ayrı yüklemeyle tekrarlandı).
- Koyu temada ekran görüntüsüyle görsel olarak doğrulandı.
- Font-family değişmedi, konsol hatası yok.

## Kapsam dışı (Faz E, kullanıcı isteğiyle kaldırıldı)
"Stilimi koru" (referans görsellerden stil tutarlılığı) ve otomatik kalite kontrolü/yeniden-üretim —
kullanıcı bunları "belirsiz" bulup plandan çıkardı.

## Files changed
- `backend/server.js` — sistem promptu sadeleştirildi (sadece yemek tanımı), yeni
  `HF_IMAGE_QUALITY_SUFFIX`/`HF_IMAGE_NEGATIVE_PROMPT` sabitleri + `generateImageHF()`'e
  `negative_prompt` parametresi eklendi.
- `admin.html` — composer'a ataç butonu + gizli file input; yeni `adminAiUploadOwnImage()`,
  `adminAiOwnImagePickerHTML()` (custom-select tabanlı), `adminAiToggleOwnImgDropdown()`,
  `adminAiPickOwnImgProduct()`, `adminAiAssignOwnImage()`; `.ai-chat .admin-btn:not(.secondary)`
  kapsamı genişletildi (önceden sadece `.ai-plan-actions`); `.ai-apply-img-btn.applied` arka planı
  şeffaf yapıldı; 6 yeni i18n anahtarı (TR+EN).
