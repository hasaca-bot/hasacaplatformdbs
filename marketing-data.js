/* ==========================================================================
   HASACA — Marketing site content registry (Phase 23)
   UMD: usable from Node (server.js, for meta injection + route list) AND the
   browser (marketing.html renders pages from this same source of truth).
   Every string is [tr, en]. Add a page => it gets a route, nav slot and sitemap
   entry automatically. NEVER hardcode a marketing URL anywhere else.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MARKETING = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const x = (tr, en) => [tr, en];

  // ---- block helpers -------------------------------------------------------
  const hero = (tag, h, p, cta) => ({ t: 'hero', tag, h, p, cta: cta || [] });
  const cards = (h, p, items) => ({ t: 'cards', h, p, items });
  const prose = (h, items) => ({ t: 'prose', h, items });
  const steps = (h, items) => ({ t: 'steps', h, items });
  const faq = (h, items) => ({ t: 'faq', h, items });
  const stats = (items) => ({ t: 'stats', items });
  const table = (h, cols, rows) => ({ t: 'table', h, cols, rows });
  const cta = (h, p, links) => ({ t: 'cta', h, p, cta: links });
  const form = (kind, h, p) => ({ t: 'form', kind, h, p });
  const timeline = (h, items) => ({ t: 'timeline', h, items });
  const status = (h, items) => ({ t: 'status', h, items });
  const posts = (h, items) => ({ t: 'posts', h, items });
  const code = (h, items) => ({ t: 'code', h, items });

  const DEMO = { label: x('Ücretsiz Demo Talep Et', 'Request a Free Demo'), href: '/demo-talep', primary: true };
  const SALES = { label: x('Satış Ekibiyle Görüş', 'Talk to Sales'), href: '/satis-ekibi' };
  const PRICE = { label: x('Fiyatları Gör', 'See Pricing'), href: '/fiyatlandirma' };

  const pages = {};
  const def = (slug, title, desc, blocks) => { pages[slug] = { slug, title, desc, blocks }; };

  /* ---------- product page factory (13 product pages share this shape) ---- */
  function product(slug, name, tagline, intro, feats, faqs) {
    def(slug, name, tagline, [
      hero(x('Ürün', 'Product'), name, intro, [DEMO, PRICE]),
      cards(x('Öne çıkanlar', 'Highlights'), tagline, feats),
      faqs ? faq(x('Sık sorulanlar', 'FAQ'), faqs) : null,
      cta(x('Bu modülü canlı görün', 'See this module live'),
        x('Size özel bir demo hazırlayalım; kendi menünüzle deneyin.',
          'Let us prepare a tailored demo — try it with your own menu.'), [DEMO, SALES])
    ].filter(Boolean));
  }

  /* ---------- legal page factory ----------------------------------------- */
  function legal(slug, name, desc, sections) {
    def(slug, name, desc, [
      hero(x('Yasal', 'Legal'), name, desc, []),
      prose(null, sections),
      cta(x('Sorunuz mu var?', 'Questions?'),
        x('Hukuki ve uyumluluk sorularınız için ekibimize yazın.',
          'Write to our team for legal and compliance questions.'),
        [{ label: x('İletişime Geç', 'Contact Us'), href: '/iletisim', primary: true }])
    ]);
  }

  /* ======================= PLATFORM / PRODUCT PAGES ====================== */

  product('qr-menu',
    x('QR Menü', 'QR Menu'),
    x('Temassız, her zaman güncel dijital menü.', 'Contactless, always up-to-date digital menu.'),
    x('Masaya özel QR kodlarıyla misafirleriniz menüyü telefonundan görür, sipariş verir ve hesap ister. Baskı maliyeti ve güncelleme derdi biter.',
      'With per-table QR codes your guests browse the menu, order and request the bill from their phone. No printing costs, no update hassle.'),
    [
      [x('Masaya özel kod', 'Per-table code'), x('Her masanın kendi kalıcı QR kodu vardır; sipariş doğru masaya düşer.', 'Every table has its own permanent QR code, so orders land on the right table.')],
      [x('Anında güncelleme', 'Instant updates'), x('Fiyat veya ürün değişikliği menüye saniyeler içinde yansır.', 'Price or product changes appear on the menu within seconds.')],
      [x('Görsel menü', 'Visual menu'), x('Yüksek çözünürlüklü ürün görselleri, porsiyon ve içerik bilgisi.', 'High-resolution product photos, portion and ingredient details.')],
      [x('Çoklu dil', 'Multi-language'), x('Menüniz Türkçe ve İngilizce olarak otomatik sunulur.', 'Your menu is served automatically in Turkish and English.')],
      [x('Alerjen ve besin değeri', 'Allergens & nutrition'), x('Kalori ve besin değerlerini ürün bazında gösterin.', 'Show calories and nutrition values per product.')],
      [x('Uygulama gerektirmez', 'No app needed'), x('Misafir hiçbir uygulama indirmez; tarayıcıdan açılır.', 'Guests install nothing — it opens in the browser.')]
    ],
    [
      [x('QR kodları kim basıyor?', 'Who prints the QR codes?'), x('Kodları panelden üretip PDF olarak indirir, dilediğiniz matbaada bastırırsınız.', 'You generate the codes in the panel, download them as PDF and print them wherever you like.')],
      [x('İnternet kesilirse ne olur?', 'What if the internet drops?'), x('Misafir kendi mobil verisiyle menüyü açabilir; sipariş akışı bulut üzerindedir.', 'Guests can open the menu on their own mobile data; the order flow runs in the cloud.')]
    ]);

  product('online-siparis',
    x('Online Sipariş', 'Online Ordering'),
    x('Kendi sitenizden komisyonsuz sipariş alın.', 'Take commission-free orders on your own site.'),
    x('Paket servis ve gel-al siparişlerini kendi web sitenizden alın. Pazaryeri komisyonu ödemeden, müşteri verisi sizde kalarak.',
      'Take delivery and pickup orders on your own website — no marketplace commission, and the customer data stays yours.'),
    [
      [x('%0 komisyon', '0% commission'), x('Her siparişin tam tutarı sizde kalır.', 'The full amount of every order stays with you.')],
      [x('Sepet ve ödeme', 'Cart & checkout'), x('Hızlı sepet akışı, adres ve not alanlarıyla eksiksiz sipariş.', 'A fast cart flow with address and note fields for complete orders.')],
      [x('Sipariş durumu', 'Order status'), x('Müşteri siparişini canlı olarak takip eder.', 'Customers track their order live.')],
      [x('Teslimat bölgeleri', 'Delivery zones'), x('Bölge ve minimum sepet tutarı tanımlayın.', 'Define zones and minimum basket amounts.')],
      [x('Müşteri verisi sizin', 'You own the data'), x('Telefon, adres ve sipariş geçmişi tamamen sizin.', 'Phone, address and order history are entirely yours.')],
      [x('Kampanyalar', 'Campaigns'), x('Bildirim sistemiyle kampanyalarınızı anında duyurun.', 'Announce campaigns instantly with the notification system.')]
    ]);

  product('rezervasyon',
    x('Rezervasyon Sistemi', 'Reservation System'),
    x('Masa rezervasyonlarını otomatik yönetin.', 'Manage table reservations automatically.'),
    x('Telefon trafiğini azaltın. Misafirler siteden rezervasyon oluşturur, siz panelden onaylarsınız; çakışma olmaz.',
      'Cut phone traffic. Guests book from your site and you approve in the panel — no clashes.'),
    [
      [x('7/24 rezervasyon', '24/7 booking'), x('Restoran kapalıyken bile rezervasyon almaya devam edin.', 'Keep taking bookings even when the restaurant is closed.')],
      [x('Onay akışı', 'Approval flow'), x('Gelen talepleri tek tıkla onaylayın veya reddedin.', 'Approve or decline incoming requests with one click.')],
      [x('Kişi sayısı ve not', 'Party size & notes'), x('Kişi sayısı, tarih, saat ve özel notlar tek ekranda.', 'Party size, date, time and special notes on one screen.')],
      [x('Anlık bildirim', 'Instant alerts'), x('Yeni rezervasyon geldiğinde ekibiniz anında haberdar olur.', 'Your team is notified the moment a booking arrives.')]
    ]);

  product('garson-cagirma',
    x('Garson Çağırma', 'Waiter Call'),
    x('Tek dokunuşla servis talebi.', 'Service requests with one tap.'),
    x('Misafir masasından garson çağırır, talep anında servis ekranına düşer. El kaldırma devri biter.',
      'Guests call a waiter from the table and the request lands on the service screen instantly.'),
    [
      [x('Anında iletim', 'Instant delivery'), x('Talep saniyeler içinde ekibinize ulaşır.', 'The request reaches your team within seconds.')],
      [x('Masa bilgisi', 'Table context'), x('Hangi masadan çağrıldığı net görünür.', 'It is clear which table called.')],
      [x('Talep geçmişi', 'Request history'), x('Açık ve kapanmış talepleri takip edin.', 'Track open and resolved requests.')]
    ]);

  product('mutfak-ekrani',
    x('Mutfak Ekranı', 'Kitchen Display'),
    x('Siparişler doğrudan mutfağa.', 'Orders straight to the kitchen.'),
    x('Kağıt adisyon yerine canlı mutfak ekranı. Yeni, hazırlanıyor ve hazır kolonlarıyla mutfak her zaman senkron.',
      'A live kitchen display instead of paper tickets. New, preparing and ready columns keep the kitchen in sync.'),
    [
      [x('Canlı akış', 'Live feed'), x('Sipariş verildiği anda ekranda belirir.', 'Orders appear the moment they are placed.')],
      [x('Durum yönetimi', 'Status flow'), x('Hazırlanıyor / hazır durumlarını tek dokunuşla güncelleyin.', 'Update preparing / ready with one tap.')],
      [x('Hata payını azaltın', 'Fewer mistakes'), x('Okunmayan el yazısı ve kaybolan adisyon sorunu ortadan kalkar.', 'No more unreadable handwriting or lost tickets.')],
      [x('Servis koordinasyonu', 'Service coordination'), x('Salon ve mutfak aynı veriyi görür.', 'Floor and kitchen see the same data.')]
    ]);

  product('masa-yonetimi',
    x('Masa Yönetimi', 'Table Management'),
    x('Salonunuzun tamamı tek ekranda.', 'Your whole floor on one screen.'),
    x('Masaları tanımlayın, QR üretin, açık siparişleri ve masa durumlarını canlı izleyin.',
      'Define tables, generate QR codes and watch open orders and table status live.'),
    [
      [x('Sınırsız masa', 'Unlimited tables'), x('Dilediğiniz kadar masa ve bölge tanımlayın.', 'Define as many tables and zones as you need.')],
      [x('Kalıcı QR token', 'Permanent QR token'), x('Her masanın kodu sabittir; yeniden basmanız gerekmez.', 'Each table code is fixed — no reprinting needed.')],
      [x('Açık hesaplar', 'Open tabs'), x('Masadaki güncel tutarı anlık görün.', 'See the live amount on each table.')],
      [x('Salon görünümü', 'Floor view'), x('Dolu, boş ve bekleyen masaları tek bakışta ayırt edin.', 'Tell occupied, free and waiting tables apart at a glance.')]
    ]);

  product('paket-servis',
    x('Paket Servis', 'Delivery'),
    x('Kendi teslimat akışınız, kendi kurallarınız.', 'Your own delivery flow, your own rules.'),
    x('Paket servis siparişlerini kendi sitenizden alın; bölge, ücret ve minimum tutarı siz belirleyin.',
      'Take delivery orders on your own site and set zones, fees and minimums yourself.'),
    [
      [x('Bölge bazlı ücret', 'Zone-based fees'), x('Her bölge için farklı teslimat ücreti tanımlayın.', 'Define a different delivery fee per zone.')],
      [x('Minimum sepet', 'Minimum basket'), x('Kârlı olmayan siparişleri baştan engelleyin.', 'Prevent unprofitable orders up front.')],
      [x('Sipariş takibi', 'Order tracking'), x('Müşteri siparişinin durumunu canlı izler.', 'Customers watch their order status live.')],
      [x('Kurye notları', 'Courier notes'), x('Adres tarifi ve özel notlar siparişe iliştirilir.', 'Directions and special notes are attached to the order.')]
    ]);

  product('analitik',
    x('Analitik', 'Analytics'),
    x('Kararlarınızı veriye dayandırın.', 'Base your decisions on data.'),
    x('Satış, sipariş sayısı, ortalama sepet ve en çok satan ürünler tek panelde. Hangi ürünün ne zaman sattığını net görün.',
      'Revenue, order count, average basket and best sellers in one panel. See exactly what sells and when.'),
    [
      [x('Satış takibi', 'Sales tracking'), x('Günlük, haftalık ve aylık satış grafikleri.', 'Daily, weekly and monthly sales charts.')],
      [x('En çok satanlar', 'Best sellers'), x('Menünüzün lokomotif ürünlerini keşfedin.', 'Discover the drivers of your menu.')],
      [x('Ortalama sepet', 'Average basket'), x('Sepet tutarını artıracak fırsatları görün.', 'Spot opportunities to increase basket size.')],
      [x('Sipariş tipi kırılımı', 'Order type split'), x('Masa, paket ve gel-al dağılımını izleyin.', 'Track the dine-in, delivery and pickup split.')]
    ]);

  product('coklu-sube',
    x('Çoklu Şube', 'Multi Branch'),
    x('Zincirinizi tek merkezden yönetin.', 'Run your chain from one place.'),
    x('Her şube kendi menüsü, fiyatı ve ekibiyle çalışır; siz merkezden tümünü görürsünüz.',
      'Each branch runs with its own menu, prices and team while you oversee everything centrally.'),
    [
      [x('Şubeye özel menü', 'Per-branch menu'), x('Her şube kendi ürün ve fiyatlarını yönetir.', 'Every branch manages its own products and prices.')],
      [x('Merkezî görünüm', 'Central overview'), x('Tüm şubelerin performansını karşılaştırın.', 'Compare performance across all branches.')],
      [x('Ayrı yetkilendirme', 'Separate permissions'), x('Şube müdürleri yalnızca kendi verisini görür.', 'Branch managers only see their own data.')],
      [x('Tek marka', 'One brand'), x('Tüm şubeler aynı marka kimliğiyle yayında.', 'All branches live under the same brand identity.')]
    ]);

  product('tema-sistemi',
    x('Tema Sistemi', 'Theme Engine'),
    x('Markanıza uyan görünüm.', 'A look that matches your brand.'),
    x('Renk ve stil temalarıyla sitenizi markanıza uydurun. Kod yazmadan, tek tıkla.',
      'Match your site to your brand with color and style themes — one click, no code.'),
    [
      [x('Hazır temalar', 'Ready themes'), x('Sıcak, açık ve siyah-beyaz temalar arasında seçim yapın.', 'Choose between warm, light and black & white themes.')],
      [x('Anında önizleme', 'Instant preview'), x('Değişiklik anında sitenize yansır.', 'Changes reflect on your site immediately.')],
      [x('Logo ve renk', 'Logo & color'), x('Logonuz ve renkleriniz her sayfada tutarlı görünür.', 'Your logo and colors stay consistent on every page.')]
    ]);

  product('white-label',
    x('White Label', 'White Label'),
    x('HASACA görünmez; her yer sizin markanız.', 'HASACA stays invisible — every surface is your brand.'),
    x('Müşterileriniz yalnızca sizin markanızı görür. Kendi alan adınızda, kendi logonuzla, kendi renklerinizle.',
      'Your customers only ever see your brand — on your domain, with your logo and your colors.'),
    [
      [x('Kendi alan adınız', 'Your own domain'), x('restoraniniz.com üzerinden yayına geçin.', 'Go live on yourrestaurant.com.')],
      [x('Marka kimliği', 'Brand identity'), x('Logo, favicon ve marka adı her ekranda sizin.', 'Logo, favicon and brand name are yours on every screen.')],
      [x('Platform gizli', 'Platform hidden'), x('Hiçbir yerde üçüncü taraf markası görünmez.', 'No third-party branding appears anywhere.')],
      [x('E-posta ve QR', 'Email & QR'), x('QR kodlar ve bildirimler de sizin markanızı taşır.', 'QR codes and notifications carry your brand too.')]
    ]);

  product('seo',
    x('SEO', 'SEO'),
    x('Arama motorlarında bulunun.', 'Get found on search engines.'),
    x('Restoranınız Google\'da görünür olsun. Başlık, açıklama, sosyal paylaşım görseli ve yapısal veri otomatik yönetilir.',
      'Make your restaurant visible on Google. Titles, descriptions, social images and structured data are handled automatically.'),
    [
      [x('Meta yönetimi', 'Meta management'), x('Başlık ve açıklamayı panelden düzenleyin.', 'Edit title and description from the panel.')],
      [x('Sosyal paylaşım', 'Social sharing'), x('WhatsApp ve Instagram paylaşımlarında şık önizleme.', 'A polished preview when shared on WhatsApp and Instagram.')],
      [x('Otomatik sitemap', 'Automatic sitemap'), x('robots.txt ve sitemap.xml alan adınıza göre üretilir.', 'robots.txt and sitemap.xml are generated for your domain.')],
      [x('Yapısal veri', 'Structured data'), x('Restoran şeması ile arama sonuçlarında zengin görünüm.', 'Restaurant schema for rich results in search.')]
    ]);

  product('bildirim-sistemi',
    x('Bildirim Sistemi', 'Notification System'),
    x('Müşterinize doğrudan ulaşın.', 'Reach your customers directly.'),
    x('Kampanya ve sipariş bildirimlerini anında gönderin. Aracı yok, komisyon yok, doğrudan temas.',
      'Send campaign and order alerts instantly — no intermediary, no commission, direct contact.'),
    [
      [x('Anlık push', 'Instant push'), x('Bildirimler saniyeler içinde ulaşır.', 'Notifications arrive within seconds.')],
      [x('Kampanya duyurusu', 'Campaign blasts'), x('Yeni ürün ve indirimleri tek ekrandan duyurun.', 'Announce new products and discounts from one screen.')],
      [x('Sipariş bilgilendirmesi', 'Order updates'), x('Sipariş durumu değiştikçe müşteri haberdar olur.', 'Customers are informed as order status changes.')],
      [x('Kendi abone listeniz', 'Your own list'), x('Aboneleriniz yalnızca size aittir.', 'Your subscribers belong only to you.')]
    ]);

  product('yapay-zeka',
    x('Yapay Zekâ', 'Artificial Intelligence'),
    x('Menüyü saniyeler içinde kurun.', 'Build your menu in seconds.'),
    x('Yapay zekâ asistanı menünüzü oluşturur, ürün açıklamalarını yazar ve satış öngörüleri sunar.',
      'The AI assistant builds your menu, writes product descriptions and surfaces sales insights.'),
    [
      [x('Menü üretimi', 'Menu generation'), x('Mutfak tarzınızı söyleyin, taslak menü hazır olsun.', 'Describe your cuisine and get a draft menu.')],
      [x('Ürün açıklamaları', 'Product copy'), x('İştah açan açıklamalar otomatik yazılır.', 'Appetising descriptions are written automatically.')],
      [x('Satış öngörüsü', 'Sales forecast'), x('Geçmiş veriye dayalı talep tahmini.', 'Demand forecasts based on historical data.')],
      [x('Çoklu dil çeviri', 'Multi-language translation'), x('Menünüz otomatik olarak İngilizceye çevrilir.', 'Your menu is translated into English automatically.')]
    ]);

  /* ============================ CORE PAGES ============================== */

  def('ozellikler', x('Özellikler', 'Features'),
    x('HASACA platformunun tüm modülleri tek sayfada.', 'Every module of the HASACA platform on one page.'), [
    hero(x('Özellikler', 'Features'), x('Restoranınızın ihtiyacı olan her şey', 'Everything your restaurant needs'),
      x('Sipariş almaktan mutfak yönetimine, rezervasyondan analitiğe kadar tüm operasyonunuz tek platformda.',
        'From taking orders to kitchen management, reservations to analytics — your whole operation on one platform.'),
      [DEMO, PRICE]),
    cards(x('Modüller', 'Modules'), null, [
      [x('QR Menü', 'QR Menu'), x('Masaya özel QR ile temassız sipariş.', 'Contactless ordering with per-table QR.'), '/qr-menu'],
      [x('Online Sipariş', 'Online Ordering'), x('Paket ve gel-al siparişleri komisyonsuz.', 'Delivery and pickup, commission-free.'), '/online-siparis'],
      [x('Rezervasyon', 'Reservations'), x('Masa rezervasyonlarını otomatik yönetin.', 'Manage bookings automatically.'), '/rezervasyon'],
      [x('Mutfak Ekranı', 'Kitchen Display'), x('Siparişler doğrudan mutfağa düşer.', 'Orders land straight in the kitchen.'), '/mutfak-ekrani'],
      [x('Masa Yönetimi', 'Table Management'), x('Salonunuzun tamamı tek ekranda.', 'Your whole floor on one screen.'), '/masa-yonetimi'],
      [x('Garson Çağırma', 'Waiter Call'), x('Tek dokunuşla servis talebi.', 'Service requests with one tap.'), '/garson-cagirma'],
      [x('Paket Servis', 'Delivery'), x('Kendi teslimat akışınız, kendi kurallarınız.', 'Your own delivery flow.'), '/paket-servis'],
      [x('Analitik', 'Analytics'), x('Satış ve ürün performansı tek panelde.', 'Sales and product performance in one panel.'), '/analitik'],
      [x('Yapay Zekâ', 'AI'), x('Menü üretimi ve satış öngörüleri.', 'Menu generation and sales insights.'), '/yapay-zeka'],
      [x('Çoklu Şube', 'Multi Branch'), x('Zincirinizi tek merkezden yönetin.', 'Run your chain centrally.'), '/coklu-sube'],
      [x('White Label', 'White Label'), x('Her yer sizin markanız.', 'Every surface is your brand.'), '/white-label'],
      [x('SEO', 'SEO'), x('Arama motorlarında bulunun.', 'Get found on search.'), '/seo'],
      [x('Tema Sistemi', 'Theme Engine'), x('Markanıza uyan görünüm.', 'A look that matches your brand.'), '/tema-sistemi'],
      [x('Bildirim Sistemi', 'Notifications'), x('Müşterinize doğrudan ulaşın.', 'Reach customers directly.'), '/bildirim-sistemi'],
      [x('Entegrasyonlar', 'Integrations'), x('Kullandığınız araçlarla birlikte çalışır.', 'Works with the tools you use.'), '/entegrasyonlar'],
      [x('Rol Yönetimi', 'Role Management'), x('Ekibinize yetki tabanlı erişim.', 'Permission-based access for your team.'), '/guvenlik']
    ]),
    cta(x('Hepsini canlı görün', 'See it all live'), x('15 dakikalık bir demoda tüm modülleri gösterelim.', 'Let us walk you through every module in a 15-minute demo.'), [DEMO, SALES])
  ]);

  def('cozumler', x('Çözümler', 'Solutions'),
    x('İşletme tipinize göre HASACA çözümleri.', 'HASACA solutions by business type.'), [
    hero(x('Çözümler', 'Solutions'), x('Her işletme tipine uygun', 'Built for every kind of venue'),
      x('Tek şubeli bir kafeden çok şubeli zincire kadar, ihtiyacınıza göre ölçeklenen bir platform.',
        'A platform that scales from a single café to a multi-branch chain.'), [DEMO, SALES]),
    cards(x('İşletme tipleri', 'Venue types'), null, [
      [x('Kafe & Pastane', 'Café & Bakery'), x('Hızlı servis, QR menü ve gel-al siparişi.', 'Fast service, QR menu and pickup orders.')],
      [x('Restoran', 'Restaurant'), x('Masa yönetimi, rezervasyon ve mutfak ekranı.', 'Table management, reservations and kitchen display.')],
      [x('Fine Dining', 'Fine Dining'), x('Rezervasyon odaklı akış ve premium marka deneyimi.', 'Reservation-first flow and a premium brand experience.')],
      [x('Fast Food', 'Fast Food'), x('Yoğun saatlerde hızlı sipariş ve paket servis.', 'Rapid ordering and delivery at peak hours.')],
      [x('Zincir & Franchise', 'Chains & Franchise'), x('Çoklu şube yönetimi ve merkezî raporlama.', 'Multi-branch management and central reporting.')],
      [x('Otel & Tesis', 'Hotels & Venues'), x('Birden fazla nokta, tek marka ve tek panel.', 'Multiple outlets, one brand, one panel.')]
    ]),
    cta(x('Size uygun kurulumu konuşalım', 'Let us plan your setup'), x('İşletmenizi anlatın, doğru paketi birlikte belirleyelim.', 'Tell us about your venue and we will find the right fit.'), [SALES, DEMO])
  ]);

  def('fiyatlandirma', x('Fiyatlandırma', 'Pricing'),
    x('Şeffaf, komisyonsuz fiyatlandırma. 14 gün ücretsiz deneme.', 'Transparent, commission-free pricing. 14-day free trial.'), [
    hero(x('Fiyatlandırma', 'Pricing'), x('Komisyon yok, sürpriz yok', 'No commission, no surprises'),
      x('Sabit aylık ücret ödersiniz, satışınızdan pay almayız. Tüm planlar 14 gün ücretsiz denemeyle başlar.',
        'You pay a fixed monthly fee and we never take a cut of your sales. All plans start with a 14-day free trial.'), []),
    { t: 'plans' },
    table(x('Plan karşılaştırması', 'Plan comparison'),
      [x('Özellik', 'Feature'), x('Başlangıç', 'Starter'), x('Profesyonel', 'Professional'), x('Kurumsal', 'Enterprise')], [
      [x('Komisyon', 'Commission'), '%0', '%0', '%0'],
      [x('QR Menü', 'QR Menu'), 'yes', 'yes', 'yes'],
      [x('Online sipariş', 'Online ordering'), 'no', 'yes', 'yes'],
      [x('Rezervasyon', 'Reservations'), 'no', 'yes', 'yes'],
      [x('Analitik', 'Analytics'), x('Temel', 'Basic'), x('Gelişmiş', 'Advanced'), x('Gelişmiş', 'Advanced')],
      [x('Özel alan adı', 'Custom domain'), 'no', 'yes', 'yes'],
      [x('White label', 'White label'), 'no', x('Kısmi', 'Partial'), 'yes'],
      [x('Yapay zekâ', 'AI'), 'no', 'no', 'yes'],
      [x('Çoklu şube', 'Multi branch'), 'no', 'no', 'yes'],
      [x('Destek', 'Support'), x('E-posta', 'Email'), x('Öncelikli', 'Priority'), x('Özel danışman', 'Dedicated manager')]
    ]),
    faq(x('Fiyatlandırma hakkında', 'About pricing'), [
      [x('Gerçekten komisyon yok mu?', 'Really no commission?'), x('Evet. Siparişlerinizden hiçbir pay almıyoruz; yalnızca sabit plan ücreti ödersiniz.', 'Yes. We take no share of your orders — you only pay the fixed plan fee.')],
      [x('Kurulum ücreti var mı?', 'Is there a setup fee?'), x('Hayır. Kurulum ve veri aktarımı ücretsizdir.', 'No. Setup and data migration are free.')],
      [x('İstediğim zaman iptal edebilir miyim?', 'Can I cancel anytime?'), x('Evet, taahhüt yoktur.', 'Yes, there is no commitment.')],
      [x('Yıllık ödemede indirim var mı?', 'Any discount for annual billing?'), x('Yıllık ödemede iki ay hediye edilir.', 'Annual billing includes two months free.')]
    ]),
    cta(x('Hangi plan size uygun?', 'Which plan fits you?'), x('Satış ekibimiz işletmenize göre doğru planı önersin.', 'Let our sales team recommend the right plan for your venue.'), [SALES, DEMO])
  ]);

  def('neden-hasaca', x('Neden HASACA?', 'Why HASACA?'),
    x('Pazaryeri uygulamaları yerine kendi platformunuz.', 'Your own platform instead of marketplace apps.'), [
    hero(x('Neden HASACA?', 'Why HASACA?'), x('Markanız size ait olsun', 'Own your brand'),
      x('Pazaryerleri her siparişten %15-20 komisyon alır ve müşteri verisini kendinde tutar. HASACA ile ikisi de sizde kalır.',
        'Marketplaces take 15-20% of every order and keep the customer data. With HASACA, both stay yours.'), [DEMO, PRICE]),
    table(x('HASACA vs Pazaryeri', 'HASACA vs Marketplace'), [x('', ''), 'HASACA', x('Pazaryeri', 'Marketplace')], [
      [x('Komisyon', 'Commission'), '%0', '%15 - %20'],
      [x('Marka sahipliği', 'Brand ownership'), 'yes', 'no'],
      [x('Müşteri verisi', 'Customer data'), 'yes', 'no'],
      [x('Kendi web siteniz', 'Your own website'), 'yes', 'no'],
      [x('Rezervasyon', 'Reservations'), 'yes', 'no'],
      [x('Yapay zekâ', 'AI'), 'yes', 'no'],
      [x('Analitik', 'Analytics'), 'yes', x('Kısıtlı', 'Limited')],
      [x('SEO', 'SEO'), 'yes', 'no'],
      [x('Fiyat kontrolü', 'Price control'), 'yes', 'no'],
      [x('Özgürlük', 'Freedom'), 'yes', 'no']
    ]),
    stats([[x('%0', '0%'), x('Komisyon', 'Commission')], [x('5 dk', '5 min'), x('Kurulum', 'Setup')], [x('%100', '100%'), x('Veri sahipliği', 'Data ownership')], [x('7/24', '24/7'), x('Destek', 'Support')]]),
    cta(x('Hesabınızı yapın', 'Do the math'), x('Aylık satışınızı söyleyin, komisyonda ne kadar tasarruf edeceğinizi hesaplayalım.', 'Tell us your monthly sales and we will calculate your commission savings.'), [SALES, DEMO])
  ]);

  def('karsilastirma', x('Özellik Karşılaştırma', 'Feature Comparison'),
    x('Planlar arasındaki farkları detaylı karşılaştırın.', 'Compare the differences between plans in detail.'), [
    hero(x('Karşılaştırma', 'Comparison'), x('Planları yan yana görün', 'See the plans side by side'),
      x('Hangi özelliğin hangi planda olduğunu net görün; gerekirse plan yükseltmesi her zaman mümkün.',
        'See exactly which feature is in which plan — you can always upgrade later.'), [PRICE]),
    table(x('Tüm özellikler', 'All features'),
      [x('Özellik', 'Feature'), x('Başlangıç', 'Starter'), x('Profesyonel', 'Professional'), x('Kurumsal', 'Enterprise')], [
      [x('QR menü', 'QR menu'), 'yes', 'yes', 'yes'],
      [x('Sınırsız ürün', 'Unlimited products'), 'yes', 'yes', 'yes'],
      [x('Masa yönetimi', 'Table management'), x('1 masa', '1 table'), x('Sınırsız', 'Unlimited'), x('Sınırsız', 'Unlimited')],
      [x('Online sipariş', 'Online ordering'), 'no', 'yes', 'yes'],
      [x('Paket servis', 'Delivery'), 'no', 'yes', 'yes'],
      [x('Rezervasyon', 'Reservations'), 'no', 'yes', 'yes'],
      [x('Mutfak ekranı', 'Kitchen display'), 'no', 'yes', 'yes'],
      [x('Garson çağırma', 'Waiter call'), 'no', 'yes', 'yes'],
      [x('Analitik', 'Analytics'), x('Temel', 'Basic'), x('Gelişmiş', 'Advanced'), x('Gelişmiş', 'Advanced')],
      [x('Bildirim sistemi', 'Notifications'), 'no', 'yes', 'yes'],
      [x('Özel alan adı', 'Custom domain'), 'no', 'yes', 'yes'],
      [x('SEO yönetimi', 'SEO management'), 'no', 'yes', 'yes'],
      [x('White label', 'White label'), 'no', x('Kısmi', 'Partial'), 'yes'],
      [x('Yapay zekâ', 'AI assistant'), 'no', 'no', 'yes'],
      [x('Çoklu şube', 'Multi branch'), 'no', 'no', 'yes'],
      [x('Rol yönetimi', 'Role management'), 'no', x('Temel', 'Basic'), 'yes'],
      [x('API erişimi', 'API access'), 'no', 'no', 'yes'],
      [x('SLA garantisi', 'SLA guarantee'), 'no', 'no', 'yes'],
      [x('Özel danışman', 'Dedicated manager'), 'no', 'no', 'yes']
    ]),
    cta(x('Emin değil misiniz?', 'Not sure?'), x('Size uygun planı birlikte belirleyelim.', 'Let us find the right plan together.'), [SALES, DEMO])
  ]);

  def('entegrasyonlar', x('Entegrasyonlar', 'Integrations'),
    x('HASACA kullandığınız araçlarla birlikte çalışır.', 'HASACA works with the tools you already use.'), [
    hero(x('Entegrasyonlar', 'Integrations'), x('Mevcut düzeninizi bozmayın', 'Keep your existing setup'),
      x('Ödeme, muhasebe, kurye ve pazarlama araçlarınızla birlikte çalışacak şekilde tasarlandı.',
        'Designed to work alongside your payment, accounting, courier and marketing tools.'), [SALES]),
    cards(x('Kategoriler', 'Categories'), null, [
      [x('Ödeme', 'Payments'), x('Online ödeme sağlayıcılarıyla uyumlu altyapı.', 'Infrastructure compatible with online payment providers.')],
      [x('Muhasebe', 'Accounting'), x('Sipariş ve satış verinizi dışa aktarın.', 'Export your order and sales data.')],
      [x('Kurye', 'Courier'), x('Teslimat akışınızı kendi kuryenizle yürütün.', 'Run delivery with your own couriers.')],
      [x('Pazarlama', 'Marketing'), x('Bildirim ve kampanya araçlarıyla entegre çalışın.', 'Work with notification and campaign tools.')],
      [x('Analitik', 'Analytics'), x('Verinizi kendi raporlama araçlarınıza taşıyın.', 'Move your data into your own reporting tools.')],
      [x('API', 'API'), x('Kurumsal planda REST API erişimi.', 'REST API access on the Enterprise plan.'), '/api-docs']
    ]),
    cta(x('Aradığınız entegrasyon yok mu?', 'Missing an integration?'), x('İhtiyacınızı iletin, yol haritamıza alalım.', 'Tell us what you need and we will add it to the roadmap.'), [{ label: x('Talep Gönder', 'Send a Request'), href: '/iletisim', primary: true }, { label: x('Yol Haritası', 'Roadmap'), href: '/yol-haritasi' }])
  ]);

  /* ========================== COMPANY / PROOF =========================== */

  def('hakkimizda', x('Hakkımızda', 'About Us'),
    x('HASACA\'nın kuruluş hikâyesi ve misyonu.', 'The story and mission behind HASACA.'), [
    hero(x('Hakkımızda', 'About Us'), x('Restoranların yanındayız', 'We stand with restaurants'),
      x('HASACA, restoran sahiplerinin komisyon baskısı altında ezilmeden dijitalleşebilmesi için kuruldu.',
        'HASACA was founded so restaurant owners could go digital without being crushed by commissions.'), []),
    prose(null, [
      [x('Misyonumuz', 'Our mission'), x('Her restoranın kendi dijital kanalına sahip olmasını sağlamak. Müşterinize ulaşmak için aracıya ihtiyacınız olmamalı.', 'To give every restaurant its own digital channel. You should not need a middleman to reach your own customers.')],
      [x('Neden kurulduk', 'Why we exist'), x('Pazaryerleri restoranlara görünürlük sunarken karşılığında komisyon, müşteri verisi ve marka kontrolü aldı. Biz bu dengeyi restoran lehine çevirmek istedik.', 'Marketplaces offered visibility but took commission, customer data and brand control in return. We wanted to tip that balance back toward the restaurant.')],
      [x('Nasıl çalışıyoruz', 'How we work'), x('Ürünümüzü restoran sahipleriyle birlikte geliştiriyoruz. Her özellik gerçek bir mutfakta, gerçek bir serviste test edilir.', 'We build alongside restaurant owners. Every feature is tested in a real kitchen during a real service.')],
      [x('Değerlerimiz', 'Our values'), x('Şeffaf fiyatlandırma, veri sahipliği, sade tasarım ve gerçek insan desteği.', 'Transparent pricing, data ownership, clean design and real human support.')]
    ]),
    stats([[x('500+', '500+'), x('Restoran', 'Restaurants')], [x('150K+', '150K+'), x('Sipariş', 'Orders')], [x('12+', '12+'), x('Ülke', 'Countries')], [x('%99.9', '99.9%'), x('Çalışma süresi', 'Uptime')]]),
    cta(x('Ekibimizle tanışın', 'Meet the team'), x('Sorularınız için kapımız her zaman açık.', 'Our door is always open for your questions.'), [{ label: x('İletişime Geç', 'Contact Us'), href: '/iletisim', primary: true }, { label: x('Kariyer', 'Careers'), href: '/kariyer' }])
  ]);

  def('kariyer', x('Kariyer', 'Careers'),
    x('HASACA ekibine katılın; açık pozisyonlarımıza göz atın.', 'Join the HASACA team — browse our open roles.'), [
    hero(x('Kariyer', 'Careers'), x('Birlikte inşa edelim', 'Let us build together'),
      x('Restoran sektörünü dönüştüren bir ürünü, küçük ve etkili bir ekiple geliştiriyoruz.',
        'We build a product that transforms the restaurant industry with a small, high-impact team.'), []),
    cards(x('Neden HASACA\'da çalışmalı?', 'Why work at HASACA?'), null, [
      [x('Gerçek etki', 'Real impact'), x('Yazdığınız kod binlerce restoranın günlük operasyonunu etkiler.', 'The code you write affects the daily operations of thousands of restaurants.')],
      [x('Uzaktan çalışma', 'Remote-friendly'), x('Nerede verimliyseniz orada çalışın.', 'Work wherever you are most productive.')],
      [x('Öğrenme bütçesi', 'Learning budget'), x('Kitap, kurs ve konferanslar için yıllık bütçe.', 'An annual budget for books, courses and conferences.')],
      [x('Sade süreçler', 'Lean process'), x('Az toplantı, çok üretim.', 'Fewer meetings, more building.')]
    ]),
    posts(x('Açık pozisyonlar', 'Open roles'), [
      [x('Kıdemli Frontend Geliştirici', 'Senior Frontend Engineer'), x('Uzaktan · Tam zamanlı', 'Remote · Full-time'), x('Panel ve müşteri arayüzlerini geliştirecek, tasarım sistemimizi büyütecek birini arıyoruz.', 'We are looking for someone to build our panels and customer interfaces and grow our design system.')],
      [x('Backend Geliştirici', 'Backend Engineer'), x('Uzaktan · Tam zamanlı', 'Remote · Full-time'), x('Çok kiracılı altyapımızı ölçeklendirecek, API tasarımına katkı verecek bir geliştirici.', 'An engineer to scale our multi-tenant infrastructure and shape our API design.')],
      [x('Müşteri Başarı Uzmanı', 'Customer Success Specialist'), x('İstanbul · Tam zamanlı', 'Istanbul · Full-time'), x('Restoran sahiplerinin kurulumdan itibaren yanında olacak bir ekip arkadaşı.', 'A teammate who supports restaurant owners from setup onward.')],
      [x('Satış Uzmanı', 'Sales Specialist'), x('İstanbul · Tam zamanlı', 'Istanbul · Full-time'), x('Restoranlarla ilk teması kuracak, ihtiyaç analizini yapacak bir satış profesyoneli.', 'A sales professional to make first contact with restaurants and map their needs.')]
    ]),
    cta(x('Aradığınız pozisyon yok mu?', 'Do not see your role?'), x('Yine de yazın; doğru kişi için pozisyon açarız.', 'Write to us anyway — we open roles for the right person.'), [{ label: x('Başvuru Gönder', 'Send an Application'), href: '/iletisim', primary: true }])
  ]);

  def('referanslar', x('Referanslar', 'Testimonials'),
    x('HASACA kullanan restoranlar ne diyor?', 'What restaurants using HASACA say.'), [
    hero(x('Referanslar', 'Testimonials'), x('Restoran sahipleri anlatıyor', 'In their own words'),
      x('Farklı ölçeklerde yüzlerce işletme HASACA ile kendi dijital kanalını kurdu.',
        'Hundreds of venues of all sizes have built their own digital channel with HASACA.'), []),
    posts(x('Müşteri yorumları', 'Customer reviews'), [
      [x('Mert Aydın · Bistro Co', 'Mert Aydın · Bistro Co'), x('★★★★★', '★★★★★'), x('Pazaryeri komisyonlarından kurtulduk. Artık her siparişin tam kârı bizde ve müşteri verisi elimizde.', 'We got rid of marketplace commissions. Now the full profit of every order is ours and we own the customer data.')],
      [x('Selin Kaya · UrbanEats', 'Selin Kaya · UrbanEats'), x('★★★★★', '★★★★★'), x('QR menüye geçtikten sonra masa devir hızımız arttı, personel yükü azaldı. Kurulum inanılmaz kolaydı.', 'After moving to the QR menu our table turnover rose and staff load dropped. Setup was incredibly easy.')],
      [x('Burak Demir · Kahve Lab', 'Burak Demir · Kahve Lab'), x('★★★★★', '★★★★★'), x('Kendi alan adımızda, kendi markamızla profesyonel bir site. AI menü oluşturma bize saatler kazandırdı.', 'A professional site on our own domain, our own brand. AI menu building saved us hours.')],
      [x('Ayşe Yıldız · Anadolu Sofra', 'Ayşe Yıldız · Anadolu Sofra'), x('★★★★★', '★★★★★'), x('Rezervasyon ve analitik tek yerde. Artık hangi ürünün ne zaman sattığını net görüyoruz.', 'Reservations and analytics in one place. Now we clearly see what sells and when.')],
      [x('Kaan Öztürk · Deniz Balık', 'Kaan Öztürk · Deniz Balık'), x('★★★★★', '★★★★★'), x('Rezervasyon yoğunluğumuz iki katına çıktı, telefon trafiği yarı yarıya azaldı.', 'Our booking volume doubled while phone traffic halved.')],
      [x('Elif Şahin · NoradaGrill', 'Elif Şahin · NoradaGrill'), x('★★★★★', '★★★★★'), x('Mutfak ekranı sayesinde sipariş hataları neredeyse sıfırlandı.', 'Thanks to the kitchen display, order mistakes dropped to almost zero.')]
    ]),
    cta(x('Siz de aramıza katılın', 'Join them'), x('Kendi başarı hikâyenizi yazmaya bugün başlayın.', 'Start writing your own success story today.'), [DEMO, { label: x('Başarı Hikâyeleri', 'Success Stories'), href: '/basari-hikayeleri' }])
  ]);

  def('basari-hikayeleri', x('Başarı Hikayeleri', 'Success Stories'),
    x('Rakamlarla müşteri başarı hikâyeleri.', 'Customer success stories, in numbers.'), [
    hero(x('Başarı Hikâyeleri', 'Success Stories'), x('Ölçülebilir sonuçlar', 'Measurable results'),
      x('HASACA\'ya geçen işletmelerin ilk altı ayda elde ettiği somut kazanımlar.',
        'Concrete gains venues achieved in their first six months on HASACA.'), []),
    posts(x('Vaka çalışmaları', 'Case studies'), [
      [x('Bistro Co', 'Bistro Co'), x('Komisyon tasarrufu: aylık ₺42.000', 'Commission saved: ₺42,000/month'), x('Pazaryeri siparişlerinin %70\'ini kendi sitesine taşıdı; komisyon gideri neredeyse tamamen ortadan kalktı.', 'Moved 70% of marketplace orders to its own site, almost entirely eliminating commission costs.')],
      [x('Kahve Lab', 'Kahve Lab'), x('Masa devir hızı: +%35', 'Table turnover: +35%'), x('QR menü ve masadan sipariş ile servis süresi kısaldı, aynı salonla daha çok misafir ağırlandı.', 'QR ordering shortened service time, serving more guests in the same room.')],
      [x('Deniz Balık', 'Deniz Balık'), x('Rezervasyon: 2 katı', 'Reservations: 2x'), x('7/24 online rezervasyon sayesinde kapalı saatlerde de talep toplanmaya başladı.', 'Round-the-clock online booking started capturing demand outside opening hours.')],
      [x('Anadolu Sofra', 'Anadolu Sofra'), x('Ortalama sepet: +%18', 'Average basket: +18%'), x('Analitik verisiyle menü düzenlendi, yüksek kârlı ürünler öne çıkarıldı.', 'The menu was reworked using analytics, promoting high-margin items.')]
    ]),
    cta(x('Sizin rakamlarınız ne olur?', 'What would your numbers be?'), x('Mevcut satışınıza göre tahmini kazancınızı hesaplayalım.', 'Let us estimate your gains based on your current sales.'), [SALES, DEMO])
  ]);

  def('partner-programi', x('Partner Programı', 'Partner Program'),
    x('Ajanslar ve teknoloji iş ortakları için HASACA partner programı.', 'The HASACA partner program for agencies and technology partners.'), [
    hero(x('Partner Programı', 'Partner Program'), x('Birlikte büyüyelim', 'Let us grow together'),
      x('Restoran müşterilerinize HASACA\'yı sunun, gelir paylaşımından yararlanın.',
        'Offer HASACA to your restaurant clients and share in the revenue.'), [{ label: x('Partner Ol', 'Become a Partner'), href: '/iletisim', primary: true }]),
    cards(x('Partner tipleri', 'Partner types'), null, [
      [x('Dijital ajanslar', 'Digital agencies'), x('Restoran müşterilerinize hazır bir dijital platform sunun.', 'Offer your restaurant clients a ready-made digital platform.')],
      [x('Danışmanlar', 'Consultants'), x('Operasyon danışmanlığınıza teknoloji katmanı ekleyin.', 'Add a technology layer to your operations consulting.')],
      [x('Teknoloji ortakları', 'Technology partners'), x('Ürününüzü HASACA ile entegre edin.', 'Integrate your product with HASACA.')],
      [x('Ekipman sağlayıcılar', 'Equipment vendors'), x('POS ve donanım çözümlerinizle birlikte sunun.', 'Bundle it with your POS and hardware solutions.')]
    ]),
    steps(x('Nasıl başlanır?', 'How to start'), [
      [x('Başvurun', 'Apply'), x('Formu doldurun, ekibimiz sizinle iletişime geçsin.', 'Fill in the form and our team will reach out.')],
      [x('Eğitim alın', 'Get trained'), x('Ürün ve satış eğitimini ücretsiz tamamlayın.', 'Complete product and sales training for free.')],
      [x('Müşteri kazanın', 'Win customers'), x('Kendi portföyünüze HASACA\'yı ekleyin.', 'Add HASACA to your portfolio.')],
      [x('Gelir paylaşın', 'Share revenue'), x('Her aktif müşteri için düzenli gelir elde edin.', 'Earn recurring revenue for every active customer.')]
    ]),
    cta(x('Partner olmak ister misiniz?', 'Want to partner with us?'), x('Programın detaylarını konuşalım.', 'Let us walk you through the details.'), [{ label: x('Başvuru Gönder', 'Apply Now'), href: '/iletisim', primary: true }, { label: x('Bayilik Programı', 'Reseller Program'), href: '/bayilik' }])
  ]);

  def('bayilik', x('Bayilik Programı', 'Reseller Program'),
    x('Bölgenizde HASACA bayisi olun.', 'Become a HASACA reseller in your region.'), [
    hero(x('Bayilik', 'Reseller'), x('Bölgenizin HASACA temsilcisi olun', 'Represent HASACA in your region'),
      x('Kendi bölgenizde restoranlara HASACA\'yı satın, kurun ve destekleyin; düzenli gelir elde edin.',
        'Sell, install and support HASACA for restaurants in your region and build recurring revenue.'), [{ label: x('Bayilik Başvurusu', 'Apply as Reseller'), href: '/iletisim', primary: true }]),
    cards(x('Bayilere sunduklarımız', 'What resellers get'), null, [
      [x('Bölge önceliği', 'Territory priority'), x('Belirlenen bölgede öncelikli temsil hakkı.', 'Priority representation in an agreed territory.')],
      [x('Satış materyali', 'Sales material'), x('Sunum, demo hesabı ve pazarlama içerikleri.', 'Presentations, a demo account and marketing content.')],
      [x('Teknik eğitim', 'Technical training'), x('Kurulum ve destek eğitimi ücretsizdir.', 'Installation and support training is free.')],
      [x('Düzenli gelir', 'Recurring revenue'), x('Aktif abonelikler üzerinden aylık kazanç.', 'Monthly earnings from active subscriptions.')],
      [x('Öncelikli destek', 'Priority support'), x('Bayilere özel destek hattı.', 'A support line dedicated to resellers.')],
      [x('Ortak pazarlama', 'Co-marketing'), x('Bölgesel kampanyalarda ortak bütçe.', 'Shared budget for regional campaigns.')]
    ]),
    cta(x('Bayilik için ilk adım', 'First step to reselling'), x('Bölgenizi ve hedeflerinizi bize anlatın.', 'Tell us your region and your goals.'), [{ label: x('Başvuru Gönder', 'Apply Now'), href: '/iletisim', primary: true }, { label: x('Partner Programı', 'Partner Program'), href: '/partner-programi' }])
  ]);

  /* ======================= RESOURCES / SUPPORT ========================== */

  def('destek', x('Destek Merkezi', 'Support Center'),
    x('HASACA destek ekibine ulaşın; kanallar ve yanıt süreleri.', 'Reach the HASACA support team — channels and response times.'), [
    hero(x('Destek', 'Support'), x('Yanınızdayız', 'We are here for you'),
      x('Kurulumdan günlük kullanıma kadar her aşamada gerçek insanlardan destek alın.',
        'Get support from real people at every stage, from setup to daily use.'), [{ label: x('Destek Talebi Oluştur', 'Open a Ticket'), href: '/iletisim', primary: true }, { label: x('Yardım Merkezi', 'Help Center'), href: '/yardim' }]),
    cards(x('Destek kanalları', 'Support channels'), null, [
      [x('E-posta desteği', 'Email support'), x('Tüm planlarda geçerli; ortalama yanıt süresi 4 saat.', 'Available on all plans; average response time 4 hours.')],
      [x('Öncelikli destek', 'Priority support'), x('Profesyonel planda 1 saat içinde yanıt.', 'Response within 1 hour on the Professional plan.')],
      [x('Özel danışman', 'Dedicated manager'), x('Kurumsal planda size atanmış bir başarı danışmanı.', 'A success manager assigned to you on Enterprise.')],
      [x('Yardım merkezi', 'Help center'), x('Adım adım rehberler ve sık sorulan sorular.', 'Step-by-step guides and frequently asked questions.'), '/yardim'],
      [x('Dokümantasyon', 'Documentation'), x('Tüm modüllerin detaylı kullanım kılavuzu.', 'Detailed guides for every module.'), '/dokumantasyon'],
      [x('Sistem durumu', 'System status'), x('Servislerin anlık çalışma durumunu izleyin.', 'Watch the live status of our services.'), '/durum']
    ]),
    faq(x('Destek hakkında', 'About support'), [
      [x('Destek ücretli mi?', 'Is support paid?'), x('Hayır. Destek tüm planlara dahildir; plan seviyesi yalnızca yanıt önceliğini belirler.', 'No. Support is included in every plan; the plan only affects response priority.')],
      [x('Kurulumda yardım ediyor musunuz?', 'Do you help with setup?'), x('Evet. Kurulum ve menü aktarımı ücretsiz olarak ekibimiz tarafından yapılır.', 'Yes. Our team handles setup and menu migration free of charge.')],
      [x('Hafta sonu destek var mı?', 'Weekend support?'), x('Kritik arızalar için 7/24 nöbet ekibimiz vardır.', 'We keep a 24/7 on-call team for critical incidents.')]
    ])
  ]);

  def('yardim', x('Yardım Merkezi', 'Help Center'),
    x('Adım adım rehberler ve en sık sorulan konular.', 'Step-by-step guides and the most common topics.'), [
    hero(x('Yardım Merkezi', 'Help Center'), x('Aradığınız cevap burada', 'Find your answer here'),
      x('En sık ihtiyaç duyulan konular için hazırlanmış kısa rehberler.',
        'Short guides for the topics people need most.'), [{ label: x('Dokümantasyon', 'Documentation'), href: '/dokumantasyon', primary: true }, { label: x('Destek', 'Support'), href: '/destek' }]),
    cards(x('Popüler konular', 'Popular topics'), null, [
      [x('İlk kurulum', 'Getting started'), x('Hesabınızı açın, logonuzu yükleyin ve menünüzü ekleyin.', 'Open your account, upload your logo and add your menu.')],
      [x('QR kodu oluşturma', 'Creating QR codes'), x('Masalarınızı tanımlayın ve QR kodlarını indirin.', 'Define your tables and download their QR codes.')],
      [x('Menü düzenleme', 'Editing the menu'), x('Ürün ekleme, fiyat güncelleme ve kategori yönetimi.', 'Add products, update prices and manage categories.')],
      [x('Sipariş yönetimi', 'Managing orders'), x('Gelen siparişleri görüntüleme ve durum güncelleme.', 'View incoming orders and update their status.')],
      [x('Rezervasyon onayı', 'Approving reservations'), x('Rezervasyon taleplerini onaylama ve reddetme.', 'Approve and decline reservation requests.')],
      [x('Kullanıcı yetkileri', 'User permissions'), x('Ekip üyelerine rol tanımlama.', 'Assign roles to team members.')]
    ]),
    faq(x('En çok sorulanlar', 'Most asked'), [
      [x('Şifremi unuttum, ne yapmalıyım?', 'I forgot my password — what now?'), x('Giriş sayfasındaki "Şifremi unuttum" bağlantısını kullanın veya destek ekibine yazın.', 'Use the "Forgot password" link on the login page or write to support.')],
      [x('Menüme nasıl ürün eklerim?', 'How do I add a product?'), x('Yönetim panelinde Ürün Yönetimi sekmesinden yeni ürün ekleyebilirsiniz.', 'Add products from the Product Management tab in the admin panel.')],
      [x('QR kodum çalışmıyor', 'My QR code does not work'), x('Masanın aktif olduğundan emin olun; gerekirse kodu yeniden indirin.', 'Make sure the table is active and re-download the code if needed.')],
      [x('Alan adımı nasıl bağlarım?', 'How do I connect my domain?'), x('Profesyonel ve Kurumsal planlarda destek ekibimiz alan adı bağlantısını sizin için yapar.', 'On Professional and Enterprise plans our team connects your domain for you.')]
    ])
  ]);

  def('dokumantasyon', x('Dokümantasyon', 'Documentation'),
    x('HASACA platformunun tüm modülleri için kullanım kılavuzu.', 'Usage guides for every HASACA module.'), [
    hero(x('Dokümantasyon', 'Documentation'), x('Platformu uçtan uca öğrenin', 'Learn the platform end to end'),
      x('Kurulumdan ileri düzey ayarlara kadar tüm modüllerin kullanım rehberleri.',
        'Guides for every module, from setup to advanced configuration.'), [{ label: x('API Dokümantasyonu', 'API Docs'), href: '/api-docs', primary: true }, { label: x('Yardım Merkezi', 'Help Center'), href: '/yardim' }]),
    cards(x('Başlangıç', 'Getting started'), null, [
      [x('Hesap oluşturma', 'Creating an account'), x('Restoranınızı platformda açmanın ilk adımları.', 'The first steps to opening your restaurant on the platform.')],
      [x('Marka ayarları', 'Brand settings'), x('Logo, favicon, renk ve marka adı yönetimi.', 'Manage logo, favicon, colors and brand name.')],
      [x('Menü kurulumu', 'Menu setup'), x('Kategori ve ürün yapısını doğru kurgulama.', 'Structuring categories and products correctly.')],
      [x('Masa ve QR', 'Tables & QR'), x('Masa tanımlama ve QR kod üretimi.', 'Defining tables and generating QR codes.')]
    ]),
    cards(x('Operasyon', 'Operations'), null, [
      [x('Sipariş akışı', 'Order flow'), x('Siparişin müşteriden mutfağa uzanan yolculuğu.', 'The journey of an order from guest to kitchen.')],
      [x('Mutfak ekranı', 'Kitchen display'), x('Ekranı kurma ve durum yönetimi.', 'Setting up the screen and managing statuses.')],
      [x('Rezervasyon yönetimi', 'Reservation management'), x('Talepleri onaylama ve takvim düzeni.', 'Approving requests and calendar layout.')],
      [x('Bildirim gönderme', 'Sending notifications'), x('Kampanya bildirimlerini hazırlama ve gönderme.', 'Preparing and sending campaign notifications.')]
    ]),
    cards(x('İleri düzey', 'Advanced'), null, [
      [x('Özel alan adı', 'Custom domain'), x('Kendi alan adınızı platforma bağlama.', 'Connecting your own domain to the platform.')],
      [x('SEO ayarları', 'SEO settings'), x('Meta etiketleri ve sosyal paylaşım görselleri.', 'Meta tags and social sharing images.')],
      [x('Rol ve yetki', 'Roles & permissions'), x('Ekip üyelerine erişim seviyesi tanımlama.', 'Defining access levels for team members.')],
      [x('Veri dışa aktarma', 'Data export'), x('Sipariş ve müşteri verinizi dışa aktarma.', 'Exporting your order and customer data.')]
    ])
  ]);

  def('api-docs', x('API Dokümantasyonu', 'API Documentation'),
    x('HASACA REST API — Kurumsal plan için genel bakış.', 'The HASACA REST API — an overview for the Enterprise plan.'), [
    hero(x('API', 'API'), x('Kendi sistemlerinizle konuşun', 'Talk to your own systems'),
      x('Kurumsal planda REST API ile sipariş, ürün ve rezervasyon verinize programatik erişin. Bu sayfa genel bir tanıtımdır; erişim anahtarları hesabınıza özel verilir.',
        'On the Enterprise plan, access your order, product and reservation data programmatically via REST. This page is an overview; access keys are issued per account.'),
      [{ label: x('API Erişimi Talep Et', 'Request API Access'), href: '/satis-ekibi', primary: true }]),
    prose(x('Temel bilgiler', 'Basics'), [
      [x('Kimlik doğrulama', 'Authentication'), x('Tüm istekler Authorization: Bearer <token> başlığı ile gönderilir. Anahtarınızı asla istemci tarafında saklamayın.', 'All requests carry an Authorization: Bearer <token> header. Never store your key on the client side.')],
      [x('Biçim', 'Format'), x('İstek ve yanıtlar JSON formatındadır; tarihler milisaniye cinsinden zaman damgasıdır.', 'Requests and responses are JSON; dates are millisecond timestamps.')],
      [x('Hız sınırı', 'Rate limit'), x('Dakikada 120 istek. Sınır aşıldığında 429 döner.', '120 requests per minute. Exceeding the limit returns 429.')],
      [x('Hatalar', 'Errors'), x('Hatalar { "error": "..." } gövdesiyle uygun HTTP durum koduyla döner.', 'Errors return a { "error": "..." } body with the appropriate HTTP status.')]
    ]),
    code(x('Örnek uç noktalar', 'Example endpoints'), [
      ['GET /api/menu', x('Restoranın güncel menüsünü döndürür.', 'Returns the restaurant\'s current menu.')],
      ['GET /api/orders?limit=50', x('Son siparişleri listeler.', 'Lists recent orders.')],
      ['POST /api/orders', x('Yeni sipariş oluşturur.', 'Creates a new order.')],
      ['GET /api/reservations', x('Rezervasyonları listeler.', 'Lists reservations.')],
      ['POST /api/reservations', x('Yeni rezervasyon oluşturur.', 'Creates a new reservation.')],
      ['GET /api/analytics?days=30', x('Dönemsel satış ve sipariş özetini döndürür.', 'Returns sales and order summary for a period.')]
    ]),
    cta(x('API erişimi ister misiniz?', 'Need API access?'), x('Kurumsal plan ve entegrasyon detayları için satış ekibimize yazın.', 'Contact sales for Enterprise plan and integration details.'), [SALES, { label: x('Entegrasyonlar', 'Integrations'), href: '/entegrasyonlar' }])
  ]);

  def('blog', x('Blog', 'Blog'),
    x('Restoran işletmeciliği, dijitalleşme ve sektör içgörüleri.', 'Restaurant operations, digitalisation and industry insights.'), [
    hero(x('Blog', 'Blog'), x('Sektörden içgörüler', 'Insights from the industry'),
      x('Restoran işletmeciliğini kolaylaştıracak pratik rehberler ve sektör analizleri.',
        'Practical guides and industry analysis to make running a restaurant easier.'), []),
    posts(x('Son yazılar', 'Latest posts'), [
      [x('Pazaryeri komisyonları restoranınıza gerçekte ne kadara mal oluyor?', 'What do marketplace commissions really cost your restaurant?'), x('Analiz · 8 dk', 'Analysis · 8 min'), x('%25 komisyonun kâr marjınıza etkisini örnek hesaplarla inceliyoruz.', 'We break down the impact of a 25% commission on your margin with worked examples.')],
      [x('QR menüye geçişte yapılan 7 hata', '7 mistakes when moving to a QR menu'), x('Rehber · 6 dk', 'Guide · 6 min'), x('Sık yapılan hataları ve nasıl kaçınacağınızı anlatıyoruz.', 'The most common mistakes and how to avoid them.')],
      [x('Masa devir hızını artırmanın 5 yolu', '5 ways to increase table turnover'), x('Operasyon · 5 dk', 'Operations · 5 min'), x('Servis süresini kısaltarak aynı salonla daha çok misafir ağırlayın.', 'Serve more guests in the same room by shortening service time.')],
      [x('Restoranınız için doğru menü fiyatlandırması', 'Getting menu pricing right'), x('Finans · 7 dk', 'Finance · 7 min'), x('Maliyet, algı ve kârlılık arasında denge kurmanın yolları.', 'How to balance cost, perception and profitability.')],
      [x('Müşteri verisi neden en değerli varlığınız?', 'Why customer data is your most valuable asset'), x('Strateji · 6 dk', 'Strategy · 6 min'), x('Kendi müşteri listenize sahip olmanın uzun vadeli getirisi.', 'The long-term return of owning your own customer list.')],
      [x('Yapay zekâ restoran mutfağına nasıl giriyor?', 'How AI is entering the restaurant kitchen'), x('Teknoloji · 9 dk', 'Technology · 9 min'), x('Menü üretiminden talep tahminine kadar pratik kullanım alanları.', 'Practical use cases from menu generation to demand forecasting.')]
    ]),
    cta(x('Yazılardan haberdar olun', 'Stay in the loop'), x('Yeni içerikler yayınlandığında haberdar olmak için bize yazın.', 'Write to us to hear when new content goes live.'), [{ label: x('İletişime Geç', 'Contact Us'), href: '/iletisim', primary: true }])
  ]);

  /* =========================== FORM PAGES ============================== */

  def('demo-talep', x('Demo Talep Formu', 'Request a Demo'),
    x('Size özel, ücretsiz bir HASACA demosu talep edin.', 'Request a free, tailored HASACA demo.'), [
    hero(x('Demo', 'Demo'), x('Ücretsiz demo talep edin', 'Request a free demo'),
      x('Formu doldurun; ekibimiz 24 saat içinde size özel hazırlanmış bir demoyla dönsün. Taahhüt yok.',
        'Fill in the form and our team will return within 24 hours with a demo prepared for you. No commitment.'), []),
    form('demo', x('Demo talebi', 'Demo request'), x('Restoranınızı kısaca anlatın, size uygun bir sunum hazırlayalım.', 'Tell us briefly about your restaurant so we can tailor the walkthrough.')),
    cards(x('Demoda ne göreceksiniz?', 'What you will see'), null, [
      [x('Kendi menünüz', 'Your own menu'), x('Demo hesabınıza örnek menünüzü yükleyip gerçek akışı gösteririz.', 'We load a sample of your menu and walk the real flow.')],
      [x('Uçtan uca sipariş', 'End-to-end order'), x('QR okutmadan mutfak ekranına kadar tüm süreç.', 'The whole process from QR scan to kitchen display.')],
      [x('Yönetim paneli', 'Admin panel'), x('Günlük operasyonu nasıl yöneteceğinizi görün.', 'See how you will run daily operations.')],
      [x('Maliyet analizi', 'Cost analysis'), x('Mevcut komisyon giderinize göre tasarruf hesabı.', 'Savings calculated against your current commission costs.')]
    ])
  ]);

  def('teklif-al', x('Teklif Al', 'Get a Quote'),
    x('İşletmenize özel fiyat teklifi alın.', 'Get a price quote tailored to your business.'), [
    hero(x('Teklif', 'Quote'), x('Size özel teklif alın', 'Get a tailored quote'),
      x('Şube sayınıza ve ihtiyacınıza göre özel fiyatlandırma hazırlayalım.',
        'We will prepare pricing based on your branch count and needs.'), [PRICE]),
    form('quote', x('Teklif talebi', 'Quote request'), x('İhtiyacınızı ve şube sayınızı belirtin; net bir teklifle dönelim.', 'Tell us your needs and branch count and we will come back with a clear quote.')),
    faq(x('Teklif süreci', 'The quote process'), [
      [x('Ne kadar sürede dönüş yapılır?', 'How fast do you respond?'), x('Genellikle aynı iş günü içinde, en geç 24 saatte.', 'Usually the same business day, within 24 hours at the latest.')],
      [x('Teklif bağlayıcı mı?', 'Is the quote binding?'), x('Hayır, teklif tamamen bilgilendirme amaçlıdır.', 'No, the quote is purely informational.')],
      [x('Çok şubeli indirim var mı?', 'Is there a multi-branch discount?'), x('Evet, şube sayısı arttıkça birim fiyat düşer.', 'Yes, unit pricing drops as branch count rises.')]
    ])
  ]);

  def('satis-ekibi', x('Satış Ekibi ile Görüş', 'Talk to Sales'),
    x('HASACA satış ekibiyle birebir görüşün.', 'Speak one-to-one with the HASACA sales team.'), [
    hero(x('Satış', 'Sales'), x('Satış ekibiyle görüşün', 'Talk to our sales team'),
      x('Kurumsal ihtiyaçlar, çoklu şube kurulumu ve API erişimi için doğrudan ekibimizle konuşun.',
        'Speak directly with our team about enterprise needs, multi-branch rollouts and API access.'), []),
    form('sales', x('Görüşme talebi', 'Request a call'), x('Size en uygun zamanda dönüş yapalım.', 'We will get back to you at a time that suits you.')),
    cards(x('Kimler için?', 'Who is this for?'), null, [
      [x('Zincir restoranlar', 'Restaurant chains'), x('Çok şubeli kurulum ve merkezî yönetim planlaması.', 'Multi-branch rollout and central management planning.')],
      [x('Kurumsal ihtiyaçlar', 'Enterprise needs'), x('SLA, özel entegrasyon ve API erişimi.', 'SLA, custom integrations and API access.')],
      [x('Geçiş süreci', 'Migration'), x('Mevcut sisteminizden HASACA\'ya veri aktarımı.', 'Migrating your data from an existing system.')],
      [x('Özel fiyatlandırma', 'Custom pricing'), x('Hacme göre özel ticari koşullar.', 'Commercial terms based on volume.')]
    ])
  ]);

  def('iletisim', x('İletişim', 'Contact'),
    x('HASACA ile iletişime geçin.', 'Get in touch with HASACA.'), [
    hero(x('İletişim', 'Contact'), x('Bize ulaşın', 'Reach out to us'),
      x('Sorularınız, önerileriniz ve iş birliği talepleriniz için formu doldurun.',
        'Fill in the form for questions, suggestions and partnership requests.'), []),
    form('contact', x('Mesaj gönderin', 'Send a message'), x('Ekibimiz en kısa sürede size dönecek.', 'Our team will get back to you shortly.')),
    cards(x('Doğru yeri bulun', 'Find the right place'), null, [
      [x('Demo talebi', 'Demo request'), x('Ürünü canlı görmek istiyorsanız.', 'If you want to see the product live.'), '/demo-talep'],
      [x('Fiyat teklifi', 'Price quote'), x('İşletmenize özel fiyatlandırma için.', 'For pricing tailored to your business.'), '/teklif-al'],
      [x('Teknik destek', 'Technical support'), x('Mevcut müşterilerimiz için destek kanalları.', 'Support channels for existing customers.'), '/destek'],
      [x('Partner olma', 'Partnering'), x('Ajans ve iş ortaklığı başvuruları.', 'Agency and partnership applications.'), '/partner-programi']
    ])
  ]);

  /* ===================== STATUS / ROADMAP / CHANGELOG =================== */

  def('durum', x('Sistem Durumu', 'System Status'),
    x('HASACA servislerinin anlık çalışma durumu.', 'Live operational status of HASACA services.'), [
    hero(x('Durum', 'Status'), x('Tüm sistemler çalışıyor', 'All systems operational'),
      x('Servislerimizin güncel durumunu buradan izleyebilirsiniz. Planlı bakımlar önceden duyurulur.',
        'Track the current state of our services here. Planned maintenance is announced in advance.'), []),
    status(x('Servisler', 'Services'), [
      [x('Müşteri web siteleri', 'Customer websites'), 'ok'],
      [x('QR sipariş sistemi', 'QR ordering'), 'ok'],
      [x('Yönetim paneli', 'Admin panel'), 'ok'],
      [x('Mutfak ekranı', 'Kitchen display'), 'ok'],
      [x('Rezervasyon servisi', 'Reservation service'), 'ok'],
      [x('Bildirim servisi', 'Notification service'), 'ok'],
      [x('Görsel yükleme', 'Image uploads'), 'ok'],
      [x('API', 'API'), 'ok']
    ]),
    stats([[x('%99.9', '99.9%'), x('30 günlük çalışma süresi', '30-day uptime')], [x('<200ms', '<200ms'), x('Ortalama yanıt', 'Average response')], [x('0', '0'), x('Açık olay', 'Open incidents')], [x('7/24', '24/7'), x('İzleme', 'Monitoring')]]),
    cta(x('Bir sorun mu yaşıyorsunuz?', 'Experiencing an issue?'), x('Burada görünmeyen bir sorun varsa lütfen bize bildirin.', 'If you hit a problem not listed here, please let us know.'), [{ label: x('Sorun Bildir', 'Report an Issue'), href: '/destek', primary: true }])
  ]);

  def('yol-haritasi', x('Yol Haritası', 'Roadmap'),
    x('HASACA\'da sırada ne var?', 'What is next on the HASACA roadmap?'), [
    hero(x('Yol Haritası', 'Roadmap'), x('Sırada ne var?', 'What is coming next'),
      x('Ürünü müşterilerimizle birlikte geliştiriyoruz. Aşağıdaki planlar geri bildirimlerinize göre şekilleniyor.',
        'We build the product with our customers. These plans are shaped by your feedback.'), []),
    timeline(x('Planlanan geliştirmeler', 'Planned work'), [
      [x('Yayında', 'Shipped'), x('Bildirim sistemi', 'Notification system'), x('Kampanya ve sipariş bildirimlerini anında gönderin.', 'Send campaign and order alerts instantly.'), 'done'],
      [x('Yayında', 'Shipped'), x('SEO yönetim merkezi', 'SEO management center'), x('Meta etiketleri, sosyal görsel ve otomatik sitemap.', 'Meta tags, social images and automatic sitemap.'), 'done'],
      [x('Geliştiriliyor', 'In progress'), x('Panel arayüz yenilemesi', 'Panel UI refresh'), x('Yönetim panelleri modern masaüstü deneyimine kavuşuyor.', 'Admin panels are moving to a modern desktop experience.'), 'active'],
      [x('Sırada', 'Next up'), x('Yapay zekâ asistanı', 'AI assistant'), x('Menü üretimi, açıklama yazımı ve satış öngörüleri.', 'Menu generation, copywriting and sales forecasts.'), 'next'],
      [x('Sırada', 'Next up'), x('QR tasarım aracı', 'QR designer'), x('QR kodlarını markanıza göre renklendirin.', 'Colour your QR codes to match your brand.'), 'next'],
      [x('Planlanıyor', 'Planned'), x('Widget yönetimi', 'Widget management'), x('Sitenizdeki bileşenleri açıp kapatın.', 'Toggle components on your site.'), 'planned'],
      [x('Planlanıyor', 'Planned'), x('Gelişmiş rol yönetimi', 'Advanced roles'), x('Daha ince ayarlı yetkilendirme seviyeleri.', 'More granular permission levels.'), 'planned'],
      [x('Planlanıyor', 'Planned'), x('Mobil uygulama', 'Mobile app'), x('İşletme sahipleri için native mobil panel.', 'A native mobile panel for owners.'), 'planned']
    ]),
    cta(x('Bir özellik mi istiyorsunuz?', 'Want a feature?'), x('Talebinizi iletin; yol haritamızı müşteri ihtiyacına göre önceliklendiriyoruz.', 'Send us your request — we prioritise the roadmap by customer need.'), [{ label: x('Özellik Öner', 'Suggest a Feature'), href: '/iletisim', primary: true }, { label: x('Sürüm Notları', 'Changelog'), href: '/surum-notlari' }])
  ]);

  def('surum-notlari', x('Sürüm Notları', 'Changelog'),
    x('HASACA platformunda yapılan güncellemeler.', 'Updates shipped to the HASACA platform.'), [
    hero(x('Sürüm Notları', 'Changelog'), x('Neler değişti?', 'What changed'),
      x('Platforma eklenen yeni özellikler ve iyileştirmeler.',
        'New features and improvements added to the platform.'), []),
    timeline(x('Güncellemeler', 'Releases'), [
      [x('Sürüm 2.3', 'v2.3'), x('Tanıtım sitesi ve kurumsal sayfalar', 'Marketing site and company pages'), x('Tüm ürün, çözüm, kaynak ve yasal sayfalar yayına alındı; yeni yönetici giriş ekranı eklendi.', 'All product, solution, resource and legal pages went live, along with a new admin login screen.'), 'done'],
      [x('Sürüm 2.2', 'v2.2'), x('SEO yönetim merkezi', 'SEO management center'), x('Restoran bazlı meta etiketleri, sosyal paylaşım görseli ve otomatik robots/sitemap.', 'Per-restaurant meta tags, social image and automatic robots/sitemap.'), 'done'],
      [x('Sürüm 2.1', 'v2.1'), x('Bildirim sistemi', 'Notification system'), x('Restoran bazlı push bildirimleri ve merkezî duyuru gönderimi.', 'Per-restaurant push notifications and central broadcast.'), 'done'],
      [x('Sürüm 2.0', 'v2.0'), x('Analitik ve aktivite kaydı', 'Analytics and activity log'), x('Satış, sipariş ve ürün performansı raporları; denetim kaydı.', 'Sales, order and product reports plus an audit trail.'), 'done'],
      [x('Sürüm 1.9', 'v1.9'), x('Tema motoru', 'Theme engine'), x('Sıcak, açık ve siyah-beyaz tema seçenekleri.', 'Warm, light and black & white theme options.'), 'done'],
      [x('Sürüm 1.8', 'v1.8'), x('Görsel yükleme sistemi', 'Image upload system'), x('Ürün ve marka görselleri artık doğrudan panelden yükleniyor.', 'Product and brand images are now uploaded straight from the panel.'), 'done']
    ]),
    cta(x('Güncellemeleri takip edin', 'Follow the updates'), x('Yeni sürümlerden haberdar olmak için bize yazın.', 'Write to us to hear about new releases.'), [{ label: x('Yol Haritası', 'Roadmap'), href: '/yol-haritasi', primary: true }, { label: x('İletişim', 'Contact'), href: '/iletisim' }])
  ]);

  def('sss', x('Sık Sorulan Sorular', 'FAQ'),
    x('HASACA hakkında en çok sorulan sorular ve yanıtları.', 'The most common questions about HASACA, answered.'), [
    hero(x('SSS', 'FAQ'), x('Merak edilenler', 'Common questions'),
      x('Aradığınız cevabı bulamazsanız ekibimize yazmaktan çekinmeyin.',
        'If you cannot find your answer here, do not hesitate to write to us.'), [{ label: x('Destek Merkezi', 'Support Center'), href: '/destek' }]),
    faq(x('Genel', 'General'), [
      [x('HASACA tam olarak nedir?', 'What exactly is HASACA?'), x('Restoranlar için komisyonsuz bir dijital platform: web sitesi, QR menü, online sipariş, rezervasyon ve yönetim paneli tek yerde.', 'A commission-free digital platform for restaurants: website, QR menu, online ordering, reservations and an admin panel in one place.')],
      [x('Gerçekten komisyon almıyor musunuz?', 'Do you really take no commission?'), x('Evet. Siparişlerinizden pay almıyoruz; yalnızca sabit plan ücreti ödersiniz.', 'Correct. We take no share of your orders — you only pay a fixed plan fee.')],
      [x('Kurulum ne kadar sürer?', 'How long does setup take?'), x('Ortalama 5 dakika. Menü aktarımında ekibimiz ücretsiz yardımcı olur.', 'About 5 minutes. Our team helps with menu migration free of charge.')],
      [x('Teknik bilgi gerekiyor mu?', 'Do I need technical skills?'), x('Hayır. Panel gündelik bir uygulama kadar basittir.', 'No. The panel is as simple as any everyday app.')]
    ]),
    faq(x('Ticari', 'Commercial'), [
      [x('İstediğim zaman iptal edebilir miyim?', 'Can I cancel anytime?'), x('Evet, taahhüt yoktur. 14 gün ücretsiz deneme ile risksiz başlarsınız.', 'Yes, there is no commitment. Start risk-free with a 14-day trial.')],
      [x('Ödeme nasıl yapılıyor?', 'How is billing handled?'), x('Aylık veya yıllık olarak; yıllık ödemede iki ay hediye edilir.', 'Monthly or annually; annual billing includes two months free.')],
      [x('Çok şubeli işletmeler için indirim var mı?', 'Discounts for multi-branch?'), x('Evet, şube sayısı arttıkça birim fiyat düşer.', 'Yes, unit pricing drops as branch count rises.')]
    ]),
    faq(x('Teknik', 'Technical'), [
      [x('Kendi alan adımı kullanabilir miyim?', 'Can I use my own domain?'), x('Evet, Profesyonel ve Kurumsal planlarda kendi alan adınızda yayına geçersiniz.', 'Yes, on Professional and Enterprise you go live on your own domain.')],
      [x('Müşteri verileri kime ait?', 'Who owns the customer data?'), x('Tamamen size aittir; istediğiniz zaman dışa aktarabilirsiniz.', 'It is entirely yours and you can export it at any time.')],
      [x('Verilerim güvende mi?', 'Is my data safe?'), x('Şifreler geri döndürülemez biçimde saklanır, tüm trafik şifrelenir ve veriler düzenli yedeklenir.', 'Passwords are stored irreversibly, all traffic is encrypted and data is backed up regularly.'), '/guvenlik'],
      [x('İnternet kesilirse ne olur?', 'What if the internet drops?'), x('Misafirler kendi mobil verisiyle menüye erişebilir; sistem bulut üzerinde çalışır.', 'Guests can reach the menu on their own mobile data; the system runs in the cloud.')]
    ])
  ]);

  /* ============================ LEGAL / TRUST =========================== */

  def('guvenlik', x('Güvenlik', 'Security'),
    x('HASACA verilerinizi nasıl koruyor?', 'How HASACA protects your data.'), [
    hero(x('Güvenlik', 'Security'), x('Verileriniz güvende', 'Your data is protected'),
      x('Restoranınızın ve misafirlerinizin verisini korumak, ürünümüzün temel tasarım ilkesidir.',
        'Protecting your restaurant\'s and your guests\' data is a core design principle of our product.'), []),
    cards(x('Güvenlik önlemleri', 'Security measures'), null, [
      [x('Şifreli bağlantı', 'Encrypted connections'), x('Tüm trafik HTTPS üzerinden şifrelenerek taşınır.', 'All traffic is encrypted in transit over HTTPS.')],
      [x('Geri döndürülemez şifreler', 'Irreversible passwords'), x('Parolalar scrypt ile özetlenir; düz metin olarak saklanmaz.', 'Passwords are hashed with scrypt and never stored in plain text.')],
      [x('Veri izolasyonu', 'Data isolation'), x('Her restoranın verisi ayrı ayrı izole edilir; hiçbir işletme diğerinin verisini göremez.', 'Every restaurant\'s data is isolated; no venue can ever see another\'s.')],
      [x('Yetki tabanlı erişim', 'Role-based access'), x('Ekip üyeleri yalnızca yetkili oldukları verilere erişir.', 'Team members only reach the data they are authorised for.')],
      [x('Denetim kaydı', 'Audit trail'), x('Kritik işlemler kim, ne zaman, nereden bilgisiyle kaydedilir.', 'Critical actions are logged with who, when and from where.')],
      [x('Düzenli yedekleme', 'Regular backups'), x('Veritabanı düzenli olarak yedeklenir ve geri yükleme test edilir.', 'The database is backed up regularly and restores are tested.')]
    ]),
    prose(x('Sorumluluklarımız', 'Our commitments'), [
      [x('Veri sahipliği', 'Data ownership'), x('Platformdaki restoran ve müşteri verisi işletmeye aittir. Verinizi hiçbir koşulda satmayız veya üçüncü taraflarla paylaşmayız.', 'Restaurant and customer data on the platform belongs to the venue. We never sell it or share it with third parties.')],
      [x('Erişim sınırlaması', 'Access limitation'), x('Ekibimiz müşteri verisine yalnızca açık destek talebiniz üzerine ve gerektiği kadar erişir.', 'Our team accesses customer data only upon your explicit support request and only as far as needed.')],
      [x('Olay bildirimi', 'Incident disclosure'), x('Veri güvenliğini etkileyen bir olay yaşanırsa etkilenen işletmeleri gecikmeden bilgilendiririz.', 'If an incident affects data security we inform affected venues without delay.')]
    ]),
    cta(x('Güvenlik sorularınız mı var?', 'Security questions?'), x('Teknik güvenlik dokümanlarımız için ekibimize yazın.', 'Write to our team for our technical security documentation.'), [{ label: x('İletişime Geç', 'Contact Us'), href: '/iletisim', primary: true }, { label: x('KVKK', 'GDPR/KVKK'), href: '/kvkk' }])
  ]);

  legal('gizlilik', x('Gizlilik Politikası', 'Privacy Policy'),
    x('Kişisel verilerinizi nasıl işlediğimizi açıklar.', 'How we process your personal data.'), [
    [x('Genel', 'Overview'), x('Bu politika, HASACA platformunu kullanırken toplanan kişisel verilerin nasıl işlendiğini açıklar. Platformu kullanarak bu politikayı kabul etmiş olursunuz.', 'This policy explains how personal data collected while using the HASACA platform is processed. By using the platform you accept this policy.')],
    [x('Toplanan veriler', 'Data we collect'), x('Hesap bilgileri (ad, e-posta, telefon), işletme bilgileri, sipariş ve rezervasyon kayıtları ile teknik kayıtlar (IP adresi, tarayıcı bilgisi) toplanır.', 'Account details (name, email, phone), business details, order and reservation records, and technical logs (IP address, browser information).')],
    [x('Kullanım amacı', 'Purpose of use'), x('Veriler yalnızca hizmetin sunulması, destek verilmesi, güvenliğin sağlanması ve yasal yükümlülüklerin yerine getirilmesi amacıyla kullanılır.', 'Data is used only to deliver the service, provide support, maintain security and meet legal obligations.')],
    [x('Paylaşım', 'Sharing'), x('Kişisel verileriniz satılmaz. Yalnızca hizmetin sunulması için gerekli altyapı sağlayıcılarıyla ve yasal zorunluluk halinde yetkili mercilerle paylaşılır.', 'Your personal data is never sold. It is shared only with infrastructure providers necessary to deliver the service, and with authorities where legally required.')],
    [x('Saklama süresi', 'Retention'), x('Veriler, hizmet ilişkisi sürdüğü müddetçe ve ilgili mevzuatın öngördüğü süre boyunca saklanır.', 'Data is retained for the duration of the service relationship and for any period required by applicable law.')],
    [x('Haklarınız', 'Your rights'), x('Verilerinize erişme, düzeltme, silme ve işlenmesine itiraz etme hakkına sahipsiniz. Taleplerinizi iletişim kanallarımızdan iletebilirsiniz.', 'You have the right to access, correct, delete and object to the processing of your data. Submit requests through our contact channels.')],
    [x('Değişiklikler', 'Changes'), x('Bu politika güncellenebilir. Önemli değişiklikler platform üzerinden duyurulur.', 'This policy may be updated. Material changes are announced on the platform.')]
  ]);

  legal('kvkk', x('KVKK Aydınlatma Metni', 'KVKK / GDPR Notice'),
    x('6698 sayılı KVKK kapsamında aydınlatma metni.', 'Data protection notice under Turkish KVKK law no. 6698.'), [
    [x('Veri sorumlusu', 'Data controller'), x('6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu HASACA\'dır. Bu metin, kişisel verilerinizin işlenmesine ilişkin olarak sizi bilgilendirmek amacıyla hazırlanmıştır.', 'Under Turkish law no. 6698 on the Protection of Personal Data, HASACA acts as data controller. This notice informs you about the processing of your personal data.')],
    [x('İşleme amaçları', 'Processing purposes'), x('Kişisel verileriniz; hizmetin sunulması, sözleşmenin ifası, müşteri desteği, güvenliğin sağlanması ve yasal yükümlülüklerin yerine getirilmesi amaçlarıyla işlenir.', 'Your data is processed to deliver the service, perform the contract, provide customer support, ensure security and fulfil legal obligations.')],
    [x('Hukuki sebep', 'Legal basis'), x('Veriler, sözleşmenin kurulması ve ifası, hukuki yükümlülüklerin yerine getirilmesi ve meşru menfaat hukuki sebeplerine dayanılarak işlenir.', 'Data is processed on the basis of contract formation and performance, compliance with legal obligations and legitimate interest.')],
    [x('Aktarım', 'Transfers'), x('Veriler, hizmetin sunulabilmesi için gerekli altyapı sağlayıcılarına ve yasal olarak yetkili kamu kurumlarına aktarılabilir.', 'Data may be transferred to infrastructure providers required to deliver the service and to legally authorised public authorities.')],
    [x('İlgili kişi hakları', 'Data subject rights'), x('KVKK\'nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme ve işlemeye itiraz etme haklarına sahipsiniz.', 'Under article 11 of the KVKK you may learn whether your data is processed, request information, request correction or deletion, and object to processing.')],
    [x('Başvuru', 'Applications'), x('Haklarınıza ilişkin taleplerinizi iletişim sayfamızdaki kanallar üzerinden iletebilirsiniz. Talepler en geç 30 gün içinde sonuçlandırılır.', 'Submit requests via the channels on our contact page. Requests are resolved within 30 days at the latest.')]
  ]);

  legal('cerez-politikasi', x('Çerez Politikası', 'Cookie Policy'),
    x('Sitemizde kullanılan çerezler ve amaçları.', 'The cookies we use and why.'), [
    [x('Çerez nedir?', 'What is a cookie?'), x('Çerezler, ziyaret ettiğiniz siteler tarafından tarayıcınıza kaydedilen küçük metin dosyalarıdır. Sitenin düzgün çalışmasına ve tercihlerinizin hatırlanmasına yardımcı olur.', 'Cookies are small text files stored in your browser by the sites you visit. They help the site work correctly and remember your preferences.')],
    [x('Zorunlu çerezler', 'Essential cookies'), x('Oturum yönetimi ve güvenlik için gereklidir. Bu çerezler olmadan giriş yapmak ve sipariş vermek mümkün değildir; devre dışı bırakılamaz.', 'Required for session management and security. Without them you cannot log in or place orders; they cannot be disabled.')],
    [x('Tercih çerezleri', 'Preference cookies'), x('Dil seçiminiz ve tema tercihiniz gibi ayarları hatırlamak için kullanılır.', 'Used to remember settings such as your language choice and theme preference.')],
    [x('Üçüncü taraf çerezleri', 'Third-party cookies'), x('Platform, pazarlama amaçlı üçüncü taraf takip çerezleri kullanmamaktadır.', 'The platform does not use third-party marketing tracking cookies.')],
    [x('Çerezleri yönetme', 'Managing cookies'), x('Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Zorunlu çerezleri engellemeniz halinde platformun bazı bölümleri çalışmayabilir.', 'You can delete or block cookies in your browser settings. Blocking essential cookies may break parts of the platform.')]
  ]);

  legal('kullanim-sartlari', x('Kullanım Şartları', 'Terms of Use'),
    x('Platformu kullanırken geçerli olan koşullar.', 'The terms that apply when using the platform.'), [
    [x('Kabul', 'Acceptance'), x('HASACA platformunu kullanarak bu kullanım şartlarını kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız platformu kullanmamalısınız.', 'By using the HASACA platform you accept these terms. If you do not accept them, you should not use the platform.')],
    [x('Hesap sorumluluğu', 'Account responsibility'), x('Hesap bilgilerinizin gizliliğinden ve hesabınız üzerinden gerçekleştirilen tüm işlemlerden siz sorumlusunuz. Şüpheli bir erişim fark ederseniz derhal bize bildirin.', 'You are responsible for keeping your credentials confidential and for all activity performed through your account. Report any suspicious access to us immediately.')],
    [x('Kabul edilebilir kullanım', 'Acceptable use'), x('Platform; yasa dışı içerik barındırmak, üçüncü kişilerin haklarını ihlal etmek veya sistemin işleyişini bozmak amacıyla kullanılamaz.', 'The platform may not be used to host unlawful content, infringe third-party rights or disrupt the operation of the system.')],
    [x('İçerik sorumluluğu', 'Content responsibility'), x('Menü, görsel ve işletme bilgileri dâhil olmak üzere platforma yüklediğiniz tüm içeriğin doğruluğundan ve hukuka uygunluğundan siz sorumlusunuz.', 'You are responsible for the accuracy and legality of all content you upload, including menus, images and business information.')],
    [x('Hizmet sürekliliği', 'Service continuity'), x('Hizmetin kesintisiz sunulması için azami çaba gösterilir; planlı bakımlar önceden duyurulur. Zorunlu hallerde hizmette geçici kesintiler yaşanabilir.', 'We make every effort to provide uninterrupted service and announce planned maintenance in advance. Temporary interruptions may occur where unavoidable.')],
    [x('Fesih', 'Termination'), x('Aboneliğinizi dilediğiniz zaman sonlandırabilirsiniz. Bu şartların ağır ihlali halinde hesabınız askıya alınabilir.', 'You may end your subscription at any time. Serious breaches of these terms may result in account suspension.')],
    [x('Değişiklikler', 'Changes'), x('Kullanım şartları güncellenebilir; önemli değişiklikler önceden duyurulur.', 'These terms may be updated; material changes are announced in advance.')]
  ]);

  legal('hizmet-sozlesmesi', x('Hizmet Sözleşmesi', 'Service Agreement'),
    x('Abonelik hizmetine ilişkin sözleşme esasları.', 'The principles governing the subscription service.'), [
    [x('Konu', 'Subject'), x('Bu sözleşme, HASACA tarafından sunulan yazılım hizmetinin abonelik esasıyla kullanılmasına ilişkin tarafların hak ve yükümlülüklerini düzenler.', 'This agreement sets out the parties\' rights and obligations regarding subscription use of the software service provided by HASACA.')],
    [x('Hizmet kapsamı', 'Scope of service'), x('Hizmet kapsamı seçilen abonelik planına göre belirlenir. Plan içerikleri fiyatlandırma sayfasında yayımlanır.', 'Scope is determined by the selected subscription plan. Plan contents are published on the pricing page.')],
    [x('Ücret ve ödeme', 'Fees and payment'), x('Abonelik ücreti seçilen plana göre aylık veya yıllık olarak tahsil edilir. Ücretler peşin ödenir ve komisyon içermez.', 'The subscription fee is charged monthly or annually according to the selected plan. Fees are paid in advance and contain no commission.')],
    [x('Deneme süresi', 'Trial period'), x('Yeni aboneler 14 günlük ücretsiz deneme süresinden yararlanır. Deneme süresi sonunda abonelik başlatılmadığı takdirde ücret tahsil edilmez.', 'New subscribers receive a 14-day free trial. No fee is charged if the subscription is not started at the end of the trial.')],
    [x('Veri sahipliği', 'Data ownership'), x('Platforma girilen tüm işletme ve müşteri verisi aboneye aittir. Abonelik sona erdiğinde veriler talep üzerine dışa aktarılabilir.', 'All business and customer data entered into the platform belongs to the subscriber. On termination, data can be exported on request.')],
    [x('Sorumluluk sınırı', 'Limitation of liability'), x('HASACA, hizmetin kullanılmasından doğan dolaylı zararlardan sorumlu tutulamaz. Sorumluluk her hâlükârda ilgili döneme ait abonelik bedeli ile sınırlıdır.', 'HASACA is not liable for indirect damages arising from use of the service. Liability is in all cases limited to the subscription fee for the relevant period.')],
    [x('Yürürlük', 'Effect'), x('Sözleşme, abonelik başlatıldığı anda yürürlüğe girer ve abonelik devam ettiği sürece geçerliliğini korur.', 'The agreement takes effect when the subscription starts and remains valid for its duration.')]
  ]);

  return { pages, x };
});
