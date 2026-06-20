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

function resolveDocumentBrand(value) {
  return value === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

function getBrandMailMeta(documentBrand) {
  const brand = resolveDocumentBrand(documentBrand);
  if (brand === 'elevenro') {
    return {
      documentBrand: brand,
      fromName: 'Eleven RO - Water Purifier Services',
      replyTo: 'mail@elevenro.com',
      mailer: 'Eleven RO Service',
      messageIdDomain: 'elevenro.com',
    };
  }
  return {
    documentBrand: brand,
    fromName: 'Hydrogen RO - Water Purifier Services',
    replyTo: 'info@hydrogenro.com',
    mailer: 'Hydrogen RO Service',
    messageIdDomain: 'hydrogenro.com',
  };
}

const PREVIEW_PURPOSES = new Set(['booking_confirmation', 'admin_composer']);
const MAX_PREVIEW_ATTACHMENTS = 5;
const MAX_PREVIEW_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function sanitizeAttachmentFilename(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[/\\<>:"|?*\x00-\x1f]/g, '_');
  if (!trimmed || trimmed.length > 180) return null;
  if (trimmed.startsWith('.')) return null;
  return trimmed;
}

function decodeBase64ByteLength(value) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const normalized = value.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function validatePreviewAttachments(raw) {
  if (raw == null) {
    return { ok: true, attachments: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Invalid attachments' };
  }
  if (raw.length > MAX_PREVIEW_ATTACHMENTS) {
    return { ok: false, error: 'Too many attachments' };
  }

  const attachments = [];
  let totalBytes = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Invalid attachment' };
    }
    const filename = sanitizeAttachmentFilename(item.filename);
    const contentType = typeof item.contentType === 'string' ? item.contentType.trim().toLowerCase() : '';
    const content = typeof item.content === 'string' ? item.content : '';

    if (!filename || !content) {
      return { ok: false, error: 'Invalid attachment' };
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      return { ok: false, error: 'Attachment type not allowed' };
    }

    const byteLength = decodeBase64ByteLength(content);
    if (byteLength <= 0 || byteLength > MAX_PREVIEW_ATTACHMENT_BYTES) {
      return { ok: false, error: 'Attachment too large' };
    }
    totalBytes += byteLength;
    if (totalBytes > MAX_PREVIEW_ATTACHMENT_TOTAL_BYTES) {
      return { ok: false, error: 'Total attachment size too large' };
    }

    attachments.push({ filename, contentType, content });
  }

  return { ok: true, attachments };
}

function validatePreviewEmailBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request' };
  }

  const blocked = hasBlockedFields(body);
  if (blocked) {
    return { ok: false, error: 'Invalid request fields' };
  }

  const purpose = body.purpose;
  if (!PREVIEW_PURPOSES.has(purpose)) {
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

  if (purpose === 'booking_confirmation' && !subject.startsWith('Service Booking Confirmed')) {
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

  const attachmentResult = validatePreviewAttachments(body.attachments);
  if (!attachmentResult.ok) {
    return attachmentResult;
  }

  return {
    ok: true,
    to,
    subject,
    html,
    text,
    attachments: attachmentResult.attachments,
  };
}

module.exports = {
  ALLOWED_PURPOSE,
  validateBookingEmailBody,
  validatePreviewEmailBody,
  getFixedFromAddress,
  getBrandMailMeta,
};
