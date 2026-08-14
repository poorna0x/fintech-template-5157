// HMAC token for "Are you going?" Yes → auto start job (EN_ROUTE). No DB.
const crypto = require('crypto');
const { requirePushHmacSecret, verifyPushHmacHex } = require('./push-hmac-secret');

const TTL_MS = 30 * 60 * 1000;

function secret() {
  const got = requirePushHmacSecret();
  if (!got.ok) {
    throw new Error(got.error);
  }
  return got.secret;
}

/** @returns {string} technicianId.jobId.exp.sig */
function makeJobStartNudgeToken(technicianId, jobId) {
  const exp = String(Date.now() + TTL_MS);
  const tid = String(technicianId || '').trim();
  const jid = String(jobId || '').trim();
  const sig = crypto
    .createHmac('sha256', secret())
    .update(`${tid}.${jid}.${exp}`)
    .digest('hex')
    .slice(0, 32);
  return `${tid}.${jid}.${exp}.${sig}`;
}

/**
 * @returns {{ ok: true, technicianId: string, jobId: string } | { ok: false, error: string }}
 */
function verifyJobStartNudgeToken(token) {
  const got = requirePushHmacSecret();
  if (!got.ok) return { ok: false, error: got.error };

  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 4) return { ok: false, error: 'Invalid token' };
  const [technicianId, jobId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!technicianId || !jobId || !Number.isFinite(exp)) {
    return { ok: false, error: 'Invalid token' };
  }
  if (Date.now() > exp) return { ok: false, error: 'Action expired' };
  if (!verifyPushHmacHex(`${technicianId}.${jobId}.${expStr}`, sig, 32)) {
    return { ok: false, error: 'Invalid token' };
  }
  return { ok: true, technicianId, jobId };
}

module.exports = {
  makeJobStartNudgeToken,
  verifyJobStartNudgeToken,
  TTL_MS,
};
