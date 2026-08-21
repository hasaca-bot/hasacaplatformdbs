/* admin.js — panelin ana mantigi (auth, tema, gorunumler, urunler, siparisler, AI).
   admin.html'in 1. <script> blogundan cikarildi (eski satir 4198-10691, Faz 87).
   Icerik DEGISTIRILMEDI; etiket ayni belge konumunda durdugu icin calisma sirasi da ayni. */
  // Storage guards: Safari private mode throws on localStorage access, so every read/write
  // goes through these. They must call the real storage API — an earlier version called
  // themselves, which blew the stack, was swallowed by the catch, and made every read
  // return null (so the admin token was never stored or sent).
  function safeGetSessItem(key) { try { return sessionStorage.getItem(key); } catch(e) { return null; } }
  function safeSetSessItem(key, val) { try { sessionStorage.setItem(key, val); } catch(e) {} }

  function safeGetItem(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
  function safeSetItem(key, val) { try { localStorage.setItem(key, val); } catch(e) {} }
  function safeRemoveItem(key) { try { localStorage.removeItem(key); } catch(e) {} }

window.isStandaloneAdmin = true;

// ── API BASE URL CONFIGURATION ──
// Automatically detects environment:
// - localhost/127.0.0.1 → relative paths (local development)
// - Any other host → cloud backend URL (production on Netlify)
window.API_BASE = (() => {
  const h = window.location.hostname;
  // API is same-origin everywhere (required for subdomain-based multi-tenancy).
  return '';
})();

// SSE (EventSource) connections must bypass Netlify's redirect-based /api/* proxy — it does not
// stream responses (confirmed: a direct EventSource to Render gets the initial ": connected"
// comment immediately; the same connection through platformhasaca.netlify.app never receives
// anything at all, not even that first byte). Every other /api/* call stays same-origin through
// the proxy (that direction works fine) — only EventSource connections need this direct URL.
window.SSE_BASE = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.onrender.com')) return '';
  return 'https://hasaca-api.onrender.com';
})();

// Admin session token (multi-tenant auth)
function getAdminToken() {
  // sessionStorage is used when the login page's "Beni hatırla" is unchecked.
  try { return safeGetItem('hasaca_admin_token') || safeGetSessItem('hasaca_admin_token') || ''; } catch (e) { return ''; }
}
function setAdminToken(t) {
  try {
    if (t) safeSetItem('hasaca_admin_token', t);
    else { safeRemoveItem('hasaca_admin_token'); sessionStorage.removeItem('hasaca_admin_token'); }
  } catch (e) {}
}

// Identity-only token (multi-restaurant Google accounts) — no tenant_id, only used to call
// /api/auth/select-tenant, /api/auth/my-restaurants and /api/auth/create-restaurant. Kept
// separate from the normal per-tenant hasaca_admin_token so a restaurant switch never needs a
// fresh Google sign-in: the identity token survives across "Restoranlarım" hub visits.
function getIdentityToken() {
  try { return safeGetItem('hasaca_identity_token') || safeGetSessItem('hasaca_identity_token') || ''; } catch (e) { return ''; }
}
function setIdentityToken(t) {
  try {
    if (t) safeSetItem('hasaca_identity_token', t);
    else { safeRemoveItem('hasaca_identity_token'); sessionStorage.removeItem('hasaca_identity_token'); }
  } catch (e) {}
}

// Root impersonation handoff: /admin.html#imp=<token> (opened from the Root Panel)
// stores the support session token and removes it from the URL immediately.
(function () {
  if (window.location.hash && window.location.hash.startsWith('#imp=')) {
    const impToken = decodeURIComponent(window.location.hash.slice(5));
    if (impToken) setAdminToken(impToken);
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
  }
})();

// Local development only: ?tenant=slug override carried onto every API call
window.__devTenant = (() => {
  try {
    return new URLSearchParams(window.location.search).get('tenant') || '';
  } catch (e) { return ''; }
})();

// Fetch interceptor: prepends API_BASE, forwards the dev tenant override,
// and attaches the admin session token when one exists.
(function() {
  const _fetch = window.fetch;
  window.fetch = function(url, options) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      url = window.API_BASE + url;
      if (window.__devTenant) url += (url.includes('?') ? '&' : '?') + 'tenant=' + encodeURIComponent(window.__devTenant);
      const token = getAdminToken();
      if (token) {
        options = options || {};
        const h = options.headers = options.headers || {};
        if (!h.Authorization && !h.authorization) h.Authorization = 'Bearer ' + token;
      }
    }
    return _fetch.call(this, url, options);
  };
})();

// Small translation helper: current language → Turkish fallback → the key itself.
function adminT(key) {
  const lang = window.currentLanguage || safeGetItem('lang') || 'tr';
  if (typeof i18nData !== 'undefined') {
    if (i18nData[lang] && i18nData[lang][key] != null) return i18nData[lang][key];
    if (i18nData.tr && i18nData.tr[key] != null) return i18nData.tr[key];
  }
  return key;
}
window.adminT = adminT;

// Global menu data state
window.menuData = [];

// Global translation system configuration
let detectedLang = safeGetItem('lang');
if (!detectedLang) {
  const browserLang = navigator.language || navigator.userLanguage || 'en';
  detectedLang = browserLang.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  safeSetItem('lang', detectedLang);
}
window.currentLanguage = detectedLang;

const i18nData = {
  tr: {
    rez_info_note: "Rezervasyonunuz restorana iletilecektir.<br>Onay için sizi arayabiliriz.",
    alert_title_notification: "Bildirim",
    confirm_title_sure: "Emin misiniz?",
    admin_btn_yes: "Evet",
    admin_lbl_edit_product: "Ürün Düzenle",
    call: "Ara",
    hero_title_1: "Emek, Lezzet, Kalite.",
    hero_subtitle_1: "Lezzetli Yemekler, Taze Malzemeler",
    hero_title_2: "Doyasıya Lezzet",
    hero_subtitle_2: "Geleneksel lezzetler modern sunumla buluşuyor",
    hero_title_3: "Şehrin Gözdesi",
    hero_subtitle_3: "En taze malzemeler, enfes baharatlar",
    info_delivery_title: "Hızlı Teslimat",
    info_delivery_desc: "Şehir Geneline",
    info_hot_title: "Taze & Sıcak",
    info_hot_desc: "Anında Servis",
    info_rez_title: "Kolay Rezervasyon",
    info_rez_desc: "Masa Ayırtın",
    sec_tag_menu: "Ne Yesek?",
    lbl_hour: "Saat",
    menu_heading: "Menümüz",
    menu_subheading: "Seçkin lezzetlerimizi inceleyin",
    all_products: "Tüm Ürünler",
    no_products: "Kategoride ürün bulunmamaktadır.",
    about_heading: "Hakkımızda",
    about_subheading: "Eşsiz Lezzet Yolculuğu",
    about_text_1: "En kaliteli malzemelerle hazırladığımız nefis lezzetlerle hizmetinizdeyiz. Misafirlerimize her zaman taze, sıcak ve lezzetli ürünler sunmak bizim önceliğimizdir.",
    about_text_2: "Özenle seçilmiş malzemeler ve geleneksel pişirme yöntemlerimizle, lezzet standardımızı her geçen gün daha da yukarı taşıyoruz. Sizleri de bu lezzet şölenine ortak olmaya davet ediyoruz.",
    rez_heading: "Rezervasyon Yapın",
    rez_subheading: "Masanızı önceden ayırtın, sıra beklemeden lezzetin tadını çıkarın.",
    lbl_person: "Kişi Sayısı",
    lbl_date: "Tarih Seçin",
    lbl_time: "Saat Seçin",
    lbl_fullname: "Ad Soyad",
    lbl_phone: "Telefon Numarası",
    lbl_note: "Not (Alerji, çocuk sandalyesi vb.)",
    btn_book: "Rezervasyon Yap",
    contact_heading: "İletişim Bilgileri",
    contact_address_lbl: "Adresimiz",
    contact_address_val: "123 Example Street, City",
    contact_phone_lbl: "Telefon",
    contact_hours_lbl: "Çalışma Saatleri",
    contact_hours_val: "Hafta İçi & Hafta Sonu: 11:00 - 22:00",
    footer_text: "© 2025 My Restaurant",
    
    // Select dropdown defaults
    select_day: "Gün",
    select_month: "Ay",
    select_year: "Yıl",
    select_hour: "Seçin",
    
    // Nutrition Facts
    nutrition_facts: "Besin Değerleri",
    allergen_info: "Alerjen Bilgisi",
    ingredients: "İçindekiler",
    energy: "Enerji (kcal)",
    fat: "Yağ (g)",
    saturated_fat: "- Doymuş Yağ (g)",
    carbs: "Karbonhidrat (g)",
    sugars: "- Şekerler (g)",
    fiber: "Lif (g)",
    protein: "Protein",
    salt: "Tuz (g)",
    macro_dist: "Makro Dağılımı",
    allergen_warn_title: "Alerjen Uyarısı",
    no_allergens: "Herhangi bir alerjen madde tespit edilmemiştir.",
    cross_contamination_warn: "Alerjen bilgilerimiz çapraz bulaşma riski içerebilir.",
    no_additives: "Katkı maddesi içermez",
    cooked_weight_info: "Ürün gramajları pişmiş halde hesaplanmıştır.",
    vat_included: "Fiyatlarımıza KDV dahildir.",
    rights_reserved: "Fiyat ve içerik değişiklik hakkı saklıdır.",
    tagline: "Lezzet bizim işimiz!",
    detail_btn: "Detay",
    
    // Placeholders
    ph_name: "Adınızı ve soyadınızı girin...",
    ph_phone: "05xx xxx xx xx",
    ph_note: "Varsa özel isteklerinizi yazın...",
    form_product_name_placeholder_tr: "Örn: Zurna Tavuk",
    form_product_name_placeholder_en: "Örn: Zurna Chicken",
    form_category_name_example: "Örn: Tatlılar",
    form_category_slug_example: "Örn: tatlilar",
    ph_gram: "Gram...",
    ph_price: "Örn: 180",
    ph_energy: "Örn: 650",
    brand_name: "My Restaurant",
    
    // Alerts
    rez_success: "Rezervasyonunuz başarıyla alındı! Teşekkür ederiz.",
    rez_error: "Bağlantı hatası. Lütfen telefonla arayın: 123 456 789",
    
    // Admin modal
    admin_login: "Yönetici Girişi",
    admin_pwd_lbl: "Şifre",
    admin_btn_login: "Giriş Yap",
    admin_login_or: "veya",
    admin_google_err: "Google ile giriş yapılamadı. Lütfen tekrar deneyin.",
    admin_google_signing: "Giriş yapılıyor…",
    order_online: "Online sipariş",
    admin_btn_cancel: "Vazgeç",
    admin_btn_product_cancel: "Tamam",
    
    // Bottom nav translations
    bottom_nav_book: "Rezerve",
    bottom_nav_menu: "Menü",
    bottom_nav_order: "Sipariş",
    bottom_nav_call: "Ara",
    bottom_nav_contact: "İletişim",
    
    // Contact section tags
    sec_tag_contact: "Bize Ulaşın",
    btn_open_maps: "Google Maps'te Aç",
    order_getir: "Online Sipariş",
    order_phone: "Telefonla Sipariş",
    
    // Weekday names
    monday: "Pazartesi",
    tuesday: "Salı",
    wednesday: "Çarşamba",
    thursday: "Perşembe",
    friday: "Cuma",
    saturday: "Cumartesi",
    sunday: "Pazar",

    // New translation additions
    btn_see_menu: "Menüyü Gör",
    ok: "Tamam",
    hero_title_main: "Gerçek<br><em>Lezzet</em><br>Her Lokmada",
    hero_sub_main: "Lezzetli yemekler ve sıcak bir atmosfer sizi bekliyor.",
    hero_badge_text: "Favori Adresiniz",
    all_categories: "Tüm Kategoriler",
    ph_admin_pwd: "Şifrenizi girin...",
    ph_admin_search: "Ürünlerde ara...",
    admin_panel_title: "Yönetim Paneli",
    admin_user_lbl: "Kullanıcı Adı",
    ph_admin_user: "Kullanıcı adınız...",
    admin_login_wrong: "Kullanıcı adı veya şifre hatalı!",
    admin_session_expired: "Oturum süreniz doldu. Lütfen tekrar giriş yapın.",
    admin_tab_prod: "Ürün Yönetimi",
    admin_tab_rez: "Rezervasyonlar",
    admin_tab_orders: "Siparişler",
    admin_orders_title: "Gelen Siparişler",
    admin_orders_empty: "Henüz gelen bir sipariş bulunmuyor.",
    admin_order_search_ph: "Sipariş ara (isim, telefon, ürün)...",
    admin_order_filter_all: "Tümü",
    admin_order_filter_new: "Yeni",
    admin_order_filter_read: "Okundu",
    admin_order_sort_newest: "En Yeni",
    admin_order_sort_oldest: "En Eski",
    admin_order_new_badge: "Yeni Sipariş",
    admin_order_read_badge: "Okundu",
    admin_order_mark_read: "Okundu İşaretle",
    admin_order_delete: "Sil",
    admin_order_total: "Toplam Tutar",
    admin_order_qty: "Adet",
    admin_order_payment: "Ödeme Yöntemi",
    admin_order_address: "Teslimat Adresi",
    admin_order_address_detail: "Kat / Daire",
    admin_order_address_notes: "Adres Tarifi",
    admin_order_notes: "Sipariş Notu",
    admin_order_items: "Ürünler",
    admin_order_confirm_delete: "Bu siparişi kalıcı olarak silmek istediğinize emin misiniz?",
    admin_order_pay_cash: "Kapıda Nakit",
    admin_order_pay_card: "Kapıda Kart",
    admin_order_pay_online: "Online Ödeme",
    admin_tab_tables: "Masa Yönetimi",
    admin_tab_tableorders: "Masa Sipariş Kontrolü",
    admin_tab_cards: "Masa Kartı Tasarla",
    admin_cards_title: "Masa Kartı Tasarla",
    admin_cards_sub: "Masalarınıza koyacağınız NFC + QR kartın tasarımını seçin. Müşteriniz telefonunu kartınıza dokundurunca menünüz açılır.",
    admin_cards_loading: "Yükleniyor...",
    admin_cards_g_shape: "Kart Şekli",
    admin_cards_custom_btn: "Aradığınızı bulamadınız mı? Özel tasarım isteyin →",
    admin_cards_custom_title: "Özel Tasarım İsteyin",
    admin_cards_custom_sub: "Hayalinizdeki kartı anlatın; tasarım ekibimiz sizin için hazırlasın.",
    admin_cards_custom_lbl: "İsteğinizi tarif edin",
    admin_cards_custom_ph: "Örn. Restoranımın logosundaki bordo ve altın renkleri kullanan, üzerinde zeytin dalı deseni olan yuvarlak bir kart istiyorum.",
    admin_cards_custom_mail: "Size dönüş yapacağımız e-posta",
    admin_cards_custom_note: "Tasarım ekibimiz isteğinizi inceleyip bu e-posta adresi üzerinden size geri dönüş yapacaktır.",
    admin_cards_custom_go: "Talebi Gönder",
    admin_cards_custom_ok: "Talebiniz alındı. Tasarım ekibimiz {mail} adresi üzerinden en kısa sürede size dönüş yapacak.",
    admin_cards_custom_err_msg: "Lütfen isteğinizi biraz daha detaylı anlatın (en az 10 karakter).",
    admin_cards_custom_err_mail: "Lütfen geçerli bir e-posta adresi girin.",
    admin_cards_pick: "Bir tasarım seçin",
    admin_cards_logo_note: "Logonuz otomatik olarak işlenip size bildirilecektir.",
    admin_cards_selected: "Seçildi",
    admin_cards_pick_first: "Önce bir tasarım seçin.",
    admin_cards_approve: "Tasarımı Onayla",
    admin_cards_tables_n: "{n} masanız için basılacak",
    admin_cards_no_tables: "Henüz masanız yok — önce Masa Yönetimi'nden ekleyin",
    admin_cards_saved: "Kaydedildi",
    admin_cards_saving: "Kaydediliyor...",
    admin_cards_save_err: "Kaydedilemedi, bağlantınızı kontrol edin",
    admin_cards_appr_title: "Teslimat Bilgileri",
    admin_cards_appr_sub: "Kartlarınızı size göndereceğimiz adresi girin. Onayladıktan sonra tasarımınız baskıya alınır.",
    admin_cards_f_contact: "Yetkili Ad Soyad *", admin_cards_f_phone: "Telefon *",
    admin_cards_f_city: "İl *", admin_cards_f_district: "İlçe *",
    admin_cards_f_address: "Açık Adres *", admin_cards_f_postal: "Posta Kodu",
    admin_cards_f_note: "Teslimat Notu",
    admin_cards_appr_go: "Onayla ve Sipariş Ver",
    admin_cards_appr_wait: "Gönderiliyor...",
    admin_cards_cancel: "Vazgeç",
    admin_cards_os_title: "Kart siparişiniz alındı",
    admin_cards_os_count: "Masa sayısı",
    admin_cards_os_date: "Sipariş tarihi",
    admin_cards_os_to: "Teslimat",
    admin_cards_st_design_approved: "Tasarım Onaylandı",
    admin_cards_st_print_pending: "Baskı Bekliyor",
    admin_cards_st_printing: "Baskıda",
    admin_cards_st_shipped: "Kargoda",
    admin_cards_st_delivered: "Teslim Edildi",
    admin_cards_st_cancelled: "İptal Edildi",
    admin_tables_title: "Masa Yönetimi",
    admin_tableorders_title: "Masa Sipariş Kontrolü",
    admin_tbl_add: "+ Masa Ekle",
    admin_tbl_bulk: "Toplu Ekle",
    admin_tbl_printall: "Tüm QR'ları Yazdır",
    admin_tbl_add_title: "Yeni Masa",
    admin_tbl_bulk_title: "Toplu Masa Oluştur",
    admin_tbl_name_lbl: "Masa Adı",
    admin_tbl_desc_lbl: "Açıklama (isteğe bağlı)",
    admin_tbl_count_lbl: "Kaç masa?",
    admin_tbl_create: "Oluştur",
    admin_tbl_cancel: "Vazgeç",
    admin_tbl_close: "Kapat",
    admin_tbl_qr: "QR Göster",
    admin_tbl_rename: "Yeniden Adlandır",
    admin_tbl_delete: "Sil",
    admin_tbl_download: "QR İndir (PNG)",
    admin_tbl_print: "Yazdır",
    admin_tbl_empty: "Henüz masa oluşturulmadı.",
    admin_tbl_err: "İşlem başarısız oldu.",
    admin_tbl_rename_prompt: "Yeni masa adı:",
    admin_tbl_confirm_delete: "Bu masa silinsin mi? QR kodu kalıcı olarak geçersiz olacak.",
    admin_tbl_scan_hint: "Sipariş için QR kodu okutun",
    admin_floor_title: "Salon Görünümü",
    admin_floor_available: "Boş",
    admin_floor_neworder: "Yeni Sipariş",
    admin_floor_bill: "Hesap Bekliyor",
    admin_floor_waiter: "Garson Çağrıldı",
    admin_dinein_active: "Aktif",
    admin_dinein_archive: "Arşiv",
    admin_dinein_none: "Aktif masa siparişi yok.",
    admin_dinein_no_archive: "Arşivde sipariş yok.",
    admin_svc_waiter: "Garson çağırıyor",
    admin_svc_bill: "Hesap istiyor",
    admin_svc_resolve: "Tamam",
    dinein_status_received: "Alındı",
    dinein_status_preparing: "Hazırlanıyor",
    dinein_status_ready: "Servise Hazır",
    dinein_status_serving: "Servis Ediliyor",
    dinein_status_delivered: "Teslim Edildi",
    admin_tab_push: "Bildirimler",
    push_stat_total: "Toplam Gönderilen",
    push_stat_today: "Bugün Gönderilen",
    push_stat_subscribers: "Aktif Aboneler",
    push_stat_permitted: "Bildirim İzni %",
    push_stat_success: "Başarı Oranı",
    push_stat_ctr: "Tıklanma (CTR)",
    push_send_title_header: "Bildirim Gönder",
    push_label_title: "Başlık",
    push_label_type: "Bildirim Türü",
    push_type_campaign: "Kampanya",
    push_type_info: "Bilgilendirme",
    push_type_new_menu: "Yeni Menü",
    push_type_order: "Sipariş",
    push_type_announcement: "Duyuru",
    push_type_system: "Sistem",
    push_label_message: "Bildirim Mesajı",
    push_label_short_desc: "Küçük Açıklama (Opsiyonel)",
    push_label_image: "Büyük Görsel URL",
    push_label_icon: "Küçük İkon URL (Opsiyonel)",
    push_label_url: "Tıklanınca Açılacak URL",
    push_label_btn_text: "Buton Yazısı",
    push_label_target: "Hedef Kitle",
    push_target_all: "Tüm Kullanıcılar",
    push_target_permitted: "İzin Veren Kullanıcılar",
    push_target_android: "Android Kullanıcıları",
    push_target_ios: "iOS Kullanıcıları",
    push_target_test: "Test Kullanıcıları",
    push_label_priority: "Öncelik",
    push_prio_normal: "Normal",
    push_prio_high: "Yüksek",
    push_prio_critical: "Kritik",
    push_label_send_time: "Gönderim Zamanı",
    push_time_now: "Şimdi Gönder",
    push_time_scheduled: "İleri Tarih",
    push_label_datetime: "Tarih & Saat",
    push_label_ttl: "TTL (Saat)",
    push_label_sound: "Bildirim Sesi",
    push_sound_default: "Varsayılan",
    push_sound_silent: "Sessiz",
    push_label_tag: "Etiket (Tag)",
    push_label_collapse: "Collapse Key",
    push_btn_send: "Bildirim Gönder",
    push_preview_header: "Canlı Önizleme",
    push_history_header: "Gönderim Geçmişi",
    push_col_date: "Tarih",
    push_col_title: "Başlık",
    push_col_message: "Mesaj",
    push_col_target: "Kime",
    push_col_success: "Başarılı",
    push_col_failed: "Başarısız",
    push_col_ctr: "CTR",
    push_col_status: "Durum",
    push_col_actions: "İşlemler",
    admin_add_product: "Yeni Ürün Ekle",
    admin_category_not_found: "Aradığınız kategoriyi bulamadınız mı?",
    admin_add_category_btn: "Yeni Kategori Ekle",
    admin_lbl_category_name: "Kategori Adı",
    ph_category_name_example: "Örn: Tatlılar",
    admin_lbl_category_slug: "Kategori Kodu (Küçük harf, ingilizce karakter)",
    ph_category_slug_example: "Örn: tatlilar",
    admin_lbl_category_icon: "SVG İkon Kodu (Boş bırakılırsa varsayılan ikon atanır)",
    admin_lbl_prod_name_tr: "Ürün Adı (Türkçe)",
    admin_lbl_prod_name_en: "Ürün Adı (İngilizce - English)",
    admin_lbl_prod_price: "Fiyat (TL)",
    admin_lbl_select_category: "Kategori Seçin",
    admin_lbl_prod_image: "Ürün Görseli",
    ph_prod_image: "Fotoğraf linki veya dosya...",
    admin_btn_select_file: "Dosya Seç",
    admin_btn_choose_image: "Görsel Seç",
    admin_btn_remove_image: "Görseli kaldır",
    admin_img_none: "Görsel yok",
    admin_img_uploading: "Yükleniyor…",
    admin_img_uploaded: "Yüklendi ✓",
    admin_img_bad_format: "Desteklenmeyen format (PNG, JPG, WEBP, GIF, SVG)",
    admin_img_too_big: "Görsel 5MB sınırını aşıyor",
    admin_lbl_prod_desc_tr: "Açıklama (Türkçe)",
    ph_prod_desc_tr: "Ürün açıklaması...",
    admin_lbl_prod_desc_en: "Açıklama (İngilizce - English)",
    ph_prod_desc_en: "Product description...",
    admin_lbl_nutrition_section: "Besin Değerleri & Makrolar",
    admin_lbl_portion_tr: "Porsiyon Ölçüsü (Türkçe)",
    ph_portion_tr: "Örn: 1 Porsiyon - 350 g",
    admin_lbl_portion_en: "Porsiyon Ölçüsü (İngilizce - English)",
    ph_portion_en: "Örn: 1 Portion - 350 g",
    admin_lbl_other_info: "Diğer Bilgiler",
    admin_lbl_ingredients_tr: "İçindekiler (Türkçe)",
    ph_ingredients_tr: "Tavuk eti, lavaş, sos, marul...",
    admin_lbl_ingredients_en: "İçindekiler (İngilizce - English)",
    ph_ingredients_en: "Chicken meat, wrap, sauce, lettuce...",
    admin_lbl_no_additives_checkbox: "Katkı Maddesi İçermez işareti gösterilsin",
    admin_lbl_allergens: "Alerjenler (Seçmek için üzerlerine tıklayın)",
    admin_btn_save: "Kaydet",
    admin_rez_title: "Müşteri Rezervasyonları",
    push_confirm_title: "Bildirimi Gönder?",
    sec_tag_book: "Masa Ayırt",
    sec_tag_contact: "Bize Ulaşın",
    bottom_nav_book: "Rezerve",
    bottom_nav_menu: "Menü",
    bottom_nav_order: "Sipariş",
    bottom_nav_call: "Ara",
    bottom_nav_contact: "İletişim",
    btn_open_maps: "Google Maps'te Aç",
    admin_btn_product_cancel: "İptal",
    push_history_header: "Gönderim Geçmişi",
    push_preview_header: "Canlı Önizleme",
    push_col_date: "Tarih",
    push_col_title: "Başlık",
    push_col_message: "Mesaj",
    push_col_target: "Kime",
    push_col_success: "Başarılı",
    push_col_failed: "Başarısız",
    push_col_ctr: "CTR",
    push_col_status: "Durum",
    push_col_actions: "İşlemler",
    push_confirm_approve: "Onayla ve Gönder",
    push_no_history: "Henüz gönderilmiş bildirim bulunmuyor.",
    alg_sut: "Süt / Laktoz",
    alg_yumurta: "Yumurta",
    alg_gluten: "Gluten",
    alg_hardal: "Hardal",
    alg_kereviz: "Kereviz",
    alg_soya: "Soya",
    alg_susam: "Susam",
    admin_theme_group: "Tema",
    admin_theme_system: "Sistem",
    admin_theme_light: "Açık",
    admin_theme_dark: "Koyu",
    admin_nav_grp_general: "Genel",
    admin_nav_grp_myrestaurant: "Restoranım",
    admin_nav_restaurant_info: "Restoran Bilgileri",
    admin_nav_branding: "Marka & Site",
    admin_restinfo_title: "Restoran Bilgileri",
    admin_restinfo_hint: "Restoranınızın temel bilgilerini düzenleyin.",
    admin_restinfo_name: "Restoran Adı",
    admin_restinfo_display: "Görünen Ad",
    admin_restinfo_phone: "Telefon",
    admin_restinfo_email: "E-posta",
    admin_restinfo_address: "Adres",
    admin_restinfo_save: "Kaydet",
    admin_restinfo_saved: "Kaydedildi.",
    admin_membership_title: "Üyelik Durumu",
    admin_membership_hint: "Aboneliğinizle ilgili bilgiler burada görünecek.",
    admin_membership_status_active: "Aktif",
    admin_membership_status_trial: "Deneme",
    admin_membership_trial_days: "Deneme Sürümü — {n} gün kaldı",
    admin_membership_trial_ended: "Deneme Süresi Doldu",
    admin_hub_title: "Restoranlarım",
    admin_hub_welcome: "Hoş geldin",
    admin_hub_stat_restaurants: "Restoran",
    admin_hub_stat_orders: "Sipariş",
    admin_hub_stat_revenue: "Satış",
    admin_hub_stat_total: "Toplam",
    admin_hub_list_title: "Restoranlarım",
    admin_hub_new: "Yeni Restoran Ekle",
    admin_hub_new_prompt: "Yeni restoranın adı:",
    admin_hub_loading: "Yükleniyor…",
    admin_hub_error: "Restoranlar yüklenemedi.",
    admin_hub_empty: "Henüz bir restoranınız yok.",
    admin_hub_open: "Aç",
    admin_hub_select_err: "Restorana geçilemedi, tekrar deneyin.",
    admin_hub_create_err: "Restoran oluşturulamadı.",
    admin_brand_basics_title: "Marka",
    admin_brand_logo: "Logo",
    admin_brand_logo_upload: "Logo Yükle",
    admin_brand_favicon: "Favicon (Sekme İkonu)",
    admin_brand_favicon_hint: "Müşteri sitenizin tarayıcı sekmesinde görünen küçük ikon. En iyi sonuç için kare (örn. 512×512) bir görsel yükleyin — kare olmayan görseller gerilmiş görünebilir.",
    admin_brand_favicon_upload: "Favicon Yükle",
    admin_brand_company: "Şirket Adı",
    admin_brand_hero_title: "Ana Sayfa",
    admin_brand_footer: "Footer Metni",
    admin_brand_seo_title: "SEO",
    admin_brand_seo_titlelbl: "SEO Başlığı",
    admin_brand_seo_desc: "SEO Açıklaması",
    admin_brand_seo_keywords: "Anahtar Kelimeler",
    admin_brand_theme: "Tema",
    admin_brand_theme_dark: "Sıcak (Varsayılan)",
    admin_brand_theme_light: "Açık",
    admin_brand_theme_bw: "Siyah & Beyaz",
    admin_brand_contact_title: "İletişim & Sosyal Medya",
    admin_brand_website: "Web Sitesi",
    admin_brand_save: "Kaydet",
    admin_brand_saved: "Kaydedildi.",
    admin_brand_bad_format: "Desteklenmeyen format.",
    admin_brand_too_big: "Görsel 5MB sınırını aşıyor.",
    admin_nav_grp_danger: "Tehlikeli Bölge",
    admin_nav_danger: "Tehlikeli Bölge",
    admin_danger_pause_title: "Restoranı Geçici Kapat",
    admin_danger_pause_hint: "Kapattığınızda müşterileriniz yeni sipariş/rezervasyon oluşturamaz. İstediğiniz an kendi panelinizden tekrar açabilirsiniz — hesabınıza girişiniz asla engellenmez.",
    admin_danger_pause_btn: "Restoranı Kapat",
    admin_danger_resume_btn: "Restoranı Tekrar Aç",
    admin_danger_pause_confirm: "Restoranınızı geçici olarak kapatmak istediğinize emin misiniz? Müşterileriniz yeni sipariş/rezervasyon oluşturamayacak. İstediğiniz an buradan tekrar açabilirsiniz.",
    admin_danger_paused_msg: "Restoranınız şu an kapalı.",
    admin_danger_resumed_msg: "Restoranınız tekrar açık.",
    admin_danger_delete_title: "Restoranı Sil",
    admin_danger_delete_hint: "Bu işlem geri alınamaz. Restoranınız, tüm ürünleriniz, siparişleriniz ve müşteri verileriniz kalıcı olarak silinir.",
    admin_danger_delete_btn: "Restoranı Sil",
    admin_danger_delete_confirm1_title: "Emin misiniz?",
    admin_danger_delete_confirm1: "Bu işlem geri alınamaz. Restoranınız ve tüm verileriniz kalıcı olarak silinecek. Devam etmek istiyor musunuz?",
    admin_danger_delete_confirm2: "Silme işlemini onaylamak için restoranınızın adını yazın:",
    admin_danger_delete_mismatch: "Yazdığınız isim eşleşmedi, silme işlemi iptal edildi.",
    admin_nav_grp_products: "Ürünler",
    admin_nav_grp_orders: "Siparişler",
    admin_nav_grp_analytics: "Analitik",
    admin_nav_grp_comms: "İletişim",
    admin_nav_grp_site: "Web Sitesi",
    admin_nav_grp_ai: "Yapay Zeka",
    admin_nav_grp_settings: "Ayarlar",
    admin_nav_settings: "Ayarlar",
    admin_nav_dashboard: "Panel",
    admin_nav_categories: "Kategoriler",
    admin_split_toggle: "Ekranı Böl",
    admin_split_add_pane: "Pano Ekle",
    admin_split_remove_pane: "Panoyu Kaldır",
    admin_nav_analytics: "Analitik",
    admin_nav_push: "Bildirim Gönder",
    admin_nav_view_site: "Siteyi Görüntüle",
    admin_nav_ai: "AI Asistanı",
    admin_ai_title: "AI Asistanı",
    admin_ai_desc: 'Ürün, kategori ve fiyatlarınızı doğal dille yönetin. Örn: "Tüm içeceklerin fiyatını %10 artır" veya "Kahve kategorisini İçecekler yap".',
    ph_ai_asst: "Ne yapmak istersiniz?",
    admin_ai_send: "Gönder",
    admin_ai_thinking: "Düşünülüyor…",
    admin_ai_plan_title: "Önerilen Değişiklikler",
    admin_ai_confirm: "Onayla ve Uygula",
    admin_ai_cancel: "İptal",
    admin_ai_applied_title: "Uygulandı",
    admin_ai_unsupported: "Desteklenmeyen istekler:",
    admin_ai_not_configured: "AI asistanı henüz yapılandırılmadı. Lütfen Root panelinden AI ayarlarını etkinleştirin.",
    admin_ai_error_generic: "Bir hata oluştu. Lütfen tekrar deneyin.",
    admin_ai_quota_remaining: "{remaining}/{limit} mesaj kaldı",
    admin_ai_quota_exceeded: "Ücretsiz deneme mesaj hakkınız doldu. Devam etmek için bizimle iletişime geçin — yakında ödeme sistemi eklenecek.",
    admin_ai_onboarding_welcome: "Hoş geldiniz! Restoranınızı birlikte oluşturalım. Önce restoranınızın adını ve mutfak türünü, ardından menünüzdeki kategorileri ve ürünleri (isim, açıklama, fiyat) yazabilirsiniz — istediğiniz zaman düzenleyip değiştirebiliriz.",
    admin_ai_table_products: "Ürün",
    admin_ai_table_categories: "Kategori",
    admin_ai_expand_all: "Tümünü Aç",
    admin_ai_collapse_all: "Tümünü Kapat",
    admin_ai_conn_error: "Bağlantı hatası.",
    admin_ai_no_actions: "İsteğinizden uygulanabilir bir değişiklik çıkaramadım.",
    admin_ai_fb_up: "Faydalı",
    admin_ai_fb_down: "Faydasız",
    admin_ai_copy: "Kopyala",
    admin_ai_regenerate: "Yeniden oluştur",
    admin_ai_hf_not_configured: "Görsel oluşturma henüz yapılandırılmadı. Lütfen Root panelinden Hugging Face anahtarını ekleyin.",
    admin_ai_hf_error: "Görsel oluşturulamadı: ",
    admin_ai_set_as_image: "Ürün görseli olarak ayarla",
    admin_ai_image_applied: "Ürün görseli güncellendi ✓",
    admin_ai_image_apply_error: "Görsel ürüne atanamadı, tekrar deneyin.",
    admin_ai_add_own_image: "Kendi Görselimi Ekle",
    admin_ai_assign_to_product: "Bu ürüne ata",
    admin_ai_own_image_bad_type: "Lütfen bir görsel dosyası seçin.",
    admin_ai_own_image_too_big: "Görsel 5MB'tan küçük olmalı.",
    admin_ai_own_image_uploaded: "Görsel yüklendi. Hangi ürüne ait olduğunu seçin:",
    admin_ai_own_image_upload_error: "Görsel yüklenemedi, tekrar deneyin.",
    admin_ai_complete_menu: "Menüyü Tamamla",
    admin_ai_menu_complete_none: "Tüm ürünlerin zaten görseli var, eksik yok.",
    admin_ai_menu_complete_found: "Görseli olmayan {n} ürün bulundu:",
    admin_ai_menu_complete_generate: "Seçilenler İçin Oluştur",
    admin_ai_menu_complete_error: "Eksik görseller kontrol edilemedi, tekrar deneyin.",
    admin_ai_menu_complete_partial: "{n} ürün için görsel oluşturulamadı.",
    admin_ai_menu_complete_apply_all: "Tümünü Uygula",
    admin_ai_candidate_prompt_template: "{name} için görsel oluştur",
    admin_ai_empty_title: "Nasıl yardımcı olabilirim?",
    admin_ai_empty_sub: "Ürün, kategori ve fiyatlarınızı doğal dille düzenleyebilirim.",
    admin_nav_widgets: "Widget Ayarları",
    admin_widgets_title: "Widget Ayarları",
    admin_widgets_hint: "Müşteri sitenizde hangi butonların/bölümlerin gösterileceğini kapatıp açın. Bir widget'ı kapatmak, ilgili bilgiyi silmez — sadece siteden gizler.",
    admin_widgets_website: "Web Sitesi",
    admin_widgets_save: "Kaydet",
    admin_widgets_saved: "Kaydedildi.",
    admin_nav_website_editor: "Web Sitesi Editörü",
    admin_website_hero_images_title: "Hero Görselleri",
    admin_website_hero_images_hint: "Ana sayfanın üst kısmında dönen görselleri yönetin, sıralayın veya kaldırın. Hiç görsel eklemezseniz varsayılan görseller gösterilir.",
    admin_website_add_image: "Görsel Ekle",
    admin_website_hero_text_title: "Hero Metni",
    admin_website_hero_text_hint: 'Sadece düz metin yazın — kalın vurgu ve satır sonu biçimlendirmesi sitede otomatik uygulanır. Örn: "Hoş Geldiniz Restoranım"',
    admin_website_save: "Kaydet",
    ph_website_hero_title: "Ne yazmak istersiniz?",
    admin_nav_logout: "Çıkış",
    admin_nav_collapse: "Daralt",
    admin_nav_admin: "Yönetici",
    admin_dash_orders: "Sipariş",
    admin_dash_revenue: "Satış",
    admin_dash_avg: "Ortalama Sepet",
    admin_dash_rez: "Rezervasyon",
    admin_dash_30d: "Son 30 gün",
    admin_dash_total: "Toplam",
    admin_dash_recent: "Analitik",
    admin_an_range_7: "7 gün", admin_an_range_30: "30 gün", admin_an_range_90: "90 gün",
    admin_dash_empty: "Henüz veri yok.", admin_dash_err: "Yüklenemedi.",
    admin_dash_quick: "Hızlı İşlemler",
    admin_dash_loading: "Yükleniyor…",
    admin_analytics_dinein: "Masa",
    admin_analytics_delivery: "Paket / Gel-al",
    admin_analytics_top: "En Çok Satan Ürünler"
  },
  en: {
    rez_info_note: "Your reservation will be forwarded to the restaurant.<br>We may call you for confirmation.",
    alert_title_notification: "Notification",
    confirm_title_sure: "Are you sure?",
    admin_btn_yes: "Yes",
    admin_lbl_edit_product: "Edit Product",
    call: "Call",
    hero_title_1: "Labor, Taste, Quality.",
    hero_subtitle_1: "Delicious Food, Fresh Ingredients",
    hero_title_2: "Delicious Feast",
    hero_subtitle_2: "Traditional tastes meet modern presentation",
    hero_title_3: "The City's Favorite",
    hero_subtitle_3: "The freshest ingredients, delicious spices",
    info_delivery_title: "Fast Delivery",
    info_delivery_desc: "Across the City",
    info_hot_title: "Fresh & Hot",
    info_hot_desc: "Instant Service",
    info_rez_title: "Easy Reservation",
    info_rez_desc: "Book a Table",
    sec_tag_menu: "What to Eat?",
    lbl_hour: "Time",
    menu_heading: "Our Menu",
    menu_subheading: "Browse our select delicacies",
    all_products: "All Products",
    no_products: "No products found in this category.",
    about_heading: "About Us",
    about_subheading: "A Unique Taste Journey",
    about_text_1: "We are at your service with delicious dishes prepared using the highest quality ingredients. Serving fresh, hot, and tasty products to our guests is always our priority.",
    about_text_2: "With carefully selected ingredients and our traditional cooking methods, we raise our taste standards day by day. We invite you to share this feast of taste.",
    rez_heading: "Book a Table",
    rez_subheading: "Book your table in advance, enjoy the taste without waiting in line.",
    lbl_person: "Number of Guests",
    lbl_date: "Select Date",
    lbl_time: "Select Time",
    lbl_fullname: "Full Name",
    lbl_phone: "Phone Number",
    lbl_note: "Note (Allergies, high chair, etc.)",
    btn_book: "Book Table",
    contact_heading: "Contact Information",
    contact_address_lbl: "Address",
    contact_address_val: "123 Example Street, City",
    contact_phone_lbl: "Phone",
    contact_hours_lbl: "Opening Hours",
    contact_hours_val: "Weekdays & Weekends: 11:00 - 22:00",
    footer_text: "© 2025 My Restaurant",
    
    // Select dropdown defaults
    select_day: "Day",
    select_month: "Month",
    select_year: "Year",
    select_hour: "Select",
    
    // Nutrition Facts
    nutrition_facts: "Nutrition Facts",
    allergen_info: "Allergen Info",
    ingredients: "Ingredients",
    energy: "Energy (kcal)",
    fat: "Fat (g)",
    saturated_fat: "- Saturated Fat (g)",
    carbs: "Carbohydrates (g)",
    sugars: "- Sugars (g)",
    fiber: "Fiber (g)",
    protein: "Protein",
    salt: "Salt (g)",
    macro_dist: "Macro Distribution",
    allergen_warn_title: "Allergen Warning",
    no_allergens: "No allergens detected.",
    cross_contamination_warn: "Our allergen information may contain risk of cross-contamination.",
    no_additives: "No additives",
    cooked_weight_info: "Product weights are calculated after cooking.",
    vat_included: "Prices include VAT.",
    rights_reserved: "We reserve the right to change prices and content.",
    tagline: "Taste is our business!",
    detail_btn: "Detail",
    
    // Placeholders
    ph_name: "Enter your full name...",
    ph_phone: "05xx xxx xx xx",
    ph_note: "Write special requests if any...",
    form_product_name_placeholder_tr: "e.g., Zurna Chicken (Turkish)",
    form_product_name_placeholder_en: "e.g., Zurna Chicken (English)",
    form_category_name_example: "e.g., Desserts",
    form_category_slug_example: "e.g., desserts",
    ph_gram: "Grams...",
    ph_price: "e.g., 180",
    ph_energy: "e.g., 650",
    brand_name: "My Restaurant",
    
    // Alerts
    rez_success: "Your reservation has been received successfully! Thank you.",
    rez_error: "Connection error. Please call: 123 456 789",
    
    // Admin modal
    admin_login: "Admin Login",
    admin_pwd_lbl: "Password",
    admin_btn_login: "Login",
    admin_login_or: "or",
    admin_google_err: "Could not sign in with Google. Please try again.",
    admin_google_signing: "Signing in…",
    order_online: "Online order",
    admin_btn_cancel: "Cancel",
    order_getir: "Order Online",
    order_phone: "Order by Phone",
    
    // Weekday names
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",

    // New translation additions
    btn_see_menu: "See Menu",
    ok: "OK",
    hero_title_main: "Real<br><em>Taste</em><br>In Every Bite",
    hero_sub_main: "Delicious food and a warm atmosphere await you.",
    hero_badge_text: "Your Favorite Spot",
    all_categories: "All Categories",
    ph_admin_pwd: "Enter password...",
    ph_admin_search: "Search products...",
    admin_panel_title: "Admin Panel",
    admin_user_lbl: "Username",
    ph_admin_user: "Your username...",
    admin_login_wrong: "Wrong username or password!",
    admin_session_expired: "Your session has expired. Please sign in again.",
    admin_tab_prod: "Product Management",
    admin_tab_rez: "Reservations",
    admin_tab_orders: "Orders",
    admin_orders_title: "Incoming Orders",
    admin_orders_empty: "No orders received yet.",
    admin_order_search_ph: "Search orders (name, phone, product)...",
    admin_order_filter_all: "All",
    admin_order_filter_new: "New",
    admin_order_filter_read: "Read",
    admin_order_sort_newest: "Newest",
    admin_order_sort_oldest: "Oldest",
    admin_order_new_badge: "New Order",
    admin_order_read_badge: "Read",
    admin_order_mark_read: "Mark as Read",
    admin_order_delete: "Delete",
    admin_order_total: "Total Amount",
    admin_order_qty: "Quantity",
    admin_order_payment: "Payment Method",
    admin_order_address: "Delivery Address",
    admin_order_address_detail: "Apt / Floor",
    admin_order_address_notes: "Address Notes",
    admin_order_notes: "Order Notes",
    admin_order_items: "Items",
    admin_order_confirm_delete: "Are you sure you want to permanently delete this order?",
    admin_order_pay_cash: "Cash on Delivery",
    admin_order_pay_card: "Card on Delivery",
    admin_order_pay_online: "Online Payment",
    admin_tab_tables: "Table Management",
    admin_tab_tableorders: "Table Order Control",
    admin_tab_cards: "Design Table Card",
    admin_cards_title: "Design Table Card",
    admin_cards_sub: "Choose the design of the NFC + QR card for your tables. Guests tap their phone on the card and your menu opens.",
    admin_cards_loading: "Loading...",
    admin_cards_g_shape: "Card Shape",
    admin_cards_custom_btn: "Can't find what you need? Request a custom design →",
    admin_cards_custom_title: "Request a Custom Design",
    admin_cards_custom_sub: "Describe the card you have in mind and our design team will create it for you.",
    admin_cards_custom_lbl: "Describe your request",
    admin_cards_custom_ph: "e.g. A round card using the burgundy and gold from my logo, with an olive branch pattern.",
    admin_cards_custom_mail: "Email we should reply to",
    admin_cards_custom_note: "Our design team will review your request and get back to you at this email address.",
    admin_cards_custom_go: "Send Request",
    admin_cards_custom_ok: "Your request has been received. Our design team will contact you at {mail} shortly.",
    admin_cards_custom_err_msg: "Please describe your request in a bit more detail (at least 10 characters).",
    admin_cards_custom_err_mail: "Please enter a valid email address.",
    admin_cards_pick: "Pick a design",
    admin_cards_logo_note: "Your logo will be processed automatically and you will be notified.",
    admin_cards_selected: "Selected",
    admin_cards_pick_first: "Please select a design first.",
    admin_cards_approve: "Approve Design",
    admin_cards_tables_n: "will be printed for your {n} tables",
    admin_cards_no_tables: "No tables yet — add them from Table Management first",
    admin_cards_saved: "Saved",
    admin_cards_saving: "Saving...",
    admin_cards_save_err: "Could not save, check your connection",
    admin_cards_appr_title: "Delivery Details",
    admin_cards_appr_sub: "Enter the address we should ship your cards to. Once approved, your design goes to print.",
    admin_cards_f_contact: "Contact Name *", admin_cards_f_phone: "Phone *",
    admin_cards_f_city: "City *", admin_cards_f_district: "District *",
    admin_cards_f_address: "Full Address *", admin_cards_f_postal: "Postal Code",
    admin_cards_f_note: "Delivery Note",
    admin_cards_appr_go: "Approve and Order",
    admin_cards_appr_wait: "Sending...",
    admin_cards_cancel: "Cancel",
    admin_cards_os_title: "Your card order has been received",
    admin_cards_os_count: "Tables",
    admin_cards_os_date: "Order date",
    admin_cards_os_to: "Delivery",
    admin_cards_st_design_approved: "Design Approved",
    admin_cards_st_print_pending: "Awaiting Print",
    admin_cards_st_printing: "Printing",
    admin_cards_st_shipped: "Shipped",
    admin_cards_st_delivered: "Delivered",
    admin_cards_st_cancelled: "Cancelled",
    admin_tables_title: "Table Management",
    admin_tableorders_title: "Table Order Control",
    admin_tbl_add: "+ Add Table",
    admin_tbl_bulk: "Bulk Add",
    admin_tbl_printall: "Print All QR",
    admin_tbl_add_title: "New Table",
    admin_tbl_bulk_title: "Bulk Create Tables",
    admin_tbl_name_lbl: "Table Name",
    admin_tbl_desc_lbl: "Description (optional)",
    admin_tbl_count_lbl: "How many tables?",
    admin_tbl_create: "Create",
    admin_tbl_cancel: "Cancel",
    admin_tbl_close: "Close",
    admin_tbl_qr: "Show QR",
    admin_tbl_rename: "Rename",
    admin_tbl_delete: "Delete",
    admin_tbl_download: "Download QR (PNG)",
    admin_tbl_print: "Print",
    admin_tbl_empty: "No tables created yet.",
    admin_tbl_err: "Operation failed.",
    admin_tbl_rename_prompt: "New table name:",
    admin_tbl_confirm_delete: "Delete this table? Its QR code will be permanently invalidated.",
    admin_tbl_scan_hint: "Scan the QR code to order",
    admin_floor_title: "Floor Overview",
    admin_floor_available: "Available",
    admin_floor_neworder: "New Order",
    admin_floor_bill: "Waiting for Bill",
    admin_floor_waiter: "Waiter Requested",
    admin_dinein_active: "Active",
    admin_dinein_archive: "Archive",
    admin_dinein_none: "No active table orders.",
    admin_dinein_no_archive: "No archived orders.",
    admin_svc_waiter: "Calling waiter",
    admin_svc_bill: "Requesting bill",
    admin_svc_resolve: "Done",
    dinein_status_received: "Received",
    dinein_status_preparing: "Preparing",
    dinein_status_ready: "Ready for Service",
    dinein_status_serving: "Being Served",
    dinein_status_delivered: "Delivered",
    admin_add_product: "Add New Product",
    admin_category_not_found: "Can't find the category you're looking for?",
    admin_add_category_btn: "Add New Category",
    admin_lbl_category_name: "Category Name",
    ph_category_name_example: "e.g., Desserts",
    admin_lbl_category_slug: "Category Code (Lowercase, English characters)",
    ph_category_slug_example: "e.g., desserts",
    admin_lbl_category_icon: "SVG Icon Code (Left blank, default icon is assigned)",
    admin_lbl_prod_name_tr: "Product Name (Turkish)",
    admin_lbl_prod_name_en: "Product Name (English)",
    admin_lbl_prod_price: "Price (TL)",
    admin_lbl_select_category: "Select Category",
    admin_lbl_prod_image: "Product Image",
    ph_prod_image: "Image link or file...",
    admin_btn_select_file: "Select File",
    admin_btn_choose_image: "Choose Image",
    admin_btn_remove_image: "Remove image",
    admin_img_none: "No image",
    admin_img_uploading: "Uploading…",
    admin_img_uploaded: "Uploaded ✓",
    admin_img_bad_format: "Unsupported format (PNG, JPG, WEBP, GIF, SVG)",
    admin_img_too_big: "Image exceeds the 5MB limit",
    admin_lbl_prod_desc_tr: "Description (Turkish)",
    ph_prod_desc_tr: "Product description...",
    admin_lbl_prod_desc_en: "Description (English)",
    ph_prod_desc_en: "Product description...",
    admin_lbl_nutrition_section: "Nutrition Facts & Macros",
    admin_lbl_portion_tr: "Serving Size (Turkish)",
    ph_portion_tr: "e.g., 1 Serving - 350 g",
    admin_lbl_portion_en: "Serving Size (English)",
    ph_portion_en: "e.g., 1 Portion - 350 g",
    admin_lbl_other_info: "Other Info",
    admin_lbl_ingredients_tr: "Ingredients (Turkish)",
    ph_ingredients_tr: "Chicken meat, wrap, sauce, lettuce...",
    admin_lbl_ingredients_en: "Ingredients (English)",
    ph_ingredients_en: "Chicken meat, wrap, sauce, lettuce...",
    admin_lbl_no_additives_checkbox: "Show 'No Additives' label",
    admin_lbl_allergens: "Allergens (Click to select)",
    admin_btn_save: "Save",
    admin_rez_title: "Customer Reservations",
    push_confirm_title: "Send Notification?",
    sec_tag_book: "Reservation",
    sec_tag_contact: "Contact Us",
    bottom_nav_book: "Book",
    bottom_nav_menu: "Menu",
    bottom_nav_order: "Order",
    bottom_nav_call: "Call",
    bottom_nav_contact: "Contact",
    btn_open_maps: "Open in Google Maps",
    admin_btn_product_cancel: "Cancel",
    push_history_header: "Send History",
    push_preview_header: "Live Preview",
    push_col_date: "Date",
    push_col_title: "Title",
    push_col_message: "Message",
    push_col_target: "Target",
    push_col_success: "Success",
    push_col_failed: "Failed",
    push_col_ctr: "CTR",
    push_col_status: "Status",
    push_col_actions: "Actions",
    push_confirm_approve: "Confirm & Send",
    push_no_history: "No notifications sent yet.",
    alg_sut: "Milk / Lactose",
    alg_yumurta: "Egg",
    alg_gluten: "Gluten",
    alg_hardal: "Mustard",
    alg_kereviz: "Celery",
    alg_soya: "Soy",
    alg_susam: "Sesame",
    admin_theme_group: "Theme",
    admin_theme_system: "System",
    admin_theme_light: "Light",
    admin_theme_dark: "Dark",
    admin_nav_grp_general: "General",
    admin_nav_grp_myrestaurant: "My Restaurant",
    admin_nav_restaurant_info: "Restaurant Info",
    admin_nav_branding: "Brand & Site",
    admin_restinfo_title: "Restaurant Info",
    admin_restinfo_hint: "Edit your restaurant's basic information.",
    admin_restinfo_name: "Restaurant Name",
    admin_restinfo_display: "Display Name",
    admin_restinfo_phone: "Phone",
    admin_restinfo_email: "Email",
    admin_restinfo_address: "Address",
    admin_restinfo_save: "Save",
    admin_restinfo_saved: "Saved.",
    admin_membership_title: "Membership Status",
    admin_membership_hint: "Information about your subscription will appear here.",
    admin_membership_status_active: "Active",
    admin_membership_status_trial: "Trial",
    admin_membership_trial_days: "Trial — {n} days left",
    admin_membership_trial_ended: "Trial Ended",
    admin_hub_title: "My Restaurants",
    admin_hub_welcome: "Welcome",
    admin_hub_stat_restaurants: "Restaurants",
    admin_hub_stat_orders: "Orders",
    admin_hub_stat_revenue: "Revenue",
    admin_hub_stat_total: "Total",
    admin_hub_list_title: "My Restaurants",
    admin_hub_new: "Add New Restaurant",
    admin_hub_new_prompt: "Name of the new restaurant:",
    admin_hub_loading: "Loading…",
    admin_hub_error: "Could not load your restaurants.",
    admin_hub_empty: "You don't have any restaurants yet.",
    admin_hub_open: "Open",
    admin_hub_select_err: "Could not switch restaurants, try again.",
    admin_hub_create_err: "Could not create the restaurant.",
    admin_brand_basics_title: "Brand",
    admin_brand_logo: "Logo",
    admin_brand_logo_upload: "Upload Logo",
    admin_brand_favicon: "Favicon (Tab Icon)",
    admin_brand_favicon_hint: "The small icon shown in your customer site's browser tab. For best results upload a square image (e.g. 512×512) — non-square images may look stretched.",
    admin_brand_favicon_upload: "Upload Favicon",
    admin_brand_company: "Company Name",
    admin_brand_hero_title: "Homepage",
    admin_brand_footer: "Footer Text",
    admin_brand_seo_title: "SEO",
    admin_brand_seo_titlelbl: "SEO Title",
    admin_brand_seo_desc: "SEO Description",
    admin_brand_seo_keywords: "Keywords",
    admin_brand_theme: "Theme",
    admin_brand_theme_dark: "Warm (Default)",
    admin_brand_theme_light: "Light",
    admin_brand_theme_bw: "Black & White",
    admin_brand_contact_title: "Contact & Social Media",
    admin_brand_website: "Website",
    admin_brand_save: "Save",
    admin_brand_saved: "Saved.",
    admin_brand_bad_format: "Unsupported format.",
    admin_brand_too_big: "Image exceeds the 5MB limit.",
    admin_nav_grp_danger: "Danger Zone",
    admin_nav_danger: "Danger Zone",
    admin_danger_pause_title: "Temporarily Close Restaurant",
    admin_danger_pause_hint: "While closed, customers can't place new orders or reservations. You can reopen anytime from your own panel — your login is never blocked.",
    admin_danger_pause_btn: "Close Restaurant",
    admin_danger_resume_btn: "Reopen Restaurant",
    admin_danger_pause_confirm: "Are you sure you want to temporarily close your restaurant? Customers won't be able to place new orders/reservations. You can reopen anytime from here.",
    admin_danger_paused_msg: "Your restaurant is currently closed.",
    admin_danger_resumed_msg: "Your restaurant is open again.",
    admin_danger_delete_title: "Delete Restaurant",
    admin_danger_delete_hint: "This action cannot be undone. Your restaurant, all products, orders and customer data will be permanently deleted.",
    admin_danger_delete_btn: "Delete Restaurant",
    admin_danger_delete_confirm1_title: "Are you sure?",
    admin_danger_delete_confirm1: "This action cannot be undone. Your restaurant and all its data will be permanently deleted. Do you want to continue?",
    admin_danger_delete_confirm2: "Type your restaurant's name to confirm deletion:",
    admin_danger_delete_mismatch: "The name you typed didn't match, deletion cancelled.",
    admin_nav_grp_products: "Products",
    admin_nav_grp_orders: "Orders",
    admin_nav_grp_analytics: "Analytics",
    admin_nav_grp_comms: "Communication",
    admin_nav_grp_site: "Website",
    admin_nav_grp_ai: "AI",
    admin_nav_grp_settings: "Settings",
    admin_nav_settings: "Settings",
    admin_nav_dashboard: "Dashboard",
    admin_nav_categories: "Categories",
    admin_split_toggle: "Split View",
    admin_split_add_pane: "Add Pane",
    admin_split_remove_pane: "Remove Pane",
    admin_nav_analytics: "Analytics",
    admin_nav_push: "Send Notification",
    admin_nav_view_site: "View Site",
    admin_nav_ai: "AI Assistant",
    admin_ai_title: "AI Assistant",
    admin_ai_desc: 'Manage your products, categories and prices in plain language. E.g. "Increase all drink prices by 10%" or "Rename Coffee category to Beverages".',
    ph_ai_asst: "What would you like to do?",
    admin_ai_send: "Send",
    admin_ai_thinking: "Thinking…",
    admin_ai_plan_title: "Proposed Changes",
    admin_ai_confirm: "Confirm & Apply",
    admin_ai_cancel: "Cancel",
    admin_ai_applied_title: "Applied",
    admin_ai_unsupported: "Unsupported requests:",
    admin_ai_not_configured: "The AI assistant isn't configured yet. Please enable AI settings from the Root panel.",
    admin_ai_error_generic: "Something went wrong. Please try again.",
    admin_ai_quota_remaining: "{remaining}/{limit} messages left",
    admin_ai_quota_exceeded: "You've used up your free trial messages. Contact us to continue — a payment plan is coming soon.",
    admin_ai_onboarding_welcome: "Welcome! Let's build your restaurant together. Start with your restaurant's name and cuisine type, then list your menu categories and items (name, description, price) — you can edit anything anytime.",
    admin_ai_table_products: "Product",
    admin_ai_table_categories: "Category",
    admin_ai_expand_all: "Expand All",
    admin_ai_collapse_all: "Collapse All",
    admin_ai_conn_error: "Connection error.",
    admin_ai_no_actions: "I couldn't derive an actionable change from your request.",
    admin_ai_fb_up: "Helpful",
    admin_ai_fb_down: "Not helpful",
    admin_ai_copy: "Copy",
    admin_ai_regenerate: "Regenerate",
    admin_ai_hf_not_configured: "Image generation isn't configured yet. Please add the Hugging Face key from the Root panel.",
    admin_ai_hf_error: "Couldn't generate the image: ",
    admin_ai_set_as_image: "Set as product image",
    admin_ai_image_applied: "Product image updated ✓",
    admin_ai_image_apply_error: "Couldn't apply the image, please try again.",
    admin_ai_add_own_image: "Add My Own Image",
    admin_ai_assign_to_product: "Assign to this product",
    admin_ai_own_image_bad_type: "Please select an image file.",
    admin_ai_own_image_too_big: "Image must be under 5MB.",
    admin_ai_own_image_uploaded: "Image uploaded. Choose which product it belongs to:",
    admin_ai_own_image_upload_error: "Couldn't upload the image, please try again.",
    admin_ai_complete_menu: "Complete the Menu",
    admin_ai_menu_complete_none: "All products already have an image, nothing missing.",
    admin_ai_menu_complete_found: "Found {n} product(s) with no image:",
    admin_ai_menu_complete_generate: "Generate for Selected",
    admin_ai_menu_complete_error: "Couldn't check for missing images, please try again.",
    admin_ai_menu_complete_partial: "Couldn't generate an image for {n} product(s).",
    admin_ai_menu_complete_apply_all: "Apply All",
    admin_ai_candidate_prompt_template: "Generate an image for {name}",
    admin_ai_empty_title: "How can I help?",
    admin_ai_empty_sub: "I can edit your products, categories and prices in plain language.",
    admin_nav_widgets: "Widget Settings",
    admin_widgets_title: "Widget Settings",
    admin_widgets_hint: "Turn individual buttons/sections on or off on your customer site. Disabling a widget doesn't delete the underlying info — it just hides it.",
    admin_widgets_website: "Website",
    admin_widgets_save: "Save",
    admin_widgets_saved: "Saved.",
    admin_nav_website_editor: "Website Editor",
    admin_website_hero_images_title: "Hero Images",
    admin_website_hero_images_hint: "Manage, reorder, or remove the images rotating at the top of your homepage. If you don't add any, the default images are shown.",
    admin_website_add_image: "Add Image",
    admin_website_hero_text_title: "Hero Text",
    admin_website_hero_text_hint: 'Type plain text only — bold emphasis and line breaks are applied automatically on the site. E.g. "Welcome to My Restaurant"',
    admin_website_save: "Save",
    ph_website_hero_title: "What would you like to say?",
    admin_nav_logout: "Logout",
    admin_nav_collapse: "Collapse",
    admin_nav_admin: "Admin",
    admin_dash_orders: "Orders",
    admin_dash_revenue: "Sales",
    admin_dash_avg: "Avg. Basket",
    admin_dash_rez: "Reservations",
    admin_dash_30d: "Last 30 days",
    admin_dash_total: "Total",
    admin_dash_recent: "Analytics",
    admin_an_range_7: "7 days", admin_an_range_30: "30 days", admin_an_range_90: "90 days",
    admin_dash_empty: "No data yet.", admin_dash_err: "Failed to load.",
    admin_dash_quick: "Quick Actions",
    admin_dash_loading: "Loading…",
    admin_analytics_dinein: "Dine-in",
    admin_analytics_delivery: "Delivery / Pickup",
    admin_analytics_top: "Best-Selling Products"
  }
};
// (legacy static item translations removed — built from tenant DB data)

let itemTranslations = {};

// Menu-content languages beyond tr/en — mirrors backend/server.js's CONTENT_LANGS. Used by the
// product/category form language tabs and by the AI-plan grouping UI's language labels.
const CONTENT_LANGS = ['zh', 'ja', 'de', 'fr', 'es', 'ko'];
const ADMIN_CONTENT_LANGS = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }
];

function toggleLanguage() {
  const nextLang = window.currentLanguage === 'tr' ? 'en' : 'tr';
  applyLanguage(nextLang);
}

// ── Phase 25: Tenant Admin Panel theme (Black/White/System) ──
// Scoped entirely to #adminPanelOverlay via CSS (see the PHASE 25 block in <style>).
// Shares the 'hasaca_panel_theme' localStorage key with the Root Panel + login page so the
// preference is consistent across every panel, but application here never touches body.theme-bw
// or any customer-facing markup — only html[data-theme] which the CSS scopes to the overlay.
const AP_THEME_MQ = window.matchMedia('(prefers-color-scheme: dark)');
function apResolveTheme(mode){ return mode === 'system' ? (AP_THEME_MQ.matches ? 'dark' : 'light') : mode; }
function apApplyThemeAttr(mode){ document.documentElement.setAttribute('data-theme', apResolveTheme(mode)); }
function apSetTheme(mode){
  try { safeSetItem('hasaca_panel_theme', mode); } catch(e){}
  apApplyThemeAttr(mode);
  document.querySelectorAll('#adminThemeSeg button').forEach(b => b.classList.toggle('on', b.getAttribute('data-theme-mode') === mode));
}
function apInitTheme(){
  let mode = 'system';
  try { mode = safeGetItem('hasaca_panel_theme') || 'system'; } catch(e){}
  apSetTheme(mode);
}
AP_THEME_MQ.addEventListener('change', () => {
  let m = 'system'; try { m = safeGetItem('hasaca_panel_theme') || 'system'; } catch(e){}
  if (m === 'system') apApplyThemeAttr('system');
});

function applyLanguage(lang) {
  window.currentLanguage = lang;
  document.documentElement.lang = lang;
  safeSetItem('lang', lang);
  document.title = 'My Restaurant';

  // Update top bar language button text
  const langText = document.getElementById('lang-btn-text');
  const adminLangText = document.getElementById('admin-lang-btn-text');
  if (adminLangText) adminLangText.textContent = lang === 'tr' ? 'EN' : 'TR';
  if (langText) {
    langText.textContent = lang === 'tr' ? 'EN' : 'TR';
  }

  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18nData[lang] && i18nData[lang][key]) {
      const val = i18nData[lang][key];
      if (val.includes('<')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
  });

  // Dynamically update pax selector buttons text grammatically
  document.querySelectorAll('.pax-btn').forEach(btn => {
    const n = btn.getAttribute('data-n');
    btn.textContent = lang === 'tr' ? `${n} Kişi` : `${n} Guest${n === '1' ? '' : 's'}`;
  });

  // Dynamically update the main reservation button text
  const rezBtn = document.getElementById('rezBtn');
  if (rezBtn) {
    rezBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ` + (lang === 'tr' ? 'Rezervasyon Yap' : 'Book Table');
  }

  // Update input placeholders with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (i18nData[lang] && i18nData[lang][key]) {
      el.setAttribute('placeholder', i18nData[lang][key]);
    }
  });

  // Update alt text with data-i18n-alt attribute
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.getAttribute('data-i18n-alt');
    if (i18nData[lang] && i18nData[lang][key]) {
      el.setAttribute('alt', i18nData[lang][key]);
    }
  });

  // Update title/aria-label with data-i18n-title (Phase 25 theme switch buttons, etc.)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (i18nData[lang] && i18nData[lang][key]) {
      el.setAttribute('title', i18nData[lang][key]);
      el.setAttribute('aria-label', i18nData[lang][key]);
    }
  });

  // Update document title dynamically
  document.title = 'My Restaurant';

  // Translate custom date select placeholders if they exist
  const rezSaatSelect = document.querySelector('#rezSaatOptions .custom-select-option[data-value=""]');
  if (rezSaatSelect) {
    rezSaatSelect.textContent = lang === 'tr' ? 'Seçin' : 'Select';
  }
  
  // Update currently selected placeholders if empty
  const rezGunSelect = document.getElementById('rezGun');
  const rezGunText = document.getElementById('rezGunSelectedText');
  if (rezGunSelect && rezGunText && rezGunSelect.value === '') {
    rezGunText.textContent = i18nData[lang].select_day || 'Gün';
  }
  
  const rezAySelect = document.getElementById('rezAy');
  const rezAyText = document.getElementById('rezAySelectedText');
  if (rezAySelect && rezAyText && rezAySelect.value === '') {
    rezAyText.textContent = i18nData[lang].select_month || 'Ay';
  }
  
  const rezYilSelect = document.getElementById('rezYil');
  const rezYilText = document.getElementById('rezYilSelectedText');
  if (rezYilSelect && rezYilText && rezYilSelect.value === '') {
    rezYilText.textContent = i18nData[lang].select_year || 'Yıl';
  }
  
  const rezSaatSelectVal = document.getElementById('rezSaat');
  const rezSaatText = document.getElementById('rezSaatSelectedText');
  if (rezSaatSelectVal && rezSaatText && rezSaatSelectVal.value === '') {
    rezSaatText.textContent = i18nData[lang].select_hour || 'Seçin';
  }

  // Update reservation dates
  updateRezDateOptions();

  // Reload categories & menu cards with translated item text
  renderCategoriesDropdown();
  updateFormCategoryOptions();
  
  const activeTabBtnForTitle = document.querySelector('.category-dropdown-option.active');
  const selectedText = document.getElementById('categoryDropdownSelectedText');
  if (selectedText && activeTabBtnForTitle) {
    const activeTab = activeTabBtnForTitle.getAttribute('data-tab');
    if (activeTab === 'tumu') {
      selectedText.textContent = lang === 'tr' ? 'Tüm Ürünler' : 'All Products';
    } else {
      const cat = categoriesMap[activeTab];
      if (cat) {
        let catName = cat.name;
        if (lang === 'en') {
          const catTranslations = {};
          catName = catTranslations[cat.name] || cat.name;
        }
        selectedText.textContent = catName;
      }
    }
  }
  
  // Find currently active category to rerender menu cards correctly
  const activeTabBtn = document.querySelector('.category-dropdown-option.active');
  const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
  renderMenuCards(activeCat);
  
  // Dynamically update Google Maps iframe language
  const mapIframe = document.getElementById('gmap-iframe');
  if (mapIframe) {
    mapIframe.src = `https://maps.google.com/maps?q=restaurant&output=embed&hl=${lang}`;
  }

  // Update header text in details modal if open
  const detailPanel = document.getElementById('foodDetailPanel');
  if (detailPanel && detailPanel.classList.contains('open')) {
    const hash = window.location.hash;
    if (hash.startsWith('#detay-')) {
      const id = hash.replace('#detay-', '');
      openFoodDetail(id, false);
    }
  }

  // Re-render orders so their dynamic (JS-rendered) labels follow the selected language.
  if (typeof renderAdminOrdersList === 'function' && (window.ordersData || []).length) renderAdminOrdersList();
  // Same for the QR table module (tables, dine-in orders, floor, service requests).
  if (typeof renderTables === 'function' && typeof tablesData !== 'undefined' && tablesData.length) renderTables();
  if (typeof renderTableOrders === 'function' && typeof dineinOrders !== 'undefined' && dineinOrders.length) renderTableOrders();
  if (typeof renderFloorOverview === 'function' && typeof tablesData !== 'undefined') renderFloorOverview();
  // Masa kartı galerisi: tasarım isimleri card-gallery.js'ten TR/EN geldiği için
  // dil değişiminde yeniden çizilmeli (data-i18n taramasıyla güncellenmezler).
  if (typeof cdLoaded !== 'undefined' && cdLoaded) { if (cdOrder) cdRenderOrderState(); else cdRenderAll(); }
  if (typeof renderServiceRequests === 'function') renderServiceRequests();
}

// Categories metadata for dynamic rendering
// Categories metadata for dynamic rendering
// (legacy category map removed — categories come from tenant DB data)

let categoriesMap = {};

function getCategoryTranslatedName(key, lang) {
  if (!categoriesMap[key]) return '';
  const cat = categoriesMap[key];
  if (lang === 'en') {
    const catTranslations = {};
    return catTranslations[cat.name] || cat.name;
  }
  return cat.name;
}

function updateFormCategoryOptions() {
  const lang = window.currentLanguage || 'tr';
  const allCategoriesText = i18nData[lang].all_categories || 'Tüm Kategoriler';

  // Update Product form Category options
  const formOptionsContainer = document.getElementById('formProductCategoryOptions');
  if (formOptionsContainer) {
    if (!window.selectedFormProductCategory) {
      window.selectedFormProductCategory = Object.keys(categoriesMap)[0] || '';
    }
    if (!categoriesMap[window.selectedFormProductCategory]) {
      window.selectedFormProductCategory = Object.keys(categoriesMap)[0] || '';
    }
    formOptionsContainer.innerHTML = Object.keys(categoriesMap).map(key => {
      const activeClass = window.selectedFormProductCategory === key ? 'active' : '';
      const catName = getCategoryTranslatedName(key, lang);
      return `
        <div class="custom-select-option ${activeClass}" onclick="selectFormProductCategoryOption('${key}')">
          ${categoriesMap[key].icon}
          <span>${catName}</span>
        </div>
      `;
    }).join('');
    const selectedText = document.getElementById('formProductCategorySelectedText');
    if (selectedText && categoriesMap[window.selectedFormProductCategory]) {
      selectedText.textContent = getCategoryTranslatedName(window.selectedFormProductCategory, lang);
    }
  }
  
  // Update Admin filter Category options
  const filterOptionsContainer = document.getElementById('adminCategoryFilterOptions');
  if (filterOptionsContainer) {
    if (!window.selectedAdminCategoryFilter) {
      window.selectedAdminCategoryFilter = 'tumu';
    }
    const activeTumu = window.selectedAdminCategoryFilter === 'tumu' ? 'active' : '';
    let html = `
      <div class="custom-select-option ${activeTumu}" onclick="selectAdminCategoryFilterOption('tumu')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
        <span>${allCategoriesText}</span>
      </div>
    `;
    html += Object.keys(categoriesMap).map(key => {
      const activeClass = window.selectedAdminCategoryFilter === key ? 'active' : '';
      const catName = getCategoryTranslatedName(key, lang);
      return `
        <div class="custom-select-option ${activeClass}" onclick="selectAdminCategoryFilterOption('${key}')">
          ${categoriesMap[key].icon}
          <span>${catName}</span>
        </div>
      `;
    }).join('');
    filterOptionsContainer.innerHTML = html;
    const selectedText = document.getElementById('adminCategoryFilterSelectedText');
    if (selectedText) {
      if (window.selectedAdminCategoryFilter === 'tumu') {
        selectedText.textContent = allCategoriesText;
      } else if (categoriesMap[window.selectedAdminCategoryFilter]) {
        selectedText.textContent = getCategoryTranslatedName(window.selectedAdminCategoryFilter, lang);
      } else {
        selectedText.textContent = allCategoriesText;
        window.selectedAdminCategoryFilter = 'tumu';
      }
    }
  }
}

// Admin panel category filter dropdown actions
function toggleAdminCategoryFilterDropdown(event) {
  event.stopPropagation();
  document.getElementById('formProductCategoryContainer')?.classList.remove('open');
  document.getElementById('categoryDropdownContainer')?.classList.remove('open');
  const container = document.getElementById('adminCategoryFilterContainer');
  if (container) container.classList.toggle('open');
}

function selectAdminCategoryFilterOption(val) {
  window.selectedAdminCategoryFilter = val;
  updateFormCategoryOptions();
  const container = document.getElementById('adminCategoryFilterContainer');
  if (container) container.classList.remove('open');
  renderAdminProductList();
}

// Form product category dropdown actions
function toggleFormProductCategoryDropdown(event) {
  event.stopPropagation();
  document.getElementById('adminCategoryFilterContainer')?.classList.remove('open');
  document.getElementById('categoryDropdownContainer')?.classList.remove('open');
  const container = document.getElementById('formProductCategoryContainer');
  if (container) container.classList.toggle('open');
}

function selectFormProductCategoryOption(val) {
  window.selectedFormProductCategory = val;
  updateFormCategoryOptions();
  const container = document.getElementById('formProductCategoryContainer');
  if (container) container.classList.remove('open');
}

// Document click to close all custom select dropdowns
document.addEventListener('click', (e) => {
  if (e.target.closest('.custom-select-container')) return;
  document.getElementById('adminCategoryFilterContainer')?.classList.remove('open');
  document.getElementById('formProductCategoryContainer')?.classList.remove('open');
  document.getElementById('rezSaatContainer')?.classList.remove('open');
  document.getElementById('rezGunContainer')?.classList.remove('open');
  document.getElementById('rezAyContainer')?.classList.remove('open');
  document.getElementById('rezYilContainer')?.classList.remove('open');
  document.getElementById('pushTimeOptionContainer')?.classList.remove('open');
});

const monthTranslations = {
  'tr': {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan', '05': 'Mayıs', '06': 'Haziran',
    '07': 'Temmuz', '08': 'Ağustos', '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
  },
  'en': {
    '01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June',
    '07': 'July', '08': 'August', '09': 'September', '10': 'October', '11': 'November', '12': 'December'
  }
};

const rezMonths = [
  { value: '01', name: 'Ocak' },
  { value: '02', name: 'Şubat' },
  { value: '03', name: 'Mart' },
  { value: '04', name: 'Nisan' },
  { value: '05', name: 'Mayıs' },
  { value: '06', name: 'Haziran' },
  { value: '07', name: 'Temmuz' },
  { value: '08', name: 'Ağustos' },
  { value: '09', name: 'Eylül' },
  { value: '10', name: 'Ekim' },
  { value: '11', name: 'Kasım' },
  { value: '12', name: 'Aralık' }
];

function toggleRezDateDropdown(event, type) {
  event.stopPropagation();
  document.getElementById('adminCategoryFilterContainer')?.classList.remove('open');
  document.getElementById('formProductCategoryContainer')?.classList.remove('open');
  document.getElementById('categoryDropdownContainer')?.classList.remove('open');
  document.getElementById('rezSaatContainer')?.classList.remove('open');
  
  // Close other date dropdowns
  ['rezGun', 'rezAy', 'rezYil'].forEach(t => {
    if (t !== type) {
      document.getElementById(t + 'Container')?.classList.remove('open');
    }
  });
  
  const container = document.getElementById(type + 'Container');
  if (container) container.classList.toggle('open');
}

function selectRezDateOption(type, optionElem, value) {
  const container = document.getElementById(type + 'Container');
  const input = document.getElementById(type);
  const selectedText = document.getElementById(type + 'SelectedText');
  
  if (input) input.value = value;
  if (selectedText) {
    if (value === '') {
      selectedText.textContent = type === 'rezGun' ? (window.currentLanguage === 'tr' ? 'Gün' : 'Day') : (type === 'rezAy' ? (window.currentLanguage === 'tr' ? 'Ay' : 'Month') : (window.currentLanguage === 'tr' ? 'Yıl' : 'Year'));
    } else {
      if (type === 'rezAy') {
        const monthName = (monthTranslations[window.currentLanguage] && monthTranslations[window.currentLanguage][value]) || value;
        selectedText.textContent = monthName;
      } else {
        selectedText.textContent = value;
      }
    }
  }
  
  if (optionElem && container) {
    const options = container.querySelectorAll('.custom-select-option');
    options.forEach(opt => opt.classList.remove('active'));
    optionElem.classList.add('active');
    container.classList.remove('open');
  }
  
  updateRezDateOptions();
}

function updateRezDateOptions() {
  const today = new Date();
  const curY = today.getFullYear();
  const curM = today.getMonth() + 1; // 1-12
  const curD = today.getDate();
  
  const selectedYVal = document.getElementById('rezYil')?.value;
  const selectedMVal = document.getElementById('rezAy')?.value;
  const selectedDVal = document.getElementById('rezGun')?.value;
  
  const selY = selectedYVal ? parseInt(selectedYVal) : null;
  const selM = selectedMVal ? parseInt(selectedMVal) : null;
  const selD = selectedDVal ? parseInt(selectedDVal) : null;
  
  // 1. Update Years
  const yilOptions = document.getElementById('rezYilOptions');
  if (yilOptions) {
    let html = `<div class="custom-select-option ${!selectedYVal ? 'active' : ''}" onclick="selectRezDateOption('rezYil', this, '')">${window.currentLanguage === 'tr' ? 'Yıl' : 'Year'}</div>`;
    [curY, curY + 1].forEach(y => {
      html += `<div class="custom-select-option ${selectedYVal == y ? 'active' : ''}" onclick="selectRezDateOption('rezYil', this, '${y}')">${y}</div>`;
    });
    yilOptions.innerHTML = html;
  }
  
  // 2. Update Months
  const ayOptions = document.getElementById('rezAyOptions');
  if (ayOptions) {
    let html = `<div class="custom-select-option ${!selectedMVal ? 'active' : ''}" onclick="selectRezDateOption('rezAy', this, '')">${window.currentLanguage === 'tr' ? 'Ay' : 'Month'}</div>`;
    rezMonths.forEach(m => {
      const mVal = parseInt(m.value);
      if (selY === curY && mVal < curM) {
        return;
      }
      const mName = (monthTranslations[window.currentLanguage] && monthTranslations[window.currentLanguage][m.value]) || m.name;
      html += `<div class="custom-select-option ${selectedMVal == m.value ? 'active' : ''}" onclick="selectRezDateOption('rezAy', this, '${m.value}')">${mName}</div>`;
    });
    ayOptions.innerHTML = html;
    
    if (selY === curY && selM && selM < curM) {
      document.getElementById('rezAy').value = '';
      document.getElementById('rezAySelectedText').textContent = window.currentLanguage === 'tr' ? 'Ay' : 'Month';
    }
  }
  
  // 3. Update Days
  const gunOptions = document.getElementById('rezGunOptions');
  if (gunOptions) {
    let html = `<div class="custom-select-option ${!selectedDVal ? 'active' : ''}" onclick="selectRezDateOption('rezGun', this, '')">${window.currentLanguage === 'tr' ? 'Gün' : 'Day'}</div>`;
    
    let maxDays = 31;
    if (selM) {
      const yearForDays = selY || curY;
      maxDays = new Date(yearForDays, selM, 0).getDate();
    }
    
    for (let d = 1; d <= maxDays; d++) {
      if (selY === curY && selM === curM && d < curD) {
        continue;
      }
      const dStr = d.toString();
      const dValStr = d < 10 ? '0' + d : d.toString();
      html += `<div class="custom-select-option ${selectedDVal == dValStr ? 'active' : ''}" onclick="selectRezDateOption('rezGun', this, '${dValStr}')">${d}</div>`;
    }
    gunOptions.innerHTML = html;
    
    if ((selY === curY && selM === curM && selD && selD < curD) || (selD && selD > maxDays)) {
      document.getElementById('rezGun').value = '';
      document.getElementById('rezGunSelectedText').textContent = window.currentLanguage === 'tr' ? 'Gün' : 'Day';
    }
  }
}

// Custom reservation hour dropdown actions
function toggleRezSaatDropdown(event) {
  event.stopPropagation();
  document.getElementById('adminCategoryFilterContainer')?.classList.remove('open');
  document.getElementById('formProductCategoryContainer')?.classList.remove('open');
  document.getElementById('categoryDropdownContainer')?.classList.remove('open');
  const container = document.getElementById('rezSaatContainer');
  if (container) container.classList.toggle('open');
}

function selectRezSaatOption(optionElem, value) {
  const container = document.getElementById('rezSaatContainer');
  const input = document.getElementById('rezSaat');
  const selectedText = document.getElementById('rezSaatSelectedText');
  
  if (input) input.value = value;
  if (selectedText) selectedText.textContent = value || (window.currentLanguage === 'tr' ? 'Seçin' : 'Select');
  
  // Update active option class
  if (container) {
    const options = container.querySelectorAll('.custom-select-option');
    options.forEach(opt => opt.classList.remove('active'));
    optionElem.classList.add('active');
    container.classList.remove('open');
  }
}

function renderCategoriesDropdown() {
  const dropdownList = document.getElementById('categoryDropdownList');
  if (!dropdownList) return;
  
  dropdownList.innerHTML = '';
  // Add a "Tümü" category button at the top of the menu selector
  const allProductsText = window.currentLanguage === 'tr' ? 'Tüm Ürünler' : 'All Products';
  const selectedText = document.getElementById('categoryDropdownSelectedText');
  if (selectedText) {
    const activeTabBtn = document.querySelector('.category-dropdown-option.active');
    if (!activeTabBtn || activeTabBtn.getAttribute('data-tab') === 'tumu') {
      selectedText.textContent = allProductsText;
    }
  }
  const tumuOption = document.createElement('div');
  tumuOption.className = 'category-dropdown-option active';
  tumuOption.setAttribute('data-tab', 'tumu');
  tumuOption.onclick = function() { selectCategoryOption(this, allProductsText); };
  tumuOption.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
    <span>${allProductsText}</span>
  `;
  dropdownList.appendChild(tumuOption);

  Object.keys(categoriesMap).forEach((key) => {
    const cat = categoriesMap[key];
    const option = document.createElement('div');
    option.className = 'category-dropdown-option';
    option.setAttribute('data-tab', key);
    
    // Translate category name dynamically
    let catName = cat.name;
    if (window.currentLanguage === 'en') {
      const catTranslations = {};
      catName = catTranslations[cat.name] || cat.name;
    }
    
    option.onclick = function() { selectCategoryOption(this, catName); };
    option.innerHTML = `
      ${cat.icon}
      <span>${catName}</span>
    `;
    dropdownList.appendChild(option);
  });
}

// Fetch data from server API database
let __adminInitialAuthGateDone = false;
async function loadMenuDatabase() {
  console.log("[DB DEBUG] loadMenuDatabase started.");
  try {
    // 1. Fetch Translations from API
    try {
      const transResponse = await fetch('/api/translations');
      if (transResponse.ok) {
        const apiTranslations = await transResponse.json();
        if (apiTranslations.tr) i18nData.tr = { ...i18nData.tr, ...apiTranslations.tr };
        if (apiTranslations.en) i18nData.en = { ...i18nData.en, ...apiTranslations.en };
      }
    } catch (e) {
      console.error("Failed to load translations from DB:", e);
    }

    // 2. Fetch Categories from API
    try {
      const catResponse = await fetch('/api/categories');
      if (catResponse.ok) {
        const categories = await catResponse.json();
        categoriesMap = {};
        categories.forEach(c => {
          // Spread every raw API field (including name_zh/name_ja/etc.) so new languages need
          // no change here — then override `name` to the Turkish value for existing callers.
          categoriesMap[c.id] = { ...c, name: c.name_tr };
        });
      }
    } catch (e) {
      console.error("Failed to load categories from DB:", e);
    }

    // 3. Fetch Products from API
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Database load failed');
    window.menuData = await response.json();
    console.log("[DB DEBUG] Successfully loaded products from API. Item count:", window.menuData.length);
    
    // Rebuild itemTranslations dynamically from menuData
    itemTranslations = {};
    window.menuData.forEach(p => {
      itemTranslations[p.id] = {
        name: p.name_en || p.name,
        description: p.description_en || p.description,
        portion: p.portion_en || (p.besin_degerleri && p.besin_degerleri.porsiyon),
        ingredients: p.ingredients_en || p.icindekiler
      };
    });

    // Load reservations count/data
    try {
      const res = await fetch('/api/reservations');
      if (res.ok) {
        window.reservationsData = await res.json();
      }
    } catch (e) {
      console.error("Failed to pre-load reservations count:", e);
    }

    // Render categories dynamically
    renderCategoriesDropdown();
    updateFormCategoryOptions();
    
    // Initial render
    renderMenuCards('tumu');
    
    // Check initial hash for deep linking
    handleDeepLink();
    
    // Standalone admin: go through the auth gate. openAdminLogin() validates any stored token via
    // /api/auth/me and only then opens the panel; otherwise it shows the login modal. This prevents
    // an unauthenticated visit from opening a blank panel whose data calls all 401. Gated to the
    // FIRST call only — openAdminLogin() -> openAdminPanel() forces the view back to Dashboard, so
    // re-running it on every later loadMenuDatabase() refresh (after saving a product, applying an
    // AI plan, applying an AI-generated image, etc.) was silently kicking the admin out of whatever
    // screen they were on and back to the Dashboard — a real, reproducible bug, not intended re-auth.
    if (window.isStandaloneAdmin && !__adminInitialAuthGateDone) {
      __adminInitialAuthGateDone = true;
      openAdminLogin();
    }
  } catch (error) {
    console.error('Error loading menu data:', error);
    window.menuData = window.menuData || [];
    if (window.isStandaloneAdmin && !__adminInitialAuthGateDone) {
      __adminInitialAuthGateDone = true;
      openAdminLogin();
    }
    document.getElementById('menuCardsContainer').innerHTML = `
      <p style="text-align:center;color:var(--muted);grid-column:1/-1;padding:40px 0;">
        Menü verileri yüklenemedi. Lütfen sunucu bağlantısını kontrol edin.
      </p>
    `;
  }
}

// Render food cards based on category
function renderMenuCards(category) {
  const container = document.getElementById('menuCardsContainer');
  if (!container) return;
  
  let filteredItems = window.menuData;
  if (category !== 'tumu') {
    filteredItems = window.menuData.filter(item => item.category === category);
  }
  
  const noProductMsg = window.currentLanguage === 'tr' ? 'Kategoride ürün bulunmamaktadır.' : 'No products found in this category.';
  if (filteredItems.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--muted);grid-column:1/-1;">${noProductMsg}</p>`;
    return;
  }
  
  const detailBtnText = window.currentLanguage === 'tr' ? 'Detay' : 'Detail';
  
  container.innerHTML = filteredItems.map(item => {
    let itemName = item.name;
    let itemDesc = item.description;
    if (window.currentLanguage === 'en' && itemTranslations[item.id]) {
      itemName = itemTranslations[item.id].name || item.name;
      itemDesc = itemTranslations[item.id].description || item.description;
    }
    
    return `
      <div class="food-card" onclick="openFoodDetail('${item.id}')">
        <div class="food-card-img">
          <img src="${item.image}" alt="${itemName}" loading="lazy">
        </div>
        <div class="food-card-info">
          <h4 class="food-card-title">${itemName}</h4>
          <p class="food-card-desc">${itemDesc}</p>
          <div class="food-card-bottom">
            <span class="food-card-price">₺${item.price}</span>
            <button class="food-card-btn">
              ${detailBtnText} 
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Allergen SVG helper
function getAllergenIcon(id) {
  switch(id) {
    case 'gluten':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20L22 2"/><path d="M8 16c0-2.5 1-4.5 3-5M16 8c2.5 0 4.5-1 5-3"/><path d="M11 13c0-2.5 1-4.5 3-5M13 11c2.5 0 4.5-1 5-3"/><path d="M14 10c0-2.5 1-4.5 3-5M9 13c-2.5 0-4.5 1-5 3M11 11c-2.5 0-4.5 1-5 3M12 10c-2.5 0-4.5 1-5 3"/></svg>`;
    case 'soya':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V12M12 12c-4 0-7-3-7-7V3h7v2c0 4 3 7 7 7v7h-7z"/><path d="M5 3h14"/></svg>`;
    case 'sut':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20h12V10l-2-3V3H8v4l-2 3v10z"/><path d="M8 3h8M6 10h12"/></svg>`;
    case 'hardal':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M9 2h6"/></svg>`;
    default:
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
  }
}

// Open Food Detail panel
function openFoodDetail(id, updateHash = true) {
  const item = window.menuData.find(x => x.id === id);
  if (!item) return;
  
  // Set Hash for SPA deep link
  if (updateHash) {
    window.location.hash = `detay-${id}`;
  }
  
  // Calculations for donut chart dasharray / offset
  const p = item.makrolar.protein.yuzde;
  const c = item.makrolar.karbonhidrat.yuzde;
  const f = item.makrolar.yag.yuzde;
  
  // Circ = 100
  const pDash = p;
  const cDash = c;
  const fDash = f;
  
  const pOffset = 75; // starts at 12 o'clock (25 dashes rotated CCW from 3 o'clock)
  const cOffset = pOffset - p;
  const fOffset = cOffset - c;
  
  const isDrink = item.category === 'diger' && item.id !== 'veggie-durum';
  const hasMacros = item.makrolar.protein.deger > 0;
  
  // Language translations variables
  const lang = window.currentLanguage;
  let itemName = item.name;
  let itemDesc = item.description;
  let itemIngredients = item.icindekiler;
  
  if (lang === 'en' && itemTranslations[item.id]) {
    itemName = itemTranslations[item.id].name || item.name;
    itemDesc = itemTranslations[item.id].description || item.description;
    itemIngredients = itemTranslations[item.id].ingredients || item.icindekiler;
  }
  
  let portionText = item.besin_degerleri.porsiyon;
  if (lang === 'en' && itemTranslations[item.id] && itemTranslations[item.id].portion) {
    portionText = itemTranslations[item.id].portion;
  } else if (lang === 'en') {
    portionText = portionText.replace('Menü', 'Menu').replace('Porsiyon', 'Portion');
  }

  // Allergen badge names translation
  function translateAllergenName(name) {
    if (lang !== 'en') return name;
    if (name.includes('Gluten')) return 'Gluten';
    if (name.includes('Soya')) return 'Soy';
    if (name.includes('Süt')) return 'Dairy';
    if (name.includes('Hardal')) return 'Mustard';
    return name;
  }

  function translateAllergenFullName(name) {
    if (lang !== 'en') return name;
    if (name === 'Gluten içerir') return 'Contains gluten';
    if (name === 'Soya içerebilir') return 'May contain soy';
    if (name === 'Süt ve süt ürünleri içerir') return 'Contains milk & dairy products';
    if (name === 'Hardal içerebilir') return 'May contain mustard';
    return name;
  }

  const content = `
    <div class="detail-img-container">
      <img src="${item.image}" alt="${itemName}">
    </div>
    
    <div class="detail-title-row">
      <h3>${itemName}</h3>
      <span class="detail-price">₺${item.price}</span>
    </div>
    
    <p class="detail-desc">${itemDesc}</p>
    
    <div class="detail-tabs">
      <button class="detail-tab-btn active" onclick="switchDetailTab(event, 'tabContentBesin')">${i18nData[lang].nutrition_facts}</button>
      <button class="detail-tab-btn" onclick="switchDetailTab(event, 'tabContentAlerjen')">${i18nData[lang].allergen_info}</button>
      <button class="detail-tab-btn" onclick="switchDetailTab(event, 'tabContentIcindekiler')">${i18nData[lang].ingredients}</button>
      <div class="detail-tab-indicator" id="detailTabIndicator" style="left: 0%;"></div>
    </div>
    
    <div class="detail-tab-content-wrapper">
      <div class="detail-tab-content-slider" id="detailTabContentSlider">
        <!-- TAB 1: BESİN DEĞERLERİ -->
        <div class="detail-tab-content active" id="tabContentBesin">
      <div class="nutrition-header">${i18nData[lang].nutrition_facts} (${portionText})</div>
      <div class="nutrition-table">
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].energy}</span>
          <span class="nutrition-val">${item.besin_degerleri.enerji} kcal</span>
        </div>
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].fat}</span>
          <span class="nutrition-val">${item.besin_degerleri.yag} g</span>
        </div>
        <div class="nutrition-row sub-row">
          <span class="nutrition-lbl">${i18nData[lang].saturated_fat}</span>
          <span class="nutrition-val">${item.besin_degerleri.doymus_yag} g</span>
        </div>
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].carbs}</span>
          <span class="nutrition-val">${item.besin_degerleri.karbonhidrat} g</span>
        </div>
        <div class="nutrition-row sub-row">
          <span class="nutrition-lbl">${i18nData[lang].sugars}</span>
          <span class="nutrition-val">${item.besin_degerleri.sekerler} g</span>
        </div>
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].fiber}</span>
          <span class="nutrition-val">${item.besin_degerleri.lif} g</span>
        </div>
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].protein} (g)</span>
          <span class="nutrition-val">${item.besin_degerleri.protein} g</span>
        </div>
        <div class="nutrition-row">
          <span class="nutrition-lbl">${i18nData[lang].salt}</span>
          <span class="nutrition-val">${item.besin_degerleri.tuz} g</span>
        </div>
      </div>
      
      ${hasMacros ? `
        <div class="detail-progress-section">
          <div>
            <div class="progress-row-info">
              <span>${i18nData[lang].protein}</span>
              <span style="font-weight:700; color: #81C784;">${item.makrolar.protein.deger} g (%${item.makrolar.protein.yuzde})</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="background:#81C784; width: ${item.makrolar.protein.yuzde}%"></div>
            </div>
          </div>
          <div>
            <div class="progress-row-info">
              <span>${lang === 'tr' ? 'Karbonhidrat' : 'Carbs'}</span>
              <span style="font-weight:700; color: #9a9a9a;">${item.makrolar.karbonhidrat.deger} g (%${item.makrolar.karbonhidrat.yuzde})</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="background:#9a9a9a; width: ${item.makrolar.karbonhidrat.yuzde}%"></div>
            </div>
          </div>
          <div>
            <div class="progress-row-info">
              <span>${lang === 'tr' ? 'Yağ' : 'Fat'}</span>
              <span style="font-weight:700; color: #f4f4f6;">${item.makrolar.yag.deger} g (%${item.makrolar.yag.yuzde})</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="background:#f4f4f6; width: ${item.makrolar.yag.yuzde}%"></div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
    
    <!-- TAB 2: ALERJEN BİLGİSİ -->
    <div class="detail-tab-content" id="tabContentAlerjen">
      ${hasMacros ? `
        <div class="nutrition-header">${i18nData[lang].macro_dist}</div>
        <div class="macro-donut-container">
          <div class="macro-donut-chart">
            <svg width="100" height="100" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="transparent"></circle>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(244,244,246,0.06)" stroke-width="4"></circle>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#81C784" stroke-width="4" stroke-dasharray="${pDash} ${100-pDash}" stroke-dashoffset="${pOffset}"></circle>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#9a9a9a" stroke-width="4" stroke-dasharray="${cDash} ${100-cDash}" stroke-dashoffset="${cOffset}"></circle>
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f4f4f6" stroke-width="4" stroke-dasharray="${fDash} ${100-fDash}" stroke-dashoffset="${fOffset}"></circle>
            </svg>
            <div class="donut-text">
              <span class="donut-kcal">${item.besin_degerleri.enerji}</span>
              <span class="donut-lbl">kcal</span>
            </div>
          </div>
          <div class="macro-legend">
            <div class="macro-legend-item">
              <div class="legend-label-group">
                <span class="legend-dot" style="background:#81C784"></span>
                <span>${i18nData[lang].protein}</span>
              </div>
              <span class="legend-pct">%${item.makrolar.protein.yuzde}</span>
            </div>
            <div class="macro-legend-item">
              <div class="legend-label-group">
                <span class="legend-dot" style="background:#9a9a9a"></span>
                <span>${lang === 'tr' ? 'Karbonhidrat' : 'Carbohydrates'}</span>
              </div>
              <span class="legend-pct">%${item.makrolar.karbonhidrat.yuzde}</span>
            </div>
            <div class="macro-legend-item">
              <div class="legend-label-group">
                <span class="legend-dot" style="background:#f4f4f6"></span>
                <span>${lang === 'tr' ? 'Yağ' : 'Fat'}</span>
              </div>
              <span class="legend-pct">%${item.makrolar.yag.yuzde}</span>
            </div>
          </div>
        </div>
      ` : ''}
      
      <div class="detail-allergens-container">
        <div class="detail-allergens-section">
          <h4>${i18nData[lang].allergen_warn_title}</h4>
          ${item.alerjenler.length > 0 ? `
            <div class="allergen-badges-row">
              ${item.alerjenler.map(a => `
                <div class="allergen-badge-item">
                  <div class="allergen-icon-circle" title="${translateAllergenFullName(a.name)}">
                    ${getAllergenIcon(a.id)}
                  </div>
                  <span>${translateAllergenName(a.name)}</span>
                </div>
              `).join('')}
            </div>
          ` : `<p style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;">${i18nData[lang].no_allergens}</p>`}
          
          <p class="allergen-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            ${i18nData[lang].cross_contamination_warn}
          </p>
        </div>
      </div>
    </div>
    
    <!-- TAB 3: İÇİNDEKİLER -->
    <div class="detail-tab-content" id="tabContentIcindekiler">
      <div class="detail-ingredients-section">
        <h4>${i18nData[lang].ingredients}</h4>
        <div class="ingredients-text">${itemIngredients}</div>
        ${item.katki_maddesi_icermez ? `
          <span class="ingredients-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ${i18nData[lang].no_additives}
          </span>
        ` : ''}
      </div>
    </div>
  </div>
</div>
    
    <!-- MENU INFO BLOCK (Visual Screen 4 Details) -->
    <div class="detail-menu-info">
      <div class="menu-info-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        ${i18nData[lang].cooked_weight_info}
      </div>
      <div class="menu-info-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        ${i18nData[lang].vat_included}
      </div>
      <div class="menu-info-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        ${i18nData[lang].rights_reserved}
      </div>
    </div>
    
    <div class="detail-menu-footer">
      <div class="detail-menu-footer-logo">My Restaurant</div>
      <div class="detail-menu-footer-sub" data-i18n="brand_name">My Restaurant</div>
      <div class="detail-menu-footer-tagline">${i18nData[lang].tagline}</div>
    </div>
  `;
  
  document.getElementById('detailBodyContent').innerHTML = content;
  
  // Show Panel
  document.getElementById('foodDetailBackdrop').classList.add('open');
  document.getElementById('foodDetailPanel').classList.add('open');
  document.body.style.overflow = 'hidden'; // prevent background scrolling
}

// Close Food Detail panel
function closeFoodDetail(updateHash = true) {
  document.getElementById('foodDetailBackdrop').classList.remove('open');
  document.getElementById('foodDetailPanel').classList.remove('open');
  document.body.style.overflow = '';
  
  // Clear Hash
  if (updateHash && window.location.hash.startsWith('#detay-')) {
    window.location.hash = '';
  }
}

// Tab Switcher inside Detail Panel
function switchDetailTab(event, contentId) {
  const btn = event.currentTarget;
  const tabsContainer = btn.parentElement;
  
  // Update active tab button class
  tabsContainer.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  // Find index of the clicked button
  const btns = Array.from(tabsContainer.querySelectorAll('.detail-tab-btn'));
  const idx = btns.indexOf(btn);
  
  // Slide orange indicator line
  const indicator = document.getElementById('detailTabIndicator');
  if (indicator) {
    indicator.style.left = (idx * 33.3333) + '%';
  }
  
  // Slide content panel
  const slider = document.getElementById('detailTabContentSlider');
  if (slider) {
    slider.style.transform = `translateX(-${idx * 33.3333}%)`;
  }
  
  // Toggle active class on panels for opacity/layout transitions
  const contents = document.querySelectorAll('.detail-tab-content');
  contents.forEach(c => c.classList.remove('active'));
  const activeContent = document.getElementById(contentId);
  if (activeContent) {
    activeContent.classList.add('active');
  }
}

// Handle deep links on page load or hash change
function handleDeepLink() {
  const hash = window.location.hash;
  if (hash.startsWith('#detay-')) {
    const id = hash.replace('#detay-', '');
    openFoodDetail(id, false);
  } else if (hash === '#admin' || hash === '#yonetici') {
    window.location.hash = "";
    openAdminPanel();
  } else {
    closeFoodDetail(false);
  }
}

// Hash change listener for back button support
window.addEventListener('hashchange', handleDeepLink);

// Initial database loading
loadMenuDatabase();

// Dropdown toggle
function toggleCategoryDropdown(event) {
  event.stopPropagation();
  const container = document.getElementById('categoryDropdownContainer');
  container.classList.toggle('open');
}

// Option selection
function selectCategoryOption(optionElem, label) {
  const container = document.getElementById('categoryDropdownContainer');
  const selectedText = document.getElementById('categoryDropdownSelectedText');
  
  // Update active state
  document.querySelectorAll('.category-dropdown-option').forEach(opt => opt.classList.remove('active'));
  optionElem.classList.add('active');
  
  // Update button text
  selectedText.textContent = label;
  
  // Render cards
  const categoryTab = optionElem.getAttribute('data-tab');
  renderMenuCards(categoryTab);
  
  // Close dropdown
  container.classList.remove('open');
}

// Close dropdown on outside click
document.addEventListener('click', () => {
  const container = document.getElementById('categoryDropdownContainer');
  if (container) container.classList.remove('open');
});

// Theme Toggle Logic
function applyTheme(themeName) {
  const themeSwitch = document.getElementById('switch');
  if (themeName === 'light') {
    document.body.classList.add('theme-bw');
    if (themeSwitch) themeSwitch.checked = true;
  } else {
    document.body.classList.remove('theme-bw');
    if (themeSwitch) themeSwitch.checked = false;
  }
}

function toggleMonochromeTheme(checkbox) {
  const themeName = checkbox.checked ? 'light' : 'dark';
  safeSetItem('theme', themeName);
  applyTheme(themeName);
}

// Load theme and language on page load
function initializeApp() {
  // Apply saved or default language
  applyLanguage(window.currentLanguage);

  const savedTheme = safeGetItem('theme');
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(systemPrefersLight ? 'light' : 'dark');
  }
  updateAdminRezBadge();

  // Initialize custom reservation date dropdowns
  updateRezDateOptions();
  
  // Periodically check and sync reservations from Telegram every 10 seconds
  syncReservationsWithTelegram();
  setInterval(syncReservationsWithTelegram, 10000);
  
  // OS color scheme listener disabled to prevent unexpected site color changes
  /* window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!safeGetItem('theme')) {
      applyTheme(e.matches ? 'light' : 'dark');
    }
  }); */
  
  // Dynamic instant synchronization for reservations, theme, and language changes across tabs/windows
  window.addEventListener('storage', (e) => {
    if (e.key === 'reservationsData') {
      renderAdminRezList();
      updateAdminRezBadge();
    }
    if (e.key === 'theme') {
      const newTheme = e.newValue || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      applyTheme(newTheme);
    }
    if (e.key === 'lang') {
      applyLanguage(e.newValue || 'tr');
    }
    if (e.key === 'menuData') {
      if (e.newValue) {
        window.menuData = JSON.parse(e.newValue);
        const activeTabBtn = document.querySelector('.category-dropdown-option.active');
        const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
        renderMenuCards(activeCat);
        if (typeof renderAdminProductList === 'function') {
          renderAdminProductList();
        }
      }
    }
    if (e.key === 'itemTranslationsData') {
      if (e.newValue) {
        itemTranslations = JSON.parse(e.newValue);
        const activeTabBtn = document.querySelector('.category-dropdown-option.active');
        const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
        renderMenuCards(activeCat);
        if (typeof renderAdminProductList === 'function') {
          renderAdminProductList();
        }
      }
    }
    if (e.key === 'categoriesMapData') {
      if (e.newValue) {
        categoriesMap = JSON.parse(e.newValue);
        renderCategoriesDropdown();
        updateFormCategoryOptions();
        const activeTabBtn = document.querySelector('.category-dropdown-option.active');
        const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
        renderMenuCards(activeCat);
        if (typeof renderAdminProductList === 'function') {
          renderAdminProductList();
        }
      }
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Scroll reveal
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
}, {threshold: 0.1});
document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));

// Bottom nav active state
const sections = ['gallery','menu','info'];
const navItems = document.querySelectorAll('.bnav-item');
window.addEventListener('scroll', () => {
  let cur = '';
  sections.forEach(id => {
    const el = document.getElementById(id);
    if(el && window.scrollY >= el.offsetTop - 200) cur = id;
  });
  navItems.forEach(item => {
    const href = item.getAttribute('href');
    item.classList.toggle('active', href && href.includes(cur));
  });
});



// Hero carousel
(function(){
  const slides = document.getElementById('heroSlides');
  if(!slides) return;
  const dots = document.querySelectorAll('.hdot');
  let cur = 0, total = 7, timer, startX = 0, isDragging = false;

  function goTo(n){
    cur = (n + total) % total;
    slides.style.transform = 'translateX(-' + (cur * 14.2857) + '%)';
    dots.forEach((d,i)=>d.classList.toggle('active', i===cur));
  }

  dots.forEach((d,i)=>d.addEventListener('click',()=>{ clearInterval(timer); goTo(i); startAuto(); }));

  function startAuto(){ timer = setInterval(()=>goTo(cur+1), 3800); }
  startAuto();

  // Touch swipe
  const el = document.getElementById('heroCarousel');
  el.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;isDragging=true;},{passive:true});
  el.addEventListener('touchend',e=>{
    if(!isDragging) return;
    const dx = e.changedTouches[0].clientX - startX;
    if(Math.abs(dx)>40){ clearInterval(timer); goTo(dx<0?cur+1:cur-1); startAuto(); }
    isDragging=false;
  },{passive:true});
})();

// ── REZERVASYON ──
const BOT_TOKEN = '8784630979:AAFJk_fg4EwNVjnAErSaEIoD18PqWufMPKg';
const CHAT_ID   = '-5100786193';

window.reservationsData = [];

async function loadReservations() {
  try {
    const res = await fetch('/api/reservations');
    if (!res.ok) throw new Error('Failed to fetch reservations');
    window.reservationsData = await res.json();
    renderAdminRezList();
    updateAdminRezBadge();
  } catch (e) {
    console.error("Error loading reservations:", e);
  }
}

let seciliPax = '1';
document.querySelectorAll('.pax-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pax-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    seciliPax = btn.dataset.n;
  });
});

async function sendRezervasyon() {
  const ad        = document.getElementById('rezAd').value.trim();
  const tel       = document.getElementById('rezTel').value.trim();
  const gun       = document.getElementById('rezGun').value;
  const ay        = document.getElementById('rezAy').value;
  const yil       = document.getElementById('rezYil').value;
  const saat      = document.getElementById('rezSaat').value;
  const not_      = document.getElementById('rezNot').value.trim();
  const msg       = document.getElementById('rezMsg');
  const btn       = document.getElementById('rezBtn');

  if(!ad || !tel || !gun || !ay || !yil || !saat){
    msg.style.display='block';
    msg.style.background='rgba(var(--fire-rgb),0.2)';
    msg.style.color='var(--bad)';
    msg.style.border='1px solid rgba(var(--fire-rgb),0.3)';
    msg.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ' + (window.currentLanguage === 'tr' ? 'Lütfen tüm alanları doldurun.' : 'Please fill all fields.');
    return;
  }

  btn.disabled=true; btn.textContent = window.currentLanguage === 'tr' ? 'Gönderiliyor...' : 'Sending...';

  const ayIsim = window.currentLanguage === 'tr'
    ? ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
    : ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const tarihOku = parseInt(gun) + ' ' + ayIsim[parseInt(ay)] + ' ' + yil;
  const isTr = window.currentLanguage === 'tr';
  const labelRez = isTr ? 'YENİ REZERVASYON' : 'NEW RESERVATION';
  const labelAd = isTr ? 'Ad Soyad' : 'Full Name';
  const labelTel = isTr ? 'Telefon' : 'Phone';
  const labelTarih = isTr ? 'Tarih' : 'Date';
  const labelSaat = isTr ? 'Saat' : 'Time';
  const labelKisi = isTr ? 'Kişi' : 'Guests';
  const labelNot = isTr ? 'Not' : 'Note';
  const labelSitesi = isTr ? '— My Restaurant Web Sitesi' : '— My Restaurant Web Site';
  
  const metin = `${labelRez}\n\n${labelAd}: ${ad}\n${labelTel}: ${tel}\n${labelTarih}: ${tarihOku}\n${labelSaat}: ${saat}\n${labelKisi}: ${seciliPax}${not_ ? `\n${labelNot}: ` + not_ : ''}\n\n${labelSitesi}`;

  const newRez = {
    id: 'rez-' + Date.now(),
    name: ad,
    phone: tel,
    date: tarihOku,
    time: saat,
    pax: parseInt(seciliPax),
    note: not_,
    read: false,
    timestamp: Date.now()
  };

  try {
    const postRes = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRez)
    });
    if (!postRes.ok) throw new Error('API save failed');
    await loadReservations();
  } catch (e) {
    console.error("Error saving reservation to SQLite API:", e);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chat_id: CHAT_ID, text: metin, parse_mode:'HTML'})
    });
    const data = await res.json();
    if(data.ok){

      msg.style.display='block';
      msg.style.background='rgba(76,175,80,0.15)';
      msg.style.color='#81C784';
      msg.style.border='1px solid rgba(76,175,80,0.3)';
      msg.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ' + (window.currentLanguage === 'tr' ? 'Rezervasyonunuz alındı! En kısa sürede sizi arayacağız.' : 'Your reservation has been received! We will contact you as soon as possible.');
      document.getElementById('rezAd').value='';
      document.getElementById('rezTel').value='';
      document.getElementById('rezGun').value='';
      document.getElementById('rezAy').value='';
      document.getElementById('rezYil').value='';
      document.getElementById('rezSaat').value='';
      document.getElementById('rezNot').value='';
      
      // Reset custom reservation date & hour dropdown UI
      document.getElementById('rezGunSelectedText').textContent = window.currentLanguage === 'tr' ? 'Gün' : 'Day';
      document.getElementById('rezAySelectedText').textContent = window.currentLanguage === 'tr' ? 'Ay' : 'Month';
      document.getElementById('rezYilSelectedText').textContent = window.currentLanguage === 'tr' ? 'Yıl' : 'Year';
      document.getElementById('rezSaatSelectedText').textContent = window.currentLanguage === 'tr' ? 'Seçin' : 'Select';
      
      const dropdownOptionsList = document.querySelectorAll(
        '#rezGunOptions .custom-select-option, ' +
        '#rezAyOptions .custom-select-option, ' +
        '#rezYilOptions .custom-select-option, ' +
        '#rezSaatOptions .custom-select-option'
      );
      dropdownOptionsList.forEach(opt => {
        if (opt.getAttribute('data-value') === '') {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
      
      updateRezDateOptions();
    } else {
      throw new Error('API hatası');
    }
  } catch(e){
    msg.style.display='block';
    msg.style.background='rgba(var(--fire-rgb),0.2)';
    msg.style.color='var(--bad)';
    msg.style.border='1px solid rgba(var(--fire-rgb),0.3)';
    msg.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> ' + (window.currentLanguage === 'tr' ? 'Bağlantı hatası. Lütfen telefonla arayın: 123 456 789' : 'Connection error. Please call: 123 456 789');
  }
  btn.disabled=false; btn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + (window.currentLanguage === 'tr' ? 'Rezervasyon Yap' : 'Book Table');
}

async function syncReservationsWithTelegram() {
  console.log("[DB DEBUG] syncReservationsWithTelegram bypassed. Using SQLite veritabanı.");
}

// ── ADMIN LOGIN & MANAGEMENT SYSTEM ──

async function openAdminLogin(e) {
  if(e) e.preventDefault();
  // Session restore: an existing valid token skips the login modal entirely.
  if (getAdminToken()) {
    try {
      const me = await fetch('/api/auth/me');
      if (me.ok) { openAdminPanel(); return; }
      setAdminToken('');
    } catch (err) { /* fall through to the modal */ }
  }
  // A multi-restaurant Google account with no tenant picked yet goes to the restaurant picker
  // instead of the login modal — the identity token alone is enough to list its restaurants.
  if (getIdentityToken()) { showRestaurantHub(); return; }
  // Kullanıcı isteğiyle kaldırıldı: admin.html artık kendi eski/stilsiz giriş modalını
  // GÖSTERMİYOR. root.html'in zaten yaptığı gibi, tek/tutarlı One UI giriş deneyimi için
  // /giris'e (login.html) yönlendiriyoruz — tenant bağlamı korunuyor.
  const tenant = new URLSearchParams(window.location.search).get('tenant') || '';
  window.location.href = '/giris' + (tenant ? ('?tenant=' + encodeURIComponent(tenant)) : '');
}

function closeAdminLogin() {
  window.location.href = "./";
}

// Google Sign-In inside the embedded login modal — same backend call as login.html's own
// button, just a different DOM target. Lazily fetches platform-config once (only when the
// login modal is actually shown), then renders Google's own button exactly once.
let ADMIN_GOOGLE_CLIENT_ID = null; // null = not fetched yet, '' = fetched, none configured
let adminGoogleButtonRendered = false;
async function initAdminGoogleButton(attemptsLeft) {
  if (ADMIN_GOOGLE_CLIENT_ID === null) {
    try {
      const cfg = await (await fetch('/api/platform-config')).json();
      ADMIN_GOOGLE_CLIENT_ID = cfg.google_client_id || '';
    } catch (e) { ADMIN_GOOGLE_CLIENT_ID = ''; }
  }
  const wrap = document.getElementById('adminGoogleWrap');
  if (!ADMIN_GOOGLE_CLIENT_ID) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = 'block';
  if (adminGoogleButtonRendered) return;
  if (!(window.google && google.accounts && google.accounts.id)) {
    if (attemptsLeft > 0) setTimeout(() => initAdminGoogleButton(attemptsLeft - 1), 150);
    return;
  }
  google.accounts.id.initialize({ client_id: ADMIN_GOOGLE_CLIENT_ID, callback: onAdminGoogleCredential });
  google.accounts.id.renderButton(document.getElementById('adminGoogleBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', width: 300 });
  adminGoogleButtonRendered = true;
}
let adminGoogleSigninInProgress = false;
async function onAdminGoogleCredential(resp) {
  // Render's free hosting plan can take several seconds to wake up on the first request after being
  // idle — with no visible feedback here, a slow (but working) first attempt looked like a dead click,
  // so people clicked again. Show a status message immediately and ignore a second click while one is
  // already in flight, instead of letting them silently stack up.
  if (adminGoogleSigninInProgress) return;
  adminGoogleSigninInProgress = true;
  const err = document.getElementById('adminLoginError');
  err.style.color = 'var(--ap-muted)';
  err.textContent = aiT('admin_google_signing', window.currentLanguage === 'tr' ? 'Giriş yapılıyor…' : 'Signing in…');
  err.style.display = 'block';
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: resp.credential })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (!data.token && !data.multi)) throw new Error('google-failed');
    document.getElementById('adminLoginBackdrop').classList.remove('open');
    if (data.multi) {
      setIdentityToken(data.identityToken);
      showRestaurantHub();
      return;
    }
    setAdminToken(data.token);
    openAdminPanel();
  } catch (e) {
    adminGoogleSigninInProgress = false;
    err.style.color = 'var(--ap-bad)';
    err.textContent = (typeof i18nData !== 'undefined' && i18nData[window.currentLanguage] && i18nData[window.currentLanguage].admin_google_err)
      || (window.currentLanguage === 'tr' ? 'Google ile giriş yapılamadı.' : 'Could not sign in with Google.');
    err.style.display = 'block';
  }
}

async function submitAdminLogin() {
  const username = (document.getElementById('adminUsername') || {}).value || '';
  const pwd = document.getElementById('adminPassword').value;
  const err = document.getElementById('adminLoginError');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password: pwd })
    });
    if (!res.ok) throw new Error('bad-credentials');
    const data = await res.json();
    setAdminToken(data.token);
    document.getElementById('adminLoginBackdrop').classList.remove('open');
    openAdminPanel();
  } catch (e) {
    err.textContent = (typeof i18nData !== 'undefined' && i18nData[window.currentLanguage] && i18nData[window.currentLanguage].admin_login_wrong)
      || (window.currentLanguage === 'tr' ? 'Kullanıcı adı veya şifre hatalı!' : 'Wrong username or password!');
    err.style.display = 'block';
  }
}

function openAdminPanel() {
  console.log('SUCCESS: admin panel opened!');
  const shell = document.getElementById('adminAppShell');
  if (shell) shell.classList.remove('hub-mode'); // in case this follows a hub restaurant pick
  window.selectedAdminCategoryFilter = 'tumu';
  updateFormCategoryOptions();
  document.getElementById('adminSearchInput').value = '';
  document.getElementById('adminPanelOverlay').classList.add('open');
  // .admin-modal-backdrop kullanan panel modalları (masa/kart onayı vb.) DOM'da bu overlay'in
  // KARDEŞİ olduğundan overlay-scoped --ap-* token'larını miras alamıyor (ölçülerek doğrulandı —
  // pre-existing bug). body üzerinde ayrı bir sınıfla CSS'te düz seçiciyle hedefleniyor;
  // :has(#adminPanelOverlay.open) denendi ama bu ortamda beklenen cascade önceliğini vermedi.
  document.body.classList.add('ap-open');
  document.body.style.overflow = 'hidden';
  apInitTheme(); // Phase 25: panel theme (scoped to the overlay; customer site untouched)

  // Phase 25 REVISION: default landing view is the Dashboard (mirrors root.html's showShell())
  // ...UNLESS this is a fresh self-service signup fresh off /restoran-olustur (?onboarding=1),
  // in which case we drop them straight into the AI Assistant with a kickoff message instead of
  // an empty Dashboard — the whole point of that signup path was "let AI build my menu".
  const isOnboarding = new URLSearchParams(window.location.search).get('onboarding') === '1';
  // Landing/login sayfalarındaki CTA'lar (örn. NFC bölümündeki "Kartınızı Seçin") belirli bir
  // sekmeyi açmak için #table-card gibi bir hash taşıyabilir — önceden bunu okuyan hiçbir mekanizma
  // yoktu, panel her zaman Dashboard'da açılıyordu. AP_VIEW_MAP'te karşılığı varsa o sekme açılır.
  const hashView = (window.location.hash || '').replace(/^#/, '');
  if (isOnboarding) {
    showAdminView('ai-assistant');
    adminAiShowOnboardingWelcome();
    // Strip the query param so a refresh/reshare of this URL doesn't replay the welcome message.
    try { window.history.replaceState({}, '', window.location.pathname + window.location.search.replace(/[?&]onboarding=1\b/, '').replace(/^&/, '?')); } catch (e) {}
  } else if (hashView && AP_VIEW_MAP[hashView]) {
    showAdminView(hashView);
    // Hash'i temizle ki sayfa yenilenince (ör. kullanıcı başka bir sekmeye geçtikten sonra F5)
    // her seferinde bu view'a geri dönmesin.
    try { window.history.replaceState({}, '', window.location.pathname + window.location.search); } catch (e) {}
  } else {
    showAdminView('dashboard');
  }

  // Eager loads that must run regardless of the active view (badges, live feed, cached config)
  loadAdminProfile(); // real Google photo/name in the top-right, if this account has one
  renderAdminProductList();
  renderAdminRezList();
  updateAdminRezBadge();
  loadOrders();   // populate Orders list + badge immediately on login
  if (typeof loadTableOrders === 'function') loadTableOrders();       // dine-in badge
  if (typeof loadServiceRequests === 'function') loadServiceRequests();
  if (typeof connectAdminEvents === 'function') connectAdminEvents(); // real-time feed
  // Cache tenant branding so printed QR codes show the correct logo + name
  fetch('/api/site-config').then(r => r.ok ? r.json() : null).then(cfg => {
    if (cfg) window.__siteConfig = cfg;
    // Phase 25.2: refresh the notification-preview brand slot as soon as tenant config lands,
    // so the mock header shows the tenant's real name/logo even before the Bildirim view opens.
    if (typeof updatePushPreview === 'function') { try { updatePushPreview(); } catch(e){} }
    const viewSiteLink = document.getElementById('adminViewSiteLink');
    if (viewSiteLink) {
      const slug = (cfg && cfg.id) || new URLSearchParams(window.location.search).get('tenant') || '';
      const loc = window.location;
      if (!slug) {
        viewSiteLink.href = '/menu';
      } else if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname.endsWith('netlify.app') || loc.hostname.endsWith('onrender.com')) {
        viewSiteLink.href = '/menu?tenant=' + encodeURIComponent(slug);
      } else {
        const parts = loc.hostname.split('.');
        const base = parts.length > 2 ? parts.slice(1).join('.') : loc.hostname;
        viewSiteLink.href = loc.protocol + '//' + encodeURIComponent(slug) + '.' + base + (loc.port ? ':' + loc.port : '');
      }
    }
  }).catch(() => {});
}

// ── Phase 50: "Restoranlarım" hub — multi-restaurant Google accounts ──
// Shown instead of the login modal (or after a multi-tenant Google sign-in) whenever an identity
// token exists with no restaurant chosen yet. Reuses #adminPanelOverlay's whole shell/theme system
// (hub-mode just hides the sidebar/nav so nothing tenant-scoped can fire) rather than a new page.
function hubMsg(text) {
  const el = document.getElementById('hubMsg');
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block'; el.textContent = text;
}
async function showRestaurantHub(days) {
  document.getElementById('adminPanelOverlay').classList.add('open');
  // .admin-modal-backdrop kullanan panel modalları (masa/kart onayı vb.) DOM'da bu overlay'in
  // KARDEŞİ olduğundan overlay-scoped --ap-* token'larını miras alamıyor (ölçülerek doğrulandı —
  // pre-existing bug). body üzerinde ayrı bir sınıfla CSS'te düz seçiciyle hedefleniyor;
  // :has(#adminPanelOverlay.open) denendi ama bu ortamda beklenen cascade önceliğini vermedi.
  document.body.classList.add('ap-open');
  document.body.style.overflow = 'hidden';
  const shell = document.getElementById('adminAppShell');
  if (shell) shell.classList.add('hub-mode');
  apInitTheme();
  showAdminView('hub');
  hubMsg('');
  const rangeEl = document.getElementById('hubAnRange');
  days = days || (rangeEl ? rangeEl.value : '30');
  if (rangeEl) rangeEl.value = String(days);
  const list = document.getElementById('hubRestoList');
  if (list) list.innerHTML = '<div class="hint">' + aiT('admin_hub_loading', 'Yükleniyor…') + '</div>';
  renderHubStats(null);
  try {
    const res = await fetch('/api/auth/my-restaurants?days=' + encodeURIComponent(days), { headers: { Authorization: 'Bearer ' + getIdentityToken() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'failed');
    const wname = document.getElementById('hubWelcomeName');
    if (wname) wname.textContent = data.display_name ? (', ' + data.display_name + '!') : '!';
    renderHubStats(data.totals);
    renderHubList(data.tenants);
  } catch (e) {
    if (list) list.innerHTML = '';
    hubMsg(aiT('admin_hub_error', 'Restoranlar yüklenemedi.'));
  }
}
function renderHubStats(t) {
  t = t || {};
  const loc = (window.currentLanguage === 'tr') ? 'tr-TR' : 'en-US';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('hubStatRestaurants', t.restaurants != null ? Number(t.restaurants).toLocaleString(loc) : '–');
  set('hubStatOrders', t.orders != null ? Number(t.orders).toLocaleString(loc) : '–');
  set('hubStatRevenue', t.revenue != null ? ('₺' + Math.round(t.revenue).toLocaleString(loc)) : '–');
}
// Each restaurant gets its own wide card (name + Aç up top, its own order/sales totals for the
// selected period, and the SAME Masa/Paket area chart the single-restaurant dashboard already
// draws — renderDashAreaChart is reused verbatim, just fed this tenant's own ordersByDay slice).
function renderHubList(list) {
  const host = document.getElementById('hubRestoList');
  if (!host) return;
  if (!list || !list.length) {
    host.innerHTML = '<div class="hint">' + aiT('admin_hub_empty', 'Henüz bir restoranınız yok.') + '</div>';
    return;
  }
  const loc = (window.currentLanguage === 'tr') ? 'tr-TR' : 'en-US';
  const dineinLabel = aiT('admin_analytics_dinein', 'Masa');
  const deliveryLabel = aiT('admin_analytics_delivery', 'Paket / Gel-al');
  host.innerHTML = list.map(t => {
    const s = t.summary || { orders: 0, revenue: 0 };
    return `
    <div class="panel-card hub-resto-card">
      <div class="hub-resto-head">
        <div class="hub-resto-logo">${t.logo_url ? `<img src="${aiAsstEsc(t.logo_url)}" alt="">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>`}</div>
        <div class="hub-resto-info"><b>${aiAsstEsc(t.display_name || t.name)}</b><span>${aiAsstEsc(t.id)}</span></div>
        <button type="button" class="admin-btn hub-open-btn" onclick="selectRestaurant('${aiAsstEsc(t.id)}')">${aiT('admin_hub_open', 'Aç')}</button>
      </div>
      <div class="hub-resto-stats">
        <div class="hr-stat"><span class="hr-k">${aiT('admin_hub_stat_orders', 'Sipariş')}</span><span class="hr-v">${Number(s.orders || 0).toLocaleString(loc)}</span></div>
        <div class="hr-stat"><span class="hr-k">${aiT('admin_hub_stat_revenue', 'Satış')}</span><span class="hr-v">₺${Math.round(s.revenue || 0).toLocaleString(loc)}</span></div>
      </div>
      <div class="dash-chart-legend">
        <span class="lg-item"><span class="lg-dot" style="background:var(--ap-gold);"></span>${dineinLabel}</span>
        <span class="lg-item"><span class="lg-dot" style="background:var(--ap-muted);"></span>${deliveryLabel}</span>
      </div>
      <div class="dash-chart-wrap" id="hub-chart-${aiAsstEsc(t.id)}"><div class="hint">${aiT('admin_hub_loading', 'Yükleniyor…')}</div></div>
    </div>`;
  }).join('');
  // Charts are drawn after the wraps exist in the DOM (renderDashAreaChart reads clientWidth/Height).
  list.forEach(t => {
    const wrap = document.getElementById('hub-chart-' + t.id);
    if (!wrap) return;
    const series = t.ordersByDay || [];
    if (!series.length || !series.some(d => (d.dinein || 0) + (d.delivery || 0) > 0)) {
      wrap.innerHTML = '<div class="hint" style="padding-top:64px;text-align:center;">' + aiT('admin_dash_empty', 'Bu aralıkta veri yok.') + '</div>';
      return;
    }
    renderDashAreaChart(wrap, series, 'ap');
  });
}
async function selectRestaurant(tenantId) {
  hubMsg('');
  try {
    const res = await fetch('/api/auth/select-tenant', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getIdentityToken() },
      body: JSON.stringify({ tenant_id: tenantId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data.error || 'failed');
    setAdminToken(data.token);
    openAdminPanel();
  } catch (e) {
    hubMsg(aiT('admin_hub_select_err', 'Restorana geçilemedi, tekrar deneyin.'));
  }
}
async function createNewRestaurantFromHub() {
  const promptText = aiT('admin_hub_new_prompt', 'Yeni restoranın adı:');
  const name = (window.prompt(promptText, '') || '').trim();
  if (!name) return;
  const btn = document.getElementById('hubAddBtn');
  if (btn) btn.disabled = true;
  hubMsg('');
  try {
    const res = await fetch('/api/auth/create-restaurant', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getIdentityToken() },
      body: JSON.stringify({ name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'failed');
    await showRestaurantHub();
  } catch (e) {
    hubMsg(aiT('admin_hub_create_err', 'Restoran oluşturulamadı.'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Phase 25 REVISION: sidebar-driven view switching (replaces switchAdminPanelTab) ──
//
// Maps a sidebar slug → the matching .view element ID + the lazy-load calls the old
// switchAdminPanelTab used to do. All existing render/load functions are reused verbatim;
// only the navigation trigger is new.
const AP_VIEW_MAP = {
  'hub':          { id: 'view-hub',                  title: 'admin_hub_title' },
  'dashboard':    { id: 'view-dashboard',           title: 'admin_nav_dashboard' },
  'restaurant-info': { id: 'view-restaurant-info',   title: 'admin_nav_restaurant_info' },
  'branding':     { id: 'view-branding',             title: 'admin_nav_branding' },
  'products':     { id: 'adminTabProducts',         title: 'admin_tab_prod' },
  'orders':       { id: 'adminTabOrdersCont',       title: 'admin_tab_orders' },
  'reservations': { id: 'adminTabRezCont',          title: 'admin_tab_rez' },
  'tables':       { id: 'adminTabTablesCont',       title: 'admin_tab_tables' },
  'table-orders': { id: 'adminTabTableOrdersCont',  title: 'admin_tab_tableorders' },
  'table-card':   { id: 'adminTabCardsCont',        title: 'admin_tab_cards' },
  'push':         { id: 'adminTabPushCont',         title: 'admin_nav_push' },
  'analytics':    { id: 'view-analytics',           title: 'admin_nav_analytics' },
  'ai-assistant': { id: 'view-ai-assistant',         title: 'admin_nav_ai' },
  'widgets':      { id: 'view-widgets',              title: 'admin_nav_widgets' },
  'danger-zone':  { id: 'view-danger-zone',           title: 'admin_nav_danger' },
  'website-editor': { id: 'view-website-editor',      title: 'admin_nav_website_editor' },
  'category-form':{ id: 'adminCategoryFormPanel',   title: 'admin_add_category_btn' },
  'product-form': { id: 'adminFormPanel',           title: 'admin_lbl_edit_product' },
  'settings':     { id: 'view-settings',            title: 'admin_nav_settings' }
};
// Phase 27 Part A: the category/product forms used to be full-viewport overlays
// (position:fixed;inset:0) living OUTSIDE #adminPanelOverlay. Relocate them (once) into
// .app-content as ordinary .view panes so the sidebar/topbar stay visible while they're open —
// same technique as every other section, zero change to their internal fields/save logic.
(function relocateFormsIntoShell(){
  const content = document.querySelector('#adminPanelOverlay .app-content');
  if (!content) return;
  ['adminCategoryFormPanel', 'adminFormPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== content) {
      el.classList.add('view');
      el.hidden = true;
      content.appendChild(el);
    }
  });
})();

// ═══ AYARLAR birleştirmesi (Faz 6) ═══
// 8 ayar bölümü → mevcut panel DOM id'si + lazy-load fonksiyonu. Paneller YENİDEN YAZILMAZ;
// init'te #setBody içine TAŞINIR, kendi kaydetme/render mantıkları aynen korunur.
const SETTINGS_SECTIONS = {
  'restaurant-info': { id: 'view-restaurant-info', load: 'loadRestaurantInfo' },
  'branding':        { id: 'view-branding',        load: 'loadBranding' },
  'tables':          { id: 'adminTabTablesCont',   load: 'loadTables' },
  'table-card':      { id: 'adminTabCardsCont',    load: 'cdInit' },
  'website-editor':  { id: 'view-website-editor',  load: 'loadWebsiteEditor' },
  'widgets':         { id: 'view-widgets',         load: 'loadTenantWidgets' },
  'danger-zone':     { id: 'view-danger-zone',     load: 'loadDangerZone' }
};
let apCurrentSettingsSection = 'restaurant-info';
// 8 paneli #setBody'ye taşı (bir kez). Taşınan paneller artık #view-settings içinde olduğundan
// showAdminView'in genel `.view` toggle'ından hariç tutuluyor (aşağıya bakınız).
(function relocateSettingsPanels(){
  const body = document.getElementById('setBody');
  if (!body) return;
  Object.values(SETTINGS_SECTIONS).forEach(sec => {
    const el = document.getElementById(sec.id);
    if (el && el.parentElement !== body) { el.hidden = true; body.appendChild(el); }
  });
})();
// Ayarlar içinde bir bölümü göster: diğerlerini gizle, menüyü işaretle, lazy-load'u çağır.
function showSettingsSection(section){
  if (!SETTINGS_SECTIONS[section]) section = 'restaurant-info';
  apCurrentSettingsSection = section;
  const body = document.getElementById('setBody');
  if (body) {
    Object.entries(SETTINGS_SECTIONS).forEach(([key, sec]) => {
      const el = document.getElementById(sec.id);
      if (el) el.hidden = (key !== section);
    });
  }
  document.querySelectorAll('#setNav .set-nav-item[data-sec]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-sec') === section));
  const fn = SETTINGS_SECTIONS[section].load;
  if (fn && typeof window[fn] === 'function') { try { window[fn](); } catch(e){ console.error('settings load '+fn, e); } }
}

function showAdminView(view) {
  // Faz 3A: sidebar'dan normal tek-görünüm gezintisine dönmek her zaman split-mode'dan çıkar —
  // panolara atama SADECE pano başlığındaki picker'dan yapılır, sidebar tıklaması karışıklık
  // yaratmasın diye.
  if (apSplitMode) apExitSplitModeSilent();
  // Görünümler arası her geçişte kaydırma konumunu sıfırla — önceki görünümde aşağı kaydırılmışken
  // geçiş yapılırsa yeni görünüm de aynı kaydırma konumunda açılıp üstte boşluk/kesik içerik
  // gösterebiliyordu (split-mode'dan çıkışta özellikle fark ediliyordu, ama tüm görünüm
  // geçişlerinde tutarlı olsun diye burada genel olarak uygulanıyor).
  const apContentEl = document.querySelector('#adminPanelOverlay .app-content');
  if (apContentEl) apContentEl.scrollTop = 0;
  // Ayarlar yönlendirmesi (Faz 6): 8 ayar bölümünün view-anahtarı (branding, tables, table-card,
  // restaurant-info, website-editor, widgets, danger-zone) ile ya da doğrudan 'settings' ile
  // çağrılınca, dış kabuk 'view-settings' olur ve ilgili bölüm sağ tarafta gösterilir.
  // /admin#table-card gibi landing derin-bağlantıları da böylece çalışmaya devam eder.
  let settingsTarget = null;
  if (SETTINGS_SECTIONS[view]) { settingsTarget = view; view = 'settings'; }
  else if (view === 'settings') { settingsTarget = apCurrentSettingsSection || 'restaurant-info'; }
  const spec = AP_VIEW_MAP[view] || AP_VIEW_MAP['dashboard'];
  // Toggle all .view panes inside the shell. Ayarlar İÇİNE taşınan paneller (#view-settings
  // altındakiler) bu genel toggle'dan hariç — onların görünürlüğünü showSettingsSection yönetir.
  document.querySelectorAll('#adminPanelOverlay .view').forEach(el => {
    if (el.id !== 'view-settings' && el.closest('#view-settings')) return;
    el.hidden = (el.id !== spec.id);
  });
  // Nav item active state (Ayarlar sidebar'da olmadığından, settings modunda tüm sidebar
  // öğelerinin active'i temizlenir).
  document.querySelectorAll('#adminPanelOverlay .nav-item[data-view]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-view') === view);
  });
  if (view === 'settings') showSettingsSection(settingsTarget);
  // Topbar page title (i18n)
  const pt = document.getElementById('adminPageTitle');
  if (pt) {
    pt.setAttribute('data-i18n', spec.title);
    const t = (typeof i18nData !== 'undefined' && i18nData[window.currentLanguage||'tr'] && i18nData[window.currentLanguage||'tr'][spec.title]);
    if (t) pt.textContent = t;
  }
  // Products' Add-Product / Add-Category buttons only relevant on the Products view
  const addBtn = document.getElementById('adminAddNewProductBtn');
  const addCatBtn = document.getElementById('adminAddNewCategoryBtn');
  const isProd = (view === 'products');
  if (addBtn) addBtn.style.display = isProd ? 'inline-block' : 'none';
  if (addCatBtn) addCatBtn.style.display = isProd ? 'inline-block' : 'none';
  // Lazy-load per view — same calls the old switchAdminPanelTab did, plus reservations
  // which the Explore pass found was never called on tab-switch before (a real gap).
  // Ayarlar bölümlerinin (restaurant-info/branding/tables/table-card/website-editor/widgets/
  // danger-zone) lazy-load'u showSettingsSection içinde yapılıyor — burada tekrarlanmaz.
  if (view === 'dashboard')       loadAdminDashboard();
  else if (view === 'analytics')  loadAdminAnalytics();
  else if (view === 'orders')     loadOrders();
  else if (view === 'reservations' && typeof loadReservations === 'function') loadReservations();
  else if (view === 'push')       loadPushDashboardData();
  else if (view === 'table-orders') {
    if (typeof loadTableOrders === 'function') loadTableOrders();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  }
  // Close the mobile drawer after navigating
  apToggleSidebar(false);
}

// ── Faz 3A: Çoklu Ekran Bölme (Bottom Container panoları) ──
// Bir görünüm aynı anda sadece TEK panoda olabilir; .view elemanları klonlanmaz, gerçekten
// appendChild ile taşınır (getElementById çakışmasını önler, mevcut render/load fonksiyonlarına
// dokunulmaz — sadece DOM'un NEREDE göründüğü değişir).
let apSplitMode = false;
let apSplitPanes = []; // view-adı dizisi, index = pano konumu, max 4
const AP_SPLITTABLE_VIEWS = ['dashboard', 'orders', 'table-orders', 'reservations', 'analytics'];

function apT(key, fallback) {
  const t = (typeof i18nData !== 'undefined' && i18nData[window.currentLanguage || 'tr'] && i18nData[window.currentLanguage || 'tr'][key]);
  return t || fallback || key;
}

// Panonun ihtiyaç duyduğu veriyi bir kez tazeler — showAdminView()'daki lazy-load dispatch'in
// aynısı, sadece görünürlük/nav-state yan etkileri olmadan.
function apLoadViewData(view) {
  if (view === 'dashboard') loadAdminDashboard();
  else if (view === 'analytics') loadAdminAnalytics();
  else if (view === 'orders') loadOrders();
  else if (view === 'reservations' && typeof loadReservations === 'function') loadReservations();
  else if (view === 'table-orders') {
    if (typeof loadTableOrders === 'function') loadTableOrders();
    if (typeof loadServiceRequests === 'function') loadServiceRequests();
  }
}

// Sadece DOM temizliği: panolardaki .view'ları .app-content'e geri taşır, split grid'i gizler.
// showAdminView()'ı ÇAĞIRMAZ (çağırsaydı showAdminView → apExitSplitModeSilent → ... sonsuz
// döngü riski olurdu) — hangi görünümün gösterileceğine çağıran karar verir.
// KRİTİK: kurtarma apSplitPanes DİZİSİNE göre değil, grid içinde O AN GERÇEKTEN bulunan .view
// elemanlarına (DOM sorgusu) göre yapılır — apSplitRemovePane() son panoyu kaldırırken diziyi
// ÖNCE boşaltıp SONRA bu fonksiyonu çağırıyor, yani dizi tabanlı kurtarma o durumda hiçbir şeyi
// kurtaramaz ve grid.innerHTML='' geriye kalan (taşınmış, klon değil) .view'ı kalıcı olarak silerdi.
function apExitSplitModeSilent() {
  const content = document.querySelector('#adminPanelOverlay .app-content');
  const grid = document.getElementById('apSplitGrid');
  if (grid && content) {
    grid.querySelectorAll('.view').forEach(el => { el.hidden = true; content.insertBefore(el, grid); });
    grid.hidden = true;
    grid.innerHTML = '';
  }
  apSplitMode = false;
  apSplitPanes = [];
  const btn = document.getElementById('apSplitToggleBtn');
  if (btn) btn.classList.remove('active');
}

function apToggleSplitMode() {
  if (apSplitMode) {
    apExitSplitModeSilent();
    const activeNav = document.querySelector('#adminPanelOverlay .nav-item.active[data-view]');
    showAdminView(activeNav ? activeNav.getAttribute('data-view') : 'dashboard');
    return;
  }
  if (!apSplitPanes.length) {
    let saved = null;
    try { saved = JSON.parse(safeGetItem('hasaca_admin_split_layout') || 'null'); } catch (e) {}
    apSplitPanes = (Array.isArray(saved) && saved.length)
      ? [...new Set(saved.filter(v => AP_SPLITTABLE_VIEWS.includes(v)))].slice(0, 4)
      : ['orders', 'table-orders'];
  }
  apSplitMode = true;
  document.querySelectorAll('#adminPanelOverlay .nav-item[data-view]').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('#adminPanelOverlay .view').forEach(el => { el.hidden = true; });
  const apContentEl2 = document.querySelector('#adminPanelOverlay .app-content');
  if (apContentEl2) apContentEl2.scrollTop = 0;
  const btn = document.getElementById('apSplitToggleBtn');
  if (btn) btn.classList.add('active');
  apRenderSplitGrid();
}

function apRenderSplitGrid() {
  const content = document.querySelector('#adminPanelOverlay .app-content');
  const grid = document.getElementById('apSplitGrid');
  if (!content || !grid) return;
  // KRİTİK: .view elemanları panolara klonlanmadan, gerçekten taşınarak (appendChild) yerleştirilir
  // — yani grid'in içindeler. `grid.innerHTML=''` bunları KLONLAMAK yerine KALICI OLARAK SİLERDİ
  // (innerHTML='' alt node'ları DOM'dan tamamen kopartır) — bu yüzden grid'i boşaltmadan ÖNCE her
  // .view'ı .app-content'e (gizli) geri kurtarmak şart, yoksa ör. "Masa Siparişi" ekranı kalıcı
  // olarak kaybolur ve sayfa yenilenene kadar geri gelmez.
  grid.querySelectorAll('.view').forEach(el => { el.hidden = true; content.insertBefore(el, grid); });
  grid.hidden = false;
  grid.className = 'ap-split-grid panes-' + apSplitPanes.length;
  grid.innerHTML = '';
  apSplitPanes.forEach((viewName, idx) => {
    const spec = AP_VIEW_MAP[viewName];
    if (!spec) return;
    const pane = document.createElement('div');
    pane.className = 'ap-split-pane';
    const options = AP_SPLITTABLE_VIEWS.map(v => {
      const vspec = AP_VIEW_MAP[v];
      const disabled = apSplitPanes.includes(v) && v !== viewName;
      return `<option value="${v}" ${v === viewName ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${apT(vspec.title, v)}</option>`;
    }).join('');
    const head = document.createElement('div');
    head.className = 'ap-split-pane-head';
    head.innerHTML = `
      <select class="ap-split-pane-picker" aria-label="${apT('admin_split_toggle', 'Ekranı Böl')}">${options}</select>
      <button type="button" class="ap-split-pane-close" aria-label="${apT('admin_split_remove_pane', 'Panoyu Kaldır')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    head.querySelector('.ap-split-pane-picker').addEventListener('change', (e) => apSplitAssign(idx, e.target.value));
    head.querySelector('.ap-split-pane-close').addEventListener('click', () => apSplitRemovePane(idx));
    const body = document.createElement('div');
    body.className = 'ap-split-pane-body';
    pane.appendChild(head);
    pane.appendChild(body);
    grid.appendChild(pane);
    const el = document.getElementById(spec.id);
    if (el) { el.hidden = false; body.appendChild(el); }
    apLoadViewData(viewName);
  });
  if (apSplitPanes.length < 4) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ap-split-add-pane';
    addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg><span>${apT('admin_split_add_pane', 'Pano Ekle')}</span>`;
    addBtn.addEventListener('click', apSplitAddPane);
    grid.appendChild(addBtn);
  }
  try { safeSetItem('hasaca_admin_split_layout', JSON.stringify(apSplitPanes)); } catch (e) {}
}

function apSplitAssign(idx, viewName) {
  const otherIdx = apSplitPanes.indexOf(viewName);
  if (otherIdx !== -1 && otherIdx !== idx) apSplitPanes[otherIdx] = apSplitPanes[idx];
  apSplitPanes[idx] = viewName;
  apRenderSplitGrid();
}

function apSplitRemovePane(idx) {
  const spec = AP_VIEW_MAP[apSplitPanes[idx]];
  if (spec) { const el = document.getElementById(spec.id); if (el) el.hidden = true; }
  apSplitPanes.splice(idx, 1);
  if (!apSplitPanes.length) {
    apExitSplitModeSilent();
    showAdminView('dashboard');
    return;
  }
  apRenderSplitGrid();
}

function apSplitAddPane() {
  if (apSplitPanes.length >= 4) return;
  const used = new Set(apSplitPanes);
  const next = AP_SPLITTABLE_VIEWS.find(v => !used.has(v)) || AP_SPLITTABLE_VIEWS[0];
  apSplitPanes.push(next);
  apRenderSplitGrid();
}

// ── Sidebar / topbar helpers (ports of root.html's toggleSidebar/Collapse/ProfileMenu) ──
function apToggleSidebar(force) {
  const shell = document.getElementById('adminAppShell');
  if (!shell) return;
  const open = typeof force === 'boolean' ? force : !shell.classList.contains('drawer-open');
  shell.classList.toggle('drawer-open', open);
  const bd = document.getElementById('adminAppBackdrop');
  if (bd) bd.classList.toggle('show', open);
}
function apToggleCollapse() {
  const shell = document.getElementById('adminAppShell');
  if (!shell) return;
  const c = shell.classList.toggle('collapsed');
  try { safeSetItem('hasaca_admin_panel_collapsed', c ? '1' : '0'); } catch (e) {}
}
function apToggleProfileMenu(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('adminProfileMenu');
  if (m) m.classList.toggle('open');
}
document.addEventListener('click', (e) => {
  const m = document.getElementById('adminProfileMenu');
  if (m && m.classList.contains('open') && !e.target.closest('#adminProfile')) m.classList.remove('open');
});

// Real logout (Phase 25 REVISION): the old "Kapat" only navigated away, leaving the token valid.
// Multi-restaurant accounts (Phase 50): the SAME "Çıkış Yap" button, clicked from inside a
// restaurant's own admin panel, returns to the "Restoranlarım" hub instead of a full logout —
// the identity token (and thus the Google session) stays alive. Clicked from the hub itself (or
// by any single-restaurant account with no identity token at all), it's a full logout as before.
function adminLogout() {
  const inHub = document.getElementById('adminAppShell') && document.getElementById('adminAppShell').classList.contains('hub-mode');
  if (!inHub && getIdentityToken()) {
    try { setAdminToken(''); } catch (e) {}
    showRestaurantHub();
    return;
  }
  try { setAdminToken(''); } catch (e) {}
  try { setIdentityToken(''); } catch (e) {}
  window.location.href = '/';
}

// ── Dashboard + Analytics (reuse existing tenant-scoped endpoints) ──
async function loadAdminDashboard() {
  try {
    const tok = (typeof getAdminToken === 'function' ? getAdminToken() : '');
    if (!tok) return;
    const a = await (await fetch('/api/admin/analytics?days=30', { headers: { 'Authorization': 'Bearer ' + tok } })).json();
    const s = a.summary || {};
    const lang = window.currentLanguage || 'tr';
    const loc = lang === 'tr' ? 'tr-TR' : 'en-US';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('adDashOrders', (s.orders != null ? s.orders : 0).toLocaleString(loc));
    set('adDashRevenue', '₺' + Math.round(s.revenue || 0).toLocaleString(loc));
    set('adDashAvg', '₺' + Math.round(s.avgOrderValue || 0).toLocaleString(loc));
    set('adDashRez', (s.reservations != null ? s.reservations : 0).toLocaleString(loc));
  } catch (e) { console.warn('loadAdminDashboard:', e); }
  // Dashboard analytics chart (replaces the old recent-activity card — Phase 38, tenant-scoped
  // port of root.html's Phase 37 chart). Activity Log itself is unaffected — still reachable from
  // the sidebar via /api/admin/activity.
  loadAdminDashboardAnalytics();
}

async function loadAdminDashboardAnalytics(){
  const wrap = document.getElementById('adDashChartWrap');
  if (!wrap) return;
  const rangeEl = document.getElementById('adDashAnRange');
  const days = rangeEl ? rangeEl.value : '30';
  try {
    const tok = (typeof getAdminToken === 'function' ? getAdminToken() : '');
    if (!tok) return;
    const a = await (await fetch('/api/admin/analytics?days=' + days, { headers: { 'Authorization': 'Bearer ' + tok } })).json();
    const series = a.ordersByDay || [];
    if (!series.length || !series.some(d => (d.dinein || 0) + (d.delivery || 0) > 0)) {
      wrap.innerHTML = '<div class="hint" style="padding-top:64px;text-align:center;">' + adminT('admin_dash_empty') + '</div>';
      return;
    }
    renderDashAreaChart(wrap, dcSmoothSeries(series), 'ap');
  } catch (e) {
    wrap.innerHTML = '<div class="hint" style="color:var(--ap-bad);">' + adminT('admin_dash_err') + '</div>';
  }
}

// Centered moving average (window 3, clamped at the edges to whatever neighbors exist) over the
// raw daily order counts BEFORE they become chart points — Catmull-Rom smoothing (below) only
// curves the line BETWEEN points, it still passes exactly through each one, so a single noisy day
// still shows up as a sharp spike. Dampening the series itself is what actually calms that down.
function dcSmoothSeries(series){
  return series.map((d, i) => {
    // Window of 5 (2 days either side, clamped at the edges) — window 3 still left sharp
    // back-to-back swings between a quiet day and a busy one.
    const win = series.slice(Math.max(0, i - 2), Math.min(series.length, i + 3));
    // Rounded — the hover tooltip displays these same numbers, and "3.33 sipariş" would look
    // like a bug rather than a smoothed trend.
    const avg = key => Math.round(win.reduce((s, x) => s + (x[key] || 0), 0) / win.length);
    return { ...d, dinein: avg('dinein'), delivery: avg('delivery') };
  });
}
// Catmull-Rom -> cubic-bezier smoothing, converted to an SVG path string. (Ported from root.html.)
function dcSmoothPath(points){
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}
// Closed area between a smooth "top" curve and a smooth "bottom" curve (same x positions).
function dcAreaPath(topPoints, bottomPoints){
  const top = dcSmoothPath(topPoints);
  const bottom = dcSmoothPath(bottomPoints.slice().reverse());
  return top + ' L' + bottom.slice(1) + ' Z';
}

// tokenPrefix: 'ap' on admin.html (--ap-gold/--ap-muted), '' on root.html (--gold/--muted) —
// the two pages use independent token systems, this is the only thing that differs between them.
function renderDashAreaChart(wrapEl, series, tokenPrefix){
  const prefix = tokenPrefix ? '--' + tokenPrefix + '-' : '--';
  const goldVar = `var(${prefix}gold)`, mutedVar = `var(${prefix}muted)`;
  const width = wrapEl.clientWidth || 400;
  const height = wrapEl.clientHeight || 180;
  const padTop = 14, padBottom = 22, padSide = 2;
  const plotW = width - padSide * 2, plotH = height - padTop - padBottom;
  const n = series.length;
  const maxTotal = Math.max(1, ...series.map(d => (d.dinein || 0) + (d.delivery || 0)));

  const xAt = i => padSide + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  // Values map into the MIDDLE band of the plot (15%-85%), not edge-to-edge — a quiet day no
  // longer touches the floor and a busy day no longer touches the ceiling, so the line reads as
  // "hovering in a healthy range" instead of swinging between empty and maxed-out.
  const bandTop = padTop + plotH * 0.15, bandH = plotH * 0.70;
  const yAt = v => bandTop + bandH - (v / maxTotal) * bandH;

  const dineinTop = series.map((d, i) => ({ x: xAt(i), y: yAt(d.dinein || 0) }));
  const baseline = series.map((d, i) => ({ x: xAt(i), y: yAt(0) }));
  const stackedTop = series.map((d, i) => ({ x: xAt(i), y: yAt((d.dinein || 0) + (d.delivery || 0)) }));

  const dineinArea = dcAreaPath(dineinTop, baseline);
  const deliveryArea = dcAreaPath(stackedTop, dineinTop);
  const dineinLine = dcSmoothPath(dineinTop);
  const deliveryLine = dcSmoothPath(stackedTop);

  const labelCount = width < 380 ? 3 : (width < 600 ? 4 : 6);
  const step = Math.max(1, Math.round((n - 1) / Math.max(1, labelCount - 1)));
  const labelIdx = [];
  for (let i = 0; i < n; i += step) labelIdx.push(i);
  if (labelIdx[labelIdx.length - 1] !== n - 1) labelIdx.push(n - 1);

  const lang = window.currentLanguage || 'tr';
  const fmtDate = dateStr => new Date(dateStr + 'T00:00:00')
    .toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric' });

  const uid = 'dc' + Math.random().toString(36).slice(2, 8);
  const dineinLabel = (typeof adminT === 'function' ? adminT('admin_analytics_dinein') : 'Masa');
  const deliveryLabel = (typeof adminT === 'function' ? adminT('admin_analytics_delivery') : 'Paket');

  wrapEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${uid}-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stop-color="${goldVar}" stop-opacity="0.55"/>
          <stop offset="95%" stop-color="${goldVar}" stop-opacity="0.04"/>
        </linearGradient>
        <linearGradient id="${uid}-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stop-color="${mutedVar}" stop-opacity="0.45"/>
          <stop offset="95%" stop-color="${mutedVar}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${deliveryArea}" fill="url(#${uid}-b)" stroke="none"></path>
      <path d="${deliveryLine}" fill="none" stroke="${mutedVar}" stroke-width="1.75"></path>
      <path d="${dineinArea}" fill="url(#${uid}-a)" stroke="none"></path>
      <path d="${dineinLine}" fill="none" stroke="${goldVar}" stroke-width="1.75"></path>
      <line class="dc-guide" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" style="opacity:0;"></line>
      <g class="dc-axis">${labelIdx.map(i =>
        `<text x="${xAt(i)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle')}">${fmtDate(series[i].date)}</text>`
      ).join('')}</g>
      <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" style="cursor:crosshair;"></rect>
    </svg>
    <div class="dash-chart-tooltip"></div>`;

  const svg = wrapEl.querySelector('svg');
  const hitbox = wrapEl.querySelector('rect');
  const guide = wrapEl.querySelector('.dc-guide');
  const tip = wrapEl.querySelector('.dash-chart-tooltip');

  hitbox.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) / rect.width * width;
    const relX = (svgX - padSide) / plotW;
    const idx = Math.max(0, Math.min(n - 1, Math.round(relX * (n - 1))));
    const d = series[idx];
    const px = xAt(idx);
    guide.setAttribute('x1', px); guide.setAttribute('x2', px);
    guide.style.opacity = '1';
    const wrapRect = wrapEl.getBoundingClientRect();
    tip.style.left = (wrapRect.width * (px / width)) + 'px';
    tip.style.top = '4px';
    tip.classList.add('show');
    tip.innerHTML = `<div class="dct-date">${fmtDate(d.date)}</div>
      <div class="dct-row"><span class="dct-dot" style="background:${goldVar}"></span>${dineinLabel}<b>${d.dinein || 0}</b></div>
      <div class="dct-row"><span class="dct-dot" style="background:${mutedVar}"></span>${deliveryLabel}<b>${d.delivery || 0}</b></div>`;
  });
  hitbox.addEventListener('mouseleave', () => { guide.style.opacity = '0'; tip.classList.remove('show'); });
}
async function loadAdminAnalytics() {
  try {
    const tok = (typeof getAdminToken === 'function' ? getAdminToken() : '');
    if (!tok) return;
    const a = await (await fetch('/api/admin/analytics?days=30', { headers: { 'Authorization': 'Bearer ' + tok } })).json();
    const s = a.summary || {}, ts = a.typeSplit || {};
    const lang = window.currentLanguage || 'tr';
    const loc = lang === 'tr' ? 'tr-TR' : 'en-US';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('adAnOrders', (s.orders != null ? s.orders : 0).toLocaleString(loc));
    set('adAnRevenue', '₺' + Math.round(s.revenue || 0).toLocaleString(loc));
    set('adAnAvg', '₺' + Math.round(s.avgOrderValue || 0).toLocaleString(loc));
    set('adAnDinein', (ts.dinein != null ? ts.dinein : 0).toLocaleString(loc));
    set('adAnDelivery', (ts.delivery != null ? ts.delivery : 0).toLocaleString(loc));
    const top = document.getElementById('adAnTop');
    const items = a.topProducts || [];
    if (top) {
      if (!items.length) { top.innerHTML = '<div class="hint">—</div>'; }
      else {
        const esc = x => String(x == null ? '' : x).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
        top.innerHTML = items.map(p => '<div class="act-row"><div class="act-main"><b>' + esc(p.name) + '</b></div><span class="act-when">' + p.qty + '×</span></div>').join('');
      }
    }
  } catch (e) { console.warn('loadAdminAnalytics:', e); }
}

// ── ThinkingOrb (Phase 70) — FAITHFUL vanilla-JS port of the real npm package "thinking-orbs"
// (Jakub Antalik, github.com/Jakubantalik/thinking-orbs, MIT) — this project has no bundler/React
// runtime to consume the actual React component, so the engine was ported directly from the
// library's own source (src/engine/*.ts, src/presets.ts, src/ThinkingOrb.tsx as published on
// GitHub) — same math, same tuned preset numbers, TypeScript types stripped, function/const names
// prefixed aiOrb* to stay collision-free in this single-file page. Only real structural change:
// React's useEffect mount/unmount lifecycle became this class's start()/stop(), and dark-mode
// detection reads this page's own html[data-theme] instead of the library's generic ancestor-DOM
// auto-detection (this page already knows its own theme state, no need to re-derive it).

// engine/core.ts — shared primitives (honestly-3D dotted sphere: rotated, depth-shaded, z-sorted).
function aiOrbHashD(a, b) { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); }
function aiOrbVnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = aiOrbHashD(xi, yi), b = aiOrbHashD(xi + 1, yi), c = aiOrbHashD(xi, yi + 1), d = aiOrbHashD(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function aiOrbFibDir(i, n) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const rad = Math.sqrt(1 - y * y);
  const a = i * golden;
  return [rad * Math.cos(a), y, rad * Math.sin(a)];
}
function aiOrbAngleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function aiOrbLerp(a, b, f) { return a + (b - a) * f; }
function aiOrbFrac(x) { return x - Math.floor(x); }
function aiOrbMakeProj(yaw, tilt, cx, cy, scale) {
  const st = Math.sin(tilt), ct = Math.cos(tilt), sy = Math.sin(yaw), cyw = Math.cos(yaw);
  return (x, y, z) => {
    const x1 = x * cyw + z * sy;
    const z1 = -x * sy + z * cyw;
    const y1 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    return [cx + x1 * scale, cy - y1 * scale, z2];
  };
}
function aiOrbPaint(ctx, dots, dark, rMin) {
  rMin = rMin == null ? 0.3 : rMin;
  dots.sort((a, b) => a.z - b.z);
  for (const d of dots) {
    const alpha = d.a == null ? 1 : d.a;
    if (alpha < 0.02) continue;
    const w = Math.min(1, Math.max(0, d.white));
    const g = Math.round((dark ? 1 - w : w) * 255);
    ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + alpha + ')';
    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(rMin, d.r), 0, Math.PI * 2);
    ctx.fill();
  }
}
function aiOrbPaintLines(ctx, lines, dark) {
  for (const l of lines) {
    const alpha = l.a == null ? 1 : l.a;
    if (alpha < 0.02) continue;
    const w = Math.min(1, Math.max(0, l.white));
    const g = Math.round((dark ? 1 - w : w) * 255);
    ctx.strokeStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + alpha + ')';
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
}
function aiOrbRadiusScale(size, pow) { return Math.pow(size / 300, pow); }

// engine/profiles.ts — density profiles + the multiplier machinery that scales them.
const AI_ORB_COUNT_PAIRS = [['latRings', 'lonDensity'], ['rings', 'lonDensity'], ['lanes', 'segs']];
const AI_ORB_COUNT_KEYS = ['orbitN', 'ghostN', 'nodeN', 'strandN', 'signals'];
const AI_ORB_RADIUS_KEYS = ['rBase', 'rDepth', 'rActive', 'rDot', 'ghostR', 'partR', 'partRDepth', 'nodeR', 'nodeRDepth'];
function aiOrbScaleCounts(opts, scale) {
  const out = Object.assign({}, opts);
  const done = new Set();
  const rt = Math.sqrt(scale);
  for (const pair of AI_ORB_COUNT_PAIRS) {
    const a = pair[0], b = pair[1];
    const va = out[a], vb = out[b];
    if (va != null && vb != null && !done.has(a) && !done.has(b)) {
      out[a] = Math.max(2, Math.round(va * rt));
      out[b] = Math.max(2, Math.round(vb * rt));
      done.add(a); done.add(b);
    }
  }
  for (const k of AI_ORB_COUNT_KEYS) {
    const v = out[k];
    if (v != null && v !== 0 && !done.has(k)) out[k] = Math.max(1, Math.round(v * scale));
  }
  if (out.iconD != null) out.iconD = Math.max(0.02, out.iconD * scale);
  return out;
}
function aiOrbScaleRadii(opts, scale) {
  const out = Object.assign({}, opts);
  for (const k of AI_ORB_RADIUS_KEYS) {
    const v = out[k];
    if (v != null) out[k] = v * scale;
  }
  out.rSizeMul = (out.rSizeMul == null ? 1 : out.rSizeMul) * scale;
  return out;
}
const AI_ORB_BASE_PROFILES = {
  globe: { latRings:17, lonDensity:44, rBase:0.6, rDepth:1.7, rBoost:1.0, inkFar:0.62, inkSpan:0.54, rsPow:0.6, rMin:0.3 },
  orbits: { orbitN:12, ghostN:40, ghostR:0.9, ghostA:0.5, particles:3, partR:1.2, partRDepth:1.6, rsPow:0.6, rMin:0.3 },
  rubik: { latRings:15, lonDensity:40, moveCount:14, rBase:0.6, rDepth:1.7, rActive:0.3, inkFar:0.62, inkSpan:0.54, rsPow:0.6, rMin:0.3 },
  wave: { rings:15, lonDensity:40, rBase:0.6, rDepth:1.7, rsPow:0.6, rMin:0.3 },
  web: { nodeN:30, thr:0.72, signals:5, nodeR:1.4, nodeRDepth:1.8, lineW:0.8, rsPow:0.6, rMin:0.3 },
  braid: { strandN:52, turns:3.0, ghostN:150, rBase:1.2, rDepth:1.8, rsPow:0.6, rMin:0.3 },
  ribbon: { lanes:5, segs:88, ghostN:150, rBase:1.1, rDepth:1.7, rsPow:0.6, rMin:0.3 },
  ring: { lanes:5, segs:88, ghostN:0, faceOn:1, rBase:1.1, rDepth:1.7, rsPow:0.6, rMin:0.3 },
  morph: { rDot:0.021, iconD:1, rMin:0.25 }
};

// engine/orbits.ts — "working": particles on tilted orbits, coreless.
function aiOrbDrawOrbits(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.82;
  const pt = aiOrbMakeProj(t * 0.12, 0.3, cx, cy, 1);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const dots = [];
  const orbitN = o.orbitN == null ? 12 : o.orbitN;
  const ghostN = o.ghostN == null ? 40 : o.ghostN;
  const particles = o.particles == null ? 3 : o.particles;
  for (let orb = 0; orb < orbitN; orb++) {
    const h1 = aiOrbHashD(orb, 1.7), h2 = aiOrbHashD(orb, 5.2), h3 = aiOrbHashD(orb, 8.9);
    const ro = R * (0.45 + 0.52 * h1);
    const th = h1 * 2 * Math.PI;
    const phi = Math.acos(2 * h2 - 1);
    const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
    let ux = -ny, uy = nx; const uz = 0;
    const ul = Math.max(1e-6, Math.sqrt(ux * ux + uy * uy));
    ux /= ul; uy /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const speed = (0.25 + 0.55 * h3) * (h3 > 0.5 ? 1 : -1);
    for (let k = 0; k < ghostN; k++) {
      const a = (k / ghostN) * 2 * Math.PI;
      const p = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
      const depth = (p[2] / ro + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: (o.ghostR == null ? 0.9 : o.ghostR) * rs, white: 0.72, a: (o.ghostA == null ? 0.5 : o.ghostA) * (0.4 + 0.6 * depth) });
    }
    for (let m = 0; m < particles; m++) {
      const a = t * speed + (m / particles) * 2 * Math.PI + h2 * 6;
      const p = pt((ux * Math.cos(a) + vx * Math.sin(a)) * ro, (uy * Math.cos(a) + vy * Math.sin(a)) * ro, (uz * Math.cos(a) + vz * Math.sin(a)) * ro);
      const depth = (p[2] / ro + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.partR == null ? 1.2 : o.partR) + (o.partRDepth == null ? 1.6 : o.partRDepth) * depth) * rs, white: 0.3 - 0.22 * depth });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// engine/lattice.ts — globe (searching), rubik (solving), wave (listening): a lat/long dot field
// with mode-specific motion.
function aiOrbSolveCycle(time, count, slotDur, rest) {
  const cyc = 2 * count * slotDur + rest;
  const tc = time % cyc;
  const amount = new Array(count).fill(0);
  let active = -1;
  if (tc < 2 * count * slotDur) {
    const slot = Math.floor(tc / slotDur);
    const p = (tc - slot * slotDur) / slotDur;
    const cl = Math.min(1, p / 0.7);
    const ep = 1 - Math.pow(1 - cl, 3);
    if (slot < count) {
      for (let i = 0; i < slot; i++) amount[i] = 1;
      amount[slot] = ep; active = slot;
    } else {
      const u = 2 * count - 1 - slot;
      for (let i = 0; i < u; i++) amount[i] = 1;
      amount[u] = 1 - ep; active = u;
    }
  }
  return { amount: amount, active: active };
}
function aiOrbApplyMoves(pt3, moves, sc) {
  let x = pt3[0], y = pt3[1], z = pt3[2];
  let inActive = false;
  for (let i = 0; i < moves.length; i++) {
    if (sc.amount[i] <= 0) continue;
    const mv = moves[i];
    const coord = mv.axis === 0 ? x : mv.axis === 1 ? y : z;
    if (coord < mv.lo || coord >= mv.hi) continue;
    if (i === sc.active) inActive = true;
    const a = mv.ang * sc.amount[i];
    const ca = Math.cos(a), sa = Math.sin(a);
    if (mv.axis === 0) { const y2 = y * ca - z * sa; z = y * sa + z * ca; y = y2; }
    else if (mv.axis === 1) { const x2 = x * ca + z * sa; z = -x * sa + z * ca; x = x2; }
    else { const x2 = x * ca - y * sa; y = x * sa + y * ca; x = x2; }
  }
  return [x, y, z, inActive];
}
function aiOrbMakeMoves(count) {
  const moves = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.min(2, Math.floor(aiOrbHashD(i, 2.3) * 3));
    const lo = -1.0 + 0.5 * Math.min(3, Math.floor(aiOrbHashD(i, 5.9) * 4));
    const dir = aiOrbHashD(i, 7.7) < 0.5 ? 1 : -1;
    moves.push({ axis: axis, lo: lo, hi: lo + 0.5, ang: (dir * Math.PI) / 2 });
  }
  return moves;
}
function aiOrbDrawGlobe(ctx, size, t, dark, o) {
  const spin = 0.5;
  const cx = size / 2, cy = size / 2;
  const radius = (size / 2) * 0.82;
  const tilt = 0.4 + 0.06 * Math.sin(t * 0.35);
  const pt = aiOrbMakeProj(t * spin, tilt, cx, cy, radius);
  const scan = t * (spin + (1.7 - spin) * (o.scanMul == null ? 1 : o.scanMul));
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const dimBase = o.dimBase == null ? 1 : o.dimBase;
  const dots = [];
  const latRings = o.latRings == null ? 17 : o.latRings;
  const lonDensity = o.lonDensity == null ? 44 : o.lonDensity;
  for (let li = 0; li <= latRings; li++) {
    const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * Math.PI;
      const p = pt(cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon));
      const depth = (p[2] + 1) / 2;
      const d = aiOrbAngleDelta(lon + t * spin, scan);
      const boost = Math.exp(-(d * d) / 0.18) * Math.max(0, p[2]);
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.rBase == null ? 0.6 : o.rBase) + (o.rDepth == null ? 1.7 : o.rDepth) * depth + (o.rBoost == null ? 1 : o.rBoost) * boost) * rs, white: (o.inkFar == null ? 0.62 : o.inkFar) - (o.inkSpan == null ? 0.54 : o.inkSpan) * depth, a: dimBase + (1 - dimBase) * Math.min(1, boost) });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}
function aiOrbDrawRubik(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.82;
  const pt = aiOrbMakeProj(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, R);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const moveCount = o.moveCount == null ? 14 : o.moveCount;
  const moves = aiOrbMakeMoves(moveCount);
  const sc = aiOrbSolveCycle(t, moveCount, 0.42, 1.2);
  const dots = [];
  const latRings = o.latRings == null ? 15 : o.latRings;
  const lonDensity = o.lonDensity == null ? 40 : o.lonDensity;
  for (let li = 0; li <= latRings; li++) {
    const lat = -Math.PI / 2 + (li / latRings) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * Math.PI;
      const r3 = aiOrbApplyMoves([cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)], moves, sc);
      const p = pt(r3[0], r3[1], r3[2]);
      const depth = (p[2] + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.rBase == null ? 0.6 : o.rBase) + (o.rDepth == null ? 1.7 : o.rDepth) * depth + (r3[3] ? (o.rActive == null ? 0.3 : o.rActive) : 0)) * rs, white: (o.inkFar == null ? 0.62 : o.inkFar) - (o.inkSpan == null ? 0.54 : o.inkSpan) * depth - (r3[3] ? 0.14 : 0) });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}
function aiOrbDrawWave(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.874;
  const pt = aiOrbMakeProj(t * 0.18, 0.38, cx, cy, 1);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const dots = [];
  const rings = o.rings == null ? 15 : o.rings;
  const lonDensity = o.lonDensity == null ? 40 : o.lonDensity;
  for (let ri = 0; ri <= rings; ri++) {
    const lat = -Math.PI / 2 + (ri / rings) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83);
    const rr = R * (0.88 + 0.105 * w);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = (lj / lonCount) * 2 * Math.PI;
      const p = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
      const depth = (p[2] / R + 1) / 2;
      const crest = Math.max(0, w);
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.rBase == null ? 0.6 : o.rBase) + (o.rDepth == null ? 1.7 : o.rDepth) * depth) * (1 + 0.4 * crest) * rs, white: 0.66 - 0.56 * depth - 0.1 * crest });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// engine/web.ts — "connecting": a constellation wires itself.
function aiOrbDrawWeb(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.8 * (o.spread == null ? 1 : o.spread);
  const pt = aiOrbMakeProj(t * 0.12, 0.32, cx, cy, R);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const nodeN = o.nodeN == null ? 30 : o.nodeN;
  const thr = o.thr == null ? 0.72 : o.thr;
  const nodeR = o.nodeR == null ? 1.4 : o.nodeR;
  const nodeRDepth = o.nodeRDepth == null ? 1.8 : o.nodeRDepth;
  const nodes = [];
  for (let i = 0; i < nodeN; i++) {
    const d = aiOrbFibDir(i, nodeN);
    const x = d[0] + 0.3 * (aiOrbVnoise(i * 0.31 + 9, t * 0.24) - 0.5) * 2;
    const y = d[1] + 0.3 * (aiOrbVnoise(i * 0.53 + 27, t * 0.21) - 0.5) * 2;
    const z = d[2] + 0.3 * (aiOrbVnoise(i * 0.77 + 55, t * 0.27) - 0.5) * 2;
    const l = Math.sqrt(x * x + y * y + z * z);
    nodes.push([x / l, y / l, z / l]);
  }
  const lines = [], dots = [];
  for (let i = 0; i < nodeN; i++) {
    for (let j = i + 1; j < nodeN; j++) {
      const dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], dz = nodes[i][2] - nodes[j][2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= thr) continue;
      const p1 = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
      const p2 = pt(nodes[j][0], nodes[j][1], nodes[j][2]);
      const depth = ((p1[2] + p2[2]) / 2 + 1) / 2;
      lines.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], white: 0.42, a: (1 - dist / thr) * (0.3 + 0.55 * depth), w: Math.max(0.6, (o.lineW == null ? 0.8 : o.lineW) * rs) });
    }
  }
  for (let i = 0; i < nodeN; i++) {
    const p = pt(nodes[i][0], nodes[i][1], nodes[i][2]);
    const depth = (p[2] + 1) / 2;
    const pulse = 1 + 0.25 * Math.sin(t * 1.4 + i * 2.7);
    dots.push({ x: p[0], y: p[1], z: p[2], r: (nodeR + nodeRDepth * depth) * pulse * rs, white: 0.55 - 0.45 * depth });
  }
  const signals = o.signals == null ? 5 : o.signals;
  for (let s = 0; s < signals; s++) {
    const seg = Math.floor(t * 0.55 + s * 7.31);
    const a = Math.floor(aiOrbHashD(seg, s * 3.1 + 1.7) * nodeN);
    const b = Math.floor(aiOrbHashD(seg, s * 5.7 + 4.2) * nodeN);
    if (a === b) continue;
    const f = aiOrbFrac(t * 0.55 + s * 7.31);
    const x = aiOrbLerp(nodes[a][0], nodes[b][0], f), y = aiOrbLerp(nodes[a][1], nodes[b][1], f), z = aiOrbLerp(nodes[a][2], nodes[b][2], f);
    const l = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z));
    const p = pt(x / l, y / l, z / l);
    const depth = (p[2] + 1) / 2;
    dots.push({ x: p[0], y: p[1], z: p[2], r: (nodeR * 1.5 + nodeRDepth * depth) * rs, white: 0.05, a: 0.5 + 0.5 * depth });
  }
  aiOrbPaintLines(ctx, lines, dark);
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// engine/braid.ts — "weaving": three strands plait around the sphere.
function aiOrbDrawBraid(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.76;
  const pt = aiOrbMakeProj(t * 0.4, 0.3, cx, cy, 1);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const dots = [];
  const ghostN = o.ghostN == null ? 150 : o.ghostN;
  for (let i = 0; i < ghostN; i++) {
    const d = aiOrbFibDir(i, ghostN);
    const p = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (p[2] / R + 1) / 2;
    dots.push({ x: p[0], y: p[1], z: p[2], r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
  }
  const strandN = o.strandN == null ? 52 : o.strandN;
  const turns = o.turns == null ? 3 : o.turns;
  for (let s = 0; s < 3; s++) {
    const phase = (s / 3) * 2 * Math.PI;
    for (let i = 0; i < strandN; i++) {
      const u = (aiOrbFrac(i / strandN + t * 0.045) * 2 - 1) * 0.96;
      const surf = Math.sqrt(Math.max(0, 1 - u * u));
      const endFade = Math.min(1, (1 - Math.abs(u)) / 0.1);
      const a = u * Math.PI * turns + phase;
      const weave = 1 + 0.075 * Math.sin(u * Math.PI * turns * 2 + phase * 2 + t * 0.8);
      const rr = surf * R * weave;
      const p = pt(Math.cos(a) * rr, u * R * weave, Math.sin(a) * rr);
      const depth = (p[2] / R + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.rBase == null ? 1.2 : o.rBase) + (o.rDepth == null ? 1.8 : o.rDepth) * depth) * rs, white: 0.55 - 0.45 * depth, a: endFade * (0.45 + 0.55 * depth) });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// engine/ribbon.ts — "composing" (band undulates, tumbles) and "breathing" (`ring`, shares this
// painter via the `faceOn` profile flag — face-on circle whose radius undulates instead).
function aiOrbDrawRibbon(ctx, size, t, dark, o) {
  const cx = size / 2, cy = size / 2;
  const R = (size / 2) * 0.78;
  const spin = o.spin == null ? 1 : o.spin;
  const camTilt = 0.3;
  const pt = aiOrbMakeProj(t * 0.1 * spin, camTilt, cx, cy, 1);
  const rs = aiOrbRadiusScale(size, o.rsPow == null ? 0.6 : o.rsPow);
  const dots = [];
  const ghostN = o.ghostN == null ? 150 : o.ghostN;
  for (let i = 0; i < ghostN; i++) {
    const d = aiOrbFibDir(i, ghostN);
    const p = pt(d[0] * R, d[1] * R, d[2] * R);
    const depth = (p[2] / R + 1) / 2;
    dots.push({ x: p[0], y: p[1], z: p[2], r: 0.8 * rs, white: 0.78, a: 0.1 + 0.22 * depth });
  }
  const ya = t * 0.24 * spin;
  const ta = o.faceOn ? -camTilt : 0.55 + 0.3 * Math.sin(t * 0.18) * spin;
  const ux = Math.cos(ya), uy = 0, uz = Math.sin(ya);
  const vx = -uz * Math.sin(ta), vy = Math.cos(ta), vz = ux * Math.sin(ta);
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const wobAmp = 0.23 * (o.wobMul == null ? 1 : o.wobMul);
  const baseR = o.faceOn ? R / (1 + 0.85 * wobAmp) : R;
  const baseLanes = o.lanes == null ? 5 : o.lanes;
  const segs = o.segs == null ? 88 : o.segs;
  const lanes = Math.max(1, Math.round(baseLanes * (o.bandMul == null ? 1 : o.bandMul)));
  for (let w = 0; w < lanes; w++) {
    const laneOff = (w - (lanes - 1) / 2) * 0.075;
    const edge = Math.abs(w - (lanes - 1) / 2) / Math.max(1, (lanes - 1) / 2);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * 2 * Math.PI;
      const wob = (0.16 * Math.sin(a * 3 - t * 1.7 + w * 0.22) + 0.07 * Math.sin(a * 5 + t * 1.1)) * (o.wobMul == null ? 1 : o.wobMul);
      const radial = o.faceOn ? 1 + wob : 1;
      const off = o.faceOn ? laneOff : laneOff + wob;
      const x = ux * Math.cos(a) + vx * Math.sin(a) + nx * off;
      const y = uy * Math.cos(a) + vy * Math.sin(a) + ny * off;
      const z = uz * Math.cos(a) + vz * Math.sin(a) + nz * off;
      const l = Math.sqrt(x * x + y * y + z * z);
      const rr = baseR * radial;
      const p = pt((x / l) * rr, (y / l) * rr, (z / l) * rr);
      const depth = (p[2] / R + 1) / 2;
      dots.push({ x: p[0], y: p[1], z: p[2], r: ((o.rBase == null ? 1.1 : o.rBase) + (o.rDepth == null ? 1.7 : o.rDepth) * depth) * (1 - 0.25 * edge) * rs, white: 0.52 - 0.44 * depth + 0.18 * edge, a: 0.4 + 0.6 * depth });
    }
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// engine/morph.ts — "shaping": a dotted outline cycling circle → triangle → square → circle.
function aiOrbSmoothE(x) { return x * x * (3 - 2 * x); }
function aiOrbPolyPath(verts) {
  const V = verts.length;
  const L = []; let total = 0;
  for (let i = 0; i < V; i++) {
    const a = verts[i], b = verts[(i + 1) % V];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(l); total += l;
  }
  return function (f) {
    let target = f * total, i = 0;
    while (target > L[i] && i < V - 1) { target -= L[i]; i++; }
    const a = verts[i], b = verts[(i + 1) % V];
    const ff = L[i] ? Math.min(1, target / L[i]) : 0;
    return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
  };
}
const AI_ORB_CIRCLE = function (f) { const a = -Math.PI / 2 + f * 2 * Math.PI; return [Math.cos(a) * 0.24, Math.sin(a) * 0.24]; };
const AI_ORB_TRIANGLE = aiOrbPolyPath([[0.0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
const AI_ORB_SQUARE = aiOrbPolyPath([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
const AI_ORB_CYCLE = [AI_ORB_CIRCLE, AI_ORB_TRIANGLE, AI_ORB_SQUARE];
function aiOrbMorphN(d) { return Math.max(6, Math.round(34 * d)); }
const AI_ORB_HOLD = 1.4, AI_ORB_MORPH = 0.9, AI_ORB_SEG = AI_ORB_HOLD + AI_ORB_MORPH;
function aiOrbDrawMorph(ctx, size, t, dark, o) {
  const K = AI_ORB_CYCLE.length;
  const tc = t % (AI_ORB_SEG * K);
  const k = Math.floor(tc / AI_ORB_SEG);
  const local = tc - k * AI_ORB_SEG;
  const m = local > AI_ORB_HOLD ? aiOrbSmoothE((local - AI_ORB_HOLD) / AI_ORB_MORPH) : 0;
  const sprd = o.spread == null ? 1 : o.spread;
  const pA = AI_ORB_CYCLE[k], pB = AI_ORB_CYCLE[(k + 1) % K];
  const M = 160;
  const pts = [];
  for (let i = 0; i < M; i++) {
    const f = i / M, a = pA(f), b = pB(f);
    pts.push([(a[0] + (b[0] - a[0]) * m) * sprd, (a[1] + (b[1] - a[1]) * m) * sprd]);
  }
  const L = []; let total = 0;
  for (let i = 0; i < M; i++) {
    const a = pts[i], b = pts[(i + 1) % M];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    L.push(l); total += l;
  }
  const n = aiOrbMorphN(o.iconD == null ? 1 : o.iconD);
  const re = (o.rDot == null ? 0.021 : o.rDot) * 1.35 * sprd;
  const pulse = 1 + 0.02 * Math.sin(local * 3.1);
  const dots = [];
  const c2 = size / 2;
  let seg = 0, acc = 0;
  for (let k2 = 0; k2 < n; k2++) {
    const target = (k2 / n) * total;
    while (acc + L[seg] < target && seg < M - 1) { acc += L[seg]; seg++; }
    const a = pts[seg], b = pts[(seg + 1) % M];
    const f = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
    const x = (a[0] + (b[0] - a[0]) * f) * pulse;
    const y = (a[1] + (b[1] - a[1]) * f) * pulse;
    dots.push({ x: c2 + x * size, y: c2 + y * size, z: 0, r: Math.max(0.35, re * size), white: 0.1 });
  }
  aiOrbPaint(ctx, dots, dark, o.rMin);
}

// registry.ts — mode key → frame painter. ring shares ribbon's painter (faceOn flag switches it).
const AI_ORB_MODE_DRAWS = {
  orbits: aiOrbDrawOrbits, globe: aiOrbDrawGlobe, rubik: aiOrbDrawRubik, wave: aiOrbDrawWave,
  web: aiOrbDrawWeb, braid: aiOrbDrawBraid, ribbon: aiOrbDrawRibbon, ring: aiOrbDrawRibbon, morph: aiOrbDrawMorph
};

// presets.ts — the shipped tunings: nine states × two sizes (64/20), baked from the library's own
// tuning session. Resolved once per (state, size) pair and cached.
const AI_ORB_STATE_TO_MODE = {
  working: 'orbits', searching: 'globe', solving: 'rubik', listening: 'wave', connecting: 'web',
  weaving: 'braid', composing: 'ribbon', breathing: 'ring', shaping: 'morph'
};
const AI_ORB_PRESETS = {
  orbits: { 64: { speed: 1.885, count: 1, size: 1 }, 20: { speed: 3.9, count: 0.238, size: 2.4 } },
  globe: { 64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } }, 20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } } },
  rubik: { 64: { speed: 1.82, count: 0.35, size: 1.05 }, 20: { speed: 1.95, count: 0.088, size: 1.9 } },
  wave: { 64: { speed: 4.388, count: 0.341, size: 1 }, 20: { speed: 3.998, count: 0.105, size: 1.6 } },
  web: { 64: { speed: 3.315, count: 1.35, size: 0.95 }, 20: { speed: 6.63, count: 0.25, size: 1.52 } },
  braid: { 64: { speed: 1.625, count: 0.5, size: 1 }, 20: { speed: 2.75, count: 0.1125, size: 1.36 } },
  ribbon: { 64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } }, 20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } } },
  ring: { 64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } }, 20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } } },
  morph: { 64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } }, 20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } } }
};
const aiOrbPresetCache = new Map();
function aiOrbResolvePreset(state, size) {
  const key = state + '-' + size;
  const hit = aiOrbPresetCache.get(key);
  if (hit) return hit;
  const mode = AI_ORB_STATE_TO_MODE[state];
  const preset = AI_ORB_PRESETS[mode][size];
  let opts = Object.assign({}, AI_ORB_BASE_PROFILES[mode]);
  if (preset.count !== 1) opts = aiOrbScaleCounts(opts, preset.count);
  if (preset.size !== 1) opts = aiOrbScaleRadii(opts, preset.size);
  if (preset.extra) opts = Object.assign({}, opts, preset.extra);
  const resolved = { mode: mode, speed: preset.speed, opts: opts };
  aiOrbPresetCache.set(key, resolved);
  return resolved;
}

// ThinkingOrb.tsx → vanilla class. start()/stop() replace React's useEffect mount/unmount; dark
// detection reads this page's own theme attribute (html[data-theme]) rather than the library's
// generic ancestor-DOM/system-preference auto-detection, since this page already tracks that itself.
class ThinkingOrb {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.state = opts.state || 'composing';
    this.size = opts.size || 64; // only 64 (chat-avatar) and 20 (inline-text) have tuned presets
    this.speed = opts.speed || 1;
    this._raf = 0;
    this._running = false;
    this._onVis = null;
  }
  _isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }
  start() {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(this.size * dpr);
    canvas.height = Math.round(this.size * dpr);
    canvas.style.width = this.size + 'px';
    canvas.style.height = this.size + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resolved = aiOrbResolvePreset(this.state, this.size);
    const draw = AI_ORB_MODE_DRAWS[resolved.mode];
    const effSpeed = resolved.speed * this.speed;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = (tSec) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.size, this.size);
      draw(ctx, this.size, tSec, this._isDark(), resolved.opts);
    };
    if (reduced) { frame(0.6); return; }
    const self = this;
    const loop = function () {
      frame((performance.now() / 1000) * effSpeed);
      if (self._running) self._raf = requestAnimationFrame(loop);
    };
    this._running = true;
    frame((performance.now() / 1000) * effSpeed);
    this._raf = requestAnimationFrame(loop);
    this._onVis = function () {
      if (document.visibilityState === 'hidden') { self._running = false; cancelAnimationFrame(self._raf); }
      else if (!self._running) { self._running = true; self._raf = requestAnimationFrame(loop); }
    };
    document.addEventListener('visibilitychange', this._onVis);
  }
  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
  }
}

// ── AI Assistant (Phase 27; redesigned as chat UI in Phase 41) — thin UI over
// /api/admin/ai-assistant/plan|execute. Writes nothing until Confirm; the server re-validates
// tenant ownership and applies through the exact same product/category update code the manual
// forms use. Mirrors root.html's rootAi* chat pattern (Phase 39) on --ap-* tokens; no target
// selector here since this assistant is always scoped to the admin's own tenant.
function aiT(key, fallback) {
  const lang = window.currentLanguage || 'tr';
  return (typeof i18nData !== 'undefined' && i18nData[lang] && i18nData[lang][key]) || fallback;
}
function aiAsstEsc(x) { return String(x == null ? '' : x).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
// Backend artık ham sağlayıcı (Groq) hata metni yerine kararlı bir KOD döndürür — burada sade,
// güven veren Türkçe metne çevrilir. Model adı/TPM sayısı gibi teknik ayrıntılar kullanıcıya
// asla gösterilmez. Bilinmeyen kod → nazik genel mesaj (ham kodu göstermeyiz).
function adminAiErrorText(code) {
  switch (code) {
    case 'ai_not_configured': return aiT('admin_ai_not_configured', 'AI asistanı henüz yapılandırılmadı.');
    case 'ai_quota_exceeded': return aiT('admin_ai_quota_exceeded', 'Ücretsiz deneme mesaj hakkınız doldu. Devam etmek için bizimle iletişime geçin — yakında ödeme sistemi eklenecek.');
    case 'ai_rate_limited': return aiT('admin_ai_rate_limited', 'AI şu an çok yoğun. Birkaç saniye sonra tekrar deneyin.');
    case 'ai_provider_error': return aiT('admin_ai_provider_error', 'AI geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.');
    case 'ai_timeout': return aiT('admin_ai_timeout', 'Bağlantı sorunu oldu, lütfen tekrar deneyin.');
    case 'plan_not_found':
    case 'plan_expired': return aiT('admin_ai_plan_expired', 'Bu öneri artık geçerli değil. Lütfen isteğinizi tekrar yazın.');
    default: return aiT('admin_ai_error_generic', 'Bir şeyler ters gitti, tekrar deneyin.');
  }
}
function aiAsstResolveLabel(a) {
  try {
    if (a.table === 'products' && Array.isArray(window.menuData)) {
      const p = window.menuData.find(x => x.id === a.targetId);
      if (p) return (p.name || a.targetId) + ' · ' + a.field;
    }
  } catch (e) {}
  return (a.table ? a.table + '.' : '') + a.field;
}

// Only one plan is ever actionable at a time (matches the backend's single-in-flight-plan
// design) — sending a new message auto-marks any still-pending plan bubble as cancelled, but
// earlier messages stay visible in the transcript like a real chat.
let adminAiPlanId = null;
let adminAiPendingBubble = null; // the .ai-msg element holding the currently-actionable plan, if any
let adminAiLastUserMsg = ''; // for the "regenerate" action — re-sends the last real user message
// Konuşma geçmişi — AI'nın önceki mesajları hatırlaması için (önceden HİÇ gönderilmiyordu, bu yüzden
// her cevap "bağlamdan kopuk" geliyordu). Yalnızca son birkaç tur, kısa metin olarak gönderilir
// (TPM'i şişirmemek için backend'de de sınırlanır). role: 'user' | 'assistant'.
let adminAiHistory = [];
function adminAiPushHistory(role, content){
  if (!content) return;
  adminAiHistory.push({ role, content: String(content).slice(0, 600) });
  if (adminAiHistory.length > 12) adminAiHistory = adminAiHistory.slice(-12);
}

function adminAiActionsRowHTML(){
  return '<div class="ai-msg-actions">' +
    '<button class="ai-msg-action-btn up" onclick="adminAiFeedback(this)" data-i18n-title="admin_ai_fb_up" title="' + aiT('admin_ai_fb_up', 'Faydalı') + '" aria-label="' + aiT('admin_ai_fb_up', 'Faydalı') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>' +
    '</button>' +
    '<button class="ai-msg-action-btn down" onclick="adminAiFeedback(this)" data-i18n-title="admin_ai_fb_down" title="' + aiT('admin_ai_fb_down', 'Faydasız') + '" aria-label="' + aiT('admin_ai_fb_down', 'Faydasız') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>' +
    '</button>' +
    '<button class="ai-msg-action-btn" onclick="adminAiCopyMsg(this)" data-i18n-title="admin_ai_copy" title="' + aiT('admin_ai_copy', 'Kopyala') + '" aria-label="' + aiT('admin_ai_copy', 'Kopyala') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
    '</button>' +
    '<button class="ai-msg-action-btn" onclick="adminAiRegenerate(this)" data-i18n-title="admin_ai_regenerate" title="' + aiT('admin_ai_regenerate', 'Yeniden oluştur') + '" aria-label="' + aiT('admin_ai_regenerate', 'Yeniden oluştur') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/></svg>' +
    '</button>' +
  '</div>';
}
function adminAiFeedback(btn){
  const row = btn.closest('.ai-msg-actions');
  const wasActive = btn.classList.contains('active');
  row.querySelectorAll('.ai-msg-action-btn.up, .ai-msg-action-btn.down').forEach(b => b.classList.remove('active'));
  if (!wasActive) btn.classList.add('active');
}
function adminAiCopyMsg(btn){
  const bubble = btn.closest('.ai-msg').querySelector('.ai-bubble');
  const text = bubble ? bubble.innerText.trim() : '';
  if (!text || !navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1200);
  }).catch(() => {});
}
function adminAiRegenerate(btn){
  if (!adminAiLastUserMsg) return;
  const input = document.getElementById('aAiInput');
  input.value = adminAiLastUserMsg;
  adminAiSend();
}
function adminAiImageHTML(data){
  if (Array.isArray(data.imageCandidates) && data.imageCandidates.length >= 2) {
    const btns = data.imageCandidates.map(c =>
      '<button class="admin-btn secondary" style="width:auto;font-size:.8rem;padding:8px 14px;" onclick="adminAiPickImageCandidate(this)" data-name="' + aiAsstEsc(c.name) + '">' + aiAsstEsc(c.name) + '</button>'
    ).join('');
    return '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">' + btns + '</div>';
  }
  if (data.imageUrl) {
    let html = '<img src="' + aiAsstEsc(data.imageUrl) + '" alt="" style="display:block;width:100%;max-width:360px;aspect-ratio:1;object-fit:cover;border-radius:14px;margin-top:10px;">';
    if (data.imageProductId) {
      html += '<button class="admin-btn secondary ai-apply-img-btn" style="width:auto;margin-top:8px;font-size:.8rem;padding:8px 14px;" ' +
        'data-product-id="' + aiAsstEsc(data.imageProductId) + '" data-image-url="' + aiAsstEsc(data.imageUrl) + '" ' +
        'onclick="adminAiApplyProductImage(this)">' +
        aiT('admin_ai_set_as_image', 'Ürün görseli olarak ayarla') +
        (data.imageProductName ? ' — ' + aiAsstEsc(data.imageProductName) : '') +
      '</button>';
    }
    return html;
  }
  if (data.imageError) {
    const msg = data.imageError === 'hf_not_configured'
      ? aiT('admin_ai_hf_not_configured', 'Görsel oluşturma henüz yapılandırılmadı. Lütfen Root panelinden Hugging Face anahtarını ekleyin.')
      : aiT('admin_ai_hf_error', 'Görsel oluşturulamadı: ') + aiAsstEsc(data.imageError);
    return '<div style="margin-top:10px;color:var(--ap-bad);font-size:.85rem;">' + msg + '</div>';
  }
  return '';
}
// Belirsiz ürün ismi (Faz C) — birden fazla gerçek ürün eşleştiğinde kullanıcı hangisini
// kastettiğini seçiyor; seçim, o ürün için AÇIK bir yeni istek olarak yeniden gönderiliyor
// (mevcut tekli-görsel akışı aynen yeniden kullanılıyor, ekstra bir state/endpoint gerekmiyor).
function adminAiPickImageCandidate(btn){
  const name = btn.dataset.name;
  const row = btn.closest('.ai-msg-actions') ? null : btn.parentElement;
  if (row) row.querySelectorAll('button').forEach(b => b.disabled = true);
  const input = document.getElementById('aAiInput');
  input.value = aiT('admin_ai_candidate_prompt_template', '{name} için görsel oluştur').replace('{name}', name);
  adminAiSend();
}
async function adminAiApplyProductImage(btn){
  const productId = btn.dataset.productId;
  const imageUrl = btn.dataset.imageUrl;
  if (!productId || !imageUrl) return;
  btn.disabled = true;
  const originalText = btn.textContent;
  try {
    const res = await fetch('/api/admin/ai-assistant/apply-image', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, imageUrl })
    });
    if (!res.ok) throw new Error();
    btn.textContent = aiT('admin_ai_image_applied', 'Ürün görseli güncellendi ✓');
    btn.classList.add('applied');
    if (typeof loadMenuDatabase === 'function') {
      await loadMenuDatabase();
      if (typeof renderAdminProductList === 'function') renderAdminProductList();
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = originalText;
    showCustomAlert(aiT('admin_ai_image_apply_error', 'Görsel ürüne atanamadı, tekrar deneyin.'));
  }
}

// "Kendi Görselimi Ekle" — kullanıcı kendi fotoğrafını yükler, hangi ürüne ait olduğunu kendisi
// seçer, aynı dar apply-image endpoint'iyle atar (AI-üretilen görsellerle AYNI güvenli yol).
// Ürün seçici — native <select>'in açılır listesi tarayıcı-native (CSS ile giydirilemiyor), bu
// yüzden sitenin zaten var olan .custom-select-container desenini (kategori filtresi, ürün formu
// vb. ile aynı) kullanıyor. Her yüklenen görsel kendi benzersiz id'sine sahip bir örnek alır.
function adminAiOwnImagePickerHTML(imageUrl){
  const products = Array.isArray(window.menuData) ? window.menuData : [];
  const uid = 'aiOwnImgPick_' + Math.random().toString(36).slice(2, 10);
  const first = products[0];
  const firstId = first ? first.id : '';
  const firstName = first ? (first.name_tr || first.name || first.id) : '';
  const options = products.map((p, i) => {
    const name = p.name_tr || p.name || p.id;
    return '<div class="custom-select-option' + (i === 0 ? ' active' : '') + '" onclick="adminAiPickOwnImgProduct(\'' + uid + '\',\'' + aiAsstEsc(p.id) + '\',this)">' +
      '<span>' + aiAsstEsc(name) + '</span></div>';
  }).join('');
  return '<div class="ai-own-img-picker">' +
    '<div class="custom-select-container ai-own-img-select" id="' + uid + '" data-product-id="' + aiAsstEsc(firstId) + '">' +
      '<div class="custom-select-trigger" onclick="adminAiToggleOwnImgDropdown(event,\'' + uid + '\')">' +
        '<span id="' + uid + '_label">' + aiAsstEsc(firstName) + '</span>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:auto;"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</div>' +
      '<div class="custom-select-options">' + options + '</div>' +
    '</div>' +
    '<button class="admin-btn ai-apply-img-btn" style="width:auto;font-size:.8rem;padding:8px 14px;" ' +
      'data-image-url="' + aiAsstEsc(imageUrl) + '" data-select-id="' + uid + '" onclick="adminAiAssignOwnImage(this)">' +
      aiT('admin_ai_assign_to_product', 'Bu ürüne ata') +
    '</button>' +
  '</div>';
}
function adminAiToggleOwnImgDropdown(event, uid){
  event.stopPropagation();
  document.querySelectorAll('.ai-own-img-select.open').forEach(el => { if (el.id !== uid) el.classList.remove('open'); });
  const el = document.getElementById(uid);
  if (el) el.classList.toggle('open');
}
function adminAiPickOwnImgProduct(uid, productId, optEl){
  const container = document.getElementById(uid);
  if (!container) return;
  container.dataset.productId = productId;
  const label = document.getElementById(uid + '_label');
  if (label) label.textContent = optEl.textContent;
  container.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('active'));
  optEl.classList.add('active');
  container.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.ai-own-img-select')) return;
  document.querySelectorAll('.ai-own-img-select.open').forEach(el => el.classList.remove('open'));
});
async function adminAiAssignOwnImage(btn){
  const imageUrl = btn.dataset.imageUrl;
  const container = document.getElementById(btn.dataset.selectId);
  const productId = container && container.dataset.productId;
  if (!productId || !imageUrl) return;
  btn.disabled = true;
  if (container) container.classList.add('disabled');
  const originalText = btn.textContent;
  try {
    const res = await fetch('/api/admin/ai-assistant/apply-image', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, imageUrl })
    });
    if (!res.ok) throw new Error();
    btn.textContent = aiT('admin_ai_image_applied', 'Ürün görseli güncellendi ✓');
    btn.classList.add('applied');
    if (typeof loadMenuDatabase === 'function') {
      await loadMenuDatabase();
      if (typeof renderAdminProductList === 'function') renderAdminProductList();
    }
  } catch (e) {
    btn.disabled = false;
    if (container) container.classList.remove('disabled');
    btn.textContent = originalText;
    showCustomAlert(aiT('admin_ai_image_apply_error', 'Görsel ürüne atanamadı, tekrar deneyin.'));
  }
}
async function adminAiUploadOwnImage(input){
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { showCustomAlert(aiT('admin_ai_own_image_bad_type', 'Lütfen bir görsel dosyası seçin.')); return; }
  if (file.size > 5 * 1024 * 1024) { showCustomAlert(aiT('admin_ai_own_image_too_big', 'Görsel 5MB\'tan küçük olmalı.')); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    adminAiAppendMsg('user', '<div class="ai-bubble"><img src="' + reader.result + '" alt="" style="display:block;max-width:100%;border-radius:12px;"></div>');
    const typingBubble = adminAiAppendMsg('assistant', adminAiTypingHTML());
    adminAiStartThinkingOrb('working');
    try {
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: reader.result })
      });
      const data = await res.json();
      adminAiStopThinkingOrb();
      if (!res.ok || !data.url) throw new Error(data.error || 'upload_failed');
      typingBubble.innerHTML = '<div class="ai-bubble">' + aiAsstEsc(aiT('admin_ai_own_image_uploaded', 'Görsel yüklendi. Hangi ürüne ait olduğunu seçin:')) + adminAiOwnImagePickerHTML(data.url) + '</div>';
      adminAiScrollToBottom();
    } catch (e) {
      adminAiStopThinkingOrb();
      typingBubble.innerHTML = '<div class="ai-bubble err">' + aiAsstEsc(aiT('admin_ai_own_image_upload_error', 'Görsel yüklenemedi, tekrar deneyin.')) + '</div>';
    }
  };
  reader.readAsDataURL(file);
}

// "Menüyü Tamamla" — görseli olmayan ürünleri tespit edip toplu görsel oluşturma teklif ediyor.
// Hangi ürünlerin eksik olduğu deterministik bir DB sorgusuyla bulunuyor (modele "hangileri eksik"
// diye sormuyoruz — aynı "modele sadece kendisine verilen gerçek veriye güven" ilkesi).
async function adminAiCompleteMenu(userMsg){
  adminAiAppendMsg('user', adminAiUserBubbleHTML(userMsg || aiT('admin_ai_complete_menu', 'Menüyü Tamamla')));
  const typingBubble = adminAiAppendMsg('assistant', adminAiTypingHTML());
  adminAiStartThinkingOrb('searching');
  try {
    const res = await fetch('/api/admin/ai-assistant/missing-images');
    const data = await res.json();
    adminAiStopThinkingOrb();
    if (!res.ok) throw new Error(data.error || 'fetch_failed');
    const products = data.products || [];
    if (!products.length) {
      typingBubble.innerHTML = '<div class="ai-bubble">' + aiAsstEsc(aiT('admin_ai_menu_complete_none', 'Tüm ürünlerin zaten görseli var, eksik yok.')) + '</div>';
      adminAiScrollToBottom();
      return;
    }
    const rows = products.map(p =>
      '<label class="ai-menu-complete-row"><input type="checkbox" checked value="' + aiAsstEsc(p.id) + '"><span>' + aiAsstEsc(p.name_tr || p.name_en || p.id) + '</span></label>'
    ).join('');
    typingBubble.innerHTML = '<div class="ai-bubble">' +
      aiAsstEsc(aiT('admin_ai_menu_complete_found', 'Görseli olmayan {n} ürün bulundu:').replace('{n}', products.length)) +
      '<div class="ai-menu-complete-list">' + rows + '</div>' +
      '<button class="admin-btn" style="width:auto;margin-top:10px;" onclick="adminAiRunBulkGenerate(this)">' +
        aiT('admin_ai_menu_complete_generate', 'Seçilenler İçin Oluştur') +
      '</button>' +
    '</div>';
    adminAiScrollToBottom();
  } catch (e) {
    adminAiStopThinkingOrb();
    typingBubble.innerHTML = '<div class="ai-bubble err">' + aiAsstEsc(aiT('admin_ai_menu_complete_error', 'Eksik görseller kontrol edilemedi, tekrar deneyin.')) + '</div>';
  }
}
async function adminAiRunBulkGenerate(btn){
  const bubble = btn.closest('.ai-bubble');
  const checked = Array.from(bubble.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
  if (!checked.length) return;
  bubble.querySelectorAll('input[type=checkbox]').forEach(c => c.disabled = true);
  btn.disabled = true;
  const msgWrap = btn.closest('.ai-msg');
  const typingBubble = adminAiAppendMsg('assistant', adminAiTypingHTML());
  adminAiStartThinkingOrb('weaving');
  try {
    const res = await fetch('/api/admin/ai-assistant/bulk-generate-images', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: checked })
    });
    const data = await res.json();
    adminAiStopThinkingOrb();
    if (!res.ok) throw new Error(data.error || 'bulk_failed');
    typingBubble.innerHTML = '<div class="ai-bubble">' + adminAiBulkResultsHTML(data.results || []) + '</div>';
    adminAiScrollToBottom();
  } catch (e) {
    adminAiStopThinkingOrb();
    const msg = e.message === 'hf_not_configured'
      ? aiT('admin_ai_hf_not_configured', 'Görsel oluşturma henüz yapılandırılmadı. Lütfen Root panelinden Hugging Face anahtarını ekleyin.')
      : aiT('admin_ai_menu_complete_error', 'Eksik görseller kontrol edilemedi, tekrar deneyin.');
    typingBubble.innerHTML = '<div class="ai-bubble err">' + aiAsstEsc(msg) + '</div>';
  }
}
function adminAiBulkResultsHTML(results){
  const ok = results.filter(r => r.imageUrl);
  const failed = results.filter(r => !r.imageUrl);
  let html = '<div class="ai-bulk-results">';
  ok.forEach(r => {
    html += '<div class="ai-bulk-result-item">' +
      '<img src="' + aiAsstEsc(r.imageUrl) + '" alt="">' +
      '<span>' + aiAsstEsc(r.productName) + '</span>' +
      '<button class="admin-btn secondary ai-apply-img-btn" style="width:auto;font-size:.75rem;padding:6px 10px;" ' +
        'data-product-id="' + aiAsstEsc(r.productId) + '" data-image-url="' + aiAsstEsc(r.imageUrl) + '" onclick="adminAiApplyProductImage(this)">' +
        aiT('admin_ai_set_as_image', 'Ürün görseli olarak ayarla') +
      '</button>' +
    '</div>';
  });
  html += '</div>';
  if (failed.length) {
    html += '<div style="margin-top:10px;color:var(--ap-bad);font-size:.8rem;">' +
      aiAsstEsc(aiT('admin_ai_menu_complete_partial', '{n} ürün için görsel oluşturulamadı.').replace('{n}', failed.length)) +
    '</div>';
  }
  if (ok.length > 1) {
    html = '<button class="admin-btn" style="width:auto;margin-bottom:10px;" onclick="adminAiApplyAllBulk(this)">' +
      aiT('admin_ai_menu_complete_apply_all', 'Tümünü Uygula') +
    '</button>' + html;
  }
  return html;
}
async function adminAiApplyAllBulk(btn){
  btn.disabled = true;
  const bubble = btn.closest('.ai-bubble');
  const buttons = Array.from(bubble.querySelectorAll('.ai-apply-img-btn:not(.applied)'));
  for (const b of buttons) {
    await adminAiApplyProductImage(b);
  }
  btn.textContent = aiT('admin_ai_image_applied', 'Ürün görseli güncellendi ✓');
  btn.classList.add('applied');
}

function adminAiAutoGrow(el){
  el.style.height = 'auto';
  el.style.height = Math.min(120, el.scrollHeight) + 'px';
}
function adminAiComposerKey(e){
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adminAiSend(); }
}
function adminAiScrollToBottom(){
  const box = document.getElementById('aAiMessages');
  box.scrollTop = box.scrollHeight;
}
// Shows/updates the free-trial quota pill in the chat header. `quota` is either
// {limit,used,remaining} (from the backend) or null/undefined (no limit — hide the pill).
function adminAiUpdateQuotaBadge(quota){
  const el = document.getElementById('aAiQuotaBadge');
  if (!el) return;
  if (!quota) { el.style.display = 'none'; return; }
  el.style.display = 'inline-block';
  el.textContent = aiT('admin_ai_quota_remaining', '{remaining}/{limit} mesaj kaldı')
    .replace('{remaining}', quota.remaining).replace('{limit}', quota.limit);
  el.classList.toggle('low', quota.remaining <= 5);
}
function adminAiAppendMsg(role, innerHTML, extraClass){
  const empty = document.getElementById('aAiEmpty');
  if (empty) empty.remove();
  const box = document.getElementById('aAiMessages');
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg ' + role + (extraClass ? ' ' + extraClass : '');
  wrap.innerHTML = innerHTML;
  box.appendChild(wrap);
  adminAiScrollToBottom();
  return wrap;
}
function adminAiUserBubbleHTML(text){
  return '<div class="ai-bubble">' + aiAsstEsc(text).replace(/\n/g, '<br>') + '</div>';
}
function adminAiTypingHTML(){
  return '<div class="ai-bubble ai-thinking-bubble"><canvas id="aAiThinkingOrb"></canvas></div>';
}
// Daktilo efekti: AI'nın metin cevabı "pat diye" değil, soldan sağa harf harf yazılır.
// text düz metin; bittiğinde cb() çağrılır (görsel/aksiyon satırı sonradan eklenir).
let adminAiTypeTimer = null;
function adminAiTypeInto(el, text, cb){
  if (adminAiTypeTimer) { clearTimeout(adminAiTypeTimer); adminAiTypeTimer = null; }
  el.textContent = '';
  el.classList.add('typing');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !text) { el.textContent = text || ''; el.classList.remove('typing'); if (cb) cb(); return; }
  let i = 0;
  const total = text.length;
  // uzun cevaplarda toplam süreyi makul tut: karakter başına 8-22ms arası, uzunlukla ölçekli
  const per = Math.max(8, Math.min(22, Math.round(1600 / Math.max(20, total))));
  (function step(){
    if (i < total){
      // her adımda birkaç karakter (uzun metinde daha hızlı) — akıcı ama bekletmeyen
      const chunk = total > 220 ? 3 : (total > 90 ? 2 : 1);
      i = Math.min(total, i + chunk);
      el.textContent = text.slice(0, i);
      adminAiScrollToBottom();
      adminAiTypeTimer = setTimeout(step, per);
    } else {
      el.classList.remove('typing');
      adminAiTypeTimer = null;
      if (cb) cb();
    }
  })();
}
let adminAiOrbInstance = null;
// Picks the orb state that best matches what kind of request was just sent — a simple client-side
// keyword read on the outgoing message (the backend call is a single non-streaming round trip, so
// there's no real "phase" signal to reflect; this is the closest honest approximation of "show a
// fitting thinking animation for the situation").
function adminAiPickOrbState(message){
  const m = (message || '').toLowerCase();
  if (/görsel|resim|fotoğraf|image|photo|picture/.test(m) && /oluştur|yap|üret|değiştir|generate|create/.test(m)) return 'weaving';
  if (/%|fiyat|price|artır|azalt|indirim|zam\b|increase|decrease/.test(m)) return 'solving';
  if (/hangi|kaç|listele|göster|bul|ara\b|search|find|which|list/.test(m)) return 'searching';
  if (m.length < 40) return 'listening';
  return 'composing';
}
function adminAiStartThinkingOrb(state){
  const canvas = document.getElementById('aAiThinkingOrb');
  if (!canvas || typeof ThinkingOrb === 'undefined') return;
  if (adminAiOrbInstance) adminAiOrbInstance.stop();
  adminAiOrbInstance = new ThinkingOrb(canvas, { state: state || 'composing', size: 20, speed: 1 });
  adminAiOrbInstance.start();
}
function adminAiStopThinkingOrb(){
  if (adminAiOrbInstance) { adminAiOrbInstance.stop(); adminAiOrbInstance = null; }
}
// Groups 'update' actions that share the same table+targetId into one card (a full-menu
// translation produces up to 4 update actions per product) — 'create'/'delete' pass through
// unchanged, in their original relative position. Order is first-seen: a product's group sits
// wherever its FIRST update action appeared in the list.
function adminAiGroupActions(actions) {
  const out = [];
  const groupsByKey = new Map();
  for (const a of actions) {
    if (a.type !== 'update') { out.push(a); continue; }
    const key = a.table + ':' + a.targetId;
    let group = groupsByKey.get(key);
    if (!group) {
      group = { __group: true, table: a.table, targetId: a.targetId, rows: [] };
      groupsByKey.set(key, group);
      out.push(group);
    }
    group.rows.push(a);
  }
  return out;
}
function aiAsstResolveGroupLabel(group) {
  try {
    if (group.table === 'products' && Array.isArray(window.menuData)) {
      const p = window.menuData.find(x => x.id === group.targetId);
      if (p) return p.name || group.targetId;
    } else if (group.table === 'categories' && typeof categoriesMap !== 'undefined' && categoriesMap[group.targetId]) {
      return categoriesMap[group.targetId].name || group.targetId;
    }
  } catch (e) {}
  return group.targetId;
}
// One collapsible card per product/category — reuses adminAiPlanRowHTML unchanged for each field
// row inside, so the old→new diff rendering is never duplicated. Small plans (today's typical
// single-field edits) default expanded; large bulk-translation plans default collapsed so the
// bubble stays scannable.
function adminAiPlanGroupHTML(group, defaultExpanded){
  const tableLabel = group.table === 'products' ? aiT('admin_ai_table_products', 'Ürün') : aiT('admin_ai_table_categories', 'Kategori');
  const label = aiAsstEsc(aiAsstResolveGroupLabel(group)) + ' <span class="ai-plan-group-table">(' + aiAsstEsc(tableLabel) + ')</span>';
  const rowsHtml = group.rows.map(adminAiPlanRowHTML).join('');
  return '<div class="ai-plan-group' + (defaultExpanded ? ' expanded' : '') + '">' +
    '<div class="ai-plan-group-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
      '<span class="ai-plan-group-title">' + label + '</span>' +
      '<span class="ai-plan-group-badge">' + group.rows.length + '</span>' +
      '<svg class="ai-plan-group-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</div>' +
    '<div class="ai-plan-group-body">' + rowsHtml + '</div>' +
  '</div>';
}
function adminAiToggleAllGroups(btn, expand){
  const bubble = btn.closest('.ai-plan');
  if (bubble) bubble.querySelectorAll('.ai-plan-group').forEach(g => g.classList.toggle('expanded', expand));
}
// Detects a bulk single-language translation (most 'update' actions share the same _XX field
// suffix) and summarizes it in one line above the grouped list, e.g. "8 ürün ve 3 kategori
// Almanca'ya çevrilecek".
const AI_PLAN_LANG_NAMES = { en: 'İngilizce', de: 'Almanca', fr: 'Fransızca', es: 'İspanyolca', zh: 'Çince', ja: 'Japonca', ko: 'Korece' };
function adminAiPlanLangSummary(actions){
  const updates = actions.filter(a => a.type === 'update');
  if (updates.length < 4) return '';
  const counts = {};
  for (const a of updates) {
    const m = /_([a-z]{2})$/.exec(a.field || '');
    if (m && AI_PLAN_LANG_NAMES[m[1]]) counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  if (!entries.length || entries[0][1] / updates.length < 0.6) return '';
  const lang = entries[0][0];
  const suffix = new RegExp('_' + lang + '$');
  const productCount = new Set(updates.filter(a => a.table === 'products' && suffix.test(a.field)).map(a => a.targetId)).size;
  const categoryCount = new Set(updates.filter(a => a.table === 'categories' && suffix.test(a.field)).map(a => a.targetId)).size;
  const parts = [];
  if (productCount) parts.push(productCount + ' ' + aiT('admin_ai_table_products', 'ürün').toLowerCase());
  if (categoryCount) parts.push(categoryCount + ' ' + aiT('admin_ai_table_categories', 'kategori').toLowerCase());
  if (!parts.length) return '';
  return '<div class="ai-plan-lang-summary">' + aiAsstEsc(parts.join(' ' + (window.currentLanguage === 'tr' ? 've' : 'and') + ' ') + ' ' +
    (window.currentLanguage === 'tr' ? AI_PLAN_LANG_NAMES[lang] + "'ya çevrilecek" : 'will be translated to ' + AI_PLAN_LANG_NAMES[lang])) + '</div>';
}
// One row per action — 'update' keeps the old→new diff layout; 'create'/'delete' have no
// old/new pair (a row that doesn't exist yet, or one about to stop existing), so they render as
// a single labeled value instead of forcing a diff shape that doesn't apply.
function adminAiPlanRowHTML(a){
  const tableLabel = a.table === 'products' ? aiT('admin_ai_table_products', 'Ürün') : aiT('admin_ai_table_categories', 'Kategori');
  if (a.type === 'create') {
    const priceStr = a.table === 'products' && a.fields.price ? ' · ₺' + aiAsstEsc(a.fields.price) : '';
    return '<div class="ai-plan-row"><div class="ai-plan-field">+ ' + aiAsstEsc(tableLabel) + '</div>' +
      '<div class="ai-plan-diff"><span class="ai-plan-new">' + aiAsstEsc(a.fields.name_tr) + priceStr + '</span></div></div>';
  }
  if (a.type === 'delete') {
    return '<div class="ai-plan-row"><div class="ai-plan-field">&minus; ' + aiAsstEsc(tableLabel) + '</div>' +
      '<div class="ai-plan-diff"><span class="ai-plan-old">' + aiAsstEsc(a.label) + '</span></div></div>';
  }
  if (a.type === 'setting') {
    // Restoran ayarı — ürün/kategori değil; dostça etiket + eski→yeni değer.
    const oldV = a.oldValue ? aiAsstEsc(a.oldValue) : '—';
    return '<div class="ai-plan-row"><div class="ai-plan-field">⚙ ' + aiAsstEsc(a.label || a.field) + '</div>' +
      '<div class="ai-plan-diff"><span class="ai-plan-old">' + oldV + '</span>' +
      '<span class="ai-plan-arrow">→</span><span class="ai-plan-new">' + aiAsstEsc(a.newValue) + '</span></div></div>';
  }
  return '<div class="ai-plan-row"><div class="ai-plan-field">' + aiAsstEsc(aiAsstResolveLabel(a)) + '</div>' +
    '<div class="ai-plan-diff"><span class="ai-plan-old">' + aiAsstEsc(a.oldValue) + '</span>' +
    '<span class="ai-plan-arrow">→</span><span class="ai-plan-new">' + aiAsstEsc(a.newValue) + '</span></div></div>';
}
function adminAiPlanHTML(data){
  const actionsList = data.actions || [];
  const grouped = adminAiGroupActions(actionsList);
  const groupCount = grouped.filter(item => item.__group).length;
  const defaultExpanded = actionsList.length <= 8;
  const langSummary = adminAiPlanLangSummary(actionsList);
  const groupControls = groupCount > 1
    ? '<div class="ai-plan-group-controls">' +
      '<button type="button" onclick="adminAiToggleAllGroups(this,true)">' + aiT('admin_ai_expand_all', 'Tümünü Aç') + '</button>' +
      '<button type="button" onclick="adminAiToggleAllGroups(this,false)">' + aiT('admin_ai_collapse_all', 'Tümünü Kapat') + '</button></div>'
    : '';
  const rows = grouped.map(item => item.__group ? adminAiPlanGroupHTML(item, defaultExpanded) : adminAiPlanRowHTML(item)).join('');
  const unsupported = (data.unsupported && data.unsupported.length)
    ? '<div class="ai-plan-unsupported"><b>' + aiT('admin_ai_unsupported', 'Desteklenmeyen istekler:') + '</b><br>' + data.unsupported.map(aiAsstEsc).join('<br>') + '</div>'
    : '';
  const actions = data.planId
    ? '<div class="ai-plan-actions"><button class="admin-btn" onclick="adminAiConfirm(this)">' + aiT('admin_ai_confirm', 'Onayla ve Uygula') + '</button>' +
      '<button class="admin-btn secondary" onclick="adminAiCancelBubble(this)">' + aiT('admin_ai_cancel', 'İptal') + '</button></div>'
    : '';
  return '<div class="ai-bubble"><div class="ai-plan"><div class="ai-plan-summary">' + aiAsstEsc(data.summary || '') + '</div>' +
    langSummary + groupControls + rows + unsupported + actions + '</div></div>';
}

// Fresh self-service signup (?onboarding=1, see openAdminPanel) — a static kickoff message, NOT
// a real AI call (no Groq request, no quota spent), just pointing the new owner at what to type.
let __aiOnboardingWelcomeShown = false;
function adminAiShowOnboardingWelcome(){
  if (__aiOnboardingWelcomeShown) return;
  __aiOnboardingWelcomeShown = true;
  const html = '<div class="ai-bubble">' + aiAsstEsc(aiT('admin_ai_onboarding_welcome',
    'Hoş geldiniz! Restoranınızı birlikte oluşturalım. Önce restoranınızın adını ve mutfak türünü, ' +
    'ardından menünüzdeki kategorileri ve ürünleri (isim, açıklama, fiyat) yazabilirsiniz — ' +
    'istediğiniz zaman düzenleyip değiştirebiliriz.')) + '</div>';
  adminAiAppendMsg('assistant', html);
}

// Detects a "complete the missing menu images" request typed as a normal chat message — this
// used to be its own toolbar button; removed in favor of triggering the exact same deterministic
// (DB-driven, not LLM-guessed) missing-image lookup from a command instead.
function adminAiIsCompleteMenuCommand(msg){
  const m = msg.toLowerCase();
  const mentionsImage = /görsel|resim|resm|foto|image|görsell/.test(m); // "resmini/resmi" (Türkçe çekim: resim→resm) de yakalanır
  const mentionsComplete = /eksik|tamamla|complete|missing/.test(m);
  const mentionsMenu = /menü|menu/.test(m);
  const mentionsAll = /tüm|tum|bütün|butun|hepsi|hepsine|all/.test(m);
  const mentionsProducts = /ürün|urun|product/.test(m);
  const mentionsGenerate = /oluştur|olustur|yap\b|üret|uret|ekle|generate|create/.test(m);
  // "eksik görselleri tamamla" / "menüyü tamamla" (mevcut) VEYA "tüm ürünlere görsel oluştur"
  // gibi TOPLU görsel oluşturma istekleri — hepsi aynı gerçek toplu-üretim akışına (thinking orb +
  // eksik görsel bulma + oluşturma) yönlenir; yoksa AI sadece "oluşturulacak" deyip hiçbir şey
  // yapmıyordu (kullanıcı işaretledi).
  return (mentionsImage && mentionsComplete)
      || (mentionsMenu && mentionsComplete)
      // "tüm/bütün/hepsi + görsel/foto + oluştur/yap" → toplu ürün görseli üretimi (ürün kelimesi
      // geçmese de "hepsine görsel oluştur" gibi ifadeleri kapsar).
      || (mentionsAll && mentionsImage && mentionsGenerate);
}
async function adminAiSend(){
  const input = document.getElementById('aAiInput');
  const msg = (input.value || '').trim();
  if (!msg) return;
  adminAiLastUserMsg = msg;
  adminAiCancel(); // superseding a still-pending plan by sending a new message
  input.value = '';
  adminAiAutoGrow(input);
  if (adminAiIsCompleteMenuCommand(msg)) {
    await adminAiCompleteMenu(msg);
    return;
  }
  const sendBtn = document.getElementById('aAiSendBtn');
  adminAiAppendMsg('user', adminAiUserBubbleHTML(msg));
  const typingBubble = adminAiAppendMsg('assistant', adminAiTypingHTML());
  adminAiStartThinkingOrb(adminAiPickOrbState(msg));
  sendBtn.disabled = true; input.disabled = true;
  try {
    const res = await fetch('/api/admin/ai-assistant/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // Konuşma geçmişini de gönder (son turlar) — AI önceki mesajları hatırlasın (bağlam kopukluğu
      // düzeltmesi). Bu mesajı henüz geçmişe eklemedik, o yüzden ayrıca message olarak gidiyor.
      body: JSON.stringify({ message: msg, history: adminAiHistory.slice(-6) })
    });
    const data = await res.json();
    adminAiStopThinkingOrb();
    sendBtn.disabled = false; input.disabled = false; input.focus();
    // The backend can report a real failure (bad key, provider error, etc.) with HTTP 200 —
    // data.error is the actual source of truth, not res.ok (same bug class fixed in root.html's
    // Phase 39 chat redesign — checking res.ok alone here would mislabel a broken key as
    // "no actionable change found").
    if (data.quota !== undefined) adminAiUpdateQuotaBadge(data.quota);
    if (!res.ok || data.error) {
      typingBubble.innerHTML = '<div class="ai-bubble err">' + aiAsstEsc(adminAiErrorText(data.error)) + '</div>';
      return;
    }
    if (!data.planId && !(data.actions && data.actions.length)) {
      const text = data.summary || aiT('admin_ai_no_actions', 'İsteğinizden uygulanabilir bir değişiklik çıkaramadım.');
      adminAiPushHistory('user', msg);
      adminAiPushHistory('assistant', data.summary || text);
      if (data.unsupported && data.unsupported.length) {
        typingBubble.innerHTML = adminAiPlanHTML(data);
        typingBubble.insertAdjacentHTML('beforeend', adminAiActionsRowHTML());
        adminAiScrollToBottom();
      } else {
        // Metin cevabı daktilo efektiyle yazılır; bitince görsel (varsa) + aksiyon satırı eklenir.
        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        typingBubble.innerHTML = '';
        typingBubble.appendChild(bubble);
        adminAiTypeInto(bubble, text, () => {
          const imgHTML = adminAiImageHTML(data);
          if (imgHTML) bubble.insertAdjacentHTML('beforeend', imgHTML);
          typingBubble.insertAdjacentHTML('beforeend', adminAiActionsRowHTML());
          adminAiScrollToBottom();
        });
      }
      return;
    }
    adminAiPushHistory('user', msg);
    adminAiPushHistory('assistant', data.summary || aiT('admin_ai_plan_ready', 'Bir plan hazırladım, onayınızı bekliyorum.'));
    typingBubble.innerHTML = adminAiPlanHTML(data);
    typingBubble.insertAdjacentHTML('beforeend', adminAiActionsRowHTML());
    adminAiPlanId = data.planId || null;
    adminAiPendingBubble = data.planId ? typingBubble : null;
    adminAiScrollToBottom();
  } catch(e) {
    adminAiStopThinkingOrb();
    sendBtn.disabled = false; input.disabled = false;
    typingBubble.innerHTML = '<div class="ai-bubble err">' + aiAsstEsc(aiT('admin_ai_conn_error', 'Bağlantı hatası.')) + '</div>';
  }
}
async function adminAiConfirm(btn){
  if (!adminAiPlanId || !adminAiPendingBubble) return;
  const planId = adminAiPlanId;
  const bubble = adminAiPendingBubble;
  const actionsRow = btn.closest('.ai-plan-actions');
  actionsRow.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const res = await fetch('/api/admin/ai-assistant/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId })
    });
    const data = await res.json();
    if (!res.ok) {
      actionsRow.insertAdjacentHTML('beforebegin', '<div class="ai-msg-tag err">' + aiAsstEsc(adminAiErrorText(data.error)) + '</div>');
      actionsRow.querySelectorAll('button').forEach(b => b.disabled = false);
      return;
    }
    actionsRow.remove();
    bubble.classList.add('applied');
    bubble.querySelector('.ai-plan').insertAdjacentHTML('beforeend',
      '<div class="ai-msg-tag applied"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + aiT('admin_ai_applied_title', 'Uygulandı') + '</div>');
    if (adminAiPlanId === planId) { adminAiPlanId = null; adminAiPendingBubble = null; }
    if (typeof loadMenuDatabase === 'function') {
      await loadMenuDatabase();
      if (typeof renderAdminProductList === 'function') renderAdminProductList();
    }
  } catch (e) {
    actionsRow.querySelectorAll('button').forEach(b => b.disabled = false);
  }
}
// Cancel button on a specific plan bubble (chat history — always targets its own bubble).
function adminAiCancelBubble(btn){
  const bubble = btn.closest('.ai-msg');
  const actionsRow = btn.closest('.ai-plan-actions');
  if (actionsRow) actionsRow.remove();
  bubble.classList.add('cancelled');
  bubble.querySelector('.ai-plan').insertAdjacentHTML('beforeend',
    '<div class="ai-msg-tag cancelled">' + aiT('admin_ai_cancel', 'İptal') + '</div>');
  if (adminAiPendingBubble === bubble) { adminAiPlanId = null; adminAiPendingBubble = null; }
}
// Invalidates whatever plan is currently pending (called before a new send) without touching
// earlier chat history — just marks that one bubble as cancelled in place.
function adminAiCancel(){
  if (adminAiPendingBubble) {
    const actionsRow = adminAiPendingBubble.querySelector('.ai-plan-actions');
    if (actionsRow) actionsRow.remove();
    adminAiPendingBubble.classList.add('cancelled');
    const plan = adminAiPendingBubble.querySelector('.ai-plan');
    if (plan && !plan.querySelector('.ai-msg-tag')) {
      plan.insertAdjacentHTML('beforeend', '<div class="ai-msg-tag cancelled">' + aiT('admin_ai_cancel', 'İptal') + '</div>');
    }
  }
  adminAiPlanId = null;
  adminAiPendingBubble = null;
}

// ── Restaurant Info + Branding (Phase C) — tenant self-service, mirrors what Root can already
// edit for any tenant via root.html's "Restoranı Düzenle"/"Marka & Site" modals. Both read from the
// same /api/site-config the customer page + Widget Ayarları already share (window.__siteConfig). ──
async function loadRestaurantInfo() {
  let cfg = window.__siteConfig;
  if (!cfg) { try { cfg = await (await fetch('/api/site-config')).json(); window.__siteConfig = cfg; } catch (e) {} }
  if (!cfg) return;
  document.getElementById('riName').value = cfg.name || '';
  document.getElementById('riDisplay').value = cfg.display_name || '';
  document.getElementById('riPhone').value = cfg.contact_phone || '';
  document.getElementById('riEmail').value = cfg.contact_email || '';
  document.getElementById('riAddress').value = cfg.address || '';
  const status = (cfg.settings && cfg.settings.subscription_status) || 'active';
  const pill = document.getElementById('membershipStatusPill');
  if (pill) {
    if (status === 'trial' && cfg.settings && cfg.settings.trial_started_at) {
      const elapsedDays = Math.floor((Date.now() - cfg.settings.trial_started_at) / 86400000);
      const daysLeft = Math.max(0, 14 - elapsedDays);
      pill.textContent = daysLeft > 0
        ? aiT('admin_membership_trial_days', 'Deneme Sürümü — {n} gün kaldı').replace('{n}', daysLeft)
        : aiT('admin_membership_trial_ended', 'Deneme Süresi Doldu');
    } else {
      pill.textContent = aiT('admin_membership_status_' + status, status === 'active' ? 'Aktif' : status);
    }
  }
}
async function saveRestaurantInfo() {
  const btn = document.getElementById('restaurantInfoSaveBtn');
  const statusEl = document.getElementById('restaurantInfoStatus');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/restaurant-info', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('riName').value.trim(),
        display_name: document.getElementById('riDisplay').value.trim(),
        contact_phone: document.getElementById('riPhone').value.trim(),
        contact_email: document.getElementById('riEmail').value.trim(),
        address: document.getElementById('riAddress').value.trim()
      })
    });
    const data = await res.json();
    btn.disabled = false;
    statusEl.style.display = 'block';
    if (!res.ok) { statusEl.textContent = data.error || aiT('admin_ai_error_generic', 'Bir hata oluştu.'); return; }
    if (window.__siteConfig) {
      Object.assign(window.__siteConfig, { name: data.name, display_name: data.display_name, contact_phone: data.contact_phone, contact_email: data.contact_email, address: data.address });
    }
    statusEl.textContent = aiT('admin_restinfo_saved', 'Kaydedildi.');
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}

async function loadBranding() {
  let cfg = window.__siteConfig;
  if (!cfg) { try { cfg = await (await fetch('/api/site-config')).json(); window.__siteConfig = cfg; } catch (e) {} }
  const s = (cfg && cfg.settings) || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('brCompany', s.company_name);
  set('brHeroTr', s.hero_title_tr); set('brHeroEn', s.hero_title_en);
  set('brHeroSubTr', s.hero_sub_tr); set('brHeroSubEn', s.hero_sub_en);
  set('brFooter', s.footer_text);
  set('brBannerTr', s.banner_text_tr); set('brBannerEn', s.banner_text_en);
  set('brSeoTitle', s.seo_title); set('brSeoDesc', s.seo_description); set('brSeoKeywords', s.seo_keywords);
  set('brOgImage', s.og_image); set('brSeoCanonical', s.seo_canonical);
  set('brSeoRobots', s.seo_robots || 'index');
  set('brTheme', s.theme || 'dark');
  // VERI KAYBI DUZELTMESI (Faz 88): telefon/e-posta/adres hem settings JSON'unda hem de tenants
  // tablosunun kendi sutunlarinda durur. Restoran bu degerleri "Restoran Bilgileri" ekranindan
  // girdiyse (ya da kurulum sirasinda gelmisse) yalnizca SUTUNDA olur, settings'te olmaz. Bu
  // alanlar sadece s.* okundugu icin form BOS aciliyor, saveBranding() ise her alani kosulsuz
  // gonderdigi icin kaydete basildigi anda restoranin telefonu/adresi SESSIZCE siliniyordu.
  // Artik settings yoksa sutun degerine dusuluyor.
  set('brPhone', s.contact_phone || cfg.contact_phone);
  set('brWhatsapp', s.whatsapp);
  set('brEmail', s.contact_email || cfg.contact_email);
  set('brWebsite', s.website); set('brAddress', s.address || cfg.address);
  set('brMapsLink', s.maps_link); set('brMapsEmbed', s.maps_embed);
  set('brInstagram', s.instagram); set('brFacebook', s.facebook); set('brTwitter', s.twitter);
  set('brTiktok', s.tiktok); set('brYoutube', s.youtube);
  const logoImg = document.getElementById('brandLogoPreview');
  window.__brandLogoUrl = s.logo_url || '';
  if (logoImg) {
    if (s.logo_url) { logoImg.src = s.logo_url; logoImg.style.display = 'block'; }
    else { logoImg.style.display = 'none'; }
  }
  const favImg = document.getElementById('brandFaviconPreview');
  window.__brandFaviconUrl = s.favicon_url || '';
  if (favImg) {
    if (s.favicon_url) { favImg.src = s.favicon_url; favImg.style.display = 'block'; }
    else { favImg.style.display = 'none'; }
  }
}
async function handleBrandFaviconUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('brandingStatus');
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!allowed.includes(file.type)) { statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_brand_bad_format', 'Desteklenmeyen format.'); input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_brand_too_big', 'Görsel 5MB sınırını aşıyor.'); input.value = ''; return; }
  statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_ai_thinking', 'Yükleniyor…');
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
    });
    const out = await res.json();
    if (!res.ok || !out.url) throw new Error(out.error || 'upload failed');
    window.__brandFaviconUrl = out.url;
    const favImg = document.getElementById('brandFaviconPreview');
    if (favImg) { favImg.src = out.url; favImg.style.display = 'block'; }
    statusEl.style.display = 'none'; statusEl.textContent = '';
  } catch (e) {
    statusEl.textContent = e.message || aiT('admin_ai_error_generic', 'Bir hata oluştu.');
  }
}
async function handleBrandLogoUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('brandingStatus');
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!allowed.includes(file.type)) { statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_brand_bad_format', 'Desteklenmeyen format.'); input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_brand_too_big', 'Görsel 5MB sınırını aşıyor.'); input.value = ''; return; }
  statusEl.style.display = 'block'; statusEl.textContent = aiT('admin_ai_thinking', 'Yükleniyor…');
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
    });
    const out = await res.json();
    if (!res.ok || !out.url) throw new Error(out.error || 'upload failed');
    window.__brandLogoUrl = out.url;
    const logoImg = document.getElementById('brandLogoPreview');
    if (logoImg) { logoImg.src = out.url; logoImg.style.display = 'block'; }
    statusEl.style.display = 'none'; statusEl.textContent = '';
  } catch (e) {
    statusEl.textContent = e.message || aiT('admin_ai_error_generic', 'Bir hata oluştu.');
  }
}
async function saveBranding() {
  const btn = document.getElementById('brandingSaveBtn');
  const statusEl = document.getElementById('brandingStatus');
  btn.disabled = true;
  const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const payload = {
    logo_url: window.__brandLogoUrl || '',
    favicon_url: window.__brandFaviconUrl || '',
    company_name: get('brCompany'),
    hero_title_tr: get('brHeroTr'), hero_title_en: get('brHeroEn'),
    hero_sub_tr: get('brHeroSubTr'), hero_sub_en: get('brHeroSubEn'),
    footer_text: get('brFooter'),
    banner_text_tr: get('brBannerTr'), banner_text_en: get('brBannerEn'),
    seo_title: get('brSeoTitle'), seo_description: get('brSeoDesc'), seo_keywords: get('brSeoKeywords'),
    og_image: get('brOgImage'), seo_canonical: get('brSeoCanonical'), seo_robots: get('brSeoRobots'),
    theme: get('brTheme'),
    contact_phone: get('brPhone'), whatsapp: get('brWhatsapp'), contact_email: get('brEmail'),
    website: get('brWebsite'), address: get('brAddress'),
    maps_link: get('brMapsLink'), maps_embed: get('brMapsEmbed'),
    instagram: get('brInstagram'), facebook: get('brFacebook'), twitter: get('brTwitter'),
    tiktok: get('brTiktok'), youtube: get('brYoutube')
  };
  try {
    const res = await fetch('/api/admin/branding', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await res.json();
    btn.disabled = false;
    statusEl.style.display = 'block';
    if (!res.ok) { statusEl.textContent = data.error || aiT('admin_ai_error_generic', 'Bir hata oluştu.'); return; }
    if (window.__siteConfig) window.__siteConfig.settings = data.settings;
    statusEl.textContent = aiT('admin_brand_saved', 'Kaydedildi.');
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}

// ── Profile avatar (Phase D) — real name/photo for Google-linked accounts, existing
// initial-letter badge stays the fallback for password-only accounts with no avatar_url. ──
async function loadAdminProfile() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return;
    const data = await res.json();
    const avEl = document.getElementById('adminProfileAv');
    const nmEl = document.getElementById('adminProfileNm');
    if (!avEl || !nmEl) return;
    if (data.avatar_url) {
      avEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = data.avatar_url; img.alt = '';
      avEl.appendChild(img);
    } else {
      avEl.textContent = (data.display_name || data.username || 'A').charAt(0).toUpperCase();
    }
    if (data.display_name) {
      nmEl.textContent = data.display_name;
      nmEl.removeAttribute('data-i18n');
    }
  } catch (e) { /* keep the static fallback badge */ }
}

// ── Danger Zone (Phase D) — tenant self-service pause/delete ──
async function loadDangerZone() {
  let cfg = window.__siteConfig;
  if (!cfg) { try { cfg = await (await fetch('/api/site-config')).json(); window.__siteConfig = cfg; } catch (e) {} }
  const paused = !!(cfg && cfg.settings && cfg.settings.self_paused);
  updateSelfPauseButton(paused);
}
function updateSelfPauseButton(paused) {
  const btn = document.getElementById('selfPauseBtn');
  if (!btn) return;
  btn.dataset.paused = paused ? '1' : '0';
  btn.textContent = paused ? aiT('admin_danger_resume_btn', 'Restoranı Tekrar Aç') : aiT('admin_danger_pause_btn', 'Restoranı Kapat');
}
async function toggleSelfPause() {
  const btn = document.getElementById('selfPauseBtn');
  const statusEl = document.getElementById('selfPauseStatus');
  const next = btn.dataset.paused !== '1';
  if (next) {
    const ok = await showCustomConfirm(aiT('admin_danger_pause_confirm', 'Restoranınızı geçici olarak kapatmak istediğinize emin misiniz? Müşterileriniz yeni sipariş/rezervasyon oluşturamayacak. İstediğiniz an buradan tekrar açabilirsiniz.'));
    if (!ok) return;
  }
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/self-pause', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: next })
    });
    const data = await res.json();
    btn.disabled = false;
    statusEl.style.display = 'block';
    if (!res.ok) { statusEl.textContent = data.error || aiT('admin_ai_error_generic', 'Bir hata oluştu.'); return; }
    if (window.__siteConfig && window.__siteConfig.settings) window.__siteConfig.settings.self_paused = data.self_paused;
    updateSelfPauseButton(data.self_paused);
    statusEl.textContent = data.self_paused
      ? aiT('admin_danger_paused_msg', 'Restoranınız şu an kapalı.')
      : aiT('admin_danger_resumed_msg', 'Restoranınız tekrar açık.');
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}
async function confirmDeleteMyRestaurant() {
  const restaurantName = (window.__siteConfig && (window.__siteConfig.display_name || window.__siteConfig.name)) || '';
  const ok = await showCustomConfirm(
    aiT('admin_danger_delete_confirm1', 'Bu işlem geri alınamaz. Restoranınız ve tüm verileriniz kalıcı olarak silinecek. Devam etmek istiyor musunuz?'),
    aiT('admin_danger_delete_confirm1_title', 'Emin misiniz?')
  );
  if (!ok) return;
  const typed = await showCustomPrompt(
    (aiT('admin_danger_delete_confirm2', 'Silme işlemini onaylamak için restoranınızın adını yazın:')) + ' <strong>"' + restaurantName + '"</strong>',
    aiT('admin_danger_delete_confirm1_title', 'Emin misiniz?')
  );
  if (typed === null) return;
  if (typed.trim() !== restaurantName.trim()) {
    showCustomAlert(aiT('admin_danger_delete_mismatch', 'Yazdığınız isim eşleşmedi, silme işlemi iptal edildi.'));
    return;
  }
  const btn = document.getElementById('selfDeleteBtn');
  const statusEl = document.getElementById('selfDeleteStatus');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/self', { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      btn.disabled = false;
      statusEl.style.display = 'block';
      statusEl.textContent = data.error || aiT('admin_ai_error_generic', 'Bir hata oluştu.');
      return;
    }
    setAdminToken('');
    window.location.href = '/';
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}

// ── Widget Settings (Phase 28) — tenant self-service on/off for the customer-site widgets ──
const TENANT_WIDGET_KEYS = ['whatsapp', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'website', 'maps'];
async function loadTenantWidgets() {
  let cfg = window.__siteConfig;
  if (!cfg) { try { cfg = await (await fetch('/api/site-config')).json(); window.__siteConfig = cfg; } catch (e) {} }
  const widgets = (cfg && cfg.settings && cfg.settings.widgets) || {};
  TENANT_WIDGET_KEYS.forEach(key => {
    const el = document.getElementById('tw' + key.charAt(0).toUpperCase() + key.slice(1));
    if (el) el.checked = widgets[key] !== false;
  });
}
async function saveTenantWidgets() {
  const btn = document.getElementById('tenantWidgetsSaveBtn');
  const statusEl = document.getElementById('tenantWidgetsStatus');
  const widgets = {};
  TENANT_WIDGET_KEYS.forEach(key => {
    const el = document.getElementById('tw' + key.charAt(0).toUpperCase() + key.slice(1));
    if (el) widgets[key] = el.checked;
  });
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/site-widgets', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets })
    });
    const data = await res.json();
    btn.disabled = false;
    statusEl.style.display = 'block';
    if (!res.ok) { statusEl.textContent = data.error || 'Kaydedilemedi.'; return; }
    if (window.__siteConfig && window.__siteConfig.settings) window.__siteConfig.settings.widgets = data.widgets;
    statusEl.textContent = aiT('admin_widgets_saved', 'Kaydedildi.');
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}

// ── Website Editor (Phase 35) — hero images + plain-text hero title/subtitle ──
// Matches the DEFAULT images index.html's carousel falls back to when a tenant hasn't
// customized hero_images, so the admin sees exactly what's live today, not an empty grid.
const HERO_DEFAULT_IMAGES = ['/icons/hero-default-1.jpg', '/icons/hero-default-2.jpg', '/icons/hero-default-3.jpg',
  '/icons/hero-default-4.jpg', '/icons/hero-default-5.jpg', '/icons/hero-default-6.jpg', '/icons/hero-default-7.jpg'];
// Same built-in copy index.html's i18nData ships, used only as an editable starting point when
// a tenant has never set their own hero text (mirrors what visitors already see by default).
const HERO_DEFAULT_TEXT = {
  tr: { title: 'Gerçek Lezzet Her Lokmada', sub: 'Lezzetli yemekler ve sıcak bir atmosfer sizi bekliyor.' },
  en: { title: 'Real Taste In Every Bite', sub: 'Delicious food and a warm atmosphere await you.' }
};
let heroImagesDraft = [];
function heroToPlainText(html) {
  return String(html == null ? '' : html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
async function loadWebsiteEditor() {
  let cfg = window.__siteConfig;
  if (!cfg) { try { cfg = await (await fetch('/api/site-config')).json(); window.__siteConfig = cfg; } catch (e) {} }
  const s = (cfg && cfg.settings) || {};
  heroImagesDraft = (Array.isArray(s.hero_images) && s.hero_images.length) ? s.hero_images.slice() : HERO_DEFAULT_IMAGES.slice();
  renderHeroImagesGrid();
  document.getElementById('heroTitleTr').value = s.hero_title_tr ? heroToPlainText(s.hero_title_tr) : HERO_DEFAULT_TEXT.tr.title;
  document.getElementById('heroTitleEn').value = s.hero_title_en ? heroToPlainText(s.hero_title_en) : HERO_DEFAULT_TEXT.en.title;
  document.getElementById('heroSubTr').value = s.hero_sub_tr ? heroToPlainText(s.hero_sub_tr) : HERO_DEFAULT_TEXT.tr.sub;
  document.getElementById('heroSubEn').value = s.hero_sub_en ? heroToPlainText(s.hero_sub_en) : HERO_DEFAULT_TEXT.en.sub;
}
function renderHeroImagesGrid() {
  const grid = document.getElementById('heroImagesGrid');
  if (!grid) return;
  grid.innerHTML = heroImagesDraft.map((url, i) => `
    <div style="position:relative; border-radius:10px; overflow:hidden; border:1px solid var(--ap-line); aspect-ratio:3/4;">
      <img src="${url}" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
      <button type="button" onclick="removeHeroImage(${i})" title="Kaldır" style="position:absolute; top:4px; right:4px; width:22px; height:22px; border:none; border-radius:50%; background:rgba(0,0,0,.6); color:#fff; cursor:pointer; font-size:14px; line-height:1;">×</button>
      <div style="position:absolute; bottom:4px; left:4px; right:4px; display:flex; gap:4px; justify-content:center;">
        <button type="button" onclick="moveHeroImage(${i},-1)" ${i === 0 ? 'disabled' : ''} style="flex:1; border:none; border-radius:6px; background:rgba(0,0,0,.6); color:#fff; cursor:pointer; padding:3px 0;">↑</button>
        <button type="button" onclick="moveHeroImage(${i},1)" ${i === heroImagesDraft.length - 1 ? 'disabled' : ''} style="flex:1; border:none; border-radius:6px; background:rgba(0,0,0,.6); color:#fff; cursor:pointer; padding:3px 0;">↓</button>
      </div>
    </div>`).join('');
}
function removeHeroImage(i) { heroImagesDraft.splice(i, 1); renderHeroImagesGrid(); }
function moveHeroImage(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= heroImagesDraft.length) return;
  [heroImagesDraft[i], heroImagesDraft[j]] = [heroImagesDraft[j], heroImagesDraft[i]];
  renderHeroImagesGrid();
}
async function handleHeroImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('heroImagesStatus');
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) { statusEl.style.display = 'block'; statusEl.textContent = 'Desteklenmeyen format.'; input.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { statusEl.style.display = 'block'; statusEl.textContent = 'Görsel 5MB sınırını aşıyor.'; input.value = ''; return; }
  if (heroImagesDraft.length >= 10) { statusEl.style.display = 'block'; statusEl.textContent = 'En fazla 10 görsel eklenebilir.'; input.value = ''; return; }
  statusEl.style.display = 'block'; statusEl.textContent = 'Yükleniyor…';
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
    });
    const out = await res.json();
    if (!res.ok || !out.url) throw new Error(out.error || 'Yükleme başarısız');
    heroImagesDraft.push(out.url);
    renderHeroImagesGrid();
    statusEl.textContent = 'Yüklendi ✓';
  } catch (e) {
    statusEl.textContent = e.message || 'Yükleme başarısız';
  } finally {
    input.value = '';
  }
}
async function saveWebsiteContent() {
  const btn = document.getElementById('websiteContentSaveBtn');
  const statusEl = document.getElementById('websiteContentStatus');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/website-content', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hero_images: heroImagesDraft,
        hero_title_tr: document.getElementById('heroTitleTr').value,
        hero_title_en: document.getElementById('heroTitleEn').value,
        hero_sub_tr: document.getElementById('heroSubTr').value,
        hero_sub_en: document.getElementById('heroSubEn').value
      })
    });
    const data = await res.json();
    btn.disabled = false;
    statusEl.style.display = 'block';
    if (!res.ok) { statusEl.textContent = data.error || 'Kaydedilemedi.'; return; }
    if (window.__siteConfig && window.__siteConfig.settings) Object.assign(window.__siteConfig.settings, data);
    statusEl.textContent = aiT('admin_widgets_saved', 'Kaydedildi.');
  } catch (e) {
    btn.disabled = false;
    statusEl.style.display = 'block';
    statusEl.textContent = aiT('admin_ai_conn_error', 'Bağlantı hatası.');
  }
}

function updateAdminRezBadge() {
  const badge = document.getElementById('adminRezBadge');
  if (!badge) return;
  const rezList = window.reservationsData || [];
  const unreadCount = rezList.filter(r => !r.read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ===================== ORDERS (food ordering system) =====================
window.ordersData = [];
window.ordersFlashIds = [];
let ordersFilter = 'all';      // all | new | read
let ordersSort = 'newest';     // newest | oldest
let ordersSearch = '';
let ordersKnownIds = new Set();
let ordersFirstLoad = true;

function ordT(key){
  const lang = window.currentLanguage || 'tr';
  if (typeof i18nData !== 'undefined' && i18nData[lang] && i18nData[lang][key] != null) return i18nData[lang][key];
  if (typeof i18nData !== 'undefined' && i18nData.tr && i18nData.tr[key] != null) return i18nData.tr[key];
  return key;
}
function escapeHtmlOrder(str){
  return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}
// Diacritic-insensitive fold so search works across Turkish characters.
// (Turkish "İ".toLowerCase() yields "i" + combining dot U+0307, which breaks naive substring search.)
function ordNormalize(s){
  return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}
function ordFormatPrice(n){
  const val = Math.round((Number(n) || 0) * 100) / 100;
  const lang = window.currentLanguage || 'tr';
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const isWhole = Math.abs(val - Math.round(val)) < 0.005;
  return '₺' + val.toLocaleString(locale, { minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2 });
}
function ordPaymentLabel(m){
  if (m === 'card') return ordT('admin_order_pay_card');
  if (m === 'online') return ordT('admin_order_pay_online');
  return ordT('admin_order_pay_cash');
}
function ordDate(ts){
  if (!ts) return '';
  const d = new Date(Number(ts));
  const lang = window.currentLanguage || 'tr';
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  try { return d.toLocaleString(locale, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return d.toLocaleString(); }
}

async function loadOrders(){
  if (!getAdminToken()) return;   // not signed in yet — skip (avoids 401 noise before login)
  try {
    const res = await fetch('/api/orders', { headers: { 'Authorization': 'Bearer ' + getAdminToken() } });
    if (!res.ok) throw new Error('Failed to fetch orders');
    const data = await res.json();

    const incomingIds = data.map(o => o.id);
    let newlyArrived = [];
    if (!ordersFirstLoad) newlyArrived = incomingIds.filter(id => !ordersKnownIds.has(id));

    window.ordersData = data;
    ordersKnownIds = new Set(incomingIds);
    window.ordersFlashIds = newlyArrived;

    if (newlyArrived.length > 0) playOrderSound();
    ordersFirstLoad = false;

    renderAdminOrdersList();
    updateAdminOrdersBadge();
  } catch (e) {
    console.error('Error loading orders:', e);
  }
}

function updateAdminOrdersBadge(){
  const badge = document.getElementById('adminOrdersBadge');
  if (!badge) return;
  const count = (window.ordersData || []).filter(o => !o.read).length;
  if (count > 0){ badge.textContent = count; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}

function renderAdminOrdersList(){
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  let list = (window.ordersData || []).slice();

  if (ordersFilter === 'new') list = list.filter(o => !o.read);
  else if (ordersFilter === 'read') list = list.filter(o => o.read);

  const q = ordNormalize((ordersSearch || '').trim());
  if (q){
    list = list.filter(o =>
      ordNormalize(o.name).includes(q) ||
      ordNormalize(o.phone).includes(q) ||
      (o.items || []).some(it => ordNormalize(it.name).includes(q))
    );
  }

  list.sort((a, b) => ordersSort === 'oldest'
    ? (Number(a.created_at) - Number(b.created_at))
    : (Number(b.created_at) - Number(a.created_at)));

  if (list.length === 0){
    container.innerHTML = `<div class="admin-orders-empty">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <p>${ordT('admin_orders_empty')}</p></div>`;
    return;
  }

  const flashSet = new Set(window.ordersFlashIds || []);
  const itemsLabel = ordT('admin_order_items');

  container.innerHTML = list.map(o => {
    const itemsHtml = (o.items || []).map(it =>
      `<div class="aoc-item-line"><span><span class="q">${parseInt(it.quantity) || 0} ×</span> ${escapeHtmlOrder(it.name)}</span><span>${ordFormatPrice(it.line_total)}</span></div>`
    ).join('');
    const addrDetail = o.address_detail ? `<div class="aoc-section"><span class="lbl">${ordT('admin_order_address_detail')}</span>${escapeHtmlOrder(o.address_detail)}</div>` : '';
    const addrNotes = o.address_notes ? `<div class="aoc-section"><span class="lbl">${ordT('admin_order_address_notes')}</span>${escapeHtmlOrder(o.address_notes)}</div>` : '';
    const orderNotes = o.order_notes ? `<div class="aoc-section"><span class="lbl">${ordT('admin_order_notes')}</span>${escapeHtmlOrder(o.order_notes)}</div>` : '';
    return `
    <div class="admin-order-card ${o.read ? 'read' : ''} ${flashSet.has(o.id) ? 'flash' : ''}">
      <div class="aoc-top">
        <div>
          <div class="aoc-name">${escapeHtmlOrder(o.name)}</div>
          <div class="aoc-phone"><a href="tel:${encodeURIComponent(o.phone || '')}">${escapeHtmlOrder(o.phone)}</a></div>
        </div>
        <span class="aoc-badge ${o.read ? 'read' : 'new'}">${o.read ? ordT('admin_order_read_badge') : ordT('admin_order_new_badge')}</span>
      </div>
      <div class="aoc-section"><span class="lbl">${ordT('admin_order_address')}</span>${escapeHtmlOrder(o.address)}</div>
      ${addrDetail}${addrNotes}
      <div class="aoc-items"><span class="lbl">${itemsLabel}</span>${itemsHtml}</div>
      ${orderNotes}
      <div class="aoc-total"><span class="lbl">${ordT('admin_order_total')}</span><span class="val">${ordFormatPrice(o.total)}</span></div>
      <div class="aoc-meta"><span>${ordPaymentLabel(o.payment_method)}</span><span>${ordDate(o.created_at)}</span></div>
      <div class="aoc-actions">
        ${o.read ? '' : `<button class="aoc-btn mark" onclick="markOrderRead('${o.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${ordT('admin_order_mark_read')}</button>`}
        <button class="aoc-btn del" onclick="deleteOrder('${o.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> ${ordT('admin_order_delete')}</button>
      </div>
    </div>`;
  }).join('');

  window.ordersFlashIds = [];   // consume flash so highlights don't repeat on next render
}

function setOrdersFilter(f, btn){
  ordersFilter = f;
  btn.parentElement.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminOrdersList();
}
function setOrdersSort(s, btn){
  ordersSort = s;
  btn.parentElement.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminOrdersList();
}
function onOrdersControlsChange(){
  const el = document.getElementById('ordersSearchInput');
  ordersSearch = el ? el.value : '';
  renderAdminOrdersList();
}

async function markOrderRead(id){
  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
      body: JSON.stringify({ read: true })
    });
    if (!res.ok) throw new Error('failed');
    await loadOrders();
  } catch(e){ console.error('markOrderRead error:', e); }
}

async function deleteOrder(id){
  const confirmed = await showCustomConfirm(ordT('admin_order_confirm_delete'), ordT('admin_order_delete'));
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getAdminToken() } });
    if (!res.ok) throw new Error('failed');
    ordersKnownIds.delete(id);
    await loadOrders();
  } catch(e){ console.error('deleteOrder error:', e); }
}

// Short beep to alert the admin of a newly arrived order (optional; ignored if audio unavailable).
function playOrderSound(){
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.52);
    o.onended = () => { try { ctx.close(); } catch(e){} };
  } catch(e){}
}

// Poll for new orders whenever the admin panel is open (open == authenticated), so the
// badge and the new-order alert update even while the admin is on another tab.
setInterval(() => {
  const panel = document.getElementById('adminPanelOverlay');
  if (panel && panel.classList.contains('open')) loadOrders();
}, 15000);

function renderAdminRezList() {
  console.log("[DEBUG] renderAdminRezList triggered. Data length:", (window.reservationsData || []).length);
  const container = document.getElementById('adminRezList');
  if (!container) {
    console.error("[DEBUG] adminRezList container NOT FOUND in HTML!");
    return;
  }
  
  const rezList = window.reservationsData || [];
  if (rezList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--muted); font-size:0.9rem; grid-column: 1 / -1;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.6;color:var(--muted);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>Henüz alınmış bir rezervasyon bulunmuyor.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = rezList.map(item => `
    <div class="admin-rez-item ${item.read ? 'read' : 'unread'}" id="rez-card-${item.id}">
      <div class="rez-details">
        <div class="rez-top-row">
          <span class="rez-name">${item.name}</span>
          <span class="rez-pax">${item.pax} ${window.currentLanguage === 'tr' ? 'Kişi' : 'People'}</span>
        </div>
        <div class="rez-meta-row">
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${item.phone}</span>
          <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${item.date} @ ${item.time}</span>
        </div>
        ${item.note ? `<div class="rez-note"><strong>Not:</strong> ${item.note}</div>` : ''}
      </div>
      <div class="rez-actions">
        ${!item.read ? `
          <button class="rez-action-btn" onclick="markRezAsRead('${item.id}')" title="${window.currentLanguage === 'tr' ? 'Okundu Olarak İşaretle' : 'Mark as Read'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        ` : `
          <span class="read-badge">${window.currentLanguage === 'tr' ? 'Okundu' : 'Read'}</span>
        `}
        <button class="rez-action-btn delete" onclick="deleteReservation('${item.id}')" title="${window.currentLanguage === 'tr' ? 'Sil' : 'Delete'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #FF5252;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function markRezAsRead(id) {
  try {
    const res = await fetch(`/api/reservations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true })
    });
    if (!res.ok) throw new Error('Failed to update status');
    await loadReservations();
  } catch (e) {
    console.error("Error marking reservation as read:", e);
  }
}

// Kullanıcı isteğiyle kaldırıldı: rezervasyon kartını üstteki "silmek için sürükleyin" kutusuna
// sürükleyip bırakma özelliği (draggedRezId/handleRezDragStart/allowRezDragOver/
// handleRezDragLeave/handleRezDrop) hiçbir kartta gerçekten `draggable`/`ondragstart` olarak
// bağlanmamıştı — yani zaten görünse de çalışmıyordu. Her kartın üzerindeki çöp kutusu butonu
// (aşağıdaki deleteReservation) zaten doğrudan silme yapıyor, artık tek silme yolu bu.
async function deleteReservation(id) {
  const confirmMsg = window.currentLanguage === 'tr' 
    ? 'Bu rezervasyonu silmek istediğinize emin misiniz?' 
    : 'Are you sure you want to delete this reservation?';
  const confirmDelete = await showCustomConfirm(confirmMsg);
  if (!confirmDelete) return;
  
  try {
    const res = await fetch(`/api/reservations/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete reservation');
    await loadReservations();
  } catch (e) {
    console.error("Error deleting reservation:", e);
  }
}

function closeAdminPanel() {
  window.location.href = "./";
}

function showAdminSearchSuggestions() {
  const panel = document.getElementById('adminSearchSuggestions');
  if (panel) {
    panel.classList.add('open');
  }
}

function hideAdminSearchSuggestions() {
  const panel = document.getElementById('adminSearchSuggestions');
  if (panel) {
    // Small delay so that click events inside the panel are processed before closing
    setTimeout(() => {
      panel.classList.remove('open');
    }, 200);
  }
}

function renderAdminProductList() {
  const list = document.getElementById('adminProductsList');
  const query = document.getElementById('adminSearchInput').value.toLowerCase().trim();
  const catFilter = window.selectedAdminCategoryFilter || 'tumu';
  if(!list) return;
  
  list.innerHTML = '';
  const filtered = window.menuData.filter(item => {
    // Filter by Category
    if (catFilter !== 'tumu' && item.category !== catFilter) {
      return false;
    }
    // Filter by Search Query (null-safe)
    const nameMatch = (item.name || '').toLowerCase().includes(query);
    const descMatch = (item.description || '').toLowerCase().includes(query);
    const catMatch = (item.category && categoriesMap[item.category]) ? categoriesMap[item.category].name.toLowerCase().includes(query) : false;
    return nameMatch || descMatch || catMatch;
  });
  
  if (filtered.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0;">Aranan kriterde ürün bulunamadı.</p>';
    return;
  }
  
  filtered.forEach(item => {
    const catName = categoriesMap[item.category] ? categoriesMap[item.category].name : item.category;
    const row = document.createElement('div');
    row.className = 'admin-product-row';
    row.innerHTML = `
      <div class="admin-prod-info">
        <img class="admin-prod-thumb" src="${item.image}" alt="" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'">
        <div class="admin-prod-details">
          <span class="admin-prod-name">${item.name}</span>
          <span class="admin-prod-meta">
            <span>Kategori: ${catName}</span> • 
            <span class="admin-prod-price">₺${item.price}</span>
          </span>
        </div>
      </div>
      <div class="admin-prod-btns">
        <button class="admin-prod-btn" onclick="openAdminForm('${item.id}')" title="Düzenle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="admin-prod-btn delete" onclick="deleteAdminProduct('${item.id}')" title="Sil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
    list.appendChild(row);
  });
}

// Custom Stepper Buttons logic
function stepUp(id, step = 1) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = parseFloat(el.value) || 0;
  const newVal = val + step;
  el.value = Number(newVal.toFixed(2));
}

function stepDown(id, step = 1) {
  const el = document.getElementById(id);
  if (!el) return;
  const val = parseFloat(el.value) || 0;
  const newVal = Math.max(0, val - step);
  el.value = Number(newVal.toFixed(2));
}

// Allergen Selector logic
function toggleAllergenBadge(el) {
  el.classList.toggle('active');
}

// Reflect a stored image URL (or none) in the product-image picker preview.
function setAdminProductImagePreview(url) {
  const box = document.getElementById('formProductImagePreview');
  const removeBtn = document.getElementById('formProductImageRemove');
  if (!box) return;
  if (url) {
    box.style.backgroundImage = 'url("' + url + '")';
    box.innerHTML = '';
    if (removeBtn) removeBtn.style.display = 'inline';
  } else {
    box.style.backgroundImage = 'none';
    box.innerHTML = '<span data-i18n="admin_img_none">' + (adminT ? adminT('admin_img_none') : 'Görsel yok') + '</span>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function clearAdminProductImage() {
  document.getElementById('formProductImage').value = '';
  const f = document.getElementById('formProductFile'); if (f) f.value = '';
  const st = document.getElementById('formProductImageStatus'); if (st) st.textContent = '';
  setAdminProductImagePreview('');
}

// File upload: validate → live preview → upload to /uploads → store the returned URL.
// Images are stored as files (never base64 in the DB). A new upload replaces the old one.
async function handleAdminImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const status = document.getElementById('formProductImageStatus');
  const setStatus = (msg, err) => { if (status) { status.textContent = msg; status.style.color = err ? '#ff6b5e' : 'var(--muted)'; } };

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!allowed.includes(file.type)) {
    setStatus((adminT ? adminT('admin_img_bad_format') : 'Desteklenmeyen format (PNG, JPG, WEBP, GIF, SVG)'), true);
    input.value = ''; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setStatus((adminT ? adminT('admin_img_too_big') : 'Görsel 5MB sınırını aşıyor'), true);
    input.value = ''; return;
  }

  // Instant local preview before the upload finishes
  const localUrl = URL.createObjectURL(file);
  setAdminProductImagePreview(localUrl);
  setStatus((adminT ? adminT('admin_img_uploading') : 'Yükleniyor…'), false);

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });
    const out = await res.json();
    if (!res.ok || !out.url) throw new Error(out.error || 'Upload failed');
    document.getElementById('formProductImage').value = out.url;
    setAdminProductImagePreview(out.url);
    setStatus((adminT ? adminT('admin_img_uploaded') : 'Yüklendi ✓'), false);
  } catch (e) {
    setStatus((e.message || 'Upload failed'), true);
    // keep the local preview so the user still sees their pick, but no URL is stored
  } finally {
    URL.revokeObjectURL(localUrl);
    input.value = '';
  }
}

// Switches which language's name/description/portion/ingredients panels are visible in the
// product form — every panel sharing that data-lang shows, the rest hide. Panels are plain
// hidden inputs (no separate JS state object): a hidden input keeps its .value fine, so
// switching tabs is a pure visibility concern and save/populate logic just loops over languages.
function setProductFormLang(lang) {
  document.querySelectorAll('#productLangTabs .admin-lang-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
  document.querySelectorAll('#adminFormPanel .admin-lang-panel').forEach(panel => {
    panel.style.display = (panel.getAttribute('data-lang') === lang) ? '' : 'none';
  });
}

function openAdminForm(id = null) {
  const panel = document.getElementById('adminFormPanel');
  const title = document.getElementById('adminFormTitle');

  // Clear fields
  document.getElementById('formProductId').value = '';
  document.getElementById('formProductName').value = '';
  document.getElementById('formProductNameEn').value = '';
  document.getElementById('formProductDescEn').value = '';
  document.getElementById('formProductPortionEn').value = '';
  document.getElementById('formProductIngredientsEn').value = '';
  for (const lang of CONTENT_LANGS) {
    document.getElementById(`formProductName_${lang}`).value = '';
    document.getElementById(`formProductDesc_${lang}`).value = '';
    document.getElementById(`formProductPortion_${lang}`).value = '';
    document.getElementById(`formProductIngredients_${lang}`).value = '';
  }
  setProductFormLang('tr');
  document.getElementById('formProductPrice').value = '';
  document.getElementById('formProductImage').value = '';
  document.getElementById('formProductFile').value = '';
  { const st = document.getElementById('formProductImageStatus'); if (st) st.textContent = ''; }
  setAdminProductImagePreview('');
  window.selectedFormProductCategory = 'starters';
  document.getElementById('formProductDesc').value = '';
  document.getElementById('formProductPortion').value = '';
  document.getElementById('formProductEnergy').value = '';
  document.getElementById('formProductProtein').value = '';
  document.getElementById('formProductCarb').value = '';
  document.getElementById('formProductFat').value = '';
  document.getElementById('formProductSfat').value = '';
  document.getElementById('formProductSugar').value = '';
  document.getElementById('formProductSalt').value = '';
  document.getElementById('formProductFiber').value = '';
  document.getElementById('formProductIngredients').value = '';
  document.getElementById('formProductNoAdditives').checked = false;
  
  // Clear allergen badges
  document.querySelectorAll('.allergen-badge-btn').forEach(btn => btn.classList.remove('active'));
  
  if (id) {
    title.textContent = window.currentLanguage === 'tr' ? 'Ürün Düzenle' : 'Edit Product';
    const item = window.menuData.find(x => x.id === id);
    if (item) {
      document.getElementById('formProductId').value = item.id;
      document.getElementById('formProductName').value = item.name;
      
      const trData = itemTranslations[item.id] || {};
      document.getElementById('formProductNameEn').value = trData.name || '';
      document.getElementById('formProductDescEn').value = trData.description || '';
      document.getElementById('formProductPortionEn').value = trData.portion || '';
      document.getElementById('formProductIngredientsEn').value = trData.ingredients || '';
      for (const lang of CONTENT_LANGS) {
        document.getElementById(`formProductName_${lang}`).value = item[`name_${lang}`] || '';
        document.getElementById(`formProductDesc_${lang}`).value = item[`description_${lang}`] || '';
        document.getElementById(`formProductPortion_${lang}`).value = item[`portion_${lang}`] || '';
        document.getElementById(`formProductIngredients_${lang}`).value = item[`ingredients_${lang}`] || '';
      }
      document.getElementById('formProductPrice').value = item.price;
      document.getElementById('formProductImage').value = item.image || '';
      setAdminProductImagePreview(item.image || '');
      window.selectedFormProductCategory = item.category;
      document.getElementById('formProductDesc').value = item.description;
      
      if(item.besin_degerleri) {
        document.getElementById('formProductPortion').value = item.besin_degerleri.porsiyon || '';
        document.getElementById('formProductEnergy').value = item.besin_degerleri.enerji || '';
        document.getElementById('formProductProtein').value = item.besin_degerleri.protein || '';
        document.getElementById('formProductCarb').value = item.besin_degerleri.karbonhidrat || '';
        document.getElementById('formProductFat').value = item.besin_degerleri.yag || '';
        document.getElementById('formProductSfat').value = item.besin_degerleri.doymus_yag || '';
        document.getElementById('formProductSugar').value = item.besin_degerleri.sekerler || '';
        document.getElementById('formProductSalt').value = item.besin_degerleri.tuz || '';
        document.getElementById('formProductFiber').value = item.besin_degerleri.lif || '';
      }
      
      document.getElementById('formProductIngredients').value = item.icindekiler || '';
      document.getElementById('formProductNoAdditives').checked = !!item.katki_maddesi_icermez;
      
      if(item.alerjenler) {
        item.alerjenler.forEach(alg => {
          const btn = document.querySelector(`.allergen-badge-btn[data-allergen="${alg.id}"]`);
          if(btn) btn.classList.add('active');
        });
      }
    }
  } else {
    title.textContent = window.currentLanguage === 'tr' ? 'Yeni Ürün Ekle' : 'Add New Product';
  }
  
  updateFormCategoryOptions();
  showAdminView('product-form'); // Phase 27: in-shell view, not a full-screen overlay
}

function closeAdminForm() {
  showAdminView('products'); // Phase 27: return to the Products view (was: hide the overlay)
}

// ── CATEGORY MANAGEMENT FUNCTIONS ──

// Switches which language's category-name panel is visible — same mechanism as
// setProductFormLang (see there for why there's no separate JS state object).
function setCategoryFormLang(lang) {
  document.querySelectorAll('#categoryLangTabs .admin-lang-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
  document.querySelectorAll('#adminCategoryFormPanel .admin-lang-panel').forEach(panel => {
    panel.style.display = (panel.getAttribute('data-lang') === lang) ? '' : 'none';
  });
}

// id is optional — there is no "edit category" entry point in the UI yet (categories are only
// ever created here; "editing" today means retyping an existing slug into this same blank form,
// and saveAdminCategory() PUTs instead of POSTs once it recognizes the slug). Accepting an id
// lets a future edit entry point pre-fill instead of silently blanking the 6 new language
// fields, without having to touch saveAdminCategory()'s existing POST/PUT-by-slug logic.
function openCategoryForm(id = null) {
  document.getElementById('formCategoryName').value = '';
  document.getElementById('formCategoryNameEn').value = '';
  document.getElementById('formCategorySlug').value = '';
  document.getElementById('formCategoryIcon').value = '';
  for (const lang of CONTENT_LANGS) {
    document.getElementById(`formCategoryName_${lang}`).value = '';
  }
  setCategoryFormLang('tr');
  if (id && categoriesMap[id]) {
    const cat = categoriesMap[id];
    document.getElementById('formCategoryName').value = cat.name || '';
    document.getElementById('formCategoryNameEn').value = cat.name_en || '';
    document.getElementById('formCategorySlug').value = id;
    document.getElementById('formCategoryIcon').value = cat.icon || '';
    for (const lang of CONTENT_LANGS) {
      document.getElementById(`formCategoryName_${lang}`).value = cat[`name_${lang}`] || '';
    }
  }
  showAdminView('category-form'); // Phase 27: in-shell view, not a full-screen overlay
}

function closeCategoryForm() {
  showAdminView('products'); // Phase 27: return to the Products view (was: hide the overlay)
}

async function saveAdminCategory() {
  const name = document.getElementById('formCategoryName').value.trim();
  const nameEn = document.getElementById('formCategoryNameEn').value.trim();
  const slug = document.getElementById('formCategorySlug').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  let icon = document.getElementById('formCategoryIcon').value.trim();

  if (!name || !slug) {
    showCustomAlert(window.currentLanguage === 'tr' ? 'Lütfen Kategori Adı ve Kodu alanlarını doldurun.' : 'Please fill in the Category Name and Code fields.', window.currentLanguage === 'tr' ? 'Eksik Bilgi' : 'Missing Info', 'warning');
    return;
  }

  if (!icon) {
    icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  }

  // zh/ja/de/fr/es/ko: sent as-is (empty string if left blank), no fallback to Turkish — same
  // rule as the product form (see saveAdminProduct).
  const langPayload = {};
  for (const lang of CONTENT_LANGS) {
    langPayload[`name_${lang}`] = document.getElementById(`formCategoryName_${lang}`).value.trim();
  }

  try {
    const exists = !!categoriesMap[slug];
    const url = exists ? `/api/categories/${slug}` : '/api/categories';
    const method = exists ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: slug,
        name_tr: name,
        name_en: nameEn || name,
        sort_order: Object.keys(categoriesMap).length + 1,
        icon: icon,
        ...langPayload
      })
    });
    
    if (!response.ok) throw new Error('Category save failed');
    
    await loadMenuDatabase();
    closeCategoryForm();
    showCustomAlert(window.currentLanguage === 'tr' ? 'Kategori başarıyla eklendi!' : 'Category added successfully!', window.currentLanguage === 'tr' ? 'Başarılı' : 'Success', 'info');
  } catch (err) {
    showCustomAlert(err.message, window.currentLanguage === 'tr' ? 'Hata' : 'Error', 'warning');
  }
}

async function resetMenuDataToDefault() {
  const confirmReset = await showCustomConfirm(window.currentLanguage === 'tr' ? 'Tüm menü verilerini varsayılana sıfırlamak istediğinize emin misiniz? (Eklediğiniz/düzenlediğiniz ürünler silinecektir)' : 'Are you sure you want to reset all menu data to default? (Products you added/edited will be deleted)');
  if (confirmReset) {
    try {
      const response = await fetch('/api/products/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Sıfırlama başarısız.');
      
      await loadMenuDatabase();
      showCustomAlert(window.currentLanguage === 'tr' ? 'Menü verileri başarıyla sıfırlandı!' : 'Menu data successfully reset!', window.currentLanguage === 'tr' ? 'Başarılı' : 'Success', 'info');
    } catch(e) {
      showCustomAlert((window.currentLanguage === 'tr' ? 'Sıfırlama sırasında hata oluştu: ' : 'Error occurred during reset: ') + e.message, window.currentLanguage === 'tr' ? 'Hata' : 'Error', 'warning');
    }
  }
}

async function deleteAdminProduct(id) {
  const confirmDelete = await showCustomConfirm(window.currentLanguage === 'tr' ? 'Bu ürünü silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this product?');
  if (confirmDelete) {
    try {
      const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Silme işlemi başarısız.');
      
      await loadMenuDatabase();
      
      // Rerender customer-facing menu cards instantly
      const activeTabBtn = document.querySelector('.category-dropdown-option.active');
      const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
      renderMenuCards(activeCat);
    } catch(e) {
      showCustomAlert(e.message, window.currentLanguage === 'tr' ? 'Hata' : 'Error', 'warning');
    }
  }
}

function saveMenuToDisk() {
  console.log("[DB DEBUG] saveMenuToDisk bypassed. SQLite backend handles updates dynamically.");
}

async function saveAdminProduct() {
  const id = document.getElementById('formProductId').value;
  const name = document.getElementById('formProductName').value.trim();
  const price = parseFloat(document.getElementById('formProductPrice').value);
  const image = document.getElementById('formProductImage').value.trim() || '/icons/placeholder-dish-1.svg';
  const category = window.selectedFormProductCategory;
  const desc = document.getElementById('formProductDesc').value.trim();
  
  if (!name || isNaN(price)) {
    showCustomAlert(window.currentLanguage === 'tr' ? 'Lütfen en azından Ürün Adı ve Fiyat alanlarını doldurun.' : 'Please fill in at least the Product Name and Price fields.', window.currentLanguage === 'tr' ? 'Eksik Bilgi' : 'Missing Info', 'warning');
    return;
  }
  
  const protein = parseFloat(document.getElementById('formProductProtein').value) || 0;
  const carb = parseFloat(document.getElementById('formProductCarb').value) || 0;
  const fat = parseFloat(document.getElementById('formProductFat').value) || 0;
  
  const allergenNames = {
    gluten: 'Gluten içerir',
    sut: 'Süt ve süt ürünleri içerir',
    soya: 'Soya içerebilir',
    yumurta: 'Yumurta içerebilir',
    hardal: 'Hardal içerebilir',
    kereviz: 'Kereviz içerebilir',
    susam: 'Susam içerebilir'
  };
  const allergens = [];
  document.querySelectorAll('.allergen-badge-btn.active').forEach(btn => {
    const algId = btn.getAttribute('data-allergen');
    allergens.push({
      id: algId,
      name: allergenNames[algId] || (algId.charAt(0).toUpperCase() + algId.slice(1) + ' içerebilir')
    });
  });

  const nameEn = document.getElementById('formProductNameEn').value.trim();
  const descEn = document.getElementById('formProductDescEn').value.trim();
  const portionEn = document.getElementById('formProductPortionEn').value.trim();
  const ingredientsEn = document.getElementById('formProductIngredientsEn').value.trim();

  // zh/ja/de/fr/es/ko: sent as-is (empty string if left blank) — no fallback to Turkish, so the
  // backend can tell "not yet translated" apart from "translated, matches the Turkish text".
  const langPayload = {};
  for (const lang of CONTENT_LANGS) {
    langPayload[`name_${lang}`] = document.getElementById(`formProductName_${lang}`).value.trim();
    langPayload[`description_${lang}`] = document.getElementById(`formProductDesc_${lang}`).value.trim();
    langPayload[`portion_${lang}`] = document.getElementById(`formProductPortion_${lang}`).value.trim();
    langPayload[`ingredients_${lang}`] = document.getElementById(`formProductIngredients_${lang}`).value.trim();
  }

  const payload = {
    ...langPayload,
    id: id || undefined,
    name_tr: name,
    name_en: nameEn || name,
    category: category,
    price: price,
    description_tr: desc,
    description_en: descEn || desc,
    image: image,
    portion_tr: document.getElementById('formProductPortion').value.trim() || '1 Porsiyon',
    portion_en: portionEn || '1 Portion',
    ingredients_tr: document.getElementById('formProductIngredients').value.trim(),
    ingredients_en: ingredientsEn || '',
    calories: parseFloat(document.getElementById('formProductEnergy').value) || 0,
    protein: protein,
    carbs: carb,
    fat: fat,
    saturated_fat: parseFloat(document.getElementById('formProductSfat').value) || 0,
    sugars: parseFloat(document.getElementById('formProductSugar').value) || 0,
    fiber: parseFloat(document.getElementById('formProductFiber').value) || 0,
    salt: parseFloat(document.getElementById('formProductSalt').value) || 0,
    allergens: allergens,
    katki_maddesi_icermez: document.getElementById('formProductNoAdditives').checked ? 1 : 0
  };

  const url = id ? `/api/products/${id}` : '/api/products';
  const method = id ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error('API save failed');
    
    await loadMenuDatabase();
    closeAdminForm();
    
    // Rerender customer-facing menu cards instantly
    const activeTabBtn = document.querySelector('.category-dropdown-option.active');
    const activeCat = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'tumu';
    renderMenuCards(activeCat);
    
    showCustomAlert(window.currentLanguage === 'tr' ? 'Ürün başarıyla kaydedildi!' : 'Product saved successfully!', window.currentLanguage === 'tr' ? 'Başarılı' : 'Success', 'info');
  } catch(e) {
    showCustomAlert(e.message, window.currentLanguage === 'tr' ? 'Hata' : 'Error', 'warning');
  }
}

let customAlertPromiseResolver = null;
function showCustomAlert(message, title, type = 'info') {
  if (!title) {
    title = window.currentLanguage === 'tr' ? 'Bildirim' : 'Notification';
  }
  return new Promise((resolve) => {
    const overlay = document.getElementById('customAlertOverlay');
    const msgEl = document.getElementById('customAlertMessage');
    const titleEl = document.getElementById('customAlertTitle');
    const iconEl = document.getElementById('customAlertIcon');
    
    msgEl.innerHTML = message;
    titleEl.textContent = title;
    
    if (type === 'info') {
      iconEl.className = 'custom-popup-icon';
      iconEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ember)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    } else {
      iconEl.className = 'custom-popup-icon warning';
      iconEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ap-bad,#e5776b)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    }
    
    const okBtn = overlay.querySelector('.admin-btn');
    if (okBtn) {
      okBtn.textContent = window.currentLanguage === 'tr' ? 'Tamam' : 'OK';
    }
    overlay.classList.add('open');
    customAlertPromiseResolver = resolve;
  });
}

function closeCustomAlert() {
  const overlay = document.getElementById('customAlertOverlay');
  overlay.classList.remove('open');
  if (customAlertPromiseResolver) {
    customAlertPromiseResolver();
    customAlertPromiseResolver = null;
  }
}

function showCustomConfirm(message, title) {
  if (!title) {
    title = window.currentLanguage === 'tr' ? 'Emin misiniz?' : 'Are you sure?';
  }
  return new Promise((resolve) => {
    const overlay = document.getElementById('customConfirmOverlay');
    const msgEl = document.getElementById('customConfirmMessage');
    const titleEl = document.getElementById('customConfirmTitle');
    const okBtn = document.getElementById('customConfirmOkBtn');
    const cancelBtn = document.getElementById('customConfirmCancelBtn');
    
    msgEl.innerHTML = message;
    titleEl.textContent = title;
    
    // Dynamically translate button texts
    cancelBtn.textContent = window.currentLanguage === 'tr' ? 'Vazgeç' : 'Cancel';
    okBtn.textContent = window.currentLanguage === 'tr' ? 'Evet' : 'Yes';
    
    overlay.classList.add('open');
    
    const cleanup = (result) => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// Promise-based replacement for native window.prompt() — resolves with the typed string on OK,
// null on Cancel/Escape (same contract as window.prompt, so existing `=== null` checks keep working).
function showCustomPrompt(message, title, defaultValue) {
  if (!title) {
    title = window.currentLanguage === 'tr' ? 'Değer girin' : 'Enter a value';
  }
  return new Promise((resolve) => {
    const overlay = document.getElementById('customPromptOverlay');
    const msgEl = document.getElementById('customPromptMessage');
    const titleEl = document.getElementById('customPromptTitle');
    const inputEl = document.getElementById('customPromptInput');
    const okBtn = document.getElementById('customPromptOkBtn');
    const cancelBtn = document.getElementById('customPromptCancelBtn');

    msgEl.innerHTML = message || '';
    msgEl.style.display = message ? '' : 'none';
    titleEl.textContent = title;
    inputEl.value = defaultValue || '';

    cancelBtn.textContent = window.currentLanguage === 'tr' ? 'Vazgeç' : 'Cancel';
    okBtn.textContent = window.currentLanguage === 'tr' ? 'Tamam' : 'OK';

    overlay.classList.add('open');
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

    const cleanup = (result) => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKeydown);
      resolve(result);
    };

    function onOk() { cleanup(inputEl.value); }
    function onCancel() { cleanup(null); }
    function onKeydown(e) {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKeydown);
  });
}

// ==========================================
// WEB PUSH NOTIFICATION ADMIN LOGIC
// ==========================================

function updatePushPreview() {
  const title = document.getElementById('pushTitle').value || 'My Restaurant';
  const body = document.getElementById('pushBody').value || 'Kampanya mesajı detayları burada canlı olarak güncellenecektir.';
  const image = document.getElementById('pushImage').value;
  const icon = document.getElementById('pushIcon').value;
  const btnText = document.getElementById('pushBtnText').value;
  const type = document.getElementById('pushType').value;

  // Update texts
  document.getElementById('phoneNotifTitlePreview').textContent = title;
  document.getElementById('phoneNotifBodyPreview').textContent = body;
  document.getElementById('phoneMockTypeBadge').textContent = '· ' + type;

  // Phase 25.2: brand name + icon come from the CURRENT tenant, never hardcoded.
  try {
    const brand = (typeof restaurantBrand === 'function') ? restaurantBrand() : { name: 'Restaurant', logo: '/icons/placeholder-logo.svg' };
    const nameEl = document.getElementById('phoneMockBrandName');
    const iconMockEl = document.getElementById('phoneMockBrandIcon');
    if (nameEl) nameEl.textContent = brand.name || 'Restaurant';
    if (iconMockEl && brand.logo) iconMockEl.src = brand.logo;
  } catch(e){}
  
  // Icon
  const iconEl = document.getElementById('phoneNotifIconPreview');
  if (icon) {
    iconEl.style.backgroundImage = `url('${icon}')`;
    iconEl.style.display = 'block';
  } else {
    iconEl.style.display = 'none';
  }
  
  // Image
  const imgEl = document.getElementById('phoneNotifImagePreview');
  if (image) {
    imgEl.style.backgroundImage = `url('${image}')`;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }
  
  // Action Button
  const actEl = document.getElementById('phoneNotifActionPreview');
  if (btnText) {
    actEl.textContent = btnText;
    actEl.style.display = 'block';
  } else {
    actEl.style.display = 'none';
  }
  
  // Update mock clock
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('phoneMockTime').textContent = timeStr;
}

function toggleScheduledTimeInput() {
  const option = document.getElementById('pushTimeOption').value;
  const wrapper = document.getElementById('scheduledTimeWrapper');
  wrapper.style.display = option === 'scheduled' ? 'block' : 'none';
}

function handlePushImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // Validate format
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showCustomAlert(window.currentLanguage === 'tr' ? 'Lütfen geçerli bir görsel yükleyin (PNG, JPG, WEBP).' : 'Please upload a valid image file (PNG, JPG, WEBP).');
    return;
  }
  // Validate size: 5MB
  if (file.size > 5 * 1024 * 1024) {
    showCustomAlert(window.currentLanguage === 'tr' ? 'Görsel boyutu en fazla 5MB olabilir.' : 'Image size cannot exceed 5MB.');
    return;
  }

  const label = document.getElementById('pushImageUploadLabel');
  const originalLabel = label.textContent;
  label.textContent = window.currentLanguage === 'tr' ? 'Yükleniyor...' : 'Uploading...';

  (async function() {
    // Push payloads are capped at ~4KB, so the raw file can never be embedded directly —
    // it's uploaded to the backend and only the resulting (tiny) hosted URL is used.
    // The file itself is first downscaled/re-compressed in the browser so the upload
    // stays fast and reliable even on slow mobile connections with large source photos.
    try {
      const compressedDataUrl = await compressImageForUpload(file, 1280, 0.8);
      const res = await fetch('/api/notifications/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
        body: JSON.stringify({ image: compressedDataUrl })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        document.getElementById('pushImage').value = data.url;
        label.textContent = '✓ ' + file.name;
        updatePushPreview();
      } else {
        label.textContent = originalLabel;
        showCustomAlert(window.currentLanguage === 'tr' ? ('Görsel yüklenemedi: ' + (data.error || '')) : ('Image upload failed: ' + (data.error || '')));
      }
    } catch (err) {
      label.textContent = originalLabel;
      showCustomAlert(window.currentLanguage === 'tr' ? 'Görsel yüklenirken ağ hatası oluştu.' : 'Network error while uploading image.');
    }
  })();
}

// Downscales an image file in-browser (Canvas) before upload so large source photos
// don't time out on slow connections. Resolves to a compressed JPEG data URL.
function compressImageForUpload(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read failed'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function togglePushTimeOptionDropdown(event) {
  event.stopPropagation();
  document.getElementById('pushTimeOptionContainer')?.classList.toggle('open');
}

function selectPushTimeOption(optionElem, val, label) {
  document.getElementById('pushTimeOption').value = val;
  document.getElementById('pushTimeOptionSelectedText').textContent = label;
  document.querySelectorAll('#pushTimeOptionOptions .custom-select-option').forEach(o => o.classList.remove('active'));
  optionElem.classList.add('active');
  document.getElementById('pushTimeOptionContainer')?.classList.remove('open');
  toggleScheduledTimeInput();
}

async function sendTestPush() {
  try {
    const subRes = await fetch('/api/subscriptions', { headers: { 'Authorization': 'Bearer ' + getAdminToken() } });
    const subs = await subRes.json();
    const active = Array.isArray(subs) ? subs.filter(s => s && s.enabled) : [];
    if (active.length === 0) {
      showCustomAlert(
        window.currentLanguage === 'tr'
          ? 'Test için abone bulunamadı. Önce canlı sitede bir cihazdan bildirim izni vermeniz gerekir.'
          : 'No subscribers found for testing. First grant notification permission from a device on the live site.',
        window.currentLanguage === 'tr' ? 'Abone Yok' : 'No Subscribers',
        'warning'
      );
      return;
    }
    const target = active[0];
    const title = document.getElementById('pushTitle').value || 'Test Bildirimi';
    const body = document.getElementById('pushBody').value || 'Bu bir test bildirimidir.';
    const url = document.getElementById('pushUrl').value || '/';
    const res = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() },
      body: JSON.stringify({ token: target.token, title, body, url })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showCustomAlert(
        window.currentLanguage === 'tr' ? 'Test bildirimi gönderildi!' : 'Test notification sent!',
        window.currentLanguage === 'tr' ? 'Başarılı' : 'Success',
        'info'
      );
    } else {
      showCustomAlert(
        (window.currentLanguage === 'tr' ? 'Hata: ' : 'Error: ') + (data.error || ''),
        window.currentLanguage === 'tr' ? 'Hata' : 'Error',
        'warning'
      );
    }
  } catch (e) {
    showCustomAlert(
      window.currentLanguage === 'tr' ? 'Test bildirimi gönderilirken ağ hatası oluştu.' : 'A network error occurred while sending the test notification.',
      window.currentLanguage === 'tr' ? 'Hata' : 'Error',
      'warning'
    );
  }
}

function openPushConfirmModal() {
  const title = document.getElementById('pushTitle').value;
  const body = document.getElementById('pushBody').value;
  const target = document.getElementById('pushTarget').value;
  const url = document.getElementById('pushUrl').value || '/';
  const image = document.getElementById('pushImage').value;
  
  if (!title || !body) {
    showCustomAlert(window.currentLanguage === 'tr' ? 'Başlık ve Bildirim Mesajı alanları zorunludur!' : 'Title and Message fields are required!');
    return;
  }
  
  document.getElementById('confirmPushTitle').textContent = title;
  document.getElementById('confirmPushBody').textContent = body;
  document.getElementById('confirmPushTarget').textContent = target === 'all' ? 'Tüm Aboneler' : (target === 'permitted' ? 'İzin Verenler' : (target === 'test' ? 'Test Kullanıcıları' : target));
  document.getElementById('confirmPushUrl').textContent = url;
  
  const imgWrapper = document.getElementById('confirmPushImageWrapper');
  if (image) {
    document.getElementById('confirmPushImage').style.backgroundImage = `url('${image}')`;
    imgWrapper.style.display = 'block';
  } else {
    imgWrapper.style.display = 'none';
  }
  
  document.getElementById('pushConfirmModal').classList.add('open');
}

function closePushConfirmModal() {
  document.getElementById('pushConfirmModal').classList.remove('open');
}

async function submitPushNotification() {
  closePushConfirmModal();
  
  const title = document.getElementById('pushTitle').value;
  const body = document.getElementById('pushBody').value;
  const image = document.getElementById('pushImage').value;
  const icon = document.getElementById('pushIcon').value;
  const url = document.getElementById('pushUrl').value;
  const target = document.getElementById('pushTarget').value;
  const priority = document.getElementById('pushPriority').value;
  const ttl = document.getElementById('pushTtl').value;
  const tag = document.getElementById('pushTag').value;
  const collapseKey = document.getElementById('pushCollapseKey').value;
  const timeOption = document.getElementById('pushTimeOption').value;
  const scheduledAt = document.getElementById('pushScheduledAt').value;
  
  const payload = {
    title, body, image, icon, url, target, priority, ttl, tag, collapse_key: collapseKey, created_by: 'admin'
  };
  
  const isScheduled = timeOption === 'scheduled';
  let endpoint = '/api/notifications/send';
  if (isScheduled) {
    if (!scheduledAt) {
      showCustomAlert(window.currentLanguage === 'tr' ? 'Lütfen planlanan tarihi ve saati seçin.' : 'Please select the scheduled date and time.');
      return;
    }
    payload.scheduled_at = new Date(scheduledAt).toISOString();
    endpoint = '/api/notifications/schedule';
  }
  
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getAdminToken()
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showCustomAlert(window.currentLanguage === 'tr' ? 'İşlem başarıyla tamamlandı!' : 'Operation completed successfully!');
      // Clear form
      document.getElementById('pushTitle').value = '';
      document.getElementById('pushBody').value = '';
      document.getElementById('pushImage').value = '';
      document.getElementById('pushIcon').value = '';
      document.getElementById('pushUrl').value = '';
      document.getElementById('pushBtnText').value = '';
      document.getElementById('pushTag').value = '';
      document.getElementById('pushCollapseKey').value = '';
      document.getElementById('pushScheduledAt').value = '';
      document.getElementById('pushTimeOption').value = 'now';
      toggleScheduledTimeInput();
      updatePushPreview();
      // Reload history & stats
      loadPushDashboardData();
    } else {
      const err = await res.json();
      showCustomAlert(window.currentLanguage === 'tr' ? `Hata: ${err.error}` : `Error: ${err.error}`);
    }
  } catch (e) {
    console.error('Failed to submit push notification:', e);
    showCustomAlert(window.currentLanguage === 'tr' ? 'Ağ hatası oluştu.' : 'A network error occurred.');
  }
}

async function loadPushDashboardData() {
  try {
    // Check if required elements exist to prevent null errors
    const subEl = document.getElementById('pushStatSubscribers');
    const permEl = document.getElementById('pushStatPermitted');
    const totalEl = document.getElementById('pushStatTotal');
    const todayEl = document.getElementById('pushStatToday');
    const succEl = document.getElementById('pushStatSuccess');
    const ctrEl = document.getElementById('pushStatCtr');
    const tbody = document.getElementById('pushHistoryTableBody');

    // 1. Fetch Subscriptions
    let subs = [];
    try {
      const subRes = await fetch('/api/subscriptions', {
        headers: { 'Authorization': 'Bearer ' + getAdminToken() }
      });
      if (subRes.ok) subs = await subRes.json();
    } catch (e) { console.warn("Subs fetch failed", e); }
    
    // 2. Fetch Notifications (History)
    let notifs = [];
    try {
      const notifRes = await fetch('/api/notifications', {
        headers: { 'Authorization': 'Bearer ' + getAdminToken() }
      });
      if (notifRes.ok) notifs = await notifRes.json();
    } catch (e) { console.warn("Notifs fetch failed", e); }

    // Safety check for arrays
    if (!Array.isArray(subs)) subs = [];
    if (!Array.isArray(notifs)) notifs = [];
    
    // 3. Process Stats
    const activeSubsCount = subs.filter(s => s && s.enabled === 1).length;
    if (subEl) subEl.textContent = activeSubsCount;
    if (permEl) permEl.textContent = activeSubsCount > 0 ? `${activeSubsCount}` : '0';
    
    const totalSent = notifs.filter(n => n && n.status === 'sent').length;
    if (totalEl) totalEl.textContent = totalSent;
    
    const today = new Date().toISOString().substring(0, 10);
    const todaySent = notifs.filter(n => n.status === 'sent' && n.sent_at && n.sent_at.substring(0, 10) === today).length;
    if (todayEl) todayEl.textContent = todaySent;
    
    let totalSuccessCount = 0;
    let totalFailedCount = 0;
    let totalClicks = 0;
    
    notifs.forEach(n => {
      totalSuccessCount += (n.success_count || 0);
      totalFailedCount += (n.failed_count || 0);
      totalClicks += (n.click_count || 0);
    });
    
    const totalDeliveries = totalSuccessCount + totalFailedCount;
    const successRate = totalDeliveries > 0 ? Math.round((totalSuccessCount / totalDeliveries) * 100) : 100;
    if (succEl) succEl.textContent = `${successRate}%`;
    
    const ctr = totalSuccessCount > 0 ? Math.round((totalClicks / totalSuccessCount) * 100) : 0;
    if (ctrEl) ctrEl.textContent = `${ctr}%`;
    
    // 4. Render History Table (If tbody exists)
    if (tbody) {
      tbody.innerHTML = '';
      if (notifs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;opacity:0.5;" data-i18n="push_no_history">Henüz gönderilmiş bildirim bulunmuyor.</td></tr>`;
      } else {
        notifs.forEach(n => {
          const date = n.sent_at ? new Date(n.sent_at).toLocaleString() : (n.scheduled_at ? 'Planlandı: ' + new Date(n.scheduled_at).toLocaleString() : new Date(n.created_at).toLocaleString());
          const rowCtr = n.success_count > 0 ? Math.round(((n.click_count || 0) / n.success_count) * 100) : 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${date}</td>
            <td style="font-weight:700;">${n.title}</td>
            <td>${n.body}</td>
            <td>${n.target === 'all' ? 'Tümü' : (n.target === 'permitted' ? 'İzinliler' : n.target)}</td>
            <td style="color:#4CAF50;">${n.success_count || 0}</td>
            <td style="color:#F44336;">${n.failed_count || 0}</td>
            <td>${rowCtr}%</td>
            <td><span class="push-badge-status ${n.status}">${n.status}</span></td>
            <td style="text-align:right;">
              <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button class="admin-btn secondary" style="margin:0;padding:4px 8px;font-size:0.75rem;" onclick="resendPush('${n.id}')">Tekrar Gönder</button>
                <button class="admin-btn secondary" style="margin:0;padding:4px 8px;font-size:0.75rem;background:rgba(244,67,54,0.1);color:#f44336;" onclick="deletePush('${n.id}')">Sil</button>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (e) {
    console.error('Failed to load push dashboard data:', e);
  }
}

async function resendPush(id) {
  try {
    const notifRes = await fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + getAdminToken() }
    });
    if (notifRes.ok) {
      const list = await notifRes.json();
      const notif = list.find(n => n.id === id);
      if (notif) {
        document.getElementById('pushTitle').value = notif.title;
        document.getElementById('pushBody').value = notif.body;
        document.getElementById('pushImage').value = notif.image || '';
        document.getElementById('pushIcon').value = notif.icon || '';
        document.getElementById('pushUrl').value = notif.url || '';
        document.getElementById('pushTarget').value = notif.target || 'all';
        document.getElementById('pushPriority').value = notif.priority || 'normal';
        document.getElementById('pushTtl').value = notif.ttl || 24;
        document.getElementById('pushTag').value = notif.tag || '';
        document.getElementById('pushCollapseKey').value = notif.collapse_key || '';
        updatePushPreview();
        showCustomAlert(window.currentLanguage === 'tr' ? 'Bildirim bilgileri forma yüklendi.' : 'Notification data loaded into form.');
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function deletePush(id) {
  const confirm = await showCustomConfirm(window.currentLanguage === 'tr' ? 'Bu bildirimi geçmişten silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this notification from history?');
  if (!confirm) return;
  
  try {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getAdminToken() }
    });
    if (res.ok) {
      loadPushDashboardData();
    } else {
      showCustomAlert(window.currentLanguage === 'tr' ? 'Silme işlemi başarısız.' : 'Delete failed.');
    }
  } catch (e) {
    console.error(e);
  }
}
