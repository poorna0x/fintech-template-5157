// Shared ALTCHA verification and short-lived login tokens for secure-auth-login
const crypto = require('crypto');
const nodeCrypto = require('crypto');

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    getRandomValues: (arr) => {
      const bytes = nodeCrypto.randomBytes(arr.length);
      for (let i = 0; i < arr.length; i++) arr[i] = bytes[i];
      return arr;
    },
    subtle: {
      digest: async (algorithm, data) => {
        const hash = nodeCrypto.createHash(algorithm.toLowerCase().replace('-', ''));
        return hash.update(Buffer.from(data)).digest();
      },
    },
  };
}

let verifySolution;
try {
  verifySolution = require('altcha-lib').verifySolution;
} catch {
  verifySolution = null;
}

const HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY';
const LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000;
const BOOKING_LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;
const usedLoginTokens = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, exp] of usedLoginTokens.entries()) {
    if (exp < now) usedLoginTokens.delete(key);
  }
}, 60_000);

function isPlaceholderKey() {
  return HMAC_KEY === 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY';
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(String(payload)).digest('hex');
}

/** Issue a one-time login token after ALTCHA payload is verified. */
function createLoginToken(payload, options = {}) {
  const ttlMs =
    options.purpose === 'booking' ? BOOKING_LOGIN_TOKEN_TTL_MS : LOGIN_TOKEN_TTL_MS;
  const exp = Date.now() + ttlMs;
  const data = JSON.stringify({ h: hashPayload(payload), exp });
  const sig = crypto.createHmac('sha256', HMAC_KEY).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, sig })).toString('base64url');
}

/** Validate login token without consuming (allows retry after wrong password). */
function verifyLoginToken(loginToken, payload) {
  if (!loginToken || typeof loginToken !== 'string') {
    return { ok: false, error: 'Missing login token' };
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(loginToken, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Invalid login token' };
  }

  const { data, sig } = parsed;
  if (!data || !sig) return { ok: false, error: 'Invalid login token format' };

  const expectedSig = crypto.createHmac('sha256', HMAC_KEY).update(data).digest('hex');
  if (sig.length !== expectedSig.length) {
    return { ok: false, error: 'Invalid login token signature' };
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return { ok: false, error: 'Invalid login token signature' };
  }

  let payloadMeta;
  try {
    payloadMeta = JSON.parse(data);
  } catch {
    return { ok: false, error: 'Invalid login token data' };
  }

  if (!payloadMeta.exp || Date.now() > payloadMeta.exp) {
    return { ok: false, error: 'Login token expired' };
  }

  if (payload && hashPayload(payload) !== payloadMeta.h) {
    return { ok: false, error: 'Login token does not match verification' };
  }

  const consumeKey = sig;
  if (usedLoginTokens.has(consumeKey)) {
    return { ok: false, error: 'Login token already used' };
  }

  return { ok: true, consumeKey, exp: payloadMeta.exp };
}

/** Mark login token used after successful authentication. */
function consumeLoginToken(consumeKey, exp) {
  if (consumeKey) {
    usedLoginTokens.set(consumeKey, exp || Date.now() + LOGIN_TOKEN_TTL_MS);
  }
}

async function verifyAltchaPayload(payload) {
  if (!payload || typeof payload !== 'string' || !payload.trim()) {
    return { verified: false, error: 'Missing ALTCHA payload' };
  }
  if (isPlaceholderKey()) {
    return { verified: false, error: 'ALTCHA not configured' };
  }
  if (!verifySolution) {
    return { verified: false, error: 'ALTCHA library unavailable' };
  }

  try {
    const verified = await verifySolution(payload, HMAC_KEY, true);
    if (!verified) {
      return { verified: false, error: 'Invalid ALTCHA solution' };
    }
    return { verified: true, loginToken: createLoginToken(payload) };
  } catch (e) {
    return { verified: false, error: e.message || 'ALTCHA verification failed' };
  }
}

module.exports = {
  HMAC_KEY,
  isPlaceholderKey,
  verifyAltchaPayload,
  createLoginToken,
  verifyLoginToken,
  consumeLoginToken,
};
