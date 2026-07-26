// =============================================
// HASACA Platform — Run migrations (and default seed) then exit.
// Idempotent: safe to run repeatedly. Works on SQLite (local) and
// PostgreSQL (production) exactly the same way.
//   node migrate.js
// =============================================

require('./lib/env').loadEnv();
const { initDatabase } = require('./db');

initDatabase()
  .then(() => { console.log('[MIGRATE] Database is up to date.'); process.exit(0); })
  .catch(err => { console.error('[MIGRATE] Failed:', err); process.exit(1); });
