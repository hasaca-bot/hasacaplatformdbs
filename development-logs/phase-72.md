# Phase 72 — Faz B tamamlandı: "Menüyü Tamamla" (eksik görsel tespiti + toplu oluşturma)

## Why
Görsel-oluşturma yol haritasının Faz B'si: görseli olmayan ürünleri tespit edip toplu görsel
oluşturma teklif etme ("Menüyü Tamamla").

## What changed

### Backend — 2 yeni endpoint (`backend/server.js`)
- `GET /api/admin/ai-assistant/missing-images` — tenant'ın `image IS NULL OR image = ''` olan
  ürünlerini deterministik bir SQL sorgusuyla döndürür (modele "hangileri eksik" diye SORULMUYOR —
  bu özelliğin baştan beri sürdürdüğü "modele sadece kendisine verilen gerçek veriye güven"
  ilkesiyle tutarlı).
- `POST /api/admin/ai-assistant/bulk-generate-images` — `{productIds}` alır, her biri için görsel
  ÜRETİR (henüz UYGULAMAZ — "kullanıcı açıkça onaylamadan gerçek görseli değiştirme" kuralı burada
  da geçerli). Bilinçli bir tasarım kararı: her ürün için Groq'a ayrı bir istek atıp "akıllı" bir
  prompt yazdırmak yerine (mevcut tekli-sohbet akışının yaptığı gibi), doğrudan ürün adı+açıklamasından
  DETERMİNİSTİK bir prompt kuruyor — toplu bir çalıştırma çok sayıda ürünü kapsayabilir, her biri için
  ekstra bir model çağrısı hem yavaşlatır hem ücretsiz Groq kotasını zorlar. Kalite eki + negative
  prompt (Faz 71) aynı şekilde uygulanmaya devam ediyor.

### Frontend (`admin.html`)
Composer'a ikinci bir ikon buton ("Menüyü Tamamla") eklendi. Akış: tıkla → eksik-görsel taraması
(orb "searching" durumunda) → 0 eksikse "Tüm ürünlerin zaten görseli var" → varsa işaretli
checkbox'lı bir liste + "Seçilenler İçin Oluştur" butonu → tıklanınca seçili ürünler için toplu
üretim (orb "weaving" durumunda) → sonuç kartları (küçük önizleme + ürün adı + "Ürün görseli olarak
ayarla" butonu, AI-üretilen tekli görsellerle AYNI dar apply-image endpoint'i) + birden fazla
sonuç varsa üstte bir "Tümünü Uygula" butonu (sırayla her birini uygular).

## Doğrulama sırasında bulunan ve düzeltilen gerçek bir hata
`bulk-generate-images` endpoint'inin SQL sorgusunda parametre SIRASI hatası vardı: SQL metninde
`tenant_id = ?` ÖNCE, `id IN (?,...)` SONRA yazılıyordu, ama params dizisi `[...ids, tenantId]`
— yani ID'LER önce, tenant SONRA sıralanmıştı. PostgreSQL'de bu ZARARSIZ olurdu (numaralı `$N`
yer tutucular METİN SIRASINDAN bağımsız, sadece NUMARAYA göre eşleşir) ama SQLite'ın `?` yer
tutucuları TAMAMEN POZİSYONEL — metindeki İLK `?` params dizisinin İLK elemanına bağlanır, mantıksal
gruplamaya bakmaksızın. Sonuç: yerel (SQLite) geliştirmede sorgu HİÇBİR satır bulamıyordu (tenant_id
karşılaştırması bir ürün id'siyle yapılıyordu), `results` her zaman boş dönüyordu — canlı testte
yakalandı ("Seçilenler İçin Oluştur"a basınca sonuç kartı hiç görünmüyordu). Düzeltme: SQL metin
sırasıyla params dizisi sırası eşleştirildi (tenant_id ÖNCE, id-listesi SONRA, ikisinde de).

## Verification
Local preview, gerçek admin oturumu, gerçek Hugging Face anahtarıyla:
- Test için GERÇEK API üzerinden (`PUT /api/products/:id`, ham DB erişimi değil) bir ürünün
  görselini geçici olarak boşalttım, test sonunda GERİ YÜKLEDİM (yerel demo verisi, orijinal tam
  değeri elde tutulamadı — seed'in kendi placeholder desenine göre makul bir değere döndürüldü).
- "Menüyü Tamamla" tıklandı → "Görseli olmayan 1 ürün bulundu: Günün Çorbası" doğru tespit edildi.
- "Seçilenler İçin Oluştur" → hata bulunup düzeltildikten SONRA gerçek bir çorba görseli üretildi,
  sonuç kartı (küçük resim + isim + buton) doğru render oldu.
- "Ürün görseli olarak ayarla" → ürünün DB'deki `image` alanının gerçekten güncellendiği
  doğrulandı.
- Konsol hatası yok, font-family değişmedi.

## Files changed
- `backend/server.js` — 2 yeni endpoint (`missing-images` GET, `bulk-generate-images` POST) +
  SQL parametre-sırası hatası düzeltmesi.
- `admin.html` — composer'a "Menüyü Tamamla" ikon butonu; yeni `adminAiCompleteMenu()`,
  `adminAiRunBulkGenerate()`, `adminAiBulkResultsHTML()`, `adminAiApplyAllBulk()` fonksiyonları;
  yeni `.ai-menu-complete-list`/`.ai-bulk-results` CSS'i; 7 yeni i18n anahtarı (TR+EN).
