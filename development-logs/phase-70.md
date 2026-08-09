# Phase 70 — ThinkingOrb: gerçek npm paketinin sadık portu + 2 gerçek hata düzeltmesi

## Why
Kullanıcı Faz 69'da verdiği kodun aslında GERÇEK bir npm paketi (`thinking-orbs`, Jakub Antalik,
MIT) olduğunu gösteren bir ekran görüntüsü gönderip "sana attığım animasyonu kullanmamışsın... bu
görseldeki koda göre hepsini yükle" dedi. Araştırma (WebSearch + GitHub kaynak dosyalarını doğrudan
okuma) doğruladı: paketin gerçek motoru, Faz 69'da kullanılan basit "döndürülen elipsler" yaklaşımından
ÇOK daha sofistike — her state kendi 3D nokta-bulutu algoritmasına sahip (working=yörüngeler,
searching=küre+tarama meridyeni, solving=rubik küp çözülmesi, listening=dalga, connecting=takımyıldız
ağı, weaving=3-iplik örgü, composing/breathing=dalgalanan kurdele/halka, shaping=daire→üçgen→kare
morph). Proje bundler/React içermediği için gerçek npm paketi doğrudan import edilemiyor — GitHub'daki
kaynak dosyaları (`src/engine/*.ts`, `src/presets.ts`, `src/ThinkingOrb.tsx`) tek tek okunup TypeScript
tipleri temizlenerek admin.html'e SADIK bir vanilla-JS portu olarak eklendi (aynı matematik, aynı
ayarlanmış preset sayıları).

## What changed

### Sadık motor portu (`admin.html`)
`core.ts` (3D projeksiyon, z-sıralı boyama), `profiles.ts` (yoğunluk profilleri + ölçekleme),
`orbits.ts`/`lattice.ts`/`web.ts`/`braid.ts`/`ribbon.ts`/`morph.ts` (9 state'in tamamının çizim
fonksiyonları), `registry.ts` (mode→çizici eşlemesi), `presets.ts` (state×boyut→ayarlanmış parametre
önbelleği) — hepsi `aiOrb*` önekiyle port edildi (tek-dosya sayfada isim çakışmasını önlemek için).
`ThinkingOrb` sınıfı artık React'in `useEffect` yaşam döngüsünü taklit ediyor (`start()`/`stop()`),
karanlık-mod tespiti sayfanın kendi `html[data-theme]`'ini okuyor (kütüphanenin genel ata-DOM
taramasını portlamaya gerek yoktu, sayfa zaten kendi temasını biliyor). `prefers-reduced-motion` +
sekme-gizliyken-duraklat desteği de korundu.

## Kullanıcı geri bildirimiyle bulunan 2 GERÇEK hata (aynı mesajda)

### 1 — Onay/mesaj sonrası ana panele geri dönme (gerçek, önemli bir hata)
Kullanıcı: "onay veriyoruz ya direk chatten çıkıyor ana panele dönüyor". Kök neden `loadMenuDatabase()`
fonksiyonunun sonunda: `if (window.isStandaloneAdmin) { openAdminLogin(); }` — bu satır KOŞULSUZ
olarak HER `loadMenuDatabase()` çağrısında çalışıyordu (sadece ilk yüklemede değil), ve
`openAdminLogin()` → (oturum geçerliyse) → `openAdminPanel()` → `showAdminView('dashboard')`
ile görünümü HER SEFERİNDE Dashboard'a sıfırlıyordu. `loadMenuDatabase()`'in 7 farklı çağrı yeri var
(ürün kaydet, kategori sil, AI planı uygula, AI görselini ürüne ata, vb.) — hepsi bu hatayı
tetikliyordu, sadece AI Asistanı akışına özel değildi, muhtemelen aylardır var olan bir hataydı.
Düzeltme: yeni bir `__adminInitialAuthGateDone` bayrağı — `openAdminLogin()` artık SADECE gerçek ilk
yüklemede bir kez çağrılıyor, sonraki tüm `loadMenuDatabase()` yenilemeleri görünümü değiştirmiyor.

### 2 — Animasyon boyutu çok büyüktü
Kullanıcı: "yaklaşık 1/4 oranında olsa yeter". Önceki boyut 64px'ti (kütüphanenin "chat-avatar"
boyutu) — kütüphanenin SADECE 2 ayarlanmış boyutu var (64 ve 20, "inline-text" boyutu). Rastgele bir
ölçek yerine kütüphanenin kendi 20px preset'ine geçildi — hem "çok daha küçük" isteğini karşılıyor
hem de gerçek, ayarlanmış bir boyut (rastgele CSS scale değil).

## Verification
Local preview, gerçek admin oturumu:
- 9 state'in TAMAMI hatasız `start()`/`stop()` ediyor (otomatik döngü ile test edildi).
- `adminAiPickOrbState()` (Faz 69'da eklenen, Faz 70'te dokunulmadı) mesaj türüne göre doğru state
  seçmeye devam ediyor — gerçek bir "weaving" (örgü) animasyonu görsel oluşturma isteğinde ekran
  görüntüsüyle YAKALANDI (önceki basit elips yerine gerçek 3-iplik örgü deseni).
- **Hata 1 doğrulaması**: gerçek bir fiyat-düzenleme planı oluşturulup "Onayla ve Uygula"ya
  TIKLANDI (programatik değil, gerçek `computer` tıklaması) — plan "Uygulandı ✓" oldu VE
  `document.getElementById('view-ai-assistant').hidden === false` doğrulandı, ekran görüntüsüyle
  AI Asistanı ekranında kaldığı teyit edildi (önceden Dashboard'a atıyordu).
- Font-family değişmedi, konsol hatası yok (huge port sırasında syntax hatası riski vardı, temiz
  çıktı doğrulandı).

## Kapsam DIŞI bırakılan (aynı mesajda gelen büyük özellik listesi)
Kullanıcı aynı mesajda çok daha büyük bir özellik seti istedi: kendi görsel yükleme + analiz, doğal
dille "hangi ürün" tanıma + çoklu-eşleşme seçimi, toplu görsel oluşturma ("menüyü tamamla"), stil
tutarlılığı (referans görsellerden), kalite kontrolü + otomatik yeniden üretim, stüdyo-kalite negatif
prompt kuralları. Bu, mevcut basit "tek istek → tek görsel" akışından çok daha büyük bir mimari
(vizyon/analiz modeli, çoklu-adımlı onay UI'ı, stil-referans depolama) gerektiriyor — bu turda
KODLANMADI, kullanıcıya ayrı bir plan/öncelik sırası önerilecek.

## Files changed
- `admin.html` — `ThinkingOrb` motoru tamamen değiştirildi (gerçek kütüphane portu, ~500 satır);
  `adminAiStartThinkingOrb()` boyutu 64→20; `loadMenuDatabase()`'e `__adminInitialAuthGateDone`
  bayrağı eklendi (2 çağrı noktası).
