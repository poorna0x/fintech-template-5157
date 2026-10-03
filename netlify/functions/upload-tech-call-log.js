// Technician phone uploads the call log it already saved, for one admin request.
const { createClient } = require('@supabase/supabase-js');

const HEADERS = { 'Content-Type': 'application/json' };
const MAX_CALLS = 400;

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function cleanCall(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Number(raw.at);
  if (!Number.isFinite(at) || at < 1_000_000_000_000) return null;
  const number = String(raw.number || '').replace(/[^\d+]/g, '').slice(0, 20);
  if (number.replace(/\D/g, '').length < 5) return null;
  const type = Math.max(0, Math.min(20, Math.floor(Number(raw.type) || 0)));
  const seconds = Math.max(0, Math.min(24 * 60 * 60, Math.floor(Number(raw.seconds) || 0)));
  const name = String(raw.name || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);
  return { at: Math.floor(at), number, type, seconds, name };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const requestId = String(body.requestId || '').trim();
  const deviceToken = String(body.token || '').trim();
  if (!requestId || deviceToken.length < 20) return json(401, { error: 'Unauthorized' });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Server misconfigured' });

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tokenRow } = await db
    .from('technician_push_tokens')
    .select('technician_id')
    .eq('token', deviceToken)
    .maybeSingle();
  let technicianId = tokenRow?.technician_id || null;
  if (!technicianId) {
    const { data: legacyRow } = await db
      .from('technician_live_locations')
      .select('technician_id')
      .eq('fcm_token', deviceToken)
      .maybeSingle();
    technicianId = legacyRow?.technician_id || null;
  }
  if (!technicianId) return json(401, { error: 'Unauthorized' });

  const { data: request } = await db
    .from('technician_phone_call_logs')
    .select('id, technician_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!request || request.technician_id !== technicianId) return json(401, { error: 'Unauthorized' });
  if (request.status === 'ready') return json(200, { ok: true, reason: 'already' });

  const calls = [];
  if (Array.isArray(body.calls)) {
    for (const raw of body.calls) {
      if (calls.length >= MAX_CALLS) break;
      const row = cleanCall(raw);
      if (row) calls.push(row);
    }
  }
  const error = String(body.error || '').trim().slice(0, 160);

  const { error: updErr } = await db
    .from('technician_phone_call_logs')
    .update({
      status: error && calls.length === 0 ? 'failed' : 'ready',
      calls,
      error: error || null,
      ready_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('technician_id', technicianId);
  if (updErr) {
    console.error('[upload-tech-call-log] save failed', updErr.message);
    return json(500, { error: 'Save failed' });
  }
  return json(200, { ok: true, count: calls.length });
};
