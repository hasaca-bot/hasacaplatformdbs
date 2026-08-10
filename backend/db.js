// =============================================
// Dayı Katık — Dual Database Layer
// Automatically uses PostgreSQL (cloud) or SQLite (local)
// based on DATABASE_URL environment variable
// =============================================

const path = require('path');
const fs = require('fs');

// ── DATABASE DRIVER SELECTION ──
const DATABASE_URL = process.env.DATABASE_URL;
let dbDriver;

if (DATABASE_URL) {
  // ── POSTGRESQL MODE (Cloud / Production) ──
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  dbDriver = {
    type: 'pg',
    
    query(sql, params = []) {
      return pool.query(sql, params);
    },
    
    async all(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    
    async get(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },
    
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return { changes: result.rowCount };
    },
    
    async exec(sql) {
      await pool.query(sql);
    }
  };

  console.log('[DB] Using PostgreSQL (cloud mode)');
} else {
  // ── SQLITE MODE (Local Development) ──
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'dayikatik.db');
  const sqliteDb = new DatabaseSync(dbPath);

  dbDriver = {
    type: 'sqlite',
    
    async all(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      return stmt.all(...params);
    },
    
    async get(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      return stmt.get(...params) || null;
    },
    
    async run(sql, params = []) {
      const pgSql = sqliteToPgRevert(sql);
      const stmt = sqliteDb.prepare(pgSql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },
    
    async exec(sql) {
      // Convert PG syntax back to SQLite where needed
      const pgSql = sqliteToPgRevert(sql);
      sqliteDb.exec(pgSql);
    }
  };

  // Convert PostgreSQL $1,$2 params back to ? for SQLite
  function sqliteToPgRevert(sql) {
    return sql.replace(/\$(\d+)/g, '?');
  }

  console.log(`[DB] Using SQLite (local mode) at: ${path.join(__dirname, 'dayikatik.db')}`);
}

// ── MIGRATIONS ──
async function runMigrations() {
  console.log('[DB] Running migrations...');

  if (dbDriver.type === 'pg') {
    // PostgreSQL DDL
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        description_tr TEXT,
        description_en TEXT,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        image TEXT,
        portion_tr TEXT,
        portion_en TEXT,
        ingredients_tr TEXT,
        ingredients_en TEXT,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        saturated_fat REAL DEFAULT 0,
        sugars REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        allergens TEXT,
        katki_maddesi_icermez INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        sort_order INTEGER DEFAULT 0,
        icon TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        people INTEGER NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT,
        updated_at BIGINT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        tr TEXT,
        en TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT,
        icon TEXT,
        url TEXT,
        target TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TEXT,
        sent_at TEXT,
        status TEXT DEFAULT 'pending',
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_by TEXT,
        priority TEXT DEFAULT 'normal',
        ttl INTEGER DEFAULT 24,
        tag TEXT,
        collapse_key TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token TEXT NOT NULL UNIQUE,
        device TEXT,
        browser TEXT,
        platform TEXT,
        language TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        enabled INTEGER DEFAULT 1
      );
    `);

    // ── ORDERS (food ordering system) ──
    // tenant_id defaults to 'default' for the current single-restaurant setup, and is
    // ready for future subdomain-based multi-tenancy (restaurant1.example.com -> 'restaurant1').
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        address_detail TEXT,
        address_notes TEXT,
        order_notes TEXT,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        subtotal REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        delivery_fee REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        created_at BIGINT,
        updated_at BIGINT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        product_id TEXT,
        product_name TEXT NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        line_total REAL NOT NULL DEFAULT 0
      );
    `);

    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);`);
    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
  } else {
    // SQLite DDL (same as original)
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        description_tr TEXT,
        description_en TEXT,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        image TEXT,
        portion_tr TEXT,
        portion_en TEXT,
        ingredients_tr TEXT,
        ingredients_en TEXT,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        saturated_fat REAL DEFAULT 0,
        sugars REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        allergens TEXT,
        katki_maddesi_icermez INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name_tr TEXT NOT NULL,
        name_en TEXT,
        sort_order INTEGER DEFAULT 0,
        icon TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        people INTEGER NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER,
        updated_at INTEGER
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        tr TEXT,
        en TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image TEXT,
        icon TEXT,
        url TEXT,
        target TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        scheduled_at TEXT,
        sent_at TEXT,
        status TEXT DEFAULT 'pending',
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_by TEXT,
        priority TEXT DEFAULT 'normal',
        ttl INTEGER DEFAULT 24,
        tag TEXT,
        collapse_key TEXT
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        token TEXT NOT NULL UNIQUE,
        device TEXT,
        browser TEXT,
        platform TEXT,
        language TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
        enabled INTEGER DEFAULT 1
      );
    `);

    // ── ORDERS (food ordering system) ──
    // tenant_id defaults to 'default' for the current single-restaurant setup, and is
    // ready for future subdomain-based multi-tenancy (restaurant1.example.com -> 'restaurant1').
    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        address_detail TEXT,
        address_notes TEXT,
        order_notes TEXT,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        subtotal REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        delivery_fee REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        created_at INTEGER,
        updated_at INTEGER
      );
    `);

    await dbDriver.exec(`
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        product_id TEXT,
        product_name TEXT NOT NULL,
        unit_price REAL NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        line_total REAL NOT NULL DEFAULT 0
      );
    `);

    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);`);
    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
  }

  await runPlatformMigrations();

  console.log('[DB] Migrations completed successfully.');
}

// ── PLATFORM MIGRATIONS (multi-tenant foundation) ──
// Idempotent: safe to run on every boot, on both PostgreSQL and SQLite.

async function columnExists(table, column) {
  if (dbDriver.type === 'pg') {
    const row = await dbDriver.get(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      [table, column]
    );
    return !!row;
  }
  const rows = await dbDriver.all(`PRAGMA table_info(${table})`);
  return rows.some(r => r.name === column);
}

async function ensureColumn(table, column, ddl) {
  if (!(await columnExists(table, column))) {
    await dbDriver.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`[DB] Migration: added column ${table}.${column}`);
  }
}

async function runPlatformMigrations() {
  // 1) New platform tables (portable DDL — valid on both dialects)
  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      contact_phone TEXT,
      contact_email TEXT,
      address TEXT,
      settings TEXT DEFAULT '{}',
      created_at BIGINT,
      updated_at BIGINT
    );
  `);

  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'tenant_admin',
      display_name TEXT,
      created_at BIGINT,
      last_login BIGINT
    );
  `);

  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      token TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT
    );
  `);

  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT 'default',
      table_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at BIGINT,
      resolved_at BIGINT
    );
  `);

  // Activity log (audit trail) — tenant_id '' means a platform/root-level action.
  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      actor TEXT,
      role TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ip TEXT,
      created_at BIGINT
    );
  `);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id);`);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);`);

  // Landing / marketing-site contact leads (public inbox → Root Panel). Platform-level, no tenant.
  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS landing_messages (
      id TEXT PRIMARY KEY,
      name TEXT,
      restaurant TEXT,
      email TEXT,
      phone TEXT,
      country TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      ip TEXT,
      created_at BIGINT
    );
  `);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_landing_status ON landing_messages(status);`);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_landing_created ON landing_messages(created_at);`);

  await dbDriver.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_tenant_username ON admin_users(tenant_id, username);`);
  await dbDriver.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_token ON tables(token);`);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_tables_tenant ON tables(tenant_id);`);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON service_requests(tenant_id);`);

  // 2) tenant_id on existing single-tenant tables (existing rows -> 'default')
  for (const table of ['products', 'categories', 'reservations', 'subscriptions', 'notifications']) {
    await ensureColumn(table, 'tenant_id', "TEXT NOT NULL DEFAULT 'default'");
    await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id);`);
  }

  // 3) translations: key was globally UNIQUE; must become UNIQUE(tenant_id, key)
  if (!(await columnExists('translations', 'tenant_id'))) {
    if (dbDriver.type === 'pg') {
      await dbDriver.exec(`ALTER TABLE translations ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';`);
      await dbDriver.exec(`ALTER TABLE translations DROP CONSTRAINT IF EXISTS translations_key_key;`);
    } else {
      // SQLite cannot drop a UNIQUE constraint -> rebuild the table without it
      await dbDriver.exec(`
        CREATE TABLE translations_new (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          tr TEXT,
          en TEXT
        );
      `);
      await dbDriver.exec(`INSERT INTO translations_new (id, tenant_id, key, tr, en) SELECT id, 'default', key, tr, en FROM translations;`);
      await dbDriver.exec(`DROP TABLE translations;`);
      await dbDriver.exec(`ALTER TABLE translations_new RENAME TO translations;`);
    }
    console.log('[DB] Migration: translations table is now tenant-scoped (UNIQUE(tenant_id, key)).');
  }
  await dbDriver.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_tenant_key ON translations(tenant_id, key);`);

  // 4) orders: dine-in (QR table ordering) extensions
  await ensureColumn('orders', 'order_type', "TEXT NOT NULL DEFAULT 'delivery'");
  await ensureColumn('orders', 'table_id', 'TEXT');
  await ensureColumn('orders', 'table_name', 'TEXT');
  await ensureColumn('orders', 'archived', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('orders', 'archived_at', 'BIGINT');

  // 5) platform-level settings (root-controlled global branding + AI non-secret config)
  await dbDriver.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id TEXT PRIMARY KEY,
      settings TEXT DEFAULT '{}',
      updated_at BIGINT
    );
  `);

  // 6) Google Sign-In identity fields on admin_users (additive; existing password-only rows keep
  // these NULL). google_sub was originally globally UNIQUE (one Google account, one tenant ever) —
  // multi-restaurant ownership now allows the same Google account to be linked to several tenants
  // (one admin_users row per tenant), so the old unique index is dropped and replaced with a plain
  // lookup index. The lookup pattern itself (WHERE google_sub = ?) is unchanged, just returns 0-N rows.
  await ensureColumn('admin_users', 'email', 'TEXT');
  await ensureColumn('admin_users', 'google_sub', 'TEXT');
  await ensureColumn('admin_users', 'avatar_url', 'TEXT');
  await dbDriver.exec(`DROP INDEX IF EXISTS idx_admin_users_google_sub;`);
  await dbDriver.exec(`CREATE INDEX IF NOT EXISTS idx_admin_users_google_sub ON admin_users(google_sub);`);

  // 7) Menu-content languages beyond tr/en. Unlike name_en/description_en (which fall back to
  // the tr value when blank), these are left NULL/empty when untranslated on purpose — the AI
  // assistant's bulk-translate feature needs a reliable way to tell "not yet translated" apart
  // from "translated, and it happens to match the Turkish text". Categories have no description
  // field at all (not even tr/en today), so only name_XX is added for them.
  for (const lang of ['zh', 'ja', 'de', 'fr', 'es', 'ko']) {
    await ensureColumn('products', `name_${lang}`, 'TEXT');
    await ensureColumn('products', `description_${lang}`, 'TEXT');
    await ensureColumn('products', `portion_${lang}`, 'TEXT');
    await ensureColumn('products', `ingredients_${lang}`, 'TEXT');
    await ensureColumn('categories', `name_${lang}`, 'TEXT');
  }
}

// Seed the master-template menu (generic "My Restaurant" demo) into a tenant.
// Used for the default tenant's factory content and for the one-time rebrand.
async function seedTemplateMenu(tenantId) {
  const tpl = require('./masterTemplate');
  const isPg = dbDriver.type === 'pg';
  let sort = 1;
  for (const cat of tpl.CATEGORIES) {
    // category id is a global PRIMARY KEY -> always tenant-suffix to avoid cross-tenant collisions
    const id = `${cat.id}-${tenantId}`;
    if (isPg) {
      await dbDriver.run(
        'INSERT INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING',
        [id, tenantId, cat.name_tr, cat.name_en, sort++, '']
      );
    } else {
      await dbDriver.run(
        'INSERT OR IGNORE INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES (?,?,?,?,?,?)',
        [id, tenantId, cat.name_tr, cat.name_en, sort++, '']
      );
    }
  }
  let imgIdx = 1;
  for (const [pid, nameTr, nameEn, cat, mn, mx] of tpl.PRODUCTS) {
    const id = `${pid}-${tenantId}`;
    const categoryId = `${cat}-${tenantId}`;
    const price = tpl.randomPrice(mn, mx);
    const image = tpl.dishImage(imgIdx++);
    const cols = `id, tenant_id, name_tr, name_en, description_tr, description_en, category, price, image,
      portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
      saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez`;
    const vals = [id, tenantId, nameTr, nameEn, tpl.DESC_TR, tpl.DESC_EN, categoryId, price, image,
      '1 Porsiyon', '1 Portion', '', '', 0, 0, 0, 0, 0, 0, 0, 0, '[]', 0];
    if (isPg) {
      await dbDriver.run(`INSERT INTO products (${cols}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT (id) DO NOTHING`, vals);
    } else {
      await dbDriver.run(`INSERT OR IGNORE INTO products (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, vals);
    }
  }
}

// ── SEEDS ──
async function runSeeds() {
  const { i18nData } = require('./seedData');

  // Categories + products for the default tenant come from the master template.
  const catRow = await dbDriver.get(
    dbDriver.type === 'pg'
      ? "SELECT COUNT(*)::int as count FROM categories WHERE tenant_id = 'default'"
      : "SELECT COUNT(*) as count FROM categories WHERE tenant_id = 'default'"
  );
  const categoryCount = catRow ? parseInt(catRow.count) : 0;

  if (categoryCount === 0) {
    console.log('[DB] Seeding master-template menu for default tenant...');
    await seedTemplateMenu('default');
    console.log('[DB] Seeded master-template categories + products.');
  } else {
    console.log(`[DB] Skipping menu seed. Existing category count: ${categoryCount}`);
  }

  // Check translations (scoped to the default tenant)
  const transRow = await dbDriver.get(
    dbDriver.type === 'pg'
      ? "SELECT COUNT(*)::int as count FROM translations WHERE tenant_id = 'default'"
      : "SELECT COUNT(*) as count FROM translations WHERE tenant_id = 'default'"
  );
  const transCount = transRow ? parseInt(transRow.count) : 0;

  if (transCount === 0) {
    console.log('[DB] Seeding static UI translations... (Table is empty)');
    let index = 1;
    const trKeys = Object.keys(i18nData.tr);
    for (const key of trKeys) {
      const trVal = i18nData.tr[key];
      const enVal = i18nData.en[key] || trVal;
      if (dbDriver.type === 'pg') {
        await dbDriver.run(
          "INSERT INTO translations (id, tenant_id, key, tr, en) VALUES ($1, 'default', $2, $3, $4) ON CONFLICT (tenant_id, key) DO NOTHING",
          [`trans-${index++}`, key, trVal, enVal]
        );
      } else {
        await dbDriver.run(
          "INSERT OR IGNORE INTO translations (id, tenant_id, key, tr, en) VALUES (?, 'default', ?, ?, ?)",
          [`trans-${index++}`, key, trVal, enVal]
        );
      }
    }
    console.log(`[DB] Seeded ${trKeys.length} UI translations successfully.`);
  } else {
    console.log(`[DB] Skipping translations seed. Existing count: ${transCount}`);
  }

  // Products for the default tenant are seeded together with categories above (master template).
}

// ── PLATFORM SEEDS (default tenant + root/admin accounts) ──
async function seedPlatform() {
  const { hashPassword, generatePassword } = require('./lib/auth');
  const isPg = dbDriver.type === 'pg';
  const now = Date.now();

  const tpl = require('./masterTemplate');
  const p1 = isPg ? '$1' : '?';

  // Platform settings row (root-controlled global branding + AI non-secret config)
  const platformRow = await dbDriver.get(`SELECT settings FROM platform_settings WHERE id = ${p1}`, ['platform']);
  let platform = {};
  try { platform = platformRow ? JSON.parse(platformRow.settings || '{}') : {}; } catch (e) {}
  if (!platformRow) {
    platform = {
      platform_name: 'HASACA',
      logo_url: '/icons/placeholder-logo.svg',
      favicon_url: '/icons/favicon.svg',
      login_logo_url: '/icons/placeholder-logo.svg',
      landing_title: 'HASACA',
      landing_subtitle: 'Restaurant Platform',
      footer_brand: 'HASACA',
      ai_enabled: false,
      ai_provider: 'groq',
      ai_model: 'llama-3.3-70b-versatile'
    };
    await dbDriver.run(
      isPg ? 'INSERT INTO platform_settings (id, settings, updated_at) VALUES ($1,$2,$3)' : 'INSERT INTO platform_settings (id, settings, updated_at) VALUES (?,?,?)',
      ['platform', JSON.stringify(platform), now]
    );
    console.log('[DB] Seeded platform_settings (generic HASACA branding).');
  }

  // Default tenant = the generic "My Restaurant" master template.
  const existingTenant = await dbDriver.get(
    isPg ? 'SELECT id FROM tenants WHERE id = $1' : 'SELECT id FROM tenants WHERE id = ?',
    ['default']
  );
  const defaultSettings = JSON.stringify(tpl.defaultSettings('My Restaurant'));
  if (!existingTenant) {
    await dbDriver.run(
      isPg
        ? 'INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'
        : 'INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ['default', 'My Restaurant', 'My Restaurant', 'active', '123456789', 'example@email.com',
       'Example Address', defaultSettings, now, now]
    );
    console.log('[DB] Seeded default tenant (My Restaurant master template).');
  }

  // ── ONE-TIME REBRAND: convert a legacy Dayı Katık `default` tenant into the generic template ──
  if (platform.default_template_applied !== '1') {
    console.log('[DB] Applying white-label master template to the default tenant...');
    // Reset default's menu to the master template
    await dbDriver.run(`DELETE FROM products WHERE tenant_id = ${p1}`, ['default']);
    await dbDriver.run(`DELETE FROM categories WHERE tenant_id = ${p1}`, ['default']);
    await seedTemplateMenu('default');
    // Reset default's branding
    await dbDriver.run(
      isPg ? 'UPDATE tenants SET name=$1, display_name=$2, contact_phone=$3, contact_email=$4, address=$5, settings=$6, updated_at=$7 WHERE id=$8'
           : 'UPDATE tenants SET name=?, display_name=?, contact_phone=?, contact_email=?, address=?, settings=?, updated_at=? WHERE id=?',
      ['My Restaurant', 'My Restaurant', '123456789', 'example@email.com', 'Example Address', defaultSettings, now, 'default']
    );
    // Strip brand text from default's translations (generic UI keys stay intact)
    await dbDriver.exec(`UPDATE translations SET
        tr = REPLACE(REPLACE(tr, 'Dayı Katık Tantuni & Döner', 'My Restaurant'), 'Dayı Katık', 'My Restaurant'),
        en = REPLACE(REPLACE(en, 'Dayi Katik Tantuni & Doner', 'My Restaurant'), 'Dayi Katik', 'My Restaurant')
      WHERE tenant_id = 'default'`);
    platform.default_template_applied = '1';
    await dbDriver.run(
      isPg ? 'UPDATE platform_settings SET settings=$1, updated_at=$2 WHERE id=$3' : 'UPDATE platform_settings SET settings=?, updated_at=? WHERE id=?',
      [JSON.stringify(platform), now, 'platform']
    );
    console.log('[DB] Default tenant is now the generic "My Restaurant" master template.');
  }

  // ── SELF-HEAL: keep the default (master template) tenant's name/display in sync with its branding ──
  // Guards against legacy/stale renames (e.g. a leftover "hasaca") surviving the one-time migration above.
  try {
    const def = await dbDriver.get(
      isPg ? 'SELECT name, display_name, settings FROM tenants WHERE id = $1' : 'SELECT name, display_name, settings FROM tenants WHERE id = ?',
      ['default']
    );
    if (def) {
      let ds = {};
      try { ds = JSON.parse(def.settings || '{}'); } catch (e) {}
      const brand = ds.company_name || 'My Restaurant';
      if (def.name !== brand || def.display_name !== brand) {
        await dbDriver.run(
          isPg ? 'UPDATE tenants SET name=$1, display_name=$2, updated_at=$3 WHERE id=$4' : 'UPDATE tenants SET name=?, display_name=?, updated_at=? WHERE id=?',
          [brand, brand, now, 'default']
        );
        console.log(`[DB] Self-healed default tenant name/display to "${brand}".`);
      }
    }
  } catch (e) { console.warn('[DB] Default-tenant self-heal skipped:', e.message); }

  // Root (platform owner) account — password generated once or overridden via ROOT_PASSWORD
  const rootUser = await dbDriver.get("SELECT id FROM admin_users WHERE role = 'root' LIMIT 1");
  if (!rootUser) {
    const rootPassword = process.env.ROOT_PASSWORD || 'bunudabullan12A';
    await dbDriver.run(
      isPg
        ? 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)'
        : 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?,?,?)',
      [`user-root-${now}`, '', 'root', hashPassword(rootPassword), 'root', 'Platform Owner', now]
    );
    console.log('[DB] Root account created with password:', rootPassword);
  } else if (process.env.ROOT_PASSWORD) {
    const rootPassHash = hashPassword(process.env.ROOT_PASSWORD);
    await dbDriver.run(
      isPg
        ? "UPDATE admin_users SET password_hash = $1 WHERE username = 'root'"
        : "UPDATE admin_users SET password_hash = ? WHERE username = 'root'",
      [rootPassHash]
    );
    console.log('[DB] Root account password updated from ROOT_PASSWORD environment variable.');
  }

  // Default tenant admin — keeps the existing password so the current login keeps working
  const defaultAdmin = await dbDriver.get(
    isPg ? "SELECT id FROM admin_users WHERE tenant_id = $1 AND username = $2" : "SELECT id FROM admin_users WHERE tenant_id = ? AND username = ?",
    ['default', 'dayikatik']
  );
  if (!defaultAdmin) {
    await dbDriver.run(
      isPg
        ? 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)'
        : 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?,?,?)',
      [`user-default-${now}`, 'default', 'dayikatik', hashPassword('dayikatik123'), 'tenant_admin', 'Yönetici', now]
    );
    console.log('[DB] Seeded default tenant admin (dayikatik).');
  }
}

// ── RESET DATABASE (tenant-scoped) ──
async function resetDatabase(tenantId = 'default') {
  const isPg = dbDriver.type === 'pg';
  console.log(`[DB] Resetting menu data for tenant '${tenantId}'...`);
  const p1 = isPg ? '$1' : '?';
  await dbDriver.run(`DELETE FROM products WHERE tenant_id = ${p1}`, [tenantId]);
  await dbDriver.run(`DELETE FROM categories WHERE tenant_id = ${p1}`, [tenantId]);
  await dbDriver.run(`DELETE FROM translations WHERE tenant_id = ${p1}`, [tenantId]);
  if (tenantId === 'default') {
    await runSeeds(); // factory data belongs to the default (Dayı Katık) tenant
  }
  console.log(`[DB] Reset completed for tenant '${tenantId}'.`);
}

// ── DELETE ALL DATA FOR A TENANT ──
// Cascading cleanup shared by regenerateDefaultTenant() (below), Root's own DELETE
// /api/root/tenants/:id, and the tenant self-service DELETE /api/admin/self — one table list to
// keep in sync instead of three copies. Does NOT delete the `tenants` row itself; callers do that
// (regenerateDefaultTenant immediately re-inserts a fresh one, the two API routes just remove it).
async function deleteTenantData(tenantId) {
  const isPg = dbDriver.type === 'pg';
  const p1 = isPg ? '$1' : '?';
  await dbDriver.run(
    isPg ? 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = $1)'
         : 'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id = ?)',
    [tenantId]
  );
  for (const table of ['orders', 'products', 'categories', 'translations', 'reservations',
                       'subscriptions', 'notifications', 'tables', 'service_requests', 'admin_users']) {
    await dbDriver.run(`DELETE FROM ${table} WHERE tenant_id = ${p1}`, [tenantId]);
  }
}

// ── REGENERATE DEFAULT TENANT ──
// Rebuilds a fresh, fully-usable `default` tenant from the master template. Used when the Root user
// deletes the default tenant (or the last remaining tenant) so the platform is never left empty.
// Idempotent: clears any stale `default` rows first, then reseeds tenant + menu + translations + admin.
async function regenerateDefaultTenant() {
  const { hashPassword } = require('./lib/auth');
  const { i18nData } = require('./seedData');
  const tpl = require('./masterTemplate');
  const isPg = dbDriver.type === 'pg';
  const p1 = isPg ? '$1' : '?';
  const now = Date.now();

  console.log('[DB] Regenerating a fresh default tenant from the master template...');

  // Defensive cleanup (safe whether or not `default` currently exists)
  await deleteTenantData('default');
  await dbDriver.run(`DELETE FROM tenants WHERE id = ${p1}`, ['default']);

  // 1) tenant row (generic "My Restaurant" placeholder branding + demo contact)
  const settings = JSON.stringify(tpl.defaultSettings('My Restaurant'));
  await dbDriver.run(
    isPg
      ? 'INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'
      : 'INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ['default', 'My Restaurant', 'My Restaurant', 'active', '123456789', 'example@email.com',
     'Example Address', settings, now, now]
  );

  // 2) demo menu (categories + products) from the master template
  await seedTemplateMenu('default');

  // 3) UI translations from seedData (TR/EN)
  let idx = 1;
  for (const key of Object.keys(i18nData.tr)) {
    const trVal = i18nData.tr[key];
    const enVal = i18nData.en[key] || trVal;
    await dbDriver.run(
      isPg ? "INSERT INTO translations (id, tenant_id, key, tr, en) VALUES ($1, 'default', $2, $3, $4) ON CONFLICT (tenant_id, key) DO NOTHING"
           : "INSERT OR IGNORE INTO translations (id, tenant_id, key, tr, en) VALUES (?, 'default', ?, ?, ?)",
      [`trans-regen-${now}-${idx++}`, key, trVal, enVal]
    );
  }

  // 4) default tenant admin (same known credentials as the seed: dayikatik / dayikatik123)
  await dbDriver.run(
    isPg
      ? 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)'
      : 'INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at) VALUES (?,?,?,?,?,?,?)',
    [`user-default-${now}`, 'default', 'dayikatik', hashPassword('dayikatik123'), 'tenant_admin', 'Restaurant Admin', now]
  );

  console.log('[DB] Fresh default tenant regenerated (My Restaurant master template).');
  return { id: 'default', name: 'My Restaurant' };
}

// ── ACTIVITY LOG ──
// Fire-and-forget audit logging. Never throws (logging must never break the request it records).
// tenant_id '' = a platform/root-level action; a slug = a tenant-scoped action.
async function logActivity({ tenantId = '', actor = '', role = '', action, target = '', details = '', ip = '' } = {}) {
  if (!action) return;
  try {
    const isPg = dbDriver.type === 'pg';
    const id = 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const det = typeof details === 'string' ? details : JSON.stringify(details || '');
    await dbDriver.run(
      isPg
        ? 'INSERT INTO activity_log (id, tenant_id, actor, role, action, target, details, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)'
        : 'INSERT INTO activity_log (id, tenant_id, actor, role, action, target, details, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, tenantId || '', String(actor || '').slice(0, 120), role || '', String(action).slice(0, 60),
       String(target || '').slice(0, 200), det.slice(0, 500), String(ip || '').slice(0, 60), Date.now()]
    );
  } catch (e) { /* swallow — audit logging must never break the caller */ }
}

// ── INIT (async) ──
async function initDatabase() {
  await runMigrations();
  await runSeeds();
  await seedPlatform();
}

module.exports = { db: dbDriver, initDatabase, resetDatabase, regenerateDefaultTenant, deleteTenantData, logActivity };
