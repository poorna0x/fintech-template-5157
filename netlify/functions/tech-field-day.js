/**
 * Admin-only: load technician field hours/km for a calendar day (IST).
 * POST { date?: "YYYY-MM-DD" } — omit date for today. Does not send push.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase } = require('./whatsapp-helper');
const { collectTechFieldDay, nowMsForIstDateKey } = require('./tech-field-day-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const headers = {
    ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, private',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { ok: false, error: 'Forbidden' });
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { ok: false, error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { ok: false, error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { ok: false, error: 'Invalid JSON' });
  }

  const db = getServiceSupabase();
  if (!db) return json(503, headers, { ok: false, error: 'Database unavailable' });

  const dateKey = String(body.date || '').trim();
  const nowMs = nowMsForIstDateKey(dateKey);
  try {
    const day = await collectTechFieldDay(db, nowMs);
    return json(200, headers, { ok: true, date: dateKey || null, ...day });
  } catch (err) {
    console.error('[tech-field-day]', err?.message || err);
    return json(500, headers, { ok: false, error: err?.message || 'Could not load technician day' });
  }
};
