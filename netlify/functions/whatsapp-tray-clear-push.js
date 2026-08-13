/**
 * Admin: silent FCM so other Admin APKs drop the WhatsApp tray after this chat was opened.
 * Body: { phone }
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase } = require('./whatsapp-helper');
const { pushWhatsAppTrayClearToAdmins } = require('./admin-whatsapp-inbound-push');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(401, headers, { error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const phone = String(body.phone || body.phoneE164 || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return json(400, headers, { error: 'Phone required' });
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(503, headers, { error: 'Service unavailable' });
  }

  try {
    const result = await pushWhatsAppTrayClearToAdmins(db, phone);
    return json(200, headers, { ok: true, sent: result.sent || 0 });
  } catch (err) {
    console.warn('[whatsapp-tray-clear-push]', err?.message || err);
    return json(200, headers, { ok: false, sent: 0 });
  }
};
