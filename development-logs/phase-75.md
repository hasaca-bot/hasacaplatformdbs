# Phase 75 — Landing page: tüm "eyebrow" rozetleri kaldırıldı

## Why
Kullanıcı "Fiyatlandırma"/"İletişim" gibi küçük noktalı, yazılı buton-benzeri rozetleri (section
başlıklarının ÜSTÜNDE duran "eyebrow" etiketleri) gösterip bunların landing page'den kaldırılmasını
istedi — "bunlar gibi" ifadesi tek bir örnekle sınırlı değildi, sayfadaki AYNI desenin TAMAMI
kastediliyordu.

## What changed
`landing.html`'de `<span class="eyebrow"><span class="dot"></span><span data-i18n="...">METİN</span
></span>` deseni TAM 12 yerde tekrarlanıyordu — hero, showcase intro + 3 alt-sekme etiketi,
features, how-it-works, comparison, stats, pricing, FAQ, contact. Hepsi kaldırıldı:
- 12 HTML span'i silindi (her `.sec-head`'in ilk çocuğu — `<h2>`/`<h3>` artık doğrudan ilk eleman,
  `.sec-head h2{margin:18px 0 16px}` kendi üst boşluğunu zaten taşıdığı için düzen bozulmadı).
- Artık kullanılmayan `.eyebrow`/`.eyebrow .dot` CSS kuralları silindi.
- Artık kullanılmayan 12 i18n anahtarı (TR+EN, toplam 24 satır) temizlendi: `hero_eyebrow`,
  `sc_eyebrow`, `sc1_tag`, `sc2_tag`, `sc3_tag`, `ft_eyebrow`, `hw_eyebrow`, `cmp_eyebrow`,
  `st_eyebrow`, `pr_eyebrow`, `fq_eyebrow`, `ct_eyebrow`.

## Verification
Local preview: grep ile `eyebrow`/`sc1_tag`/`sc2_tag`/`sc3_tag` sıfır kalıntı doğrulandı, konsol
hatası yok, sayfa metni (get_page_text) ile tüm bölüm başlıklarının (Fiyatlandırma, İletişim,
Özellikler vb.) artık üstlerinde yetim bir rozet metni OLMADAN doğrudan aktığı doğrulandı.

## Files changed
- `landing.html` — 12 `.eyebrow` span'i + CSS kuralları + 24 i18n anahtarı satırı silindi.
