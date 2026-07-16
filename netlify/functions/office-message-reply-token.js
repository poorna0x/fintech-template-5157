// Shared HMAC reply token for office-message notification replies.
// No DB: token is signed into the push; submit-tech-message-reply verifies it.
const crypto = require('crypto');

const REPLY_TTL_MS = 30 * 60 * 1000; // 30 minutes

function replySecret() {
  return (
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    (process.env.ALTCHA_HMAC_KEY || '').trim() ||
    'hro-office-message-reply'
  );
}

/** @returns {string} technicianId.expMs.sig */
function makeOfficeMessageReplyToken(technicianId) {
  const exp = String(Date.now() + REPLY_TTL_MS);
  const id = String(technicianId || '').trim();
  const sig = crypto
    .createHmac('sha256', replySecret())
    .update(`${id}.${exp}`)
    .digest('hex')
    .slice(0, 32);
  return `${id}.${exp}.${sig}`;
}

/**
 * @returns {{ ok: true, technicianId: string } | { ok: false, error: string }}
 */
function verifyOfficeMessageReplyToken(token) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return { ok: false, error: 'Invalid token' };
  const [technicianId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!technicianId || !Number.isFinite(exp)) return { ok: false, error: 'Invalid token' };
  if (Date.now() > exp) return { ok: false, error: 'Reply expired' };
  const expected = crypto
    .createHmac('sha256', replySecret())
    .update(`${technicianId}.${expStr}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid token' };
  }
  return { ok: true, technicianId };
}

module.exports = {
  makeOfficeMessageReplyToken,
  verifyOfficeMessageReplyToken,
  REPLY_TTL_MS,
};
