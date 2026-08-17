// =============================================
// tada — Master Restaurant Template
// The canonical "My Restaurant" demo dataset. It is what the `default`
// tenant is seeded with, and what every new tenant is cloned from, so
// new sites are never empty. No Dayı Katık / real-brand content here.
// =============================================

const CATEGORIES = [
  { id: 'starters', name_tr: 'Başlangıçlar', name_en: 'Starters' },
  { id: 'mains', name_tr: 'Ana Yemekler', name_en: 'Main Courses' },
  { id: 'drinks', name_tr: 'İçecekler', name_en: 'Drinks' },
  { id: 'desserts', name_tr: 'Tatlılar', name_en: 'Desserts' }
];

// [id, name_tr, name_en, category, minPrice, maxPrice]
const PRODUCTS = [
  ['tpl-soup', 'Günün Çorbası', 'Soup of the Day', 'starters', 45, 80],
  ['tpl-bruschetta', 'Bruschetta', 'Bruschetta', 'starters', 70, 130],
  ['tpl-salad', 'Mevsim Salatası', 'Seasonal Salad', 'starters', 80, 150],
  ['tpl-burger', 'Ev Burger', 'House Burger', 'mains', 160, 300],
  ['tpl-grill', 'Izgara Köfte', 'Grilled Meatballs', 'mains', 180, 320],
  ['tpl-chicken', 'Tavuk Şiş', 'Chicken Skewer', 'mains', 170, 300],
  ['tpl-pasta', 'Kremalı Makarna', 'Creamy Pasta', 'mains', 120, 240],
  ['tpl-pizza', 'Margherita Pizza', 'Margherita Pizza', 'mains', 150, 280],
  ['tpl-lemonade', 'Ev Yapımı Limonata', 'Homemade Lemonade', 'drinks', 30, 70],
  ['tpl-cheesecake', 'Cheesecake', 'Cheesecake', 'desserts', 70, 140],
  ['tpl-baklava', 'Fıstıklı Baklava', 'Pistachio Baklava', 'desserts', 90, 180]
];

const DESC_TR = 'Demo ürün açıklaması — kendi açıklamanızı yönetim panelinden ekleyin veya AI ile oluşturun.';
const DESC_EN = 'Demo product description — add your own from the admin panel or generate it with AI.';

// Default branding for a brand-new / template restaurant (generic, no real brand).
function defaultSettings(displayName) {
  const name = displayName || 'My Restaurant';
  return {
    logo_url: '/icons/placeholder-logo.svg',
    company_name: name,
    hero_title_tr: 'Hoş Geldiniz<br><em>' + name + '</em>',
    hero_title_en: 'Welcome to<br><em>' + name + '</em>',
    hero_sub_tr: 'Lezzetli yemekler, sıcak bir atmosfer. İçerikleri yönetim panelinden düzenleyin.',
    hero_sub_en: 'Delicious food, a warm atmosphere. Edit the content from your admin panel.',
    footer_text: name,
    seo_title: name + ' | tada',
    seo_description: 'A restaurant website powered by the tada platform.',
    // New restaurants start on the "first 14 days free" trial from the pricing page (landing.html's
    // PLANS). trial_started_at is read by admin.html's "Üyelik Durumu" card to show days remaining.
    subscription_status: 'trial',
    trial_started_at: Date.now(),
    self_paused: false
  };
}

function randomPrice(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

// Local placeholder dish image, cycled 1..4 (no external services).
function dishImage(index) {
  return `/icons/placeholder-dish-${((index - 1) % 4) + 1}.svg`;
}

module.exports = {
  CATEGORIES,
  PRODUCTS,
  DESC_TR,
  DESC_EN,
  defaultSettings,
  randomPrice,
  dishImage
};
