/**
 * Optional iLovePDF Compress API post-process for Chromium PDFs.
 * Soft-fails to the original buffer if keys are missing or the API errors.
 *
 * Levels (API): extreme | recommended | low
 * We default to `recommended` so Chromium PDFs actually shrink.
 * Set compressionLevel to `low` in app_secrets.ilovepdf for max visual quality.
 *
 * Production (preferred — avoids Netlify / Lambda 4KB env limit):
 *   app_secrets.ilovepdf = JSON {
 *     "publicKey": "...",
 *     "secretKey": "...",          // optional; /auth only needs public key
 *     "compressionLevel": "low",   // optional
 *     "region": "in"               // optional
 *   }
 *
 * Local fallback env (optional):
 *   ILOVEPDF_PUBLIC_KEY
 *   ILOVEPDF_SECRET_KEY
 *   ILOVEPDF_COMPRESSION_LEVEL=low|recommended|extreme
 *   ILOVEPDF_REGION=in|eu|us|…
 *   ILOVEPDF_COMPRESS=0 to disable even when keys are set
 */

const { getServiceSupabase } = require('./whatsapp-helper');

const API_BASE = 'https://api.ilovepdf.com/v1';
const APP_SECRET_KEY = 'ilovepdf';
const DEFAULT_API_DEADLINE_MS = 12_000;
const CACHE_TTL_MS = 60_000;

let cachedConfig = null;
let cachedAt = 0;

function deadlineSignal(deadlineAt) {
  const remainingMs = Math.max(250, Number(deadlineAt || 0) - Date.now());
  return AbortSignal.timeout(remainingMs);
}

async function fetchWithDeadline(url, options = {}, deadlineAt) {
  if (Number(deadlineAt || 0) <= Date.now() + 250) {
    throw new Error('iLovePDF deadline reached');
  }
  return fetch(url, {
    ...options,
    signal: options.signal || deadlineSignal(deadlineAt),
  });
}

function normalizeLevel(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'extreme' || value === 'recommended' || value === 'low') return value;
  return 'low';
}

function normalizeRegion(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value || 'in';
}

function parseSecretJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  const text = String(value).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') {
      try {
        return JSON.parse(parsed);
      } catch {
        return null;
      }
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const publicKey = String(raw.publicKey || raw.public_key || '').trim();
  if (!publicKey) return null;
  return {
    publicKey,
    secretKey: String(raw.secretKey || raw.secret_key || '').trim() || null,
    compressionLevel: normalizeLevel(raw.compressionLevel || raw.compression_level),
    region: normalizeRegion(raw.region),
  };
}

function getConfigFromEnv() {
  if (process.env.ILOVEPDF_COMPRESS === '0' || process.env.ILOVEPDF_COMPRESS === 'false') {
    return null;
  }
  return normalizeConfig({
    publicKey: process.env.ILOVEPDF_PUBLIC_KEY,
    secretKey: process.env.ILOVEPDF_SECRET_KEY,
    compressionLevel: process.env.ILOVEPDF_COMPRESSION_LEVEL,
    region: process.env.ILOVEPDF_REGION,
  });
}

async function readConfigFromAppSecrets() {
  const db = getServiceSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from('app_secrets')
    .select('value')
    .eq('key', APP_SECRET_KEY)
    .maybeSingle();
  if (error || !data?.value) return null;
  return normalizeConfig(parseSecretJson(data.value));
}

/**
 * Prefer app_secrets.ilovepdf (production), then env (local).
 * Cached briefly to avoid a DB round-trip on every PDF.
 */
async function getILovePdfConfig() {
  if (process.env.ILOVEPDF_COMPRESS === '0' || process.env.ILOVEPDF_COMPRESS === 'false') {
    return null;
  }

  const now = Date.now();
  if (cachedConfig !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const fromSecrets = await readConfigFromAppSecrets();
  const config = fromSecrets || getConfigFromEnv();
  cachedConfig = config;
  cachedAt = now;
  return config;
}

function compressionLevel(config) {
  // `recommended` actually shrinks Chromium PDFs. Stored `low` often saves 0%
  // so production kept shipping the original file.
  const requested = normalizeLevel(
    config?.compressionLevel || process.env.ILOVEPDF_COMPRESSION_LEVEL || 'recommended'
  );
  return requested === 'low' ? 'recommended' : requested;
}

function region(config) {
  return normalizeRegion(config?.region || process.env.ILOVEPDF_REGION || 'in');
}

async function isEnabled() {
  return Boolean((await getILovePdfConfig())?.publicKey);
}

async function getAuthToken(publicKey, deadlineAt = Date.now() + DEFAULT_API_DEADLINE_MS) {
  const res = await fetchWithDeadline(
    `${API_BASE}/auth`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: publicKey }),
    },
    deadlineAt
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(data.error?.message || data.message || `auth HTTP ${res.status}`);
  }
  return data.token;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Official balance read: GET /start/{tool}/{region} returns remaining_credits
 * (and sometimes remaining_files). Auth + start only — no upload/process, so no
 * credit spend for the lookup itself.
 */
async function fetchILovePdfAccountUsage() {
  const config = await getILovePdfConfig();
  const level = compressionLevel(config);
  const regionName = region(config);
  const compressCreditsPerFile = 10;

  if (!config?.publicKey) {
    return {
      ok: false,
      configured: false,
      remainingCredits: null,
      remainingFiles: null,
      estimatedCompressJobs: null,
      compressCreditsPerFile,
      level,
      region: regionName,
      error: 'iLovePDF keys missing (set app_secrets.ilovepdf or ILOVEPDF_PUBLIC_KEY)',
    };
  }

  try {
    const deadlineAt = Date.now() + DEFAULT_API_DEADLINE_MS;
    const token = await getAuthToken(config.publicKey, deadlineAt);
    const startRes = await fetchWithDeadline(
      `${API_BASE}/start/compress/${encodeURIComponent(regionName)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      deadlineAt
    );
    const start = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !start.server || !start.task) {
      throw new Error(start.error?.message || start.message || `start HTTP ${startRes.status}`);
    }

    const remainingCredits = parseOptionalNumber(start.remaining_credits);
    const remainingFiles = parseOptionalNumber(start.remaining_files);
    const estimatedCompressJobs =
      remainingCredits == null ? null : Math.floor(remainingCredits / compressCreditsPerFile);

    return {
      ok: true,
      configured: true,
      remainingCredits,
      remainingFiles,
      estimatedCompressJobs,
      compressCreditsPerFile,
      level,
      region: regionName,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      remainingCredits: null,
      remainingFiles: null,
      estimatedCompressJobs: null,
      compressCreditsPerFile,
      level,
      region: regionName,
      error: error?.message || 'Could not read iLovePDF credits',
    };
  }
}

/**
 * @param {Buffer} pdfBuffer
 * @param {{ filename?: string, deadlineAt?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, compressed: boolean, originalBytes: number, compressedBytes: number, level: string }>}
 */
async function maybeCompressPdfBuffer(pdfBuffer, opts = {}) {
  const originalBytes = pdfBuffer?.length || 0;
  const config = await getILovePdfConfig();
  const level = compressionLevel(config);
  const filename = String(opts.filename || 'document.pdf').replace(/[^\w.\-]+/g, '_') || 'document.pdf';

  if (!Buffer.isBuffer(pdfBuffer) || originalBytes < 1024) {
    return {
      buffer: pdfBuffer,
      compressed: false,
      skipReason: 'too_small',
      originalBytes,
      compressedBytes: originalBytes,
      level,
    };
  }
  if (!config?.publicKey) {
    console.warn('[ilovepdf-compress] keys missing (app_secrets.ilovepdf); using original PDF');
    return {
      buffer: pdfBuffer,
      compressed: false,
      skipReason: 'no_keys',
      originalBytes,
      compressedBytes: originalBytes,
      level,
    };
  }

  try {
    const deadlineAt = Number(opts.deadlineAt) || Date.now() + 20_000;
    if (deadlineAt <= Date.now() + 4_000) {
      const err = new Error('not enough function time remaining');
      err.skipReason = 'no_time';
      throw err;
    }
    const token = await getAuthToken(config.publicKey, deadlineAt);
    const startRes = await fetchWithDeadline(
      `${API_BASE}/start/compress/${encodeURIComponent(region(config))}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      deadlineAt
    );
    const start = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !start.server || !start.task) {
      throw new Error(start.error?.message || start.message || `start HTTP ${startRes.status}`);
    }
    const remainingCredits = start.remaining_credits;
    if (
      remainingCredits !== null &&
      remainingCredits !== undefined &&
      remainingCredits !== '' &&
      Number.isFinite(Number(remainingCredits)) &&
      Number(remainingCredits) < 10
    ) {
      console.warn('[ilovepdf-compress] insufficient credits; using original PDF');
      return {
        buffer: pdfBuffer,
        compressed: false,
        skipReason: 'low_credits',
        originalBytes,
        compressedBytes: originalBytes,
        level,
      };
    }

    const serverBase = `https://${start.server}/v1`;
    const form = new FormData();
    form.append('task', start.task);
    form.append(
      'file',
      new Blob([Uint8Array.from(pdfBuffer)], { type: 'application/pdf' }),
      filename
    );

    const uploadRes = await fetchWithDeadline(
      `${serverBase}/upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
      deadlineAt
    );
    const uploaded = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || !uploaded.server_filename) {
      throw new Error(uploaded.error?.message || uploaded.message || `upload HTTP ${uploadRes.status}`);
    }

    const processRes = await fetchWithDeadline(
      `${serverBase}/process`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: start.task,
          tool: 'compress',
          compression_level: level,
          files: [
            {
              server_filename: uploaded.server_filename,
              filename,
            },
          ],
        }),
      },
      deadlineAt
    );
    const processed = await processRes.json().catch(() => ({}));
    if (!processRes.ok) {
      throw new Error(processed.error?.message || processed.message || `process HTTP ${processRes.status}`);
    }

    const downloadRes = await fetchWithDeadline(
      `${serverBase}/download/${encodeURIComponent(start.task)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      deadlineAt
    );
    if (!downloadRes.ok) {
      throw new Error(`download HTTP ${downloadRes.status}`);
    }
    const out = Buffer.from(await downloadRes.arrayBuffer());
    if (out.length < 512 || out.slice(0, 4).toString() !== '%PDF') {
      return {
        buffer: pdfBuffer,
        compressed: false,
        skipReason: 'invalid_output',
        originalBytes,
        compressedBytes: originalBytes,
        level,
      };
    }
    if (out.length >= originalBytes) {
      console.warn('[ilovepdf-compress] no size savings; keeping original', {
        level,
        originalBytes,
        compressedBytes: out.length,
      });
      return {
        buffer: pdfBuffer,
        compressed: false,
        skipReason: 'no_savings',
        originalBytes,
        compressedBytes: originalBytes,
        level,
      };
    }

    console.log('[ilovepdf-compress]', {
      level,
      originalBytes,
      compressedBytes: out.length,
      savedPct: Math.round((1 - out.length / originalBytes) * 100),
      remaining_credits: start.remaining_credits,
    });

    return {
      buffer: out,
      compressed: true,
      skipReason: null,
      originalBytes,
      compressedBytes: out.length,
      level,
    };
  } catch (error) {
    const skipReason = error?.skipReason || 'failed';
    console.warn('[ilovepdf-compress] soft-fail, using original PDF:', error?.message || error);
    return {
      buffer: pdfBuffer,
      compressed: false,
      skipReason,
      originalBytes,
      compressedBytes: originalBytes,
      level,
    };
  }
}

/** Test helper: clear in-memory config cache. */
function clearILovePdfConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

module.exports = {
  maybeCompressPdfBuffer,
  fetchILovePdfAccountUsage,
  getILovePdfConfig,
  isEnabled,
  compressionLevel,
  region,
  clearILovePdfConfigCache,
  APP_SECRET_KEY,
};
