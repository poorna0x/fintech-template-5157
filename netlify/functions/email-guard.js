// Validation helpers for the public send-email endpoint (booking confirmations only).

const ALLOWED_PURPOSE = 'booking_confirmation';

const BLOCKED_BODY_KEYS = new Set([
  'bcc',
  'cc',
  'from',
  'replyTo',
  'reply_to',
  'attachments',
  'envelope',
  'sender',
  'headers',
  'list',
]);

const MAX_SUBJECT_LENGTH = 200;
const MAX_HTML_LENGTH = 150_000;
const MAX_TEXT_LENGTH = 150_000;

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function hasBlockedFields(body) {
  if (!body || typeof body !== 'object') return null;
  for (const key of Object.keys(body)) {
    if (BLOCKED_BODY_KEYS.has(key)) {
      return key;
    }
  }
  return null;
}

function normalizeRecipient(to) {
  if (typeof to !== 'string') return null;
  const trimmed = to.trim();
  if (!trimmed || trimmed.includes(',') || trimmed.includes(';')) return null;
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) return null;
  return trimmed;
}

function validateBookingEmailBody(body) {
  const blocked = hasBlockedFields(body);
  if (blocked) {
    return { ok: false, error: 'Invalid request fields' };
  }

  if (body.purpose !== ALLOWED_PURPOSE) {
    return { ok: false, error: 'Invalid or missing purpose' };
  }

  const to = normalizeRecipient(body.to);
  if (!to) {
    return { ok: false, error: 'Invalid recipient address' };
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, error: 'Invalid subject' };
  }

  if (!subject.startsWith('Service Booking Confirmed')) {
    return { ok: false, error: 'Invalid subject' };
  }

  const html = typeof body.html === 'string' ? body.html : '';
  if (!html || html.length > MAX_HTML_LENGTH) {
    return { ok: false, error: 'Invalid email body' };
  }

  let text = '';
  if (body.text != null) {
    if (typeof body.text !== 'string' || body.text.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: 'Invalid email body' };
    }
    text = body.text;
  } else {
    text = html.replace(/<[^>]*>/g, '');
  }

  return { ok: true, to, subject, html, text };
}

function getFixedFromAddress() {
  const configured =
    process.env.ALLOWED_EMAIL_FROM || process.env.HOSTINGER_EMAIL_USER || '';
  const trimmed = String(configured).trim().toLowerCase();
  if (!trimmed || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

module.exports = {
  ALLOWED_PURPOSE,
  validateBookingEmailBody,
  getFixedFromAddress,
};
