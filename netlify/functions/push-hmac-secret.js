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
  if (service) return service;
  const altcha = String(process.env.ALTCHA_HMAC_KEY || '').trim();
  if (altcha) return altcha;
  return '';
}

/** @returns {{ ok: true, secret: string } | { ok: false, error: string }} */
function requirePushHmacSecret() {
  const secret = getPushHmacSecret();
  if (!secret) {
    return {
      ok: false,
      error: 'Push HMAC secret not configured (set SUPABASE_SERVICE_ROLE_KEY or PUSH_REPLY_HMAC_SECRET)',
    };
  }
  return { ok: true, secret };
}

module.exports = {
  getPushHmacSecret,
  requirePushHmacSecret,
};
