// =============================================
// HASACA Platform — Minimal .env loader (no dependency)
// Loads backend/.env (or project-root .env) into process.env
// WITHOUT overwriting variables already set by the real environment.
// Production (Render) sets real env vars, so the file is simply absent there.
// =============================================

const fs = require('fs');
const path = require('path');

function parseEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'),        // backend/.env
    path.join(__dirname, '..', '..', '.env')   // project-root/.env
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
      let applied = 0;
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) { process.env[k] = v; applied++; }
      }
      console.log(`[ENV] Loaded ${applied} variable(s) from ${path.basename(path.dirname(file))}/.env`);
      return;
    } catch (e) {
      console.error('[ENV] Failed to read .env:', e.message);
    }
  }
}

module.exports = { loadEnv };
