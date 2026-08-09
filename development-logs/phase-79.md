# Phase 79 — AI Asistanı: yeni ürün/kategori oluşturma + silme

## Why
Kullanıcı Faz 77'de "AI menü bilgisi alıp düzenleyebilsin" demişti. Kontrol edince gerçek bir eksik
bulundu: mevcut AI Asistanı SADECE var olan ürün/kategorileri düzenleyebiliyordu
(`if (!row) { "Bulunamayan kayıt" diye reddet }`) — yeni bir ürün/kategori OLUŞTURAMIYOR ya da
SİLEMİYORDU. Yani "menüme kahvaltı kategorisi ekle, içine şunu şunu koy" gibi bir istek o an
çalışmıyordu; sadece klonlanan demo menüdeki mevcut satırları yeniden adlandırabiliyordu.

## What changed

### `backend/server.js`
- Action şeması `update`'e ek olarak `create` ve `delete` tiplerini destekliyor:
  `{"type":"create","table":...,"tempId":string,"fields":object}` ve
  `{"type":"delete","table":...,"targetId":string}`. Sistem promptu üç tipi de örneklerle
  açıklıyor; `create` için modelin kendi uydurduğu `tempId` SADECE aynı plan içindeki bağımlılıklar
  için (örn. yeni oluşturduğu bir kategoriye yeni bir ürün atamak) — gerçek veritabanı id'si
  sunucuda üretiliyor, modele asla güvenilmiyor.
- `/plan` route: `create` action'ları için `fields.name_tr` zorunlu, ürün için `fields.category`
  ya GERÇEK bir kategori id'si ya da AYNI planda oluşturulan bir kategorinin tempId'si olmalı
  (yoksa `unsupported`'a düşer, action üretilmez). `delete` action'ları update ile aynı
  sahiplik kontrolünden geçiyor (`productsById`/`categoriesById`'de bulunmalı).
- `/execute` route: önce TÜM `create:categories` action'ları işleniyor (gerçek id üretiliyor,
  `tempId→realId` haritası dolduruluyor), SONRA update/delete/`create:products` işleniyor —
  ürün oluştururken `category` alanı bu haritadan çözülüyor, execute anında TEKRAR
  `tenant_id` sahiplik kontrolünden geçiyor (var olan güvenlik deseniyle birebir aynı).
- Ürün INSERT mantığı `POST /api/products`'tan `createProductRow()` adında paylaşılan bir
  fonksiyona çıkarıldı (hem gerçek REST endpoint hem AI'nin execute'u AYNI kodu kullanıyor —
  23 kolonluk INSERT'i iki yerde elle tekrarlamak yerine). Kategori oluşturma için ayrı, küçük
  bir `createCategoryRow()` helper'ı eklendi (gerçek `POST /api/categories` endpoint'i id'yi
  çağırandan bekliyor, farklı bir sözleşmesi var, ona dokunulmadı).

### `admin.html`
- `adminAiPlanHTML()` artık `create`/`delete` action'ları için ayrı bir satır biçimi kullanıyor
  (update'in old→new diff'i yerine): `+ Kategori: Tatlılar`, `+ Ürün: Sufle · ₺150`,
  `− Ürün: Sufle` gibi. İki yeni i18n anahtarı eklendi.

## Verification
Gerçek bir Groq çağrısıyla uçtan uca test edildi (`default` tenant, gerçek admin oturumu):
- "Menüme 'Tatlılar' adında yeni bir kategori ekle, içine 'Sufle' adında... 150 TL fiyatlı bir
  ürün koy" → model doğru şekilde 1 kategori + 1 ürün create action'ı önerdi, UI'da doğru
  gösterildi, "Onayla ve Uygula" ile veritabanına yazıldı — kategori ÖNCE oluştu, ürün GERÇEK
  kategori id'sine (tempId değil) doğru bağlandı, doğrudan veritabanı sorgusuyla doğrulandı.
- "Sufle adlı ürünü menümden kaldır" → model doğru delete action'ı önerdi, onaylanınca ürün
  gerçekten silindi (veritabanı sorgusuyla doğrulandı).
- Ürün listesi arayüzde (`window.menuData`) otomatik güncellendi (mevcut `loadMenuDatabase()`
  çağrısı zaten her execute sonrası genel olarak çalışıyordu, ek değişiklik gerekmedi).
- Test verisi (kategori+ürün) temizlendi, tenant orijinal haline döndü (4 kategori, 11 ürün).
- Konsol/backend log hatası yok.

## Files changed
- `backend/server.js` — action şeması, `/plan` validasyonu, `/execute` create/delete işleme,
  `createProductRow`/`createCategoryRow` paylaşılan yardımcı fonksiyonlar.
- `admin.html` — `adminAiPlanRowHTML()` (yeni), `adminAiPlanHTML()` güncellendi, 2 i18n anahtarı.

## Push
Hâlâ commit/push edilmedi — "pushlama ben diyene kadar" talimatı geçerli.
