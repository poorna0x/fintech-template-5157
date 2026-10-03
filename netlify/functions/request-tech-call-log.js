// Admin asks one technician phone to upload the call log it already saved.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (shouldRejectMissingOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const auth = await authorizeAdminBearer(event, body);
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const technicianId = String(body.technicianId || '').trim();
  if (!technicianId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: insErr } = await db
    .from('technician_phone_call_logs')
    .insert({ technician_id: technicianId, status: 'pending' })
    .select('id')
    .single();
  if (insErr || !row?.id) {
    console.error('[request-tech-call-log] insert failed', insErr?.message || insErr);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not start the request' }) };
  }

  const siteUrl = (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    'https://hydrogenro.com'
  ).replace(/\/$/, '');

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      (token) => ({
        token,
        data: {
          type: 'call_log_request',
          silent: '1',
          requestId: String(row.id),
          uploadUrl: `${siteUrl}/.netlify/functions/upload-tech-call-log`,
        },
        android: { priority: 'high' },
      }),
      null
    );
    if (!tokens) {
      await db
        .from('technician_phone_call_logs')
        .update({ status: 'failed', error: 'Phone is not signed in', ready_at: new Date().toISOString() })
        .eq('id', row.id);
      return { statusCode: 200, headers, body: JSON.stringify({ requestId: row.id, sent: false }) };
    }
    if (!sent) {
      await db
        .from('technician_phone_call_logs')
        .update({ status: 'failed', error: 'Could not reach the phone', ready_at: new Date().toISOString() })
        .eq('id', row.id);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ requestId: row.id, sent: sent > 0 }) };
  } catch (err) {
    console.error('[request-tech-call-log] push failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed', requestId: row.id }) };
  }
};
