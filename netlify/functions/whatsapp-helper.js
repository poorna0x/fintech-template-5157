/**
 * WhatsApp Cloud API shared helpers (credentials, phone normalize, message persist).
 * Credentials: app_secrets first (production source of truth), env as local fallback.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const GRAPH_VERSION = 'v21.0';

const SECRET_KEYS = {
  accessToken: 'whatsapp_access_token',
  phoneNumberId: 'whatsapp_phone_number_id',
  verifyToken: 'whatsapp_verify_token',
  appSecret: 'whatsapp_app_secret',
  wabaId: 'whatsapp_waba_id',
};

/** Slim columns for admin list/chat — keep egress low. */
const WHATSAPP_MESSAGE_LIST_COLUMNS = [
  'id',
  'wa_message_id',
  'direction',
  'phone_e164',
  'customer_id',
  'msg_type',
  'body',
  'media_url',
  'media_mime',
  'filename',
  'status',
  'template_name',
  'error_message',
  'sent_by_user_id',
  'created_at',
].join(',');

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** E.164 digits for India-friendly storage (no +). */
function normalizePhoneE164(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function getServiceSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readAppSecret(db, key) {
  if (!db) return '';
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error || !data?.value) return '';
  return String(data.value).trim();
}

/**
 * Resolve Cloud API credentials.
 * Prefer app_secrets (avoids stale Netlify env tokens causing "Authentication Error").
 * Fall back to WHATSAPP_* / PHONE_NUMBER_ID / VERIFY_TOKEN env for local POC.
 */
async function getWhatsAppCredentials(db = getServiceSupabase()) {
  const envAccessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const envPhoneNumberId = (process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const envVerifyToken = (process.env.VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const envAppSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  const envWabaId = (process.env.WHATSAPP_WABA_ID || '').trim();

  let accessToken = '';
  let phoneNumberId = '';
  let verifyToken = '';
  let appSecret = '';
  let wabaId = '';

  if (db) {
    const [secretToken, secretPhoneId, secretVerify, secretApp, secretWaba] = await Promise.all([
      readAppSecret(db, SECRET_KEYS.accessToken),
      readAppSecret(db, SECRET_KEYS.phoneNumberId),
      readAppSecret(db, SECRET_KEYS.verifyToken),
      readAppSecret(db, SECRET_KEYS.appSecret),
      readAppSecret(db, SECRET_KEYS.wabaId),
    ]);
    accessToken = secretToken || envAccessToken;
    phoneNumberId = secretPhoneId || envPhoneNumberId;
    verifyToken = secretVerify || envVerifyToken;
    appSecret = secretApp || envAppSecret;
    wabaId = secretWaba || envWabaId;
  } else {
    accessToken = envAccessToken;
    phoneNumberId = envPhoneNumberId;
    verifyToken = envVerifyToken;
    appSecret = envAppSecret;
    wabaId = envWabaId;
  }

  return { accessToken, phoneNumberId, verifyToken, appSecret, wabaId };
}

/**
 * Meta webhook HMAC. Callers must refuse unsigned POSTs in production when
 * app secret is missing — skip is local POC only.
 */
function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return { ok: true, skipped: true };
  const header = String(signatureHeader || '').trim();
  if (!header.startsWith('sha256=')) {
    return { ok: false, error: 'Missing signature' };
  }
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody || '', 'utf8')
    .digest('hex');
  const provided = header.slice('sha256='.length);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(provided, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid signature' };
    }
  } catch {
    return { ok: false, error: 'Invalid signature' };
  }
  return { ok: true };
}

async function callWhatsAppApi(phoneNumberId, accessToken, payload) {
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp-helper] callWhatsAppApi missing credentials', {
      hasPhoneNumberId: Boolean(phoneNumberId),
      hasAccessToken: Boolean(accessToken),
    });
    return {
      ok: false,
      status: 401,
      data: {
        error: {
          message:
            'WhatsApp credentials missing on server (set app_secrets.whatsapp_access_token + phone id; Netlify needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
          type: 'OAuthException',
          code: 190,
        },
      },
    };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Persist a slim message row. Never throws — logging must not break send/webhook.
 * @returns {Promise<{ id?: string } | null>}
 */
async function insertWhatsAppMessage(db, row) {
  if (!db) {
    console.warn('[whatsapp-helper] insert skipped — no service Supabase client');
    return null;
  }
  const phone = normalizePhoneE164(row.phone_e164 || row.phone);
  if (!phone) return null;

  const payload = {
    wa_message_id: row.wa_message_id || null,
    direction: row.direction,
    phone_e164: phone,
    customer_id: row.customer_id || null,
    msg_type: row.msg_type || row.type || 'text',
    body: row.body != null ? String(row.body).slice(0, 8000) : null,
    media_url: row.media_url || null,
    media_mime: row.media_mime || null,
    filename: row.filename || null,
    status: row.status || null,
    template_name: row.template_name || null,
    error_message: row.error_message ? String(row.error_message).slice(0, 1000) : null,
    sent_by_user_id: row.sent_by_user_id || null,
  };
  if (row.created_at) {
    payload.created_at = row.created_at;
  }

  let { data, error } = await db
    .from('whatsapp_messages')
    .insert(payload)
    .select('id')
    .maybeSingle();

  // Bad/stale customer_id must not drop the inbox row
  if (error && payload.customer_id && (error.code === '23503' || /customer_id|foreign key/i.test(error.message || ''))) {
    console.warn('[whatsapp-helper] insert retry without customer_id', error.message);
    payload.customer_id = null;
    ({ data, error } = await db
      .from('whatsapp_messages')
      .insert(payload)
      .select('id')
      .maybeSingle());
  }

  if (error) {
    if (error.code === '23505') return null;
    console.error('[whatsapp-helper] insert failed', error.message);
    return null;
  }
  return data;
}

/** Update delivery status on an outbound row by Meta wamid. */
async function updateWhatsAppMessageStatus(db, waMessageId, status, errorMessage = null) {
  if (!db || !waMessageId) return false;
  const patch = { status: String(status || '').slice(0, 40) || null };
  if (errorMessage) {
    patch.error_message = String(errorMessage).slice(0, 1000);
  }
  const { error } = await db
    .from('whatsapp_messages')
    .update(patch)
    .eq('wa_message_id', waMessageId);
  if (error) {
    console.warn('[whatsapp-helper] status update failed', error.message);
    return false;
  }
  return true;
}

/** Best-effort link phone → customer (primary / alternate). */
async function findCustomerIdByPhone(db, phoneE164) {
  if (!db) return null;
  const phone = normalizePhoneE164(phoneE164);
  if (!phone || phone.length < 10) return null;
  try {
    const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');
    const row = await findCustomerByPhoneDigits(db, phone.slice(-10), 'id');
    return row?.id || null;
  } catch (err) {
    console.warn('[whatsapp-helper] customer lookup failed', err?.message || err);
    return null;
  }
}

/**
 * Download WhatsApp media bytes via Graph API.
 * @returns {Promise<{ buffer: Buffer, mime: string } | null>}
 */
async function downloadWhatsAppMedia(mediaId, accessToken) {
  if (!mediaId || !accessToken) return null;
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || !meta.url) {
      console.warn('[whatsapp-helper] media meta failed', metaRes.status, meta?.error?.message);
      return null;
    }
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!binRes.ok) {
      console.warn('[whatsapp-helper] media download failed', binRes.status);
      return null;
    }
    const ab = await binRes.arrayBuffer();
    const mime = String(meta.mime_type || binRes.headers.get('content-type') || 'application/octet-stream');
    return { buffer: Buffer.from(ab), mime };
  } catch (err) {
    console.warn('[whatsapp-helper] media download error', err?.message || err);
    return null;
  }
}

function getCloudinaryConfig() {
  const cloudName = (
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.VITE_CLOUDINARY_CLOUD_NAME ||
    ''
  ).trim();
  const uploadPreset = (
    process.env.CLOUDINARY_UPLOAD_PRESET ||
    process.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
    ''
  ).trim();
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

const {
  uploadWhatsAppMediaToR2,
  uploadOutboundMediaToR2,
  isR2MediaRef,
  parseR2ObjectKey,
  getR2ObjectBytes,
} = require('./r2-helper');

/**
 * Upload inbound media to private R2 (preferred for inbox).
 * Public Cloudinary fallback is opt-in only (WHATSAPP_ALLOW_PUBLIC_CLOUDINARY_FALLBACK=1).
 * Returns { url, mime, filename } where url is r2:key (or https if fallback allowed).
 */
async function uploadWhatsAppMediaToCloudinary(buffer, mime, filename) {
  const r2 = await uploadWhatsAppMediaToR2(buffer, mime, filename, 'inbound');
  if (r2?.url) {
    return { url: r2.url, mime: r2.mime || mime || null, filename: r2.filename };
  }
  if (String(process.env.WHATSAPP_ALLOW_PUBLIC_CLOUDINARY_FALLBACK || '').trim() === '1') {
    return uploadBufferToCloudinaryOnly(buffer, mime, filename, 'whatsapp/inbound');
  }
  console.warn(
    '[whatsapp-helper] R2 unavailable for inbound media — refusing public Cloudinary fallback'
  );
  return null;
}

/**
 * Force Cloudinary HTTPS URL (legacy / explicit public re-host only).
 */
async function uploadBufferToCloudinaryOnly(buffer, mime, filename, folder = 'whatsapp/customer-photos') {
  const config = getCloudinaryConfig();
  if (!config || !buffer?.length) return null;
  try {
    const safeName = String(filename || 'media').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), safeName);
    form.append('upload_preset', config.uploadPreset);
    form.append('folder', folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) {
      console.warn('[whatsapp-helper] cloudinary-only upload failed', res.status, data?.error?.message);
      return null;
    }
    return {
      url: data.secure_url,
      mime: mime || null,
      filename: safeName,
    };
  } catch (err) {
    console.warn('[whatsapp-helper] cloudinary-only upload error', err?.message || err);
    return null;
  }
}

/**
 * CRM photo ref for booking-bot / customer gallery.
 * Prefer private r2: keys (gallery uses signed URLs). Do NOT re-host to public Cloudinary.
 */
async function ensurePublicCrmPhotoUrl(mediaUrl, opts = {}) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return null;
  const r2Key = parseR2ObjectKey(raw);
  if (r2Key) {
    return raw.startsWith('r2:') ? raw : `r2:${r2Key}`;
  }
  if (/^https:\/\//i.test(raw)) {
    // Legacy already-public URL — keep as-is; do not copy again.
    return raw;
  }
  void opts;
  return null;
}

/** Upload PDF bytes for outbound — R2 first; public Cloudinary only if explicitly allowed. */
async function uploadOutboundPdfToCloudinary(buffer, filename) {
  const name = String(filename || 'document.pdf').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const pdfName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
  const r2 = await uploadOutboundMediaToR2(buffer, 'application/pdf', pdfName);
  if (r2?.url) return { url: r2.url, filename: r2.filename || pdfName };

  if (String(process.env.WHATSAPP_ALLOW_PUBLIC_CLOUDINARY_FALLBACK || '').trim() !== '1') {
    console.warn(
      '[whatsapp-helper] R2 unavailable for outbound PDF — refusing public Cloudinary fallback'
    );
    return null;
  }

  const config = getCloudinaryConfig();
  if (!config || !buffer?.length) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'application/pdf' }), pdfName);
    form.append('upload_preset', config.uploadPreset);
    form.append('folder', 'whatsapp/outbound');

    const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) {
      const form2 = new FormData();
      form2.append('file', new Blob([buffer], { type: 'application/pdf' }), pdfName);
      form2.append('upload_preset', config.uploadPreset);
      form2.append('folder', 'whatsapp/outbound');
      const res2 = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
        method: 'POST',
        body: form2,
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok || !data2.secure_url) {
        console.warn(
          '[whatsapp-helper] outbound pdf upload failed',
          res.status,
          data?.error?.message,
          res2.status,
          data2?.error?.message
        );
        return null;
      }
      return { url: data2.secure_url, filename: pdfName };
    }
    return { url: data.secure_url, filename: pdfName };
  } catch (err) {
    console.warn('[whatsapp-helper] outbound pdf upload error', err?.message || err);
    return null;
  }
}

/**
 * Upload file to Meta WhatsApp Media API (preferred for outbound media).
 * @returns {{ id: string, filename: string } | null}
 */
async function uploadOutboundFileToWhatsAppMedia(
  phoneNumberId,
  accessToken,
  buffer,
  filename,
  mimeType
) {
  if (!phoneNumberId || !accessToken || !buffer?.length) return null;
  const mime = String(mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const safeName = String(filename || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'file';
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([buffer], { type: mime }), safeName);

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      console.warn(
        '[whatsapp-helper] Meta media upload failed',
        res.status,
        data?.error?.message || JSON.stringify(data)
      );
      return null;
    }
    return { id: String(data.id), filename: safeName };
  } catch (err) {
    console.warn('[whatsapp-helper] Meta media upload error', err?.message || err);
    return null;
  }
}

/**
 * Meta image messages only allow JPEG/PNG (not WebP — that is stickers only).
 * Convert webp/other → JPEG so Cloud API does not fail with 131053 Media upload error.
 * @returns {{ buffer: Buffer, mime: string, filename: string }}
 */
async function normalizeOutboundImageForWhatsApp(buffer, mimeType, filename) {
  const mime = String(mimeType || '').toLowerCase().trim();
  let name = String(filename || 'image.jpg').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'image.jpg';

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    if (!/\.jpe?g$/i.test(name)) name = `${name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
    return { buffer, mime: 'image/jpeg', filename: name };
  }
  if (mime === 'image/png') {
    if (!/\.png$/i.test(name)) name = `${name.replace(/\.[^.]+$/, '') || 'image'}.png`;
    return { buffer, mime: 'image/png', filename: name };
  }

  // webp / heic / empty mime with image ext → JPEG
  try {
    const sharp = require('sharp');
    const out = await sharp(buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    const base = name.replace(/\.[^.]+$/, '') || 'image';
    return { buffer: out, mime: 'image/jpeg', filename: `${base}.jpg` };
  } catch (err) {
    console.warn('[whatsapp-helper] image normalize failed', err?.message || err);
    return { buffer, mime: mime || 'image/jpeg', filename: name };
  }
}

/**
 * Upload PDF to Meta WhatsApp Media API (preferred for outbound documents).
 * Cloudinary public links often 401 for Meta crawlers; media-id send is reliable.
 * @returns {{ id: string, filename: string } | null}
 */
async function uploadOutboundPdfToWhatsAppMedia(phoneNumberId, accessToken, buffer, filename) {
  const safeName = String(filename || 'document.pdf').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const name = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  return uploadOutboundFileToWhatsAppMedia(
    phoneNumberId,
    accessToken,
    buffer,
    name,
    'application/pdf'
  );
}

/** Decode data-URL or raw base64 to Buffer. */
function fileBase64ToBuffer(fileBase64) {
  const raw = String(fileBase64 || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, '');
  try {
    return Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
}

function pdfBase64ToBuffer(pdfBase64) {
  return fileBase64ToBuffer(pdfBase64);
}

/** Optional CRM inbox preview copy — private R2 preferred; public Cloudinary opt-in only. */
async function uploadOutboundMediaToCloudinary(buffer, mime, filename) {
  const r2 = await uploadOutboundMediaToR2(buffer, mime, filename);
  if (r2?.url) return { url: r2.url, filename: r2.filename };

  if (String(process.env.WHATSAPP_ALLOW_PUBLIC_CLOUDINARY_FALLBACK || '').trim() !== '1') {
    console.warn(
      '[whatsapp-helper] R2 unavailable for outbound preview — refusing public Cloudinary fallback'
    );
    return null;
  }

  const config = getCloudinaryConfig();
  if (!config || !buffer?.length) return null;
  try {
    const safeName = String(filename || 'media').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), safeName);
    form.append('upload_preset', config.uploadPreset);
    form.append('folder', 'whatsapp/outbound');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) {
      console.warn(
        '[whatsapp-helper] outbound cloudinary preview failed',
        res.status,
        data?.error?.message
      );
      return null;
    }
    return { url: data.secure_url, filename: safeName };
  } catch (err) {
    console.warn('[whatsapp-helper] outbound cloudinary preview error', err?.message || err);
    return null;
  }
}

/** Resolve media id on an inbound WhatsApp message object → public URL. */
async function resolveInboundMedia(msg, accessToken) {
  const type = String(msg?.type || '');
  const mediaObj = msg?.[type];
  const mediaId = mediaObj?.id;
  if (!mediaId) return { media_url: null, media_mime: null, filename: null };

  const downloaded = await downloadWhatsAppMedia(mediaId, accessToken);
  if (!downloaded) {
    return {
      media_url: null,
      media_mime: mediaObj?.mime_type || null,
      filename: mediaObj?.filename || null,
    };
  }
  const uploaded = await uploadWhatsAppMediaToCloudinary(
    downloaded.buffer,
    downloaded.mime || mediaObj?.mime_type,
    mediaObj?.filename || `${type}-${mediaId}`
  );
  return {
    media_url: uploaded?.url || null,
    media_mime: downloaded.mime || mediaObj?.mime_type || null,
    filename: mediaObj?.filename || uploaded?.filename || null,
  };
}

function extractInboundBody(msg) {
  const type = String(msg?.type || 'unknown');
  if (type === 'text') return msg.text?.body || null;
  if (type === 'button') return msg.button?.text || msg.button?.payload || null;
  if (type === 'interactive') {
    const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
    return reply?.title || reply?.id || null;
  }
  if (type === 'location' && msg.location) {
    const { latitude, longitude, name, address } = msg.location;
    const coords =
      latitude != null && longitude != null ? `${latitude},${longitude}` : '';
    const label = String(name || address || '').trim();
    if (coords && label) return `${coords} ${label}`;
    return coords || label || null;
  }
  const media = msg[type];
  if (media?.caption) return media.caption;
  if (type === 'contacts' && Array.isArray(msg.contacts)) {
    return (
      msg.contacts
        .map((c) => c?.profile?.name || c?.name?.formatted_name)
        .filter(Boolean)
        .join(', ') || null
    );
  }
  return null;
}

module.exports = {
  GRAPH_VERSION,
  SECRET_KEYS,
  WHATSAPP_MESSAGE_LIST_COLUMNS,
  digitsOnly,
  normalizePhoneE164,
  getServiceSupabase,
  getWhatsAppCredentials,
  verifyWhatsAppSignature,
  callWhatsAppApi,
  insertWhatsAppMessage,
  updateWhatsAppMessageStatus,
  findCustomerIdByPhone,
  downloadWhatsAppMedia,
  uploadWhatsAppMediaToCloudinary,
  uploadBufferToCloudinaryOnly,
  ensurePublicCrmPhotoUrl,
  uploadOutboundPdfToCloudinary,
  uploadOutboundPdfToWhatsAppMedia,
  uploadOutboundFileToWhatsAppMedia,
  normalizeOutboundImageForWhatsApp,
  uploadOutboundMediaToCloudinary,
  pdfBase64ToBuffer,
  fileBase64ToBuffer,
  resolveInboundMedia,
  extractInboundBody,
  isR2MediaRef,
  parseR2ObjectKey,
};
