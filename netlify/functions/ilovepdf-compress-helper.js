/**
 * Optional iLovePDF Compress API post-process for Chromium PDFs.
 * Soft-fails to the original buffer if keys are missing or the API errors.
 *
 * Levels (API): extreme | recommended | low
 * We default to `low` = least compression = highest visual quality.
 *
 * Env (server-only):
 *   ILOVEPDF_PUBLIC_KEY
 *   ILOVEPDF_SECRET_KEY (optional; /auth only needs public key)
 *   ILOVEPDF_COMPRESSION_LEVEL=low|recommended|extreme (default low)
 *   ILOVEPDF_REGION=in|eu|us|… (default in)
 *   ILOVEPDF_COMPRESS=0 to disable even when keys are set
 */

const API_BASE = 'https://api.ilovepdf.com/v1';
const DEFAULT_API_DEADLINE_MS = 12_000;

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

function compressionLevel() {
  const raw = String(process.env.ILOVEPDF_COMPRESSION_LEVEL || 'low').trim().toLowerCase();
  if (raw === 'extreme' || raw === 'recommended' || raw === 'low') return raw;
  return 'low';
}

function region() {
  const raw = String(process.env.ILOVEPDF_REGION || 'in').trim().toLowerCase();
  return raw || 'in';
}

function isEnabled() {
  if (process.env.ILOVEPDF_COMPRESS === '0' || process.env.ILOVEPDF_COMPRESS === 'false') {
    return false;
  }
  return Boolean(String(process.env.ILOVEPDF_PUBLIC_KEY || '').trim());
}

async function getAuthToken(publicKey, deadlineAt = Date.now() + DEFAULT_API_DEADLINE_MS) {
  const res = await fetchWithDeadline(`${API_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: publicKey }),
  }, deadlineAt);
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
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   configured: boolean,
 *   remainingCredits: number | null,
 *   remainingFiles: number | null,
 *   estimatedCompressJobs: number | null,
 *   compressCreditsPerFile: number,
 *   level: string,
 *   region: string,
 *   error?: string,
 * }>}
 */
async function fetchILovePdfAccountUsage() {
  const level = compressionLevel();
  const regionName = region();
  const compressCreditsPerFile = 10;
  const publicKey = String(process.env.ILOVEPDF_PUBLIC_KEY || '').trim();

  if (!publicKey) {
    return {
      ok: false,
      configured: false,
      remainingCredits: null,
      remainingFiles: null,
      estimatedCompressJobs: null,
      compressCreditsPerFile,
      level,
      region: regionName,
      error: 'ILOVEPDF_PUBLIC_KEY not set',
    };
  }

  try {
    const deadlineAt = Date.now() + DEFAULT_API_DEADLINE_MS;
    const token = await getAuthToken(publicKey, deadlineAt);
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
  const level = compressionLevel();
  const filename = String(opts.filename || 'document.pdf').replace(/[^\w.\-]+/g, '_') || 'document.pdf';

  if (!Buffer.isBuffer(pdfBuffer) || originalBytes < 1024 || !isEnabled()) {
    return {
      buffer: pdfBuffer,
      compressed: false,
      originalBytes,
      compressedBytes: originalBytes,
      level,
    };
  }

  const publicKey = String(process.env.ILOVEPDF_PUBLIC_KEY || '').trim();

  try {
    const deadlineAt = Number(opts.deadlineAt) || Date.now() + 20_000;
    if (deadlineAt <= Date.now() + 2_000) {
      throw new Error('not enough function time remaining');
    }
    const token = await getAuthToken(publicKey, deadlineAt);
    const startRes = await fetchWithDeadline(`${API_BASE}/start/compress/${encodeURIComponent(region())}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, deadlineAt);
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
        originalBytes,
        compressedBytes: originalBytes,
        level,
      };
    }

    const serverBase = `https://${start.server}/v1`;
    const form = new FormData();
    form.append('task', start.task);
    form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);

    const uploadRes = await fetchWithDeadline(`${serverBase}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }, deadlineAt);
    const uploaded = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || !uploaded.server_filename) {
      throw new Error(uploaded.error?.message || uploaded.message || `upload HTTP ${uploadRes.status}`);
    }

    const processRes = await fetchWithDeadline(`${serverBase}/process`, {
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
    }, deadlineAt);
    const processed = await processRes.json().catch(() => ({}));
    if (!processRes.ok) {
      throw new Error(processed.error?.message || processed.message || `process HTTP ${processRes.status}`);
    }

    const downloadRes = await fetchWithDeadline(`${serverBase}/download/${encodeURIComponent(start.task)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, deadlineAt);
    if (!downloadRes.ok) {
      throw new Error(`download HTTP ${downloadRes.status}`);
    }
    const out = Buffer.from(await downloadRes.arrayBuffer());
    if (out.length < 512 || out.length >= originalBytes) {
      // Keep original if shrink failed or somehow grew.
      return {
        buffer: pdfBuffer,
        compressed: false,
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
      originalBytes,
      compressedBytes: out.length,
      level,
    };
  } catch (error) {
    console.warn('[ilovepdf-compress] soft-fail, using original PDF:', error?.message || error);
    return {
      buffer: pdfBuffer,
      compressed: false,
      originalBytes,
      compressedBytes: originalBytes,
      level,
    };
  }
}

module.exports = {
  maybeCompressPdfBuffer,
  fetchILovePdfAccountUsage,
  isEnabled,
  compressionLevel,
  region,
};
