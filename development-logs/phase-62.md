# Phase 62 — Faz 3A: Admin Paneli Çoklu Ekran Bölme (Bottom Container panoları)

## Why
Faz 1'in planında ertelenmiş "4'e bölünebilen ekran" özelliği — kullanıcı artık bunu istiyor:
admin panelinin ekranı en fazla 4 panoya bölünebilsin (örn. Uzaktan Sipariş + Masa Siparişi yan
yana), One UI referans kitindeki "Bottom Container" görsel dilinde (büyük radius'lu, başlıklı kart
konteyner).

## What changed
`admin.html`'e yeni bir split-mode sistemi eklendi, mevcut `showAdminView()`/`AP_VIEW_MAP` mimarisi
üzerine inşa edildi (yeni bir sistem değil):

- **Topbar toggle** (`#apSplitToggleBtn`, 2x2 grid ikonu, mevcut `.topbar-icon` pill stiliyle) —
  `apToggleSplitMode()`.
- **Panoya alınabilen görünümler**: Dashboard, Uzaktan Sipariş, Masa Siparişi, Rezervasyonlar,
  Analitik (`AP_SPLITTABLE_VIEWS`) — form/ayar ekranları kasıtlı olarak listede yok.
- **DOM taşıma, klonlama değil**: bir görünüm panoya atandığında gerçek `.view` elemanı (mevcut
  ID'siyle) `appendChild` ile panoya TAŞINIR — `getElementById` çakışması yok, mevcut render/load
  fonksiyonlarına hiç dokunulmadı.
- **Pano UI**: her pano bir "Bottom Container" kartı — başlık çubuğunda görünüm-değiştirme
  `<select>` (zaten-atanmış görünümler devre dışı) + "×" kaldır butonu, `--ap-radius-lg` köşe.
  1/2/3/4 pano için responsive CSS Grid (`panes-2`/`panes-3`/`panes-4` sınıfları), 900px altında
  tek sütuna düşer.
- **Kalıcılık**: `localStorage['hasaca_admin_split_layout']` — son pano düzeni sayfa yenilenince
  geri yükleniyor (mevcut `hasaca_panel_theme` vb. deseniyle tutarlı, `safeGetItem`/`safeSetItem`
  kullanılıyor).
- **Sidebar tıklaması split-mode'dan çıkarır**: `showAdminView()`'in başına bir kontrol eklendi —
  panolara atama SADECE pano başlığındaki picker'dan yapılabilir, belirsizlik yok.
- Yeni i18n anahtarları (`admin_split_toggle`/`admin_split_add_pane`/`admin_split_remove_pane`)
  hem TR hem EN bloklarına eklendi.

## Doğrulama sırasında bulunan GERÇEK, ciddi bir hata
`apRenderSplitGrid()` her yeniden çizimde (pano ekle/kaldır/görünüm değiştir) `grid.innerHTML = ''`
ile eski pano markup'ını temizliyordu — ama panoların İÇİNDEKİ `.view` elemanları KLONLANMAMIŞ,
gerçekten TAŞINMIŞTI, yani grid'in kendi alt-ağacındaydılar. `innerHTML=''` bu elemanları
KALICI OLARAK SİLİYORDU (DOM'dan tamamen kopartıp çöpe atıyor, sadece gizlemiyor). Canlı testte
yakalandı: bir panonun görünümünü "Panel"e çevirince diğer panodaki "Masa Siparişi" (`adminTabTableOrdersCont`)
elemanı `document.getElementById()`'den bile TAMAMEN KAYBOLDU — sayfa yenilenmeden geri gelmiyordu,
yani bu özellik o oturum için Masa Siparişi ekranını kalıcı olarak kırardı. Düzeltme:
`grid.innerHTML=''` çağrılmadan HEMEN ÖNCE, grid içindeki tüm `.view` elemanları önce
`.app-content`'e (gizli) geri kurtarılıyor, ANCAK ONDAN SONRA grid boşaltılıyor. Düzeltme sonrası
aynı senaryo (görünüm değiştir → diğer pano sağlam mı) tekrar test edildi, artık hiçbir `.view`
kaybolmuyor.

## Kullanıcı ekran görüntüsüyle bulunan İKİNCİ gerçek hata
Kullanıcı, split-mode açıkken başka bir bölüme (ör. sidebar'dan "Panel") geçince üst tarafta büyük
bir boş alan kaldığını bildirdi (ekran görüntüsüyle). Kök neden: `#adminPanelOverlay .ap-split-grid{
display:grid; height:100%; ...}` kuralı, tarayıcının `[hidden]` özniteliği için varsayılan
`display:none` davranışını EZİYORDU (aynı `.view[hidden]` için dosyada zaten var olan düzeltme
deseninin unutulmuş hali) — `grid.hidden=true` ayarlanıyordu ama CSS specificity'si `display:grid`'i
`display:none`'dan daha güçlü kılıyordu, boş grid `height:100%` yüzünden görünmeye devam edip normal
görünümün üstünde koca bir boşluk bırakıyordu. Düzeltme: `#adminPanelOverlay .ap-split-grid[hidden]{
display:none; }` eklendi. Ayrıca kullanıcının "kaydırma konumu kalıyor" bildirimine karşı,
`showAdminView()`'in başına HER görünüm geçişinde `.app-content` kaydırmasını sıfırlayan bir satır
eklendi (sadece split-mode'a özel değil, tüm görünüm geçişlerinde tutarlı olsun diye).

## ÜÇÜNCÜ hata: son panoyu kaldırırken de aynı yıkıcı sorun, farklı bir kod yolundan
Kullanıcı bizzat "bütün panoların çarpısına basıp tekrar 4'lü ikona basınca bu oldu" diyerek boş/
kırık bir pano ekran görüntüsü gönderdi. Kök neden AYNI aileden ama FARKLI bir çağrı yolu:
`apSplitRemovePane()` son panoyu kaldırırken önce `apSplitPanes.splice(idx,1)` ile diziyi
BOŞALTIYOR, SONRA `apExitSplitModeSilent()`'ı çağırıyordu — ama o fonksiyon hangi `.view`'ları
kurtaracağını (o ana kadar) `apSplitPanes` DİZİSİNE bakarak karar veriyordu; dizi zaten boş
olduğu için hiçbir şey kurtarılmadan `grid.innerHTML=''` çalışıyor ve grid içinde hâlâ fiziksel
olarak duran (taşınmış, klonlanmamış) son `.view` KALICI OLARAK SİLİNİYORDU. Düzeltme:
`apExitSplitModeSilent()` artık DİZİYE değil, grid içinde O AN GERÇEKTEN bulunan `.view`
elemanlarına (`grid.querySelectorAll('.view')`) bakarak kurtarma yapıyor — `apRenderSplitGrid()`'de
zaten kanıtlanmış aynı sağlam teknik, hangi kod yolundan çağrılırsa çağrılsın artık güvenli.
Kullanıcının "hata yaptın mı" sorusu üzerine tüm senaryo (tüm panoları tek tek kapat → tekrar aç)
sıfırdan tekrar test edildi, 5 splittable view'ın hepsi sağlam kaldığı doğrulandı.

## Ayrıca: eski gömülü admin giriş modalı kaldırıldı (kullanıcı isteği, ekran görüntüsüyle)
`admin.html` kimliksiz erişimde kendi eski/stilsiz giriş modalını (`#adminLoginBackdrop` — Kullanıcı
Adı/Şifre alanları, hiç One UI'a uymayan görünüm) gösteriyordu; `root.html` ise ZATEN bunu yapmıyor,
kimliksiz erişimde doğrudan `/giris`'e (login.html — hem Restoran hem Root sekmeli, tam One UI,
Google Sign-In dahil) yönlendiriyordu. Kullanıcı bu tutarsızlığı fark edip modalın kaldırılmasını
istedi. `openAdminLogin()` artık aynı `root.html` deseniyle `/giris`'e yönlendiriyor (tenant query
param'ı koruyarak) — modal MARKUP'ı/CSS'i şimdilik dosyada duruyor ama artık hiçbir kod yolu ona
ulaşmıyor (ölü kod, ayrı bir temizlik işi olarak bırakıldı, bu turda kapsam dışı).

## Verification
Local preview, gerçek admin oturumu, taze-sayfa-yenileme:
- Split-mode açma: varsayılan pano düzeni (`orders`+`table-orders`), her ikisi de GERÇEK veri
  gösteriyor (18 sipariş kartı, ilk müşteri adı doğru; 15 masa/floor-cell kartı).
- Pano görünümünü değiştirme (picker): pano 0 → "Panel" (dashboard, 4 stat kartı doğru render
  oldu), pano 1 → `adminTabTableOrdersCont` SAĞLAM kaldı (yukarıdaki hatanın düzeltmesi).
- Pano ekleme (2→3→4): `panes-4` class'ı doğru uygulandı.
- Pano kaldırma (4→3): `panes-3`'e doğru döndü.
- Bu ekle/ekle/kaldır dizisi boyunca 5 splittable görünümün TAMAMI (`view-dashboard`,
  `adminTabOrdersCont`, `adminTabTableOrdersCont`, `adminTabRezCont`, `view-analytics`) döküman
  içinde sağlam kaldığı doğrulandı.
- localStorage kalıcılık: 3 panolu bir düzen kaydedildi, TAZE sayfa yenilemesi sonrası split-mode
  açılınca AYNI 3 pano/AYNI sıra geri geldi.
- Sidebar çıkışı: normal bir nav-item'a (Ürünler) tıklayınca split grid gizlendi, toggle butonu
  "active" class'ını kaybetti, Ürünler view'ı göründü — VE önceki 3 panodaki tüm görünümler
  döküman içinde sağlam kaldı (silinmedi).
- Açık tema: pano radius `28px` (`--ap-radius-lg`), pano arka planı beyaz, başlık çubuğu açık gri —
  hepsi doğru. Toggle butonunun aktif rengi (mavi `#387AFF`) doğrulandı — ilk testte geçiş
  animasyonu (`transition`) yüzünden yanlışlıkla beyaz okundu, ayrı bir sorgulamada doğru mavi
  teyit edildi (gerçek bir hata değil, sadece test zamanlaması).
- Font-family değişmedi, sadece `admin.html` değişti.

**Boşluk/kaydırma düzeltmesi**: split-mode açılıp `.ap-split-grid` gerçekten `hidden` özniteliğiyle
işaretlendiğinde `getComputedStyle(...).display === "none"` doğrulandı (öncesinde `"grid"` kalıyordu)
— split-mode'dan çıkış sonrası ilk stat kartının üstten mesafesi (`getBoundingClientRect().top`)
`88px` — topbar'ın hemen altı, ARADA BOŞLUK YOK. Görünüm geçişlerinde `.app-content.scrollTop`
her seferinde `0`'a döndüğü doğrulandı.

**Giriş modalı kaldırma**: `localStorage` temizlenip kimliksiz `/admin.html?tenant=default`'a
gidildi → gerçek yönlendirme doğrulandı: `location.href === "http://localhost:12999/giris?tenant=default"`,
sayfa içeriği gerçek `login.html` (Restoran/Root Panel sekmeleri, Google ile oturum aç, Kullanıcı
Adı/Şifre, "Beni hatırla") — eski modal bir daha hiç görünmüyor.

## Files changed
- `admin.html` — split-mode state/JS (`apToggleSplitMode`, `apRenderSplitGrid`, `apSplitAssign`,
  `apSplitRemovePane`, `apSplitAddPane`, `apExitSplitModeSilent`, `apLoadViewData`), topbar toggle
  butonu, `.ap-split-grid`/`.ap-split-pane` CSS (+ `[hidden]` düzeltmesi), `showAdminView()`'e
  split-çıkış + kaydırma-sıfırlama hook'u, yeni i18n anahtarları, `openAdminLogin()`'in eski modal
  yerine `/giris`'e yönlendirmesi.
