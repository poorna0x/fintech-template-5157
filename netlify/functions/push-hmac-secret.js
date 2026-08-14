// Shared HMAC material for notification reply / job-start tokens.
//
// Production already has SUPABASE_SERVICE_ROLE_KEY → behavior unchanged.
// Optional PUSH_REPLY_HMAC_SECRET decouples signing from the DB god-key later
// (rotating it invalidates in-flight reply tokens for ~30 minutes).
//
// Never falls back to a hardcoded string (forgeable if env is missing).

function getPushHmacSecret() {
  const dedicated = String(process.env.PUSH_REPLY_HMAC_SECRET || '').trim();
  if (dedicated) return dedicated;
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (service) {
    if (process.env.CONTEXT === 'production') {
      console.warn(
        '[push-hmac] production using service-role fallback — set PUSH_REPLY_HMAC_SECRET'
      );
    }
    return service;
  }
  const altcha = String(process.env.ALTCHA_HMAC_KEY || '').trim();
  if (altcha) return altcha;
  return '';
}

/** Prefer dedicated secret; still accept service-role signatures during rotation. */
function pushHmacVerifyCandidates() {
  const list = [];
  const dedicated = String(process.env.PUSH_REPLY_HMAC_SECRET || '').trim();
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const altcha = String(process.env.ALTCHA_HMAC_KEY || '').trim();
  for (const s of [dedicated, service, altcha]) {
    if (s && !list.includes(s)) list.push(s);
  }
  return list;
}

/** @returns {{ ok: true, secret: string } | { ok: false, error: string }} */
function requirePushHmacSecret() {
  const secret = getPushHmacSecret();
  if (!secret) {
    return {
      ok: false,
      error: 'Push HMAC secret not configured (set PUSH_REPLY_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY)',
    };
  }
  return { ok: true, secret };
}

/** True if hexSig matches HMAC-SHA256(payload) under any verify candidate (rotation-safe). */
function verifyPushHmacHex(payload, hexSig, sliceLen) {
  const crypto = require('crypto');
  const provided = String(hexSig || '').trim();
  if (!provided) return false;
  const candidates = pushHmacVerifyCandidates();
  if (!candidates.length) return false;
  const a = Buffer.from(provided);
  for (const secret of candidates) {
    let expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sliceLen) expected = expected.slice(0, sliceLen);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

module.exports = {
  getPushHmacSecret,
  pushHmacVerifyCandidates,
  requirePushHmacSecret,
  verifyPushHmacHex,
};
