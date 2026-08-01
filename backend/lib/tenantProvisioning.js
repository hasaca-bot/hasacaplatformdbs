// =============================================
// HASACA Platform — shared tenant auto-provisioning
// Every new tenant is a CLONE of the `default` master template — its categories,
// products, translations and settings — so the template is the single source of
// truth and any edits the owner makes to `default` flow into future tenants.
// Used by BOTH Root's manual "create tenant" form (routes/root.js) and the
// Google Sign-In self-signup flow (server.js) — one tested code path, not two.
// =============================================

const crypto = require('crypto');

const RESERVED_SLUGS = ['www', 'api', 'root', 'admin', 'app', 'mail', 'ftp', 'static', 'cdn', 'localhost', 'default'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

function safeParse(json) {
  try { return JSON.parse(json || '{}') || {}; } catch (e) { return {}; }
}

// 10-char base62 token — permanent per table, never derived from the table number
function generateTableToken() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Derives a URL-legal slug candidate from a free-text seed (e.g. a Google account's first name
// or the local part of its email). The caller is responsible for appending -2, -3, ... on
// collision — this only produces the base candidate.
function generateSlugCandidate(seed) {
  let base = String(seed || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents/Turkish diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  if (!base || !SLUG_RE.test(base)) base = 'restoran';
  return base;
}

module.exports = function createTenantProvisioner({ db, isPg, hashPassword, generatePassword }) {
  const P = (n) => (isPg ? `$${n}` : '?');
  const tpl = require('../masterTemplate');

  // adminOverride (optional): when provided, the tenant's admin_users row is created from it
  // instead of generating a random password — used by the Google Sign-In signup path, whose
  // account has no password at all (Google-only login). Shape:
  // { username, password_hash, email, google_sub, avatar_url, display_name }
  async function createTenantWithDemoContent({ slug, name, display_name, body, adminOverride }) {
    const now = Date.now();
    const settings = tpl.defaultSettings(display_name || name);

    await db.run(
      `INSERT INTO tenants (id, name, display_name, status, contact_phone, contact_email, address, settings, created_at, updated_at)
       VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)})`,
      [slug, name, display_name, 'active',
       (body && body.contact_phone) || '123456789',
       (body && body.contact_email) || 'example@email.com',
       (body && body.address) || 'Example Address',
       JSON.stringify(settings), now, now]
    );

    // 1) Clone UI translations from the default template
    const baseTranslations = await db.all(
      `SELECT key, tr, en FROM translations WHERE tenant_id = ${P(1)}`, ['default']
    );
    let i = 1;
    for (const row of baseTranslations) {
      await db.run(
        `INSERT INTO translations (id, tenant_id, key, tr, en) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)})`,
        [`trans-${slug}-${i++}`, slug, row.key, row.tr, row.en]
      );
    }

    // 2) Clone categories (ids remapped per-tenant)
    const baseCats = await db.all(
      `SELECT * FROM categories WHERE tenant_id = ${P(1)} ORDER BY sort_order ASC`, ['default']
    );
    const catIdMap = {};
    let sort = 1;
    for (const c of baseCats) {
      const newId = `${c.id}-${slug}`;
      catIdMap[c.id] = newId;
      await db.run(
        `INSERT INTO categories (id, tenant_id, name_tr, name_en, sort_order, icon) VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)})`,
        [newId, slug, c.name_tr, c.name_en, sort++, c.icon || '']
      );
    }

    // 3) Clone products (ids + category remapped; images/prices/nutrition preserved)
    const baseProducts = await db.all(
      `SELECT * FROM products WHERE tenant_id = ${P(1)}`, ['default']
    );
    for (const pr of baseProducts) {
      const newId = `${pr.id}-${slug}`;
      const category = catIdMap[pr.category] || pr.category;
      await db.run(
        `INSERT INTO products (id, tenant_id, name_tr, name_en, description_tr, description_en, category, price, image,
          portion_tr, portion_en, ingredients_tr, ingredients_en, calories, protein, carbs, fat,
          saturated_fat, sugars, fiber, salt, allergens, katki_maddesi_icermez)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)},${P(11)},${P(12)},${P(13)},${P(14)},${P(15)},${P(16)},${P(17)},${P(18)},${P(19)},${P(20)},${P(21)},${P(22)},${P(23)})`,
        [newId, slug, pr.name_tr, pr.name_en, pr.description_tr, pr.description_en, category, pr.price, pr.image,
         pr.portion_tr, pr.portion_en, pr.ingredients_tr, pr.ingredients_en, pr.calories, pr.protein, pr.carbs, pr.fat,
         pr.saturated_fat, pr.sugars, pr.fiber, pr.salt, pr.allergens || '[]', pr.katki_maddesi_icermez || 0]
      );
    }

    // 4) Starter tables with permanent QR tokens (QR Table Ordering ready out of the box)
    const tables = [];
    for (let t = 1; t <= 3; t++) {
      const tableId = `table-${slug}-${now}-${t}`;
      const token = generateTableToken();
      await db.run(
        `INSERT INTO tables (id, tenant_id, token, name, description, sort_order, active, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},1,${P(7)})`,
        [tableId, slug, token, `Masa ${t}`, '', t, now]
      );
      tables.push({ id: tableId, token, name: `Masa ${t}` });
    }

    // 5) Tenant admin account — either Google-linked (adminOverride) or a fresh random password
    // returned ONCE in this response (Root's manual creation flow, unchanged behavior).
    let adminPassword = null;
    if (adminOverride) {
      await db.run(
        `INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, email, google_sub, avatar_url, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)},${P(8)},${P(9)},${P(10)})`,
        [`user-${slug}-${now}`, slug, adminOverride.username, adminOverride.password_hash, 'tenant_admin',
         adminOverride.display_name, adminOverride.email || '', adminOverride.google_sub || '', adminOverride.avatar_url || '', now]
      );
    } else {
      adminPassword = generatePassword();
      await db.run(
        `INSERT INTO admin_users (id, tenant_id, username, password_hash, role, display_name, created_at)
         VALUES (${P(1)},${P(2)},${P(3)},${P(4)},${P(5)},${P(6)},${P(7)})`,
        [`user-${slug}-${now}`, slug, slug, hashPassword(adminPassword), 'tenant_admin', display_name + ' Admin', now]
      );
    }

    const tenant = await db.get(`SELECT * FROM tenants WHERE id = ${P(1)}`, [slug]);
    return {
      tenant: { ...tenant, settings: safeParse(tenant.settings) },
      admin: adminOverride
        ? { username: adminOverride.username, email: adminOverride.email }
        : { username: slug, password: adminPassword },
      tables,
      seeded: {
        translations: baseTranslations.length,
        categories: baseCats.length,
        products: baseProducts.length,
        tables: tables.length
      }
    };
  }

  return { createTenantWithDemoContent, generateSlugCandidate, RESERVED_SLUGS, SLUG_RE };
};

// Also exposed as a static property (not just via the factory) — routes/tables.js requires this
// directly (`require('../routes/root').generateTableToken`), and root.js re-exports it from here
// to preserve that existing contract without any change needed in tables.js.
module.exports.generateTableToken = generateTableToken;
module.exports.RESERVED_SLUGS = RESERVED_SLUGS;
module.exports.SLUG_RE = SLUG_RE;
module.exports.generateSlugCandidate = generateSlugCandidate;
