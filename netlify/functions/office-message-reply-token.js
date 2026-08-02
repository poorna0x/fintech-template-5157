// Shared HMAC reply token for office-message notification replies.
// No DB: token is signed into the push; submit-tech-message-reply verifies it.
// Optional "about" (nudge label) is embedded so admin formatting works even when
// the technician APK does not echo originalTitle/originalBody.
const crypto = require('crypto');
const { requirePushHmacSecret } = require('./push-hmac-secret');

const REPLY_TTL_MS = 30 * 60 * 1000; // 30 minutes

function replySecret() {
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

/**
 * @param {string} technicianId
 * @param {string} [about] short nudge label e.g. "Time to finish?"
 * @returns {string} id.exp.sig | id.exp.aboutEnc.sig
 */
function makeOfficeMessageReplyToken(technicianId, about) {
  const exp = String(Date.now() + REPLY_TTL_MS);
  const id = String(technicianId || '').trim();
  const aboutEnc = encodeAbout(about);
  const payload = aboutEnc ? `${id}.${exp}.${aboutEnc}` : `${id}.${exp}`;
  const sig = crypto
    .createHmac('sha256', replySecret())
    .update(payload)
    .digest('hex')
    .slice(0, 32);
  return aboutEnc ? `${id}.${exp}.${aboutEnc}.${sig}` : `${id}.${exp}.${sig}`;
}

/**
 * @returns {{ ok: true, technicianId: string, about: string } | { ok: false, error: string }}
 */
function verifyOfficeMessageReplyToken(token) {
  const got = requirePushHmacSecret();
  if (!got.ok) return { ok: false, error: got.error };

  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 && parts.length !== 4) {
    return { ok: false, error: 'Invalid token' };
  }

  let technicianId;
  let expStr;
  let aboutEnc = '';
  let sig;
  if (parts.length === 3) {
    [technicianId, expStr, sig] = parts;
  } else {
    [technicianId, expStr, aboutEnc, sig] = parts;
  }

  const exp = Number(expStr);
  if (!technicianId || !Number.isFinite(exp)) return { ok: false, error: 'Invalid token' };
  if (Date.now() > exp) return { ok: false, error: 'Reply expired' };

  const payload = aboutEnc ? `${technicianId}.${expStr}.${aboutEnc}` : `${technicianId}.${expStr}`;
  const expected = crypto
    .createHmac('sha256', got.secret)
    .update(payload)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid token' };
  }
  return { ok: true, technicianId, about: decodeAbout(aboutEnc) };
}

module.exports = {
  makeOfficeMessageReplyToken,
  verifyOfficeMessageReplyToken,
  REPLY_TTL_MS,
};
