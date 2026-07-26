// =============================================
// HASACA Platform — Authentication Library
// Password hashing (crypto.scrypt, no external deps)
// + HMAC-signed session tokens.
// SECRET source: env AUTH_SECRET, or auto-generated
// data/secret.json (same pattern as VAPID keys).
// =============================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── SECRET ──
const secretPath = path.join(__dirname, '..', '..', 'data', 'secret.json');
let SECRET = process.env.AUTH_SECRET || '';

if (!SECRET) {
  try {
    if (fs.existsSync(secretPath)) {
      SECRET = (JSON.parse(fs.readFileSync(secretPath, 'utf8')) || {}).secret || '';
    }
  } catch (e) {
    console.error('[AUTH] Failed to read data/secret.json:', e.message);
  }
}

if (!SECRET) {
  SECRET = crypto.randomBytes(48).toString('base64url');
  try {
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(secretPath, JSON.stringify({ secret: SECRET }, null, 2), 'utf8');
    console.log('[AUTH] Generated new auth secret and saved to data/secret.json');
  } catch (e) {
    console.error('[AUTH] Failed to persist auth secret (tokens will invalidate on restart):', e.message);
  }
}

// ── PASSWORD HASHING (scrypt) ──
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

// Format: scrypt$<N>$<saltHex>$<hashHex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .scryptSync(String(password), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
    .toString('hex');
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
    const n = parseInt(parts[1], 10);
    const salt = parts[2];
    const expected = Buffer.from(parts[3], 'hex');
    const calc = crypto.scryptSync(String(password), salt, expected.length, { N: n, r: SCRYPT_R, p: SCRYPT_P });
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch (e) {
    return false;
  }
}

// ── SESSION TOKENS (HMAC-SHA256 signed JSON) ──
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function signToken(payload, ttlMs = DEFAULT_TTL_MS) {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// Returns the payload object, or null when invalid/expired.
function verifyToken(token) {
  try {
    const [data, sig] = String(token || '').split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Random human-typeable password for generated accounts (root seed, new tenants).
function generatePassword(len = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, generatePassword };
