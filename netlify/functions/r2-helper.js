/**
 * Cloudflare R2 helpers for WhatsApp media (private bucket + signed URLs).
 *
 * Secrets (prefer app_secrets to stay under Netlify/Lambda 4KB env limit):
 *   app_secrets.cloudflare_r2 = JSON {
 *     accountId, accessKeyId, secretAccessKey, bucket, ttlSeconds?
 *   }
 * Env fallback (local): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME,
 *   CLOUDFLARE_R2_SIGNED_URL_TTL_SECONDS
 *
 * Ops: bucket must be private — disable r2.dev public access. Objects are
 * referenced as r2:whatsapp/... and served only via short-lived signed GETs.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const R2_KEY_PREFIX = 'r2:';
const APP_SECRET_KEY = 'cloudflare_r2';
const CACHE_TTL_MS = 60_000;

let cachedConfig = null;
let cachedAt = 0;

function getServiceSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const accountId = String(raw.accountId || raw.account_id || '').trim();
  const accessKeyId = String(raw.accessKeyId || raw.access_key_id || '').trim();
  const secretAccessKey = String(raw.secretAccessKey || raw.secret_access_key || '').trim();
  const bucket = String(raw.bucket || raw.bucket_name || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const ttl = Math.max(
    60,
    Math.min(3600, Number(raw.ttlSeconds || raw.ttl || process.env.CLOUDFLARE_R2_SIGNED_URL_TTL_SECONDS) || 900)
  );
  return { accountId, accessKeyId, secretAccessKey, bucket, ttl };
}

function getR2ConfigFromEnv() {
  return normalizeConfig({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    ttlSeconds: process.env.CLOUDFLARE_R2_SIGNED_URL_TTL_SECONDS,
  });
}

async function readCloudflareR2Secret() {
  const db = getServiceSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', APP_SECRET_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  try {
    const parsed = JSON.parse(String(data.value).trim());
    return normalizeConfig(parsed);
  } catch {
    return null;
  }
}

/**
 * Prefer env (local), then app_secrets.cloudflare_r2 (production).
 * Cached briefly to avoid a DB round-trip on every media op.
 */
async function getR2Config() {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const fromEnv = getR2ConfigFromEnv();
  if (fromEnv) {
    cachedConfig = fromEnv;
    cachedAt = now;
    return fromEnv;
  }

  const fromSecret = await readCloudflareR2Secret();
  if (fromSecret) {
    cachedConfig = fromSecret;
    cachedAt = now;
    return fromSecret;
  }

  cachedConfig = null;
  cachedAt = now;
  return null;
}

function getR2Client(config) {
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
  const config = await getR2Config();
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
  const config = await getR2Config();
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
  const config = await getR2Config();
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
  const config = await getR2Config();
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

function folderForObjectKey(key) {
  const raw = String(key || '').replace(/^\/+/, '');
  if (raw.startsWith('whatsapp/inbound/')) return 'inbound';
  if (raw.startsWith('whatsapp/outbound/')) return 'outbound';
  if (raw.startsWith('whatsapp/accept/')) return 'accept';
  const slash = raw.indexOf('/');
  if (slash > 0) return raw.slice(0, slash);
  return 'other';
}

/**
 * List the private R2 bucket and sum object sizes.
 * Uses existing S3-compatible credentials (no Cloudflare API token).
 */
async function summarizeR2BucketUsage() {
  const config = await getR2Config();
  const client = getR2Client(config);
  if (!config || !client) {
    return { ok: false, error: 'Cloudflare R2 is not configured' };
  }

  const started = Date.now();
  const TIME_BUDGET_MS = 8000;
  const MAX_PAGES = 80;
  const folders = Object.create(null);
  let objectCount = 0;
  let totalBytes = 0;
  let oldest = null;
  let newest = null;
  let truncated = false;
  let token;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      const out = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          ContinuationToken: token,
          MaxKeys: 1000,
        })
      );
      for (const obj of out.Contents || []) {
        const size = Number(obj.Size) || 0;
        const key = String(obj.Key || '');
        objectCount += 1;
        totalBytes += size;
        const folder = folderForObjectKey(key);
        if (!folders[folder]) folders[folder] = { bytes: 0, objects: 0 };
        folders[folder].bytes += size;
        folders[folder].objects += 1;
        const lm = obj.LastModified ? new Date(obj.LastModified).toISOString() : null;
        if (lm) {
          if (!oldest || lm < oldest) oldest = lm;
          if (!newest || lm > newest) newest = lm;
        }
      }
      if (!out.IsTruncated) break;
      token = out.NextContinuationToken;
      if (!token) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not list R2 objects' };
  }

  const prefixes = Object.entries(folders)
    .map(([name, v]) => ({ name, bytes: v.bytes, objects: v.objects }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    ok: true,
    bucket: config.bucket,
    total_bytes: totalBytes,
    object_count: objectCount,
    prefixes,
    oldest_modified: oldest,
    newest_modified: newest,
    truncated,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  R2_KEY_PREFIX,
  APP_SECRET_KEY,
  getR2Config,
  getR2ConfigFromEnv,
  toMediaRef,
  parseR2ObjectKey,
  isR2MediaRef,
  uploadWhatsAppMediaToR2,
  uploadOutboundMediaToR2,
  uploadAcceptOriginalToR2,
  deleteR2Object,
  createR2SignedGetUrl,
  getR2ObjectBytes,
  summarizeR2BucketUsage,
};
