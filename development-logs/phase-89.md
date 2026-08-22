# Faz 89 — Porsiyon / boyut fiyatlandırması

**Tarih:** 2026-08-22
**Görev:** #19 (Ürünlere porsiyon/boyut seçeneği ekle)

Bir ürünün birden fazla boyutu ve her boyutun kendi fiyatı olabiliyor artık
(örn. Çorba: Küçük 120₺, Büyük 180₺, Aile 260₺).

## Veri modeli

`products.portions` — TEXT sütun, JSON dizi:

```json
[{"name_tr":"Küçük","name_en":"Small","price":120}, {"name_tr":"Büyük","name_en":"Large","price":180}]
```

Mevcut `ensureColumn()` deseniyle eklendi (SQLite + Postgres'te aynı şekilde çalışır, açılışta
otomatik). Ayrı tablo yerine JSON sütun seçildi: porsiyonlar her zaman ürünle birlikte okunuyor,
bağımsız sorgulanmıyor; tek `ensureColumn` yetiyor ve hiçbir JOIN'e dokunmak gerekmiyor.

> **Karıştırmayın:** Zaten var olan `portion_tr` / `portion_en` sütunları AYRI bir şey — onlar
> serbest metin porsiyon notudur ("300 gr / 2 kişilik" gibi) ve fiyatı etkilemez. Yeni `portions`
> sütunu FİYATLI boyut seçenekleridir. Koda bu ayrımı açıklayan yorum bırakıldı.

## Geriye dönük uyumluluk (tasarımın merkezinde)

Sütun boş/NULL ise ürün **eskisi gibi** tek `price` ile çalışır. Yani:
- Mevcut bütün ürünler hiç etkilenmez (API onlar için `portions: []` döner).
- Geçmiş siparişler etkilenmez.
- Tarayıcıda kayıtlı **eski sepetler** çalışmaya devam eder (`c.key || c.id` yedeği sayesinde) —
  test edildi, anahtarsız eski sepet satırında adet artırma sorunsuz çalışıyor.

## Fiyat güvenliği (en önemli kısım)

Fiyat **her zaman sunucuda** ürünün kendi satırından çözülür; istemcinin gönderdiği fiyata asla
güvenilmez (mevcut tasarımın devamı). İstemci sadece seçilen porsiyonun **sıra numarasını**
(`portion_index`) gönderir — isim değil, çünkü isim değişebilir ya da çakışabilir.

Geçersiz numara (aralık dışı, negatif, yanlış tip, hiç gönderilmemiş) → sipariş düşürülmez,
ilk (en küçük) porsiyona düşülür. Dördü de test edildi.

Seçilen porsiyonun adı sipariş kalemine ürün adının yanına yazılır — `Günün Çorbası (Aile)` —
böylece mutfak fişinde ve sipariş listesinde hangi boyut istendiği görünür, yeni sütun gerekmedi.

## Arayüz

**Admin (ürün formu):** Fiyat alanının altına "Porsiyon / Boyut Seçenekleri" bölümü eklendi —
satır ekle/sil, TR adı + EN adı + fiyat. En fazla 8 satır. Adı boş veya fiyatı geçersiz satırlar
kaydederken sessizce atlanır. Porsiyon eklendiğinde tek fiyat alanının altında "müşteri fiyatı
porsiyondan görecek, bu alan yedek olarak kalır" uyarısı çıkar.

**Müşteri sitesi:**
- Menü kartında porsiyonlu ürünün **en düşük** porsiyon fiyatı gösterilir (müşteri "en az ne
  kadar" olduğunu görsün; kesin fiyat detayda seçilir).
- Ürün detayında pil şeklinde porsiyon seçici; ilki seçili başlar, seçim değişince hem üstteki
  birim fiyat hem butondaki toplam anında güncellenir.
- **Sepet kimliği değişti:** satırlar artık `id` yerine `id::porsiyonSırası` anahtarıyla ayırt
  ediliyor, böylece aynı ürünün Küçük ve Aile boyutu sepette **ayrı satır** olur. Sepette ve
  sipariş özetinde porsiyon adı gösterilir.

## Doğrulama (localhost:12999, tenant=default)

- Migration açılışta çalıştı: `[DB] Migration: added column products.portions`.
- Porsiyonsuz ürünler API'de `portions: []` dönüyor — bozulma yok.
- Admin form fonksiyonları: mevcut porsiyonlar yükleniyor, satır ekleniyor, boş satır atlanıyor,
  uyarı notu doğru anda çıkıyor.
- Detay ekranı: Aile seçilince ₺260, adet 3 → buton ₺780; Küçük'e dönünce ₺120 → ₺360. Seçili pil
  vurgusu doğru (`[false,false,true]`).
- Sepet: Küçük×2 + Aile×1 + porsiyonsuz Bruschetta = **3 ayrı satır**, toplam ₺584 (doğru).
- **Sipariş fiyatlandırması:** istemci kasten `price: 1` gönderdi → **yok sayıldı**, sunucu
  260/120/84 hesapladı, toplam ₺724. Sipariş kalemlerinde `Günün Çorbası (Aile)` yazıyor.
- Sınır durumları: `portion_index` 99 / yok / `'kotu'` / -1 → dördü de ilk porsiyona düştü,
  çökme yok.
- Dil: porsiyon adları TR/EN doğru değişiyor. **Bulunan ve düzeltilen hata:** "Porsiyon Seçin"
  başlığı İngilizce'de Türkçe kalıyordu — modal içeriği dinamik üretildiği için `applyLanguage()`
  onu hiç görmüyor; `data-i18n` yerine doğrudan `dkT()` ile basıldı.
- Eski (anahtarsız) sepet kaydı hâlâ çalışıyor; mobilde yatay taşma yok; başarısız istek yok.
- Test verileri (porsiyonlar + 2 test siparişi) sonrasında temizlendi.

## Not

Porsiyonlar AI asistanının düzenleyebildiği alanlar arasına **eklenmedi** — mevcut
`AI_SETTING_WHITELIST` ürün alanlarını değil site ayarlarını kapsıyor; AI'ın ürün düzenleme
yolunun porsiyonları da desteklemesi ayrı bir iş olarak değerlendirilmeli.
