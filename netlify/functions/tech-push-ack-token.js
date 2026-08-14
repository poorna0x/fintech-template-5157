// HMAC ack token for technician push dismiss / open acknowledgments.
// No DB: token is signed into the FCM payload; submit-tech-push-ack verifies it.
const crypto = require('crypto');
const { requirePushHmacSecret, verifyPushHmacHex } = require('./push-hmac-secret');

// Long enough for tray leftovers overnight / weekend; late dismiss still notifies.
const ACK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const ACK_SOURCES = new Set(['direct_message', 'nudge', 'job_alert', 'other']);

function ackSecret() {
  const got = requirePushHmacSecret();
  if (!got.ok) {
    throw new Error(got.error);
  }
  return got.secret;
}

function encodeAbout(about) {
  const t = String(about || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (!t) return '';
  return Buffer.from(t, 'utf8').toString('base64url');
}

function decodeAbout(enc) {
  try {
    const raw = Buffer.from(String(enc || ''), 'base64url').toString('utf8');
    return raw.trim().replace(/\s+/g, ' ').slice(0, 80);
  } catch {
    return '';
  }
}

function normalizeSource(source) {
  const s = String(source || '')
    .trim()
    .toLowerCase();
  return ACK_SOURCES.has(s) ? s : 'other';
}

/**
 * @param {string} technicianId
 * @param {string} [source] direct_message | nudge | job_alert | other
 * @param {string} [about] short label for admin tray
 * @returns {string} id.exp.source.sig | id.exp.source.aboutEnc.sig
 */
function makeTechPushAckToken(technicianId, source, about) {
  const exp = String(Date.now() + ACK_TTL_MS);
  const id = String(technicianId || '').trim();
  const src = normalizeSource(source);
  const aboutEnc = encodeAbout(about);
  const payload = aboutEnc
    ? `${id}.${exp}.${src}.${aboutEnc}`
    : `${id}.${exp}.${src}`;
  const sig = crypto
    .createHmac('sha256', ackSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 32);
  return aboutEnc
    ? `${id}.${exp}.${src}.${aboutEnc}.${sig}`
    : `${id}.${exp}.${src}.${sig}`;
}

/**
 * @returns {{ ok: true, technicianId: string, source: string, about: string } | { ok: false, error: string }}
 */
function verifyTechPushAckToken(token) {
  const got = requirePushHmacSecret();
  if (!got.ok) return { ok: false, error: got.error };

  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 4 && parts.length !== 5) {
    return { ok: false, error: 'Invalid token' };
  }

  let technicianId;
  let expStr;
  let source;
  let aboutEnc = '';
  let sig;
  if (parts.length === 4) {
    [technicianId, expStr, source, sig] = parts;
  } else {
    [technicianId, expStr, source, aboutEnc, sig] = parts;
  }

  const exp = Number(expStr);
  if (!technicianId || !Number.isFinite(exp)) return { ok: false, error: 'Invalid token' };
  if (!ACK_SOURCES.has(source)) return { ok: false, error: 'Invalid token' };
  if (Date.now() > exp) return { ok: false, error: 'Ack expired' };

  const payload = aboutEnc
    ? `${technicianId}.${expStr}.${source}.${aboutEnc}`
    : `${technicianId}.${expStr}.${source}`;
  if (!verifyPushHmacHex(payload, sig, 32)) {
    return { ok: false, error: 'Invalid token' };
  }
  return {
    ok: true,
    technicianId,
    source,
    about: decodeAbout(aboutEnc),
  };
}

module.exports = {
  makeTechPushAckToken,
  verifyTechPushAckToken,
  normalizeSource,
  ACK_TTL_MS,
  ACK_SOURCES,
};
