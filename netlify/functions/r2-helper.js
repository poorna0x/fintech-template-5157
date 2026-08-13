/**
 * Cloudflare R2 helpers for WhatsApp media (private bucket + signed URLs).
 * Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 * CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME
 * Optional: CLOUDFLARE_R2_SIGNED_URL_TTL_SECONDS (default 900)
 */
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const R2_KEY_PREFIX = 'r2:';

function getR2Config() {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (process.env.CLOUDFLARE_R2_BUCKET_NAME || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const ttl = Math.max(
    60,
    Math.min(3600, Number(process.env.CLOUDFLARE_R2_SIGNED_URL_TTL_SECONDS) || 900)
  );
  return { accountId, accessKeyId, secretAccessKey, bucket, ttl };
}

function getR2Client(config = getR2Config()) {
  if (!config) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

function safeFilename(name, fallback = 'file') {
  const base = String(name || fallback).replace(/[^\w.\-]+/g, '_').slice(0, 80);
  return base || fallback;
}

function buildObjectKey(folder, filename) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const safe = safeFilename(filename);
  let prefix = 'whatsapp/inbound';
  if (folder === 'outbound') prefix = 'whatsapp/outbound';
  else if (folder === 'accept') prefix = 'whatsapp/accept';
  return `${prefix}/${yyyy}/${mm}/${id}-${safe}`;
}

/** Store as r2:key in whatsapp_messages.media_url */
function toMediaRef(objectKey) {
  const key = String(objectKey || '').replace(/^r2:/, '').replace(/^\/+/, '');
  return key ? `${R2_KEY_PREFIX}${key}` : null;
}

function parseR2ObjectKey(mediaUrlOrRef) {
  const raw = String(mediaUrlOrRef || '').trim();
  if (!raw) return null;
  if (raw.startsWith(R2_KEY_PREFIX)) {
    const key = raw.slice(R2_KEY_PREFIX.length).replace(/^\/+/, '');
    return key.startsWith('whatsapp/') ? key : null;
  }
  // Plain key stored without prefix
  if (raw.startsWith('whatsapp/inbound/') || raw.startsWith('whatsapp/outbound/') || raw.startsWith('whatsapp/accept/')) {
    return raw;
  }
  return null;
}

function isR2MediaRef(mediaUrlOrRef) {
  return Boolean(parseR2ObjectKey(mediaUrlOrRef));
}

/**
 * Upload buffer to private R2. Returns { key, ref, filename } or null.
 * ref is stored in media_url (r2:...).
 */
async function uploadWhatsAppMediaToR2(buffer, mime, filename, folder = 'inbound') {
  const config = getR2Config();
  const client = getR2Client(config);
  if (!config || !client || !buffer?.length) return null;

  const key = buildObjectKey(folder, filename);
  const contentType = String(mime || 'application/octet-stream').trim() || 'application/octet-stream';
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return {
      key,
      ref: toMediaRef(key),
      url: toMediaRef(key), // callers historically expect .url
      filename: safeFilename(filename),
      mime: contentType,
    };
  } catch (err) {
    console.warn('[r2-helper] upload failed', err?.message || err);
    return null;
  }
}

async function uploadOutboundMediaToR2(buffer, mime, filename) {
  return uploadWhatsAppMediaToR2(buffer, mime, filename, 'outbound');
}

async function uploadAcceptOriginalToR2(buffer, mime, filename) {
  return uploadWhatsAppMediaToR2(buffer, mime, filename, 'accept');
}

async function deleteR2Object(objectKeyOrRef) {
  const config = getR2Config();
  const client = getR2Client(config);
  const key = parseR2ObjectKey(objectKeyOrRef) || String(objectKeyOrRef || '').trim();
  if (!config || !client || !key || !key.startsWith('whatsapp/')) {
    return { ok: false, skipped: true };
  }
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
    return { ok: true, key };
  } catch (err) {
    console.warn('[r2-helper] delete failed', key, err?.message || err);
    return { ok: false, key, error: err?.message || String(err) };
  }
}

async function createR2SignedGetUrl(objectKeyOrRef, expiresInSeconds) {
  const config = getR2Config();
  const client = getR2Client(config);
  const key = parseR2ObjectKey(objectKeyOrRef);
  if (!config || !client || !key) return null;
  const ttl = Math.max(60, Math.min(3600, Number(expiresInSeconds) || config.ttl));
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
      { expiresIn: ttl }
    );
    return { url, key, expiresIn: ttl };
  } catch (err) {
    console.warn('[r2-helper] signed url failed', err?.message || err);
    return null;
  }
}

/** Server-side GET for private objects (thumbnails / proxy; avoids browser CORS to R2). */
async function getR2ObjectBytes(objectKeyOrRef) {
  const config = getR2Config();
  const client = getR2Client(config);
  const key = parseR2ObjectKey(objectKeyOrRef);
  if (!config || !client || !key) return null;
  try {
    const out = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );
    const chunks = [];
    for await (const chunk of out.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return {
      key,
      buffer,
      contentType: out.ContentType || 'application/octet-stream',
      contentLength: buffer.length,
    };
  } catch (err) {
    console.warn('[r2-helper] get object failed', key, err?.message || err);
    return null;
  }
}

module.exports = {
  R2_KEY_PREFIX,
  getR2Config,
  toMediaRef,
  parseR2ObjectKey,
  isR2MediaRef,
  uploadWhatsAppMediaToR2,
  uploadOutboundMediaToR2,
  uploadAcceptOriginalToR2,
  deleteR2Object,
  createR2SignedGetUrl,
  getR2ObjectBytes,
};
