/* =============================================================================
   HASACA Platform — NFC + QR masa kartı hazır tasarım galerisi
   -----------------------------------------------------------------------------
   TEK kaynak: admin.html (tenant tasarım seçimi), root.html (Root Panel önizleme)
   ve landing.html (pazarlama carousel'i) AYNI dosyayı yükler — böylece hepsi
   birebir aynı listeyi gösterir, ayrı ayrı senkronize tutulmak zorunda kalınmaz.

   Bu dosya bir RENDER MOTORU DEĞİL — sadece hazır görsellerin bir kaydı (registry).
   Görsellerdeki QR/logo ÖN GÖSTERİM amaçlıdır, gerçek/taranabilir değildir; gerçek
   QR + logo işleme adımı fiziksel üretim sırasında elle yapılır (kullanıcı kararı).

   Yeni bir tasarım eklemek için: görseli assets/nfc-cards/ klasörüne koy, GALLERY
   dizisine bir satır ekle. Başka hiçbir dosyaya dokunmaya gerek yok.
   ============================================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HasacaGallery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BASE = '/assets/nfc-cards/';

  var GALLERY = [
    { id: 'terra',            file: 'terra.png',            label: { tr: 'Terra',                en: 'Terra' } },
    { id: 'turk-lezzeti',     file: 'turk-lezzeti.png',     label: { tr: 'Türk Lezzeti',          en: 'Turkish Delight' } },
    { id: 'okyanus-balik',    file: 'okyanus-balik.png',    label: { tr: 'Okyanus Balık',         en: 'Ocean Fish' } },
    { id: 'olive-oak',        file: 'olive-oak.png',        label: { tr: 'Olive & Oak',           en: 'Olive & Oak' } },
    { id: 'terra-kitchen',    file: 'terra-kitchen.png',    label: { tr: 'Terra Kitchen',         en: 'Terra Kitchen' } },
    { id: 'lezzet-sanat',     file: 'lezzet-sanat.png',     label: { tr: 'Lezzet & Sanat',        en: 'Taste & Art' } },
    { id: 'lezzet-bahcesi',   file: 'lezzet-bahcesi.png',   label: { tr: 'Lezzet Bahçesi',        en: 'Flavor Garden' } },
    { id: 'lezzet-kosesi',    file: 'lezzet-kosesi.png',    label: { tr: 'Lezzet Köşesi',         en: 'Flavor Corner' } },
    { id: 'restoran-logosu',  file: 'restoran-logosu.png',  label: { tr: 'Zeytin Çelenk',         en: 'Olive Wreath' } },
    { id: 'dogal-lezzetler',  file: 'dogal-lezzetler.png',  label: { tr: 'Doğal Lezzetler',       en: 'Natural Flavors' } },
    { id: 'zeytinlik',        file: 'zeytinlik.png',        label: { tr: 'Zeytinlik',             en: 'Olive Grove' } }
  ];

  function byId(id) {
    for (var i = 0; i < GALLERY.length; i++) if (GALLERY[i].id === id) return GALLERY[i];
    return null;
  }

  /**
   * Bilinmeyen/boş id verilirse null döner — eski card-render.js'in normalize()'ının
   * aksine SESSİZCE bir varsayılana düşmez. Bu ayrım kritik: onay adımında "gerçekten
   * seçim yapıldı mı" ile "hiç seçilmedi"yi ayırt edebilmemiz gerekiyor.
   */
  function normalizeDesignId(id) {
    var item = byId(id);
    return item ? item.id : null;
  }

  function imageUrl(idOrItem) {
    var item = (idOrItem && typeof idOrItem === 'object') ? idOrItem : byId(idOrItem);
    return item ? (BASE + item.file) : '';
  }

  function label(idOrItem, lang) {
    var item = (idOrItem && typeof idOrItem === 'object') ? idOrItem : byId(idOrItem);
    if (!item) return '';
    var l = (lang === 'en') ? 'en' : 'tr';
    return item.label[l] || item.label.tr;
  }

  return {
    GALLERY: GALLERY,
    BASE_PATH: BASE,
    ids: GALLERY.map(function (g) { return g.id; }),
    byId: byId,
    normalizeDesignId: normalizeDesignId,
    imageUrl: imageUrl,
    label: label
  };
});
