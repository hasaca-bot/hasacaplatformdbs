# Phase 65 — root.html'e glass dialog sistemi portlandı + Masa Yönetimi'ndeki QR Stili kartı kaldırıldı

## Why
İki ayrı kullanıcı isteği:
1. Faz 64'te bulunan bir eksik: `root.html` (platform sahibi paneli) tamamen native
   `confirm()`/`alert()`/`prompt()` kullanıyordu, `.custom-popup-*` sisteminin kendisi o dosyada hiç
   yoktu. Kullanıcı: "şimdi başla" diyerek bu portlamayı onayladı.
2. Ekran görüntüsüyle: Masa Yönetimi sayfasındaki "QR Stili" kartının (Ön Plan/Arka Plan/Kenar
   Boşluğu/Hata Düzeltme + Kaydet) kaldırılmasını istedi.

## What changed

### Masa Yönetimi — "QR Stili" kartı tamamen kaldırıldı (`admin.html`)
`#adminTabTablesCont` içindeki `.panel-card` (QR Stili) HTML bloğu silindi; `showAdminView()`'in
`tables` görünümü için `loadQrStyle()` çağrısı kaldırıldı; artık hiç çağrılmayan `loadQrStyle()`/
`saveQrStyle()` JS fonksiyonları ve `admin_qrstyle_*` i18n anahtarları (TR+EN, 8'er anahtar) silindi.
Backend'deki `/api/admin/qr-style` endpoint'ine dokunulmadı (kapsam sadece bu sayfadaki UI'ydı).

### root.html'e `.custom-popup-*` dialog sistemi portlandı
`admin.html`/`index.html` ile AYNI CSS/markup/JS deseni root.html'e eklendi:
- CSS: `.custom-popup-overlay`/`-card`/`-title`/`-message`/`-input`/`-actions`/`-actions-row`/
  `-divider`, root'un kendi `.overlay`/`.modal` CSS'inin yanına (root.html'in inline `<style>`
  bloğu — panel.css'ten ÖNCE gelir, root'un DOKUZ mevcut form modalına dokunulmadı, bunlar tamamen
  ayrı bir yeni sınıf ailesi). Butonlar root'un kendi `.btn`/`.btn.secondary`/`.btn.danger`
  sınıflarını kullanıyor (admin.html'deki gibi ayrı bir "admin-btn" yok), input alanı root'un zaten
  var olan global `input{border-radius:var(--radius-pill)}` kuralından otomatik pill şekli alıyor.
  **Font-family BİLEREK set edilmedi** — root.html'in kendi global `*{font-family:'Samsung Sharp
  Sans'!important}` kuralı (Faz 19) zaten miras alınıyor; admin.html'in Syne/DM Sans'ı buraya
  taşınmadı (yanlış olurdu — her sayfa kendi kurulu fontunu korumalı).
- Markup: `#customAlertOverlay`/`#customConfirmOverlay`/`#customPromptOverlay`, root'un son form
  modalından (`#notifyOverlay`) hemen sonra, `#toast`'tan önce eklendi.
- JS: `showCustomAlert()`/`closeCustomAlert()`/`showCustomConfirm()`/`showCustomPrompt()` —
  admin.html'deki Promise deseninin birebir aynısı, sadece `window.currentLanguage` yerine root'un
  kendi modül-seviyesi `lang` değişkeni kullanıldı (`T()` fonksiyonunun okuduğu aynı değişken).
- 5 native çağrı-yeri değiştirildi: `toggleStatus()` (`confirm`→`showCustomConfirm`), `deleteTenant()`
  (`confirm`+`prompt`→`showCustomConfirm`+`showCustomPrompt`, default tenant "DELETE yaz" akışı),
  `resetTenantPassword()` (`alert`→`showCustomAlert`, yeni şifre artık `esc()` ile kaçışlanıp
  `<strong>` vurgulu gösteriliyor), `deleteLandingMessage()` (`confirm`→`showCustomConfirm`).

## Doğrulama sırasında bulunan küçük bir tutarsızlık
İlk sürümde tek-butonlu `showCustomAlert` diyaloğu (şifre sıfırlama sonucu) `.custom-popup-actions`
sınıfı OLMADAN, düz `.btn` (root'un varsayılan dolu-mavi pill butonu) ile render ediliyordu —
admin.html/index.html'deki tek-butonlu uyarıların şeffaf/düz-metin stiliyle TUTARSIZDI (Faz 64 Ek 1'de
zaten düzeltilmişti, ama root.html'e portlarken bu adım atlanmıştı). Düzeltme: markup'a
`.custom-popup-actions` sınıfı + karşılık gelen CSS (`.custom-popup-actions .btn{background:
transparent!important;...}` + açık tema varyantı) eklendi — artık üç dosyada da (`admin.html`,
`index.html`, `root.html`) tek-butonlu uyarı aynı şeffaf/pill görünümde.

## Verification
Local preview, `root.html` (kimliksiz DAHİ — yeni overlay'ler DOM'da her zaman mevcut, auth'a bağlı
değil), doğrudan `showCustomConfirm()`/`showCustomPrompt()`/`showCustomAlert()` çağrılarıyla:
- Koyu tema: confirm (Vazgeç/Evet + ayırıcı, "Evet" kırmızı), prompt (pill input, otomatik
  focus+select), alert (şeffaf tek buton) — üçü de ekran görüntüsüyle doğrulandı.
- `:root[data-theme="light"]`: aynı üç dialog, koyu metin + daha opak beyaz cam ile doğrulandı.
- Grep ile root.html'de sıfır kalan native `alert/confirm/prompt` çağrısı doğrulandı (sadece yorum
  satırlarında isim geçiyor).
- `toggleStatus`/`deleteTenant`/`resetTenantPassword`/`deleteLandingMessage`'ın hepsi hâlâ geçerli
  fonksiyon (syntax hatası yok), konsolda hata yok.
- Masa Yönetimi: QR Stili kartı olmadan sayfa (`showAdminView('tables')`) düzgün render oluyor,
  masa kartları/QR Göster/Yeniden Adlandır/Sil butonları etkilenmedi, konsolda hata yok.

## Files changed
- `admin.html` — Masa Yönetimi'nden QR Stili kartı (HTML+JS+i18n) tamamen silindi.
- `root.html` — yeni `.custom-popup-*` CSS/markup/JS sistemi eklendi, 5 native dialog çağrısı
  değiştirildi.
