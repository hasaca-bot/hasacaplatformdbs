# Phase 86 — Google girişi hatası: teşhis için loglama eklendi

**Tarih:** 2026-08-21
**Dosya:** `backend/server.js`

## Bildirilen sorun

Kullanıcı canlı ortamda (login sayfası) bir ekran görüntüsü paylaştı: Google hesabıyla giriş
denendiğinde "Google ile giriş yapılamadı. Lütfen tekrar deneyin." hatası çıkıyor — Google'ın
kendi hesap seçme kutusu ("Sign in as Hasan") doğru görünüyor, yani sorun Google tarafında değil,
bizim `/api/auth/google` uç noktasıyla oluyor.

Bu, [[auth-google-signin]] notunda daha önce "bildirildi ama yerelde tekrar üretilemedi" olarak
işaretli bilinen hatanın canlı ortamda tekrar görülmesi.

## Araştırma

- `GET /api/platform-config` (canlı, `hasaca-api.onrender.com`) kontrol edildi —
  `google_client_id` doğru ve dolu (`679295497183-...apps.googleusercontent.com`).
- Frontend (`google.accounts.id.initialize`) ve backend (`verifyIdToken`'ın `audience` parametresi)
  **aynı** `GOOGLE_CLIENT_ID` env değişkeninden besleniyor — iki ayrı yerde tutarsız bir değer
  olması mümkün değil, audience uyuşmazlığı ihtimali elendi.
- CORS listesi (`allowedOrigins`) kontrol edildi — `hasaca-api.onrender.com` zaten listede, ayrıca
  tüm `*.netlify.app` originleri de otomatik izinli. Login isteği zaten same-origin (relative
  `fetch('/api/auth/google')`) olduğu için CORS bu senaryoda zaten devre dışı.
- **Asıl bulgu:** `verifyIdToken()`'ı saran `catch` bloğu (server.js ~1241), Google'ın kütüphanesinin
  (`google-auth-library`) döndürdüğü asıl hata mesajını (`e.message`) hiçbir yere loglamadan
  sessizce `401 invalid_google_token` dönüyordu. Bu yüzden bu hata sınıfı Render loglarından bile
  teşhis edilemiyordu — "yerelde üretilemedi" demek "sebebi hiç görünmüyordu" demekti.

## Yapılan değişiklik

`catch (e)` bloğuna `console.error('[AUTH] Google verifyIdToken failed:', e.message)` eklendi.
İstemciye dönen yanıt değişmedi (hâlâ genel `invalid_google_token` — ham hata asla client'a
sızmıyor), sadece artık Render loglarında görünecek.

## Sıradaki adım (kullanıcıdan)

Deploy sonrası sorunu tekrar tetikleyip Render loglarına bakmak gerekiyor — `[AUTH] Google
verifyIdToken failed: ...` satırı asıl sebebi (ör. "Token used too late", "Wrong recipient",
saat senkron sorunu, vb.) gösterecek. O olmadan kör teşhis yapmaktan kaçınıldı — mevcut kodda
audience/CORS/env tarafında somut bir hata bulunamadı, bu yüzden spekülatif bir "düzeltme"
uygulamak yerine önce görünürlük sağlandı.

## Push durumu

Commit edilip push edildi (otomatik push politikası, bkz. RULES.md Kural 1).
