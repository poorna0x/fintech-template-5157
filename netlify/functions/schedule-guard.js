// Auth gate for Netlify scheduled (cron) functions.
//
// - Local `netlify dev` is allowed.
// - Valid CRON_SECRET (Bearer or X-Cron-Secret) is always allowed.
// - Netlify scheduler sends `x-netlify-event: schedule` and cannot attach
//   custom secrets — allowed only when the invoke does NOT look like a
//   browser/client request (no Origin / Referer). Spoofed schedule+Origin is rejected.
// - Production should still set CRON_SECRET for manual/ops invokes.

function isLocalDev() {
  if (process.env.NETLIFY_DEV === 'true') return true;
  if (process.env.CONTEXT === 'dev') return true;
  if (process.env.CORS_PERMISSIVE === 'true') return true;
  return false;
}

function isProductionContext() {
  return process.env.CONTEXT === 'production';
}

function readCronSecret(event) {
  const headers = event?.headers || {};
  const fromHeader = String(
    headers['x-cron-secret'] || headers['X-Cron-Secret'] || ''
  ).trim();
  if (fromHeader) return fromHeader;
  const auth = headers.authorization || headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

function looksLikeBrowserInvoke(event) {
  const headers = event?.headers || {};
  const origin = String(headers.origin || headers.Origin || '').trim();
  const referer = String(headers.referer || headers.Referer || '').trim();
  return Boolean(origin || referer);
}

/**
 * @param {import('@netlify/functions').HandlerEvent | { headers?: Record<string, string> }} event
 * @returns {{ ok: true } | { ok: false, statusCode: number, body: string }}
 */
function assertScheduledInvoke(event) {
  if (isLocalDev()) {
    return { ok: true };
  }

  const expected = String(process.env.CRON_SECRET || '').trim();
  if (isProductionContext() && !expected) {
    console.error(
      '[schedule-guard] CRON_SECRET missing in production — set it for manual cron auth'
    );
  }

  const provided = readCronSecret(event);
  if (expected && provided && provided === expected) {
    return { ok: true };
  }

  const headers = event?.headers || {};
  const netlifyEvent = String(
    headers['x-netlify-event'] || headers['X-Netlify-Event'] || ''
  ).trim();
  if (netlifyEvent === 'schedule') {
    // Netlify's scheduler has no Origin/Referer. Reject browser/curl-with-Origin spoofs.
    if (looksLikeBrowserInvoke(event)) {
      return {
        ok: false,
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    statusCode: 401,
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

module.exports = {
  assertScheduledInvoke,
  isLocalDev,
};
