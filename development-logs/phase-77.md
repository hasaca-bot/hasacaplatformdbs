# Phase 77 — Giriş ekranı açık tema + "Yapay Zeka ile Restoranınızı Oluşturun" self-servis akışı

## Why
İki ayrı istek: (1) `login.html` açık temaya hiç uymuyordu — kullanıcı siteyi açık temaya
çevirip giriş ekranına gittiğinde ekran hâlâ siyah kalıyordu, ayrıca "Kayıt Ol" seçeneği hiç
yoktu. (2) Ana sayfaya "Yapay Zeka ile Restoranınızı Oluşturun" diyen, tıklanınca hesap
oluşturan, kullanıcıyı bir AI sohbetiyle karşılayıp menüsünü/restoranını birlikte kuran bir akış
istendi — bir ödeme sistemi olmadığı için kullanıcı başına bir kota ile sınırlı, "daha sonra
ödeme sistemi ekleriz" dendi. Kullanıcı açıkça "plan oluştur ve bana sormadan ilerle" dedi;
push ise onaya bağlı bırakıldı.

## Yaklaşım
Yeni bir kayıt/tenant-oluşturma mantığı YAZILMADI — mevcut, zaten test edilmiş iki sistem
yeniden kullanıldı:
- **Tenant oluşturma**: `backend/lib/tenantProvisioning.js`'in `createTenantWithDemoContent`
  fonksiyonu zaten Root'un manuel formu VE Google ile kendi-kendine-kayıt akışı (Faz ~50) için
  kullanılıyordu. Yeni akış da AYNI Google Sign-In → `/api/auth/google` →
  `provisionTenantForGoogleAccount` yolunu kullanıyor, üçüncü bir varyant açılmadı.
  Şifre tabanlı yeni bir kayıt formu YOK.
- **AI görüşmesi**: yeni bir chat arayüzü kurulmadı — admin panelindeki mevcut AI Asistanı
  (`/api/admin/ai-assistant/plan`, ürün/kategori düzenleyebiliyor, serbest sohbet destekliyor)
  `?onboarding=1` parametresiyle otomatik açılıyor ve statik bir karşılama mesajıyla
  yönlendiriyor.

## Değişiklikler

### `login.html` (Görev 1)
- `landing_theme` localStorage anahtarı (landing.html/marketing.html ile paylaşılan) senkron
  olarak okunup `html.theme-mono` uygulanıyor — sayfa yüklenmeden önce, tema flaşı olmadan.
  Neredeyse tüm sayfa zaten `--bg`/`--surface`/`--border`/`--text` token'ları üzerinden
  çalıştığı için tek `html.theme-mono{...}` bloğu yeterli oldu; sadece kart camı
  (`rgba(20,20,24,.55)`), marka rozeti ve grid-lines gibi donuk (token'sız) birkaç yer için
  ayrı override eklendi.
- Tema geçiş butonu eklendi (`.theme-switch`, landing.html'deki birebir aynı görsel dil).
- "Restoran / Root Panel" sekmelerinin ALTINA değil, Google butonunun ÜSTÜNE "Hesabınız yok
  mu? Kayıt Ol" satırı eklendi — `/restoran-olustur`'a link veriyor. Sadece "Restoran"
  sekmesinde görünüyor (Root panelinde self-servis kayıt anlamsız, gizleniyor).
- Google butonunun `theme` parametresi (`filled_black`/`outline`) artık aktif temaya göre
  seçiliyor ve tema değiştiğinde yeniden render ediliyor (Google'ın butonu kendi iframe'i,
  konteynerin teması değişince otomatik boyanmıyor).

### `restoran-olustur.html` (yeni dosya, Görev 2)
- login.html'in görsel dilini (kart, ambient blob'lar, tema sistemi) birebir taşıyan, ama
  kullanıcı adı/şifre formu OLMAYAN yeni bir sayfa — tek CTA: Google ile Kayıt Ol.
  3 madde halinde ne olacağını anlatan kısa bir tanıtım + KVKK/Kullanım Şartları onay metni var.
  Başarılı girişte `/admin?tenant=<slug>&onboarding=1`'e yönlendiriyor (`d.provisioned`
  true ise `onboarding=1` ekleniyor, mevcut hesap tekrar giriş yapıyorsa eklenmiyor).
- `_redirects`'e `/restoran-olustur` ve `/ai-ile-baslayin` (takma ad) satırları eklendi.
- **Gerçek bir hata bulundu**: `_redirects` sadece PRODUCTION'da (Netlify) devreye giriyor —
  yerel geliştirmede (ve doğrudan Render isteklerinde) `backend/server.js`'in KENDİ
  `app.get(['/login',...])` gibi route'ları çalışıyor. `/restoran-olustur` için böyle bir route
  eklemeden önce, tıklama testinde sayfa "Restoran Bulunamadı" hatası verdi (tenant-resolver
  path'i yakalıyordu). `server.js`'e `/login`'in hemen altına eşdeğer bir
  `app.get(['/restoran-olustur','/ai-ile-baslayin'], ...)` route'u eklenerek düzeltildi.

### `backend/server.js` (Görev 2 — kota)
- `AI_ONBOARDING_QUOTA_LIMIT = 30` sabiti eklendi.
- `provisionTenantForGoogleAccount()` artık `createTenantWithDemoContent`'in dönüş değerini
  kullanıp `settings.ai_quota = {limit:30, used:0}` ile bir UPDATE yapıyor — SADECE self-servis
  (Google) kayıtlarda. Root'un manuel oluşturduğu tenant'larda bu alan hiç yok, dolayısıyla
  sınırsız kalıyorlar (davranış değişmedi). Migration YOK — `settings` zaten JSON blob.
- `POST /api/admin/ai-assistant/plan`'a kota kapısı eklendi: Groq çağrısından ÖNCE
  `tenants.settings.ai_quota` kontrol ediliyor, `used >= limit` ise 429
  `{error:'ai_quota_exceeded', quota}` dönüyor (Groq'a hiç gitmiyor). Gerçek bir Groq çağrısı
  BAŞARILI olduğunda `used` +1 artırılıp veritabanına yazılıyor. Yanıtlara her zaman
  `quota:{limit,used,remaining}` (veya kota yoksa `null`) ekleniyor.

### `admin.html` (Görev 2 — onboarding + kota UI)
- `openAdminPanel()` artık `?onboarding=1`'i okuyor; varsa varsayılan Dashboard yerine
  doğrudan AI Asistanı görünümüne geçiyor, statik bir karşılama mesajı ekliyor
  (`adminAiShowOnboardingWelcome()` — GERÇEK bir Groq çağrısı yapmıyor, kota harcamıyor) ve
  URL'den `onboarding=1`'i temizliyor (yenilemede tekrar oynamasın diye).
- AI sohbet başlığına kota rozeti eklendi (`#aAiQuotaBadge`, "X/Y mesaj kaldı") —
  `data.quota` null ise hiç görünmüyor (kotasız tenant'larda hiçbir değişiklik yok).
  Kalan mesaj ≤5 olunca kırmızı vurgulanıyor.
- Kota dolduğunda backend'in 429'u özel, nazik bir Türkçe/İngilizce mesajla gösteriliyor
  ("Ücretsiz deneme mesaj hakkınız doldu... yakında ödeme sistemi eklenecek") — genel hata
  mesajı yerine.

### `landing.html` (Görev 2 — CTA)
- Trust (sayaçlar) ile Showcase arasına yeni bir bölüm: hero/stats ile aynı yuvarlak-panel
  görsel dilinde (28px radius, gradyan zemin), sol tarafta başlık+açıklama+CTA butonu
  (`/restoran-olustur`'a link), sağ tarafta CSS ile çizilmiş 3 baloncuklu sahte bir sohbet
  önizlemesi (ne olacağını göstermek için, gerçek işlevsellik yok). Mobilde sohbet önizlemesi
  metnin üstüne geçiyor.

## Verification
- **login.html**: koyu/açık tema geçişi + kalıcılığı (localStorage), Root/Restoran sekmesinde
  "Kayıt Ol" görünürlüğü, mobil taşma — hepsi gerçek DOM etkileşimiyle doğrulandı.
- **restoran-olustur.html**: GOOGLE_CLIENT_ID varken buton gerçekten render oluyor (yerelde
  zaten yapılandırılmış), tema geçişi, mobil.
- **Kota sistemi**: gerçek bir Groq çağrısıyla uçtan uca test edildi — `default` tenant'a
  geçici `ai_quota:{limit:3,used:2}` verilip (test sonrası geri alındı) admin panelinden gerçek
  bir mesaj gönderildi: rozet "0/3 mesaj kaldı" (kırmızı) oldu, bir sonraki mesaj Groq'a hiç
  gitmeden 429 + nazik hata mesajıyla reddedildi.
- **Onboarding**: geçerli bir token ile `/admin?tenant=default&onboarding=1` açılıp panelin
  doğrudan AI Asistanı görünümünde, karşılama mesajıyla açıldığı ve URL'nin temizlendiği
  doğrulandı.
- **Uçtan uca link döngüsü**: Ana Sayfa CTA → `/restoran-olustur` → "Giriş Yapın" →
  `/login` → "Kayıt Ol" → `/restoran-olustur` — gerçek tıklamalarla test edildi.
- **Gerçek hata + düzeltme**: `/restoran-olustur` yerelde 404/"tenant bulunamadı" veriyordu
  (yalnızca `_redirects` eklenmişti, `server.js`'e route eklenmemişti) — düzeltildi, doğrulandı.
- Konsol/backend log hatası yok (temiz bir sekmede doğrulandı — eski test oturumundan kalan
  401/429 girdileri karıştırılmadı).

## Kapsam dışı (bilinçli)
- Ödeme sistemi (kullanıcı "daha sonra ayarlarız" dedi).
- Şifre tabanlı yeni bir kayıt formu — sadece Google.
- Kota rozetinin sayfa yüklenirken (ilk mesajdan önce) önceden doldurulması — sadece ilk
  mesajdan sonra görünüyor; bunun için yeni bir public "kota sorgula" endpoint'i açmak
  gerekiyordu, kapsam dışı bırakıldı.

## Files changed
- `login.html` — açık tema desteği + "Kayıt Ol" satırı.
- `restoran-olustur.html` — yeni dosya.
- `_redirects` — `/restoran-olustur`, `/ai-ile-baslayin` satırları.
- `backend/server.js` — `/restoran-olustur` route'u, `AI_ONBOARDING_QUOTA_LIMIT`,
  `provisionTenantForGoogleAccount` kota ataması, `/api/admin/ai-assistant/plan` kota kapısı.
- `admin.html` — onboarding modu, kota rozeti, kota-doldu hata mesajı, ilgili i18n anahtarları.
- `landing.html` — yeni AI CTA bölümü + i18n anahtarları.

## Push
Kullanıcının "pushlama ben diyene kadar" talimatı hâlâ geçerli — hiçbir şey commit/push
edilmedi, hepsi yerelde doğrulanmış durumda bekliyor.
