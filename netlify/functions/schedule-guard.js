// Auth gate for Netlify scheduled (cron) functions.
//
// Safe for existing deploys:
// - Netlify's scheduler always sends `x-netlify-event: schedule` → allowed.
// - Optional CRON_SECRET allows manual/ops invokes (Bearer or X-Cron-Secret).
// - Local `netlify dev` is allowed so cron handlers stay testable.
//
// Rejects bare public POSTs that omit the schedule header / secret.
// Note: x-netlify-event can be spoofed; set CRON_SECRET later if Netlify
// gains schedule-header injection, or pair with IP allowlists.

function isLocalDev() {
  if (process.env.NETLIFY_DEV === 'true') return true;
  if (process.env.CONTEXT === 'dev') return true;
  if (process.env.CORS_PERMISSIVE === 'true') return true;
  return false;
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

/**
 * @param {import('@netlify/functions').HandlerEvent | { headers?: Record<string, string> }} event
 * @returns {{ ok: true } | { ok: false, statusCode: number, body: string }}
 */
function assertScheduledInvoke(event) {
  if (isLocalDev()) {
    return { ok: true };
  }

  const expected = String(process.env.CRON_SECRET || '').trim();
  const provided = readCronSecret(event);
  if (expected && provided && provided === expected) {
    return { ok: true };
  }

  const headers = event?.headers || {};
  const netlifyEvent = String(
    headers['x-netlify-event'] || headers['X-Netlify-Event'] || ''
  ).trim();
  if (netlifyEvent === 'schedule') {
    return { ok: true };
  }

  // Production with CRON_SECRET set but caller used only schedule header is OK
  // (Netlify schedule cannot attach custom secrets today). Already handled above.
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
