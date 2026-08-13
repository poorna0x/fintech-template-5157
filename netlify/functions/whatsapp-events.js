/**
 * List recent WhatsApp activity for /whatsapp-test (POC).
 * Auth: WHATSAPP_POC_SECRET via ?secret= or x-wa-poc-secret, or admin JWT.
 * Returns in-memory webhook buffer + last 50 DB rows (long retention).
 */
const { getCorsHeaders } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { listEvents, clearEvents } = require('./whatsapp-event-store');
const {
  getServiceSupabase,
  WHATSAPP_MESSAGE_LIST_COLUMNS,
} = require('./whatsapp-helper');

async function isAuthorized(event) {
  const pocSecret = (process.env.WHATSAPP_POC_SECRET || '').trim();
  if (pocSecret) {
    const q = event.queryStringParameters || {};
    const provided =
      String(q.secret || '').trim() ||
      String(event.headers['x-wa-poc-secret'] || event.headers['X-Wa-Poc-Secret'] || '').trim();
    if (provided === pocSecret) return true;
  }
  const auth = await authorizeAdminRequest(event);
  return auth.ok;
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (!(await isAuthorized(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (event.httpMethod === 'DELETE') {
    clearEvents();
    return { statusCode: 200, headers, body: JSON.stringify({ cleared: true }) };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const memoryEvents = listEvents();
  let messages = [];
  const db = getServiceSupabase();
  if (db) {
    const { data, error } = await db
      .from('whatsapp_messages')
      .select(WHATSAPP_MESSAGE_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[whatsapp-events] list failed', error.message);
    } else {
      messages = data || [];
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ events: memoryEvents, messages }),
  };
};
