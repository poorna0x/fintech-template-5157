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

function hasBlockedFields(body, allowedKeys = null) {
  if (!body || typeof body !== 'object') return null;
  for (const key of Object.keys(body)) {
    if (BLOCKED_BODY_KEYS.has(key) && !(allowedKeys && allowedKeys.has(key))) {
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

const MAX_PREVIEW_RECIPIENTS = 10;

/** Comma-separated To list for AMC agreement emails (up to 10 addresses). */
function normalizePreviewRecipients(to) {
  if (typeof to !== 'string') return null;
  const trimmed = to.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length || parts.length > MAX_PREVIEW_RECIPIENTS) return null;

  const seen = new Set();
  const validated = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.includes('nomail') || lower.includes('no@mail')) return null;
    if (!EMAIL_RE.test(part) || part.length > 254) return null;
    if (seen.has(lower)) continue;
    seen.add(lower);
    validated.push(part);
  }

  if (!validated.length) return null;
  return validated.join(', ');
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

const PREVIEW_PURPOSES = new Set(['booking_confirmation', 'admin_composer', 'amc_agreement']);
const MAX_PREVIEW_ATTACHMENTS = 5;
const MAX_PREVIEW_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dot: 'application/msword',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlt: 'application/vnd.ms-excel',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pot: 'application/vnd.ms-powerpoint',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  odg: 'application/vnd.oasis.opendocument.graphics',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  epub: 'application/epub+zip',
  pages: 'application/vnd.apple.pages',
  numbers: 'application/vnd.apple.numbers',
  key: 'application/vnd.apple.keynote',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
};

/** Block programs/scripts; allow other document/image attachments. */
const BLOCKED_ATTACHMENT_EXT = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'cpl',
  'scr',
  'js',
  'jse',
  'mjs',
  'vbs',
  'vbe',
  'ws',
  'wsf',
  'wsc',
  'wsh',
  'msi',
  'msp',
  'dll',
  'sys',
  'drv',
  'apk',
  'deb',
  'rpm',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'psc1',
  'jar',
  'hta',
  'inf',
  'reg',
  'lnk',
  'url',
  'iso',
  'dmg',
  'pkg',
  'app',
  'action',
  'command',
  'csh',
  'ksh',
  'php',
  'py',
  'rb',
  'pl',
]);

function sanitizeAttachmentFilename(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[/\\<>:"|?*\x00-\x1f]/g, '_');
  if (!trimmed || trimmed.length > 180) return null;
  if (trimmed.startsWith('.')) return null;
  return trimmed;
}

function fileExtension(filename) {
  const base = String(filename || '')
    .trim()
    .split(/[/\\]/)
    .pop();
  if (!base) return '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

function resolveAttachmentContentType(filename, contentType) {
  const mime = typeof contentType === 'string' ? contentType.trim().toLowerCase() : '';
  const ext = fileExtension(filename);
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (mime && mime !== 'application/octet-stream') return mime;
  return 'application/octet-stream';
}

function isSafeDocumentMime(contentType) {
  const mime = typeof contentType === 'string' ? contentType.trim().toLowerCase().split(';')[0] : '';
  if (!mime || mime === 'application/octet-stream') return false;
  if (mime.startsWith('image/')) return true;
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/pdf') return true;
  if (mime.startsWith('application/msword')) return true;
  if (mime.startsWith('application/vnd.ms-')) return true;
  if (mime.startsWith('application/vnd.openxmlformats-officedocument.')) return true;
  if (mime.startsWith('application/vnd.oasis.opendocument.')) return true;
  if (mime.startsWith('application/vnd.apple.')) return true;
  if (mime === 'application/rtf' || mime === 'text/rtf') return true;
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return true;
  if (mime === 'application/json' || mime === 'application/xml' || mime === 'text/xml') return true;
  if (mime === 'message/rfc822') return true;
  if (mime === 'application/epub+zip') return true;
  return Object.values(MIME_BY_EXT).includes(mime);
}

function isAllowedAttachment(filename, contentType) {
  const ext = fileExtension(filename);
  if (ext && BLOCKED_ATTACHMENT_EXT.has(ext)) return false;
  if (ext) return true;
  // Mobile / cloud pickers sometimes omit the extension — allow known document MIME.
  return isSafeDocumentMime(contentType);
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
    const rawContentType =
      typeof item.contentType === 'string' ? item.contentType.trim().toLowerCase() : '';
    const content = typeof item.content === 'string' ? item.content : '';

    if (!filename || !content) {
      return { ok: false, error: 'Invalid attachment' };
    }
    if (!isAllowedAttachment(filename, rawContentType)) {
      return { ok: false, error: 'Attachment type not allowed' };
    }
    const contentType = resolveAttachmentContentType(filename, rawContentType);

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

  const blocked = hasBlockedFields(body, new Set(['attachments']));
  if (blocked) {
    return { ok: false, error: 'Invalid request fields' };
  }

  const purpose = body.purpose;
  if (!PREVIEW_PURPOSES.has(purpose)) {
    return { ok: false, error: 'Invalid or missing purpose' };
  }

  const toMulti = typeof body.to === 'string' && /[,;]/.test(body.to);
  const to = toMulti ? normalizePreviewRecipients(body.to) : normalizeRecipient(body.to);
  if (!to) {
    return {
      ok: false,
      error: toMulti
        ? 'Invalid recipient addresses — check each email and try again'
        : 'Invalid recipient address',
    };
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
