/** Signed HttpOnly cookie for server-side portal route protection (Edge Functions). */
const crypto = require('crypto');

const COOKIE_NAME = 'hro_portal';
const COOKIE_VERSION = 'v1';

function getSecret() {
  return (
    process.env.PORTAL_SESSION_SECRET ||
    process.env.ALTCHA_HMAC_KEY ||
    'PLACEHOLDER-DO-N-USE-IN-PRODUCTION'
  );
}

function signPortalCookie(role, expiresInSec = 60 * 60 * 12) {
  const r = role === 'technician' ? 't' : 'a';
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSec);
  const payload = Buffer.from(JSON.stringify({ r, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(`${COOKIE_VERSION}.${payload}`).digest('base64url');
  return `${COOKIE_VERSION}.${payload}.${sig}`;
}

function verifyPortalCookie(value) {
  if (!value || typeof value !== 'string') return { ok: false };
  const secret = getSecret();
  if (secret.startsWith('PLACEHOLDER')) return { ok: false };

  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return { ok: false };

  const [, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(`${COOKIE_VERSION}.${payload}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false };
  }

  if (!data?.exp || data.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false };
  }

  const role = data.r === 't' ? 'technician' : 'admin';
  return { ok: true, role };
}

function cookieHeader(value, maxAgeSec) {
  const secure = process.env.CONTEXT === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function clearCookieHeader() {
  const secure = process.env.CONTEXT === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

module.exports = {
  COOKIE_NAME,
  signPortalCookie,
  verifyPortalCookie,
  cookieHeader,
  clearCookieHeader,
};
