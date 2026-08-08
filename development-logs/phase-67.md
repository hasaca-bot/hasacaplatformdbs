# Phase 67 — Landing nav temizliği, HF API anahtar UI'ı, Root toggle switch hataları, "Ciro"→"Satış"

## Why
Tek bir yoğun turda birden fazla küçük, somut kullanıcı isteği:
1. Landing sayfasının üst menüsünde gereksiz bir "Admin Login" butonu vardı — asıl CTA butonu
   (`navCtaBtn`) zaten oturumu olan ziyaretçiler için otomatik "Giriş Yap"a dönüşüyordu, bu ikinci
   buton fazlaydı.
2. Landing'in iletişim formundaki "Message" textarea'sı tam pill (999px) köşeliydi — büyük/çok
   satırlı kutular için bu tuhaf duruyordu, normal yuvarlak köşe istendi.
3. Hugging Face görsel-oluşturma API anahtarı için root panelindeki "AI Ayarları (Groq)" kartına
   (kullanıcı yanlışlıkla "Grok" dedi, gerçek isim Groq) aynı kart içinde aşağıya yeni bir alan.
4. Ekran görüntüsüyle: aynı karttaki "AI özelliklerini etkinleştir" toggle switch'i metinle
   çakışıyordu ("I özellikleri..." gibi görünüyordu, "A" gizleniyordu).
5. "Sitedeki ciro yazılarını satış ile değiştir, hiç ciro kalmasın."

## What changed

### 1. Landing nav — "Admin Login" kaldırıldı (`landing.html`)
Masaüstü (`.btn.btn-ghost`) ve mobil (`.nav-cta-mobile`) kopyaları + `nav_login` i18n anahtarı
(TR+EN) tamamen silindi. `navCtaBtn`/`navCtaBtnMobile` zaten `updateNavCta()` ile oturum durumuna
göre "Kayıt Ol"↔"Giriş Yap" arasında otomatik geçiş yapıyor (`/api/auth/me` ile doğrulanan
`hasaca_admin_token`) — ikinci statik link artık gereksizdi.

### 2. Büyük metin kutuları artık tam pill değil (`landing.html`)
`.field input,.field textarea{border-radius:999px}` ortak kuralı korundu (tek satırlık input'lar
için hâlâ doğru), yeni `.field textarea{border-radius:var(--radius)}` (22px) eklenerek SADECE
textarea'lar için override edildi.

### 3. Hugging Face API anahtarı — aynı "AI Ayarları" kartına yeni bölüm (`root.html` + backend)
`#aiOverlay` modalına, mevcut Groq alanlarının altına bir ayırıcı çizgiyle yeni bir bölüm:
başlık + açıklama + `#hfKey` (şifre-tipi input, `hf_...` placeholder) + `#hfKeyStatus`. Backend
`ai_key` ile AYNI deseni izliyor — `getPlatform()`/`savePlatform()` üzerinden `platform_settings`
JSON blob'unun içinde saklanıyor (ayrı `.env` YOK, ayrı dosya YOK): `GET /api/root/ai-settings`
artık `hf_key_set:boolean` da döndürüyor (ham anahtar asla), `PUT /api/root/ai-settings` boş
olmayan bir `hf_key` gönderildiğinde kaydediyor (boş bırakılırsa mevcut anahtara dokunmuyor —
`ai_key` ile birebir aynı "sadece doluysa üzerine yaz" mantığı). `GET /platform-settings`'teki
mevcut "ai_key'i asla sızdırma" maskesine `hf_key` de eklendi. Yeni i18n anahtarları
(`root_hf_title/hint/key`, TR+EN).

### 4. Root panelindeki 9 toggle switch — gerçek bir hata bulunup düzeltildi
Kullanıcının ekran görüntüsüyle bildirdiği "AI özelliklerini etkinleştir" toggle'ı metinle
çakışıyordu. Kök neden: `#aiEnabled` inputunda `style="width:auto;"` — panel.css'in pill-switch
kuralı (`input[type=checkbox]:not(.nf-ten){width:42px;height:26px;...}`) satır-içi stil tarafından
eziliyordu (inline her zaman kazanır), checkbox `width:auto`'ya (ölçülen gerçek değer: 24px, height
26px kaldığı için oransız/sıkışık) çöküyordu. Grep ile AYNI hatanın Widget Ayarları bölümündeki 8
sosyal-medya aç/kapa switch'inde de (`wWhatsapp`/`wInstagram`/`wFacebook`/`wTwitter`/`wTiktok`/
`wYoutube`/`wWebsite`/`wMaps`) olduğu bulundu — kullanıcı sadece birini gösterdi ama aynı kök neden
9 yerde de vardı, hepsi düzeltildi (`style="width:auto;"` kaldırıldı, `.nf-ten` — bilerek küçük
checkbox kalması gereken bildirim-hedefi çoklu-seçim listesi — dokunulmadı).

### 5. "Ciro" → "Satış" (tüm site)
Grep ile taranan gerçek örnekler (`admin.html`, `root.html`, `landing.html`, `marketing-data.js` —
`marketing-data.js`'deki gramer ekli türevler [`cironuzdan`→`satışınızdan`, `cironuzu`→
`satışınızı`, `cironuza`→`satışınıza`] Türkçe ünlü uyumuna göre elle düzeltildi, kör bul-değiştir
YAPILMADI): admin panosu istatistik kartı, root panosu + analitik modalı, landing hero mockup'ı +
UI kartı, 45 pazarlama sayfasının ortak veri dosyasındaki 8 gerçek kullanım. `development-logs/`
içindeki GEÇMİŞ faz kayıtlarına (5 dosya) BİLEREK dokunulmadı — bunlar canlı site içeriği değil,
o anki adlandırmayı belgeleyen değişmez geçmiş kayıtlar.

## Verification
Local preview, gerçek oturumlar, hem koyu hem `data-theme="light"`:
- Landing: nav'da tek CTA kaldığı, oturumsuz "Kayıt Ol"/oturumlu "Giriş Yap" geçişinin bozulmadığı
  doğrulandı; Message textarea'sının artık `border-radius:22px` (pill değil) olduğu doğrulandı.
- Root: `#aiOverlay` yeniden açılıp Hugging Face alanının doğru render olduğu, gerçek bir
  `saveAiSettings()` çağrısıyla `hf_key_set:true` döndüğü VE `/platform-settings`'te `hf_key`
  anahtarının hiç görünmediği (`Object.keys` ile) doğrulandı. Sunucu backend değişikliklerini
  görebilsin diye YENİDEN BAŞLATILDI (ilk testte eski kod hâlâ çalışıyordu, restart sonrası düzeldi).
- 9 toggle switch'in hepsi (`getBoundingClientRect` yerine ekran görüntüsüyle) artık düzgün
  42x26px pill olarak, metinle çakışmadan render olduğu doğrulandı.
- `grep` ile repo genelinde (backup/log klasörleri hariç) sıfır kalan canlı "Ciro"/"ciro" metni
  doğrulandı.

## Files changed
- `landing.html` — nav CTA temizliği (markup + i18n), `.field textarea` radius override.
- `root.html` — Hugging Face alanı (markup + JS + i18n), 9 toggle switch'teki `width:auto` hatası,
  "Ciro"→"Satış" (2 yer).
- `backend/routes/root.js` — `hf_key` alanı `ai-settings` GET/PUT'a eklendi, `platform-settings`
  maskesine dahil edildi.
- `admin.html` — "Ciro"→"Satış" (dashboard + analitik kartları, TR+EN, markup fallback dahil).
- `marketing-data.js` — "Ciro"/türevleri → "Satış"/türevleri (8 yer, TR+EN).
