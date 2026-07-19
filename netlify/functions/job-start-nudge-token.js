// HMAC token for "Are you going?" Yes → auto start job (EN_ROUTE). No DB.
const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;

function secret() {
  return (
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    (process.env.ALTCHA_HMAC_KEY || '').trim() ||
    'hro-job-start-nudge'
  );
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
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 4) return { ok: false, error: 'Invalid token' };
  const [technicianId, jobId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!technicianId || !jobId || !Number.isFinite(exp)) {
    return { ok: false, error: 'Invalid token' };
  }
  if (Date.now() > exp) return { ok: false, error: 'Action expired' };
  const expected = crypto
    .createHmac('sha256', secret())
    .update(`${technicianId}.${jobId}.${expStr}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid token' };
  }
  return { ok: true, technicianId, jobId };
}

module.exports = {
  makeJobStartNudgeToken,
  verifyJobStartNudgeToken,
  TTL_MS,
};
