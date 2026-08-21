# Faz 87 — admin.html bölündü: 12.127 satır → 1.692 satır

**Tarih:** 2026-08-22
**Görev:** #21 (yapılacaklar listesinde bekleyen "admin.html'i ayrı CSS/JS dosyalarına böl")

## Neden

Admin panelinin görsel yenilemesine başlamadan önce yapıldı. Tek dosyada 12.127 satır varken her
küçük tasarım değişikliği bütün dosyayı okumayı gerektiriyordu; CSS/JS/HTML iç içe olduğu için de
bir yeri değiştirirken ilgisiz bir kuralı veya `onclick` fonksiyonunu bozma riski yüksekti. Bölme
işi bilerek **tasarım değişikliğinden ÖNCE** ve **tamamen mekanik** yapıldı ki ileride bir hata
çıkarsa "bölmeden mi geldi, tasarımdan mı" karışıklığı yaşanmasın.

## Temel prensip: hiçbir kod satırı değiştirilmedi

Kesimler **yalnızca mevcut `<style>` / `<script>` etiket sınırlarından** yapıldı. Kod içinde yeni
sınır icat edilmedi, hiçbir satır yeniden yazılmadı, sıralama değiştirilmedi.

## Yeni dosyalar

| Dosya | Satır | İçerik |
|---|---|---|
| `admin.css` | 3.409 | 4 ayrı `<style>` bloğu, **belge sırasıyla** birleştirildi |
| `admin.js` | 6.497 | Panelin ana mantığı (auth, tema, görünümler, ürünler, siparişler, AI) |
| `admin-tables.js` | 325 | QR masa yönetimi + masa sipariş kontrolü |
| `admin-card-designer.js` | 220 | Masa kartı tasarım galerisi arayüzü |
| `admin.html` | **1.692** | Sadece yapı (eskiden 12.127) |

## Bölmeden önce doğrulanan riskler

- **Sunucu tarafı şablon yok:** `admin.html` `res.sendFile()` ile düz statik dosya olarak
  gönderiliyor — `index.html`'deki gibi `<!--HEAD-->` yer tutucusu YOK. Korunacak bir şey yoktu.
- **CSS'te göreli yol yok:** Taşınan CSS'teki tek iki `url(...)` değeri kök-göreli
  (`/fonts/...`) ve tam mutlak (Unsplash). CSS'te göreli yollar **stil dosyasının** konumuna göre
  çözülür, dolayısıyla dosya taşınınca kırılabilirdi — kontrol edildi, ikisi de güvenli.
- **`document.currentScript` kullanılmıyor** (0 sonuç) — harici dosyaya taşınınca bozulacak bir
  şey yok.
- **Tek giriş noktası:** Bütün başlatma `DOMContentLoaded` → `initializeApp` üzerinden; ayrıştırma
  anında DOM'a dokunan üst düzey kod yok.
- **Servis çalışanı önbelleklemiyor** (`service-worker.js` sadece bildirim için) — bayat dosya riski yok.

## Sıralama neden korundu (önemli)

- **CSS:** 4 blok tek dosyada birleştirildi çünkü cascade **yalnızca kural sırasına** bağlı;
  bloklar arasına başka stil sayfası girmiyor (tek harici CSS Google Fonts, o da sadece
  `@font-face`). Gövde içindeki 2 blok (siparişler `--ord-*`, masa `--tbl-*`) head'e taşındı ama
  **kendi aralarındaki sıra** birebir aynı kaldığı için sonuç değişmedi.
- **JS:** 3 blok **birleştirilMEdi** ve etiketleri **aynı belge konumunda** bırakıldı. Sebep:
  3. blok, kendisinden hemen önce yüklenen `/card-gallery.js`'e bağımlı — birleştirilseydi bu sıra
  bozulurdu.

## Doğrulama

**1. İçerik bütünlüğü (betikle kanıtlandı):** Orijinal `admin.html` git'ten çekilip her blok
yeni dosyadaki haliyle karşılaştırıldı — 7 bloğun tamamı **birebir** eşleşti (tek bilinçli fark:
gövde içindeki 38 satırlık CSS bloğunun 10 boşluk girintisi silindi, salt biçimsel). CSS
bloklarının dosya içindeki sırasının da belge sırasıyla aynı olduğu ayrıca doğrulandı. Dokunulmayan
HTML gövde parçaları da (6 aralık) birebir korundu.

**2. Sözdizimi:** `node -c` üç JS dosyası için de temiz.

**3. Tarayıcı (localhost:12999/admin):**
- Dört yeni dosyanın dördü de `200 OK` yükleniyor; yükleme sırası korunmuş
  (`admin.js` → `admin-tables.js` → `card-gallery.js` → `admin-card-designer.js`).
- CSS gerçekten uygulanıyor (sidebar 252px / flex), `--ord-*` ve `--tbl-*` değişkenleri tanımlı,
  `.admin-orders-header` kuralı birebir çalışıyor (`flex` / `space-between`).
- Üç dosyadaki global fonksiyonların hepsi çözülüyor (`showAdminView`, `apSetTheme`, `adminT`,
  `loadTables`, `cdInit`, `HasacaGallery`).
- **Gerçek tıklamayla** 7 menü butonunun tamamı test edildi: doğru ekran açılıyor, doğru başlık
  yazılıyor, `active` vurgusu doğru geçiyor. Bu, HTML'deki satır-içi `onclick=` yazımlarının artık
  harici dosyadaki fonksiyonlara doğru bağlandığını kanıtlıyor.
- Tema geçişi çalışıyor: `light` → `--ap-bg:#f4f5f7`, `dark` → `--ap-bg:#0a0a0b`, `system` → OS'a
  göre çözülüyor.
- Masa kartı galerisi çalışıyor (11 tasarım yüklendi, `cdInit()` hatasız).
- **JS hatası yok.** Tek başarısız istek `/api/site-config` — tenant parametresiz çağrıldığında
  404 dönen, yerel geliştirmeye özgü, önceden beri var olan bir davranış (curl ile doğrulandı:
  parametresiz 404, `?tenant=default` ile 200). Backend'e hiç dokunulmadı, JS içeriği birebir aynı.

## Geri alma

Tek komut: `git revert <commit>`. Ayrıca bölme öncesi hâli `862fde7`'de duruyor.

## Not — bilinçli olarak YAPILMAYANLAR

`admin.js` hâlâ 6.497 satır. İçinde net bölüm başlıkları var (tema, rezervasyon, giriş, görünüm
geçişi, dashboard, ThinkingOrb, AI asistanı, ayarlar, siparişler, kategoriler) ve ileride bunlar
da ayrılabilir. Bu turda **kasıtlı olarak yapılmadı**: kod içinde yeni kesim sınırı icat etmek,
mevcut etiket sınırlarından kesmeye göre belirgin şekilde daha riskli. Asıl kazanç (HTML'in
1.692 satıra inmesi ve CSS'in tamamen ayrılması) zaten elde edildi; tasarım çalışması için gereken
buydu.
