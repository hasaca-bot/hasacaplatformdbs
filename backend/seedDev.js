// =============================================
// HASACA Platform — Development Seed
// Creates a fully-populated demo tenant so EVERY feature can be
// tested immediately after a fresh clone: categories, menu items,
// tables + QR tokens, reservations, delivery orders and table orders.
//
//   node seedDev.js            # seed (skips if 'demo' tenant already exists)
//   node seedDev.js --force    # wipe the 'demo' tenant and reseed
//
// Never touches the 'default' (Dayı Katık) tenant or production data.
// =============================================

require('./lib/env').loadEnv();
const { db, initDatabase } = require('./db');
const { hashPassword } = require('./lib/auth');
const crypto = require('crypto');

const isPg = !!process.env.DATABASE_URL;
const P = (n) => (isPg ? `$${n}` : '?');
const SLUG = 'demo';
const ADMIN_USER = 'demo';
const ADMIN_PASS = 'demo1234';

function token(len = 10) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.randomBytes(len);
  let s = ''; for (let i = 0; i < len; i++) s += a[b[i] % a.length];
  return s;
}
const rid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const rnd = (min, max) => Math.round(min + Math.random() * (max - min));

const CATEGORIES = [
  { id: 'demo-starters', tr: 'Başlangıçlar', en: 'Starters' },
  { id: 'demo-mains', tr: 'Ana Yemekler', en: 'Main Courses' },
  { id: 'demo-drinks', tr: 'İçecekler', en: 'Drinks' },
  { id: 'demo-desserts', tr: 'Tatlılar', en: 'Desserts' }
];
const PRODUCTS = [
  ['demo-p1', 'Mercimek Çorbası', 'Lentil Soup', 'demo-starters', 40, 80],
  ['demo-p2', 'Humus Tabağı', 'Hummus Plate', 'demo-starters', 70, 130],
  ['demo-p3', 'Sezar Salata', 'Caesar Salad', 'demo-starters', 90, 160],
  ['demo-p4', 'Demo Burger', 'Demo Burger', 'demo-mains', 160, 300],
  ['demo-p5', 'Izgara Köfte', 'Grilled Meatballs', 'demo-mains', 180, 320],
  ['demo-p6', 'Tavuk Şiş', 'Chicken Skewer', 'demo-mains', 170, 300],
  ['demo-p7', 'Margherita Pizza', 'Margherita Pizza', 'demo-mains', 150, 280],
  ['demo-p8', 'Ayran', 'Ayran', 'demo-drinks', 20, 45],
  ['demo-p9', 'Limonata', 'Lemonade', 'demo-drinks', 30, 70],
  ['demo-p10', 'Künefe', 'Kunefe', 'demo-desserts', 90, 170],
  ['demo-p11', 'Sütlaç', 'Rice Pudding', 'demo-desserts', 60, 120]
];

async function wipeDemo() {
  await db.run(
    isPg ? 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id=$1)'
         : 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id=?)', [SLUG]);
  for (const t of ['orders', 'products', 'categories', 'translations', 'reservations',
                   'subscriptions', 'notifications', 'tables', 'service_requests', 'admin_users']) {
    await db.run(`DELETE FROM ${t} WHERE tenant_id=${P(1)}`, [SLUG]);
  }
  await db.run(`DELETE FROM tenants WHERE id=${P(1)}`, [SLUG]);
}

async function seed() {
  await initDatabase();

  const force = process.argv.includes('--force');
  const existing = await db.get(`SELECT id FROM tenants WHERE id=${P(1)}`, [SLUG]);
  if (existing && !force) {
    console.log(`[SEED] '${SLUG}' tenant already exists. Use --force to reseed.`);
    console.log(`[SEED] Login: ${ADMIN_USER} / ${ADMIN_PASS}  →  http://localhost:12000/?tenant=${SLUG}`);
    return;
  }
  if (existing) { console.log(`[SEED] --force: wiping '${SLUG}'...`); await wipeDemo(); }

  const now = Date.now();
  const settings = JSON.stringify({
    logo_url: '/icons/placeholder-logo.svg',
    company_name: 'Demo Restaurant',
    hero_title_tr: 'Demo<br><em>Restoran</em>', hero_title_en: 'Demo<br><em>Restaurant</em>',
    hero_sub_tr: 'Tüm özellikleri test etmek için hazır demo restoran.',
    hero_sub_en: 'A demo restaurant ready to test every feature.',
    footer_text: 'Demo Restaurant', seo_title: 'Demo Restaurant | HASACA',
    seo_description: 'Demo restaurant for local development.'
  });
  await db.run(
    `INSERT INTO tenants (id,name,display_name,status,contact_phone,contact_email,address,settings,created_at,updated_at)
     VALUES (${P(1)},${P(2)},${P(3)},'active',${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)})`,
    [SLUG, 'Demo Restaurant', 'Demo Restaurant', '0212 000 00 00', 'demo@example.com', 'Demo Cd. No:1, İstanbul', settings, now, now]
  );

  // Admin account
  await db.run(
    `INSERT INTO admin_users (id,tenant_id,username,password_hash,role,display_name,created_at)
     VALUES (${P(1)},${P(2)},${P(3)},${P(4)},'tenant_admin',${P(5)},${P(6)})`,
    [rid('user'), SLUG, ADMIN_USER, hashPassword(ADMIN_PASS), 'Demo Admin', now]
  );

  // Base translations copied from default so the demo site is fully bilingual
  const base = await db.all(`SELECT key,tr,en FROM translations WHERE tenant_id=${P(1)}`, ['default']);
  let ti = 1;
  for (const r of base) {
    await db.run(`INSERT INTO translations (id,tenant_id,key,tr,en) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)})`,
      [`trans-${SLUG}-${ti++}`, SLUG, r.key, r.tr, r.en]);
  }

  // Categories
  let so = 1;
  for (const c of CATEGORIES) {
    await db.run(`INSERT INTO categories (id,tenant_id,name_tr,name_en,sort_order,icon) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},'')`,
      [c.id, SLUG, c.tr, c.en, so++]);
  }

  // Products
  const priceOf = {};
  let pi = 1;
  for (const [id, tr, en, cat, mn, mx] of PRODUCTS) {
    const price = rnd(mn, mx); priceOf[id] = { price, name: tr };
    const img = `/icons/placeholder-dish-${((pi++ - 1) % 4) + 1}.svg`;
    await db.run(
      `INSERT INTO products (id,tenant_id,name_tr,name_en,description_tr,description_en,category,price,image,
        portion_tr,portion_en,ingredients_tr,ingredients_en,calories,protein,carbs,fat,saturated_fat,sugars,fiber,salt,allergens,katki_maddesi_icermez)
       VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},'1 Porsiyon','1 Portion','','',0,0,0,0,0,0,0,0,'[]',0)`,
      [id, SLUG, tr, en, 'Demo ürün açıklaması.', 'Demo product description.', cat, price, img]
    );
  }

  // Tables (with permanent QR tokens)
  const tables = [];
  for (let i = 1; i <= 5; i++) {
    const id = rid('table'); const tok = token();
    tables.push({ id, tok, name: `Masa ${i}` });
    await db.run(`INSERT INTO tables (id,tenant_id,token,name,description,sort_order,active,created_at) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},'',${P(5)},1,${P(6)})`,
      [id, SLUG, tok, `Masa ${i}`, i, now]);
  }

  // Reservations
  await db.run(`INSERT INTO reservations (id,tenant_id,customer_name,phone,date,time,people,note,status,created_at,updated_at) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},'pending',${P(9)},${P(10)})`,
    [rid('rez'), SLUG, 'Ahmet Demir', '0555 111 22 33', '5 Ağustos 2026', '19:30', 4, 'Pencere kenarı', now, now]);
  await db.run(`INSERT INTO reservations (id,tenant_id,customer_name,phone,date,time,people,note,status,created_at,updated_at) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},'pending',${P(9)},${P(10)})`,
    [rid('rez'), SLUG, 'Zeynep Kaya', '0555 444 55 66', '6 Ağustos 2026', '20:00', 2, '', now - 3600000, now]);

  // Helper to insert an order + items
  async function makeOrder({ type, items, name, phone, address, table, status, notes }) {
    const oid = rid('order');
    let subtotal = 0;
    const resolved = items.map(([pid, qty]) => {
      const p = priceOf[pid]; const line = Math.round(p.price * qty * 100) / 100; subtotal += line;
      return { id: rid('oi'), pid, name: p.name, price: p.price, qty, line };
    });
    subtotal = Math.round(subtotal * 100) / 100;
    await db.run(
      `INSERT INTO orders (id,tenant_id,customer_name,phone,address,address_detail,address_notes,order_notes,payment_method,subtotal,tax,delivery_fee,total,status,order_type,table_id,table_name,archived,created_at,updated_at)
       VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},'','',${P(6)},'cash',${P(7)},0,0,${P(8)},${P(9)},${P(10)},${P(11)},${P(12)},0,${P(13)},${P(14)})`,
      [oid, SLUG, name || 'Masa Müşterisi', phone || '', address || '', notes || '', subtotal, subtotal, status, type,
       table ? table.id : null, table ? table.name : null, now, now]
    );
    for (const it of resolved) {
      await db.run(`INSERT INTO order_items (id,order_id,tenant_id,product_id,product_name,unit_price,quantity,line_total) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)})`,
        [it.id, oid, SLUG, it.pid, it.name, it.price, it.qty, it.line]);
    }
  }

  // Delivery orders
  await makeOrder({ type: 'delivery', name: 'Mehmet Yıldız', phone: '0532 100 20 30', address: 'Bağdat Cd. No:12 D:4, Kadıköy', status: 'new', items: [['demo-p4', 2], ['demo-p8', 2]] });
  await makeOrder({ type: 'delivery', name: 'Elif Şahin', phone: '0533 200 30 40', address: 'İstiklal Cd. No:5, Beyoğlu', status: 'read', notes: 'Kapıda kart', items: [['demo-p7', 1], ['demo-p9', 1], ['demo-p10', 1]] });

  // Table (dine-in) orders in different statuses
  await makeOrder({ type: 'dinein', table: tables[0], status: 'received', notes: 'Az tuzlu', items: [['demo-p5', 1], ['demo-p8', 2]] });
  await makeOrder({ type: 'dinein', table: tables[2], status: 'preparing', items: [['demo-p1', 2], ['demo-p6', 1], ['demo-p11', 2]] });

  // One open service request
  await db.run(`INSERT INTO service_requests (id,tenant_id,table_id,type,status,created_at) VALUES (${P(1)},${P(2)},${P(3)},'waiter','open',${P(4)})`,
    [rid('svc'), SLUG, tables[1].id, now]);

  console.log('==================================================');
  console.log(`[SEED] Demo tenant '${SLUG}' seeded successfully.`);
  console.log(`[SEED]   Site:  http://localhost:12000/?tenant=${SLUG}`);
  console.log(`[SEED]   Admin: http://localhost:12000/admin.html?tenant=${SLUG}`);
  console.log(`[SEED]   Login: ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`[SEED]   ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${tables.length} tables, 2 reservations, 2 delivery + 2 table orders.`);
  console.log(`[SEED]   Scan a table QR from the admin panel to try dine-in ordering.`);
  console.log('==================================================');
}

seed().then(() => process.exit(0)).catch(err => { console.error('[SEED] Failed:', err); process.exit(1); });
