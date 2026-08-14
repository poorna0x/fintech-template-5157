// HMAC for cash-check Yes/No push replies.
// Prefer dedicated CASH_CHECK_HMAC_SECRET (or PUSH_REPLY_HMAC_SECRET).
// Falls back to SUPABASE_SERVICE_ROLE_KEY so existing APK tokens keep working.
// Verification accepts any configured candidate (rotation-safe).

function hmacCandidates() {
  const list = [];
  const cash = String(process.env.CASH_CHECK_HMAC_SECRET || '').trim();
  const push = String(process.env.PUSH_REPLY_HMAC_SECRET || '').trim();
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  for (const s of [cash, push, service]) {
    if (s && !list.includes(s)) list.push(s);
  }
  return list;
}

/** Secret used when *signing* new cash-check pushes. */
function getCashCheckSignSecret() {
  const candidates = hmacCandidates();
  return candidates[0] || '';
}

/**
 * @returns {{ ok: true, secret: string } | { ok: false, error: string }}
 */
function requireCashCheckSignSecret() {
  const secret = getCashCheckSignSecret();
  if (!secret) {
    return { ok: false, error: 'Cash-check HMAC secret not configured' };
  }
  if (
    process.env.CONTEXT === 'production' &&
    !String(process.env.CASH_CHECK_HMAC_SECRET || '').trim() &&
    !String(process.env.PUSH_REPLY_HMAC_SECRET || '').trim()
  ) {
    console.warn(
      '[cash-check-hmac] production signing with service-role fallback — set CASH_CHECK_HMAC_SECRET'
    );
  }
  return { ok: true, secret };
}

function signCashCheck(technicianId, date, amount, secret) {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', secret)
    .update(`cash-check|${technicianId}|${date}|${amount}`)
    .digest('hex');
}

/** True if sig matches any current HMAC candidate (dedicated or legacy service-role). */
function verifyCashCheckSig(technicianId, date, amount, sig) {
  const crypto = require('crypto');
  const provided = String(sig || '').trim();
  if (!provided) return false;
  const sigBuf = Buffer.from(provided);
  for (const secret of hmacCandidates()) {
    const expected = signCashCheck(technicianId, date, amount, secret);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  getCashCheckSignSecret,
  requireCashCheckSignSecret,
  signCashCheck,
  verifyCashCheckSig,
  hmacCandidates,
};
