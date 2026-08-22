# Faz 90 — Auth bugları: iki kök neden bulundu (#1 ve #2)

**Tarih:** 2026-08-22
**Görevler:** #1 (root→tenant girişi login'e atıyor) ve #2 (Google ile admin panele girilemiyor)

Bu iki hata aylardır "yerelde tekrar üretilemedi" diye açık duruyordu. Bu turda **kod incelemesiyle
iki ayrı, somut kök neden** bulundu. İkisi de canlıya özgü koşullarda ortaya çıktığı için yerel
testlerde hiç görünmemesi beklenen davranış.

---

## Kök neden 1 — `AUTH_SECRET` tanımlı değilse her deploy'da herkes oturumdan düşüyor (#1)

`backend/lib/auth.js` oturum anahtarını şu sırayla arıyor:

1. `process.env.AUTH_SECRET`
2. `data/secret.json` dosyası
3. **Yoksa: rastgele yeni bir anahtar üret ve dosyaya yaz**

Sorun: `data/secret.json` `.gitignore`'da (bu **doğru** — gizli anahtar herkese açık repoda
durmamalı) ve Render'ın diski her deploy/restart'ta sıfırlanıyor. Yani `AUTH_SECRET` ortam
değişkeni tanımlı **değilse**, sunucu her yeniden başladığında 3. adıma düşüp **yepyeni bir
anahtar** üretiyor. O ana kadar verilmiş bütün oturum token'ları anında geçersiz oluyor ve
kullanıcılar login ekranına atılıyor.

Bu, "root→tenant girişi **bazen** login'e atıyor" şikayetini birebir açıklıyor:
**"bazen" = "her deploy'dan sonra"**. Yerelde hiç görünmemesinin sebebi de net — yerelde
`data/secret.json` diskte kalıcı, dolayısıyla anahtar hiç değişmiyor.

Daha da kötüsü: bu durum **tamamen sessizdi**. Dosya yazma işlemi Render'da (geçici diske)
başarılı olduğu için mevcut `catch` bloğu da tetiklenmiyor, tek bir uyarı satırı bile çıkmıyordu.

**Yapılan:** Üretim ortamında (`NODE_ENV=production` / `RENDER` / `DATABASE_URL` varsa)
`AUTH_SECRET` tanımlı değilken açılışta büyük ve net bir uyarı bloğu basılıyor — sorunun ne
olduğunu ve nasıl çözüleceğini birebir yazıyor.

> **Kod bu hatayı tek başına çözemez** — çözüm ortam değişkeni tanımlamaktır ve o kullanıcının
> alanı. Kodun yapabileceği en iyi şey, görünmez bir hatayı görünür kılmaktı; o yapıldı.

### Kullanıcının yapması gereken (tek seferlik)

Render panelinde **Environment → Add Environment Variable**:

- **Key:** `AUTH_SECRET`
- **Value:** uzun, rastgele bir metin (örn. 40+ karakter; parola üreticiyle üretilebilir)

Kaydedip servisi yeniden başlatmak yeterli. Bundan sonra deploy'lar oturumları düşürmeyecek.
(Bu değişiklik bir kez yapılır; değeri sonradan değiştirmek yine herkesi oturumdan düşürür.)

---

## Kök neden 2 — Hız sınırlayıcı sayaçları uçlar arasında paylaşılıyordu (#2)

`rateLimiter(limit)` sayacı **yalnızca IP** bazlıydı: `ipCounts[ip]`. Ama bu sayacı
`rateLimiter` kullanan **8 ayrı uç nokta** paylaşıyordu:

| Uç | Limit |
|---|---|
| `/api/orders` | 30 |
| `/api/auth/login` | 15 |
| `/api/auth/google` | **15** |
| `/api/auth/select-tenant` | 30 |
| `/api/auth/my-restaurants` | 30 |
| `/api/auth/create-restaurant` | 5 |
| `/api/subscriptions` | 30 |
| `/api/notifications/click` | 100 |

Tek sayaç olduğu için **en düşük limit fiilen hepsini yönetiyordu**. Yani bir IP'den dakika içinde
herhangi bu uçlara toplam 15 istek gittiyse, Google ile giriş sebepsiz yere **429** dönüyor,
ön yüz de bunu "Google ile giriş yapılamadı" olarak gösteriyordu.

Bu, hatanın neden **kararsız** olduğunu da açıklıyor: ortak IP arkasındaki kullanıcılar (ofis ağı,
mobil operatör CGNAT, aynı restoranda birden fazla müşteri sipariş veriyorken) aynı sayacı
paylaşıyor. Müşteriler sipariş verirken restoran sahibinin girişi engellenebiliyordu.

**Yapılan:** Sayaç anahtarı `IP` yerine `IP + uç nokta yolu` oldu. Artık her uç kendi kovasını
kullanıyor, limitler birbirini etkilemiyor.

### Doğrulama

`/api/auth/login`'e arka arkaya 16 istek atıldı → 15'i normal yanıt, 16'sı `429` (limit doğru
çalışıyor). Hemen ardından `/api/auth/google` çağrıldı → **`400`** (yani isteği işledi, "credential
eksik" dedi), `429` **değil**. Düzeltmeden önce bu istek 429 dönecekti.

`AUTH_SECRET` uyarısı üç senaryoda ayrı ayrı test edildi:
- Üretim + `AUTH_SECRET` yok → uyarı çıkıyor ✅
- Üretim + `AUTH_SECRET` var → sessiz ✅
- Yerel geliştirme → uyarı çıkmıyor ✅

Uygulama sağlığı: `/admin`, `/menu`, `/api/products` hepsi 200; müşteri sitesinde başarısız istek
yok, 12 ürün yükleniyor.

---

## Durum

- **#2** için ayrıca Faz 86'da `verifyIdToken` hatasının gerçek sebebini Render loglarına yazan
  kayıt eklenmişti. Yukarıdaki 429 düzeltmesi muhtemel nedenlerden birini ortadan kaldırıyor;
  hata devam ederse artık log satırı gerçek sebebi gösterecek.
- İki görev de **kod tarafında yapılabilecek her şey yapılmış** durumda. Kesin kapanış için canlı
  doğrulama gerekiyor: `AUTH_SECRET` tanımlandıktan ve bu deploy çıktıktan sonra
  (1) root→tenant girişinin artık login'e atmadığı, (2) Google ile girişin çalıştığı
  denenmeli. Sorun sürerse Render logundaki `[AUTH]` ve `[AUTH] Google verifyIdToken failed:`
  satırları paylaşılmalı.
