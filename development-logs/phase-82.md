# Phase 82 — HASACA → tada marka geçişi, AI asistan genişletmesi, canlı domain + robots.txt hatası

## Why
Bu faz iki ayrı isteği kapsıyor: (1) platformun adının HASACA'dan tada'ya değişmesi (metin + logo,
sitenin tamamında) ve AI asistanın hem daha kullanışlı (bağlam hafızası, daktilo efekti) hem de daha
yetenekli (yeni "setting" action tipi) hale getirilmesi; (2) kullanıcının canlı Netlify adresini
`tadadigital.netlify.app` yapmasının ardından Google Search Console kurulumu sırasında ortaya çıkan,
sitenin tamamının indekslenmesini engelleyen gerçek bir production hatası.

## 1) tada marka geçişi
"HASACA"/"HASACA Platform" geçen her görünür metin küçük harfle "tada" yapıldı (4 shell sayfa +
`marketing.html` + 45 `pages/*.html`). Kod-seviyesi kimlikler (localStorage anahtarları
`hasaca_admin_token` vb., `hasaca.com`/`hasaca-api.onrender.com` altyapı URL'leri, `HasacaGallery`
JS global'i, `neden-hasaca` slug'ı) bilinçli olarak DEĞİŞTİRİLMEDİ — hiçbiri "HASACA" string'ine
bitişik bir davranışa bağlı değildi, sadece görünür metin/logo kapsamı hedeflendi.

Yeni logo (kullanıcının sağladığı chef-hat görseli): Python/PIL+numpy ile kenardan flood-fill'e
dayalı arka plan temizleme (iç kısımdaki beyaz kıvrım çizgileri korunarak, sadece kenara bağlı beyaz
bölge şeffaflaştırıldı) → `assets/tada-logo.png` + `icons/tada-logo*.png` + yeni `favicon.ico`/
`favicon.svg`. AI asistan ikonu ayrıca kullanıcının sağladığı `bard.png` (Gemini-tarzı gradyan
yıldız) ile değiştirildi — `assets/ai-logo.png`/`icons/ai-logo.png`, admin.html sidebar + boş-sohbet
ekranı.

## 2) AI asistan geliştirmeleri (`backend/server.js`, `admin.html`)
- **Yeni "setting" action tipi:** whitelist'li restoran ayarları (ad/telefon/e-posta/adres/whatsapp,
  hero başlık+alt başlık TR/EN, banner metni, footer metni, tema, SEO başlık/açıklama/anahtar
  kelime) artık doğal dille düzenlenebiliyor — onay öncesi plan kartında `⚙ alan: eski → yeni`
  gösteriliyor. Müşteri verisi/ödeme/API anahtarı/başka tenant verisi kasıtlı olarak dışarıda
  bırakıldı (kullanıcı onayıyla).
- **Bağlam hafızası:** `/api/admin/ai-assistant/plan` artık son 8 mesajlık konuşma geçmişini alıyor
  (`callAiJSON`'a `history` parametresi eklendi) — önceden her istek tamamen state'siz gidiyordu,
  bu "sanki bağlamdan kopuk" şikayetinin gerçek kök nedeniydi.
- **Daktilo efekti:** `adminAiTypeInto()` — cevaplar artık soldan sağa harfle yazılıyor
  (`prefers-reduced-motion` destekli).
- **TPM optimizasyonu:** sistem promptu aynı kuralları koruyarak sıkıştırıldı; yeni "setting"
  verisi sadece boş-olmayan alanları gönderiyor.
- **Toplu görsel oluşturma tetikleyicisi genişletildi:** `adminAiIsCompleteMenuCommand()` artık
  "tüm/bütün/hepsi + görsel + oluştur" kalıbını da yakalıyor (önceden sadece "eksik...tamamla").

## 3) Admin "Ayarlar" birleştirmesi
8 ayrı sidebar öğesi (Restoran Bilgileri, Marka, Masa Yönetimi, Masa Kartı Tasarla, Website
Editörü, Widget Ayarları, Siteyi Görüntüle, Tehlikeli Bölge) profil menüsünden açılan tek bir
`#view-settings` ekranında (sol iç-menü + sağ içerik) birleştirildi. Panellerin kendi
kaydetme/lazy-load mantığı korunarak sadece DOM'da taşındı.

## 4) Canlı domain düzeltmesi + kritik robots.txt hatası

Kullanıcı Netlify site adını `tadadigital.netlify.app` yaptı (eski: `hasacaplatform.netlify.app`).
Kod tabanında bu domain 3 yerde sabitti: `landing.html`/`marketing.html`'in canonical/OG/JSON-LD
etiketleri, `backend/server.js`'teki `PUBLIC_SITE_URL` sabiti, `backend/scripts/
prerender-marketing.js`'in varsayılan `BASE_URL`'i. Üçü de güncellendi, script yeniden çalıştırılıp
45 `pages/*.html` yeni domainle yeniden üretildi.

**Bulunan kritik hata (Search Console URL Denetimi ile canlı tespit edildi):** `_redirects`
`/robots.txt`'i Render'a proxy'liyordu (`https://hasaca-api.onrender.com/robots.txt`). Render'ın
ücretsiz planı boştayken uyuyor; Googlebot tam bu anda robots.txt'yi çekmeye çalışınca istek zaman
aşımına uğradı. Google'ın robots.txt spesifikasyonu gereği davranışı: robots.txt'ye ulaşılamazsa
GÜVENLİ TARAF seçilir ve sitenin TAMAMI taranmaz — tek bir sayfa değil, bütün domain "Robots.txt
tarafından engellendi" hâline düştü (Search Console'da doğrudan gözlemlendi: "Dizine ekleme isteği
reddedildi" → "Sayfa taranamıyor: Robots.txt tarafından engellendi").

**Çözüm:** `/robots.txt` artık Render'a hiç uğramıyor — repo kökündeki statik `robots.txt` dosyası
doğrudan Netlify'den (anında, hep ayakta) sunuluyor; içine doğru domain ile `Sitemap:` satırı
eklendi. Bu route'un tenant-özel `seo_robots` mantığı bu paylaşılan marketing domain'inde zaten
anlamlı biçimde çalışamıyordu (bare host isteğinde tenant context yok) — kaybedilen bir şey olmadı.
Tenant'ların KENDİ özel domain'leri zaten doğrudan Render'a gidiyor (Netlify'ye hiç uğramıyor),
dolayısıyla onların dinamik robots.txt'si bu değişiklikten etkilenmedi. `/sitemap.xml` proxy'si
BİLEREK korundu — sitemap fetch hatasının etkisi (Search Console'un sonra tekrar denemesi) tüm
siteyi bloke eden robots.txt hatasıyla kıyaslanamayacak kadar küçük.

**Mobil render hatası (kullanıcı ekran görüntüsüyle bildirdi):** yüzen "tada" nav pili
(`position:fixed` + `backdrop-filter:blur(12px)`) Android Chrome'da scroll sırasında altındaki
içeriği tam repaint etmiyor, geride bulanık bir iz bırakıyordu. `.nav-in`'e
`transform:translateZ(0)` + `will-change:transform` + `isolation:isolate` eklenerek kendi GPU
katmanına alındı, scroll'daki içerikten izole edildi.

## 5) AI asistanı canlıda tamamen kırıktı — Groq model deprecation'ı (aynı fazın devamı)

Kullanıcı canlıda AI Asistanı'na her mesaj attığında `"The model 'llama-3.3-70b-versatile' does not
exist or you do not have access to it."` hatası aldığını bildirdi. Araştırma (Groq'un resmi
deprecation sayfası): Groq bu modeli **17 Ağustos 2026'da tam bu turun ortasında** kaldırdı (aynı
gün `llama-3.1-8b-instant`'ı da kaldırdı), önerilen yerine geçen: `openai/gpt-oss-120b` (birincil,
131K context, structured output destekli) / `openai/gpt-oss-20b` (küçük model için).

Model adı 3 yerde sabitti (`backend/db.js` seed, `backend/server.js` `DEFAULT_AI_MODEL`,
`backend/routes/root.js`'ın kendi ayrı kopyası) — üçü de `openai/gpt-oss-120b`'ye güncellendi.
Asıl kritik kısım: canlı `platform_settings` satırında ZATEN kaydedilmiş eski model adı vardı —
sadece varsayılanı değiştirmek bu satırı düzeltmezdi (`cleanAiModel(s.ai_model) || DEFAULT` mantığı
dolu bir stored değeri hep tercih ediyor). Bunun yerine mevcut "eski Gemini adlarını temizle" deseni
(`cleanAiModel`) genişletildi — artık bilinen deprecated Groq model adlarını yeni karşılıklarına
haritalıyor (`DEPRECATED_AI_MODELS` map'i, server.js + root.js'te ayrı ayrı). Bu sayede tek bir kod
deploy'u, elle DB düzeltmesi gerekmeden, üretimdeki bozuk kaydı da otomatik onarıyor.

## Verification
- tada logosu: flood-fill arka plan temizleme sonucu doğrulandı (iç kıvrım çizgileri korundu,
  sadece kenar-bağlı beyaz bölge şeffaflaştı); siyah-beyaz temada renk değişmediği teyit edildi.
- AI "setting" action'ı: sözdizimi (`node -c`), DB yaz/oku/geri-al bağımsız script ile, frontend
  plan-kartı render'ı gerçek fonksiyon çağrısıyla doğrulandı. Gerçek Groq/HF anahtarıyla uçtan uca
  test EDİLEMEDİ (yerelde anahtar yok) — sadece boru hattı doğrulandı.
- Domain düzeltmesi: canlıda `curl` ile `robots.txt`/`sitemap.xml` doğru domaini ve 47 URL'i
  gösterdiği, eski domain'den hiç iz kalmadığı teyit edildi.
- robots.txt statik dosya: Render deploy sonrası canlıda `curl` ile 200 + doğru `Sitemap:` satırı
  doğrulandı.
- Mobil nav fix: `getComputedStyle` ile `transform`/`will-change`/`isolation` uygulandığı, 375px'te
  yatay taşma olmadığı doğrulandı. GPU compositor hatası cihaza özgü olduğundan bu ortamda birebir
  tekrarlanamadı — kullanıcının gerçek cihazında doğrulaması gerekiyor.

## Files changed
`admin.html`, `landing.html`, `marketing.html`, `login.html`, `root.html`, `index.html`,
`restoran-olustur.html`, `public.css`, `backend/db.js`, `backend/server.js`,
`backend/masterTemplate.js`, `backend/lib/marketingSeo.js`, `backend/lib/tenantSeo.js`,
`backend/scripts/prerender-marketing.js`, `marketing-data.js`, 45 `pages/*.html`, `robots.txt`,
`_redirects`, `favicon.ico`, `icons/favicon.svg`, yeni: `assets/tada-logo.png`,
`assets/ai-logo.png`, `icons/tada-logo*.png`, `icons/ai-logo.png`, `icons/tada-favicon.png`.

## Push
tada rebrand + AI geliştirmeleri: pushlandı (`f3a9279`). Mobil nav fix: pushlandı (`489c311`).
robots.txt statik dosya düzeltmesi: bu commit ile pushlanıyor.
