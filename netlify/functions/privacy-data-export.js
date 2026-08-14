/**
 * Admin-only: build a DSAR data pack for a privacy request (by id) or phone.
 * Returns slim JSON — client zips JSON + printable HTML for WhatsApp/email send.
 */
const { getCorsHeaders } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { createClient } = require('@supabase/supabase-js');
const { recordSecurityAudit } = require('./privacy-consent-helper');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function getServiceDb() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function phoneVariants(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const ten = d.slice(-10);
  if (ten.length !== 10) return [];
  return [...new Set([ten, `91${ten}`, `+91${ten}`])];
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

  const admin = await authorizeAdminRequest(event);
  if (!admin.ok) return json(401, headers, { error: 'Unauthorized' });

  const db = getServiceDb();
  if (!db) return json(500, headers, { error: 'Server misconfigured' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const requestId = String(body.requestId || body.id || '').trim();
  let phone = String(body.phone || '').replace(/\D/g, '').slice(-10);
  let requestRow = null;

  if (requestId) {
    const { data, error } = await db
      .from('privacy_requests')
      .select(
        'id,request_type,status,brand,requester_name,requester_phone,requester_email,customer_id,details,created_at,sla_due_at'
      )
      .eq('id', requestId)
      .maybeSingle();
    if (error || !data) return json(404, headers, { error: 'Privacy request not found' });
    requestRow = data;
    if (!phone) phone = String(data.requester_phone || '').replace(/\D/g, '').slice(-10);
  }

  if (phone.length !== 10) {
    return json(400, headers, { error: '10-digit phone required to export' });
  }

  const variants = phoneVariants(phone);
  let customer = null;
  for (const p of variants) {
    const { data } = await db
      .from('customers')
      .select(
        'id,customer_id,full_name,phone,alternate_phone,email,address,location,visible_address,service_type,brand,model,installation_date,warranty_expiry,status,member_since,last_service_date,created_at,updated_at'
      )
      .eq('phone', p)
      .maybeSingle();
    if (data) {
      customer = data;
      break;
    }
  }
  if (!customer) {
    for (const p of variants) {
      const { data } = await db
        .from('customers')
        .select(
          'id,customer_id,full_name,phone,alternate_phone,email,address,location,visible_address,service_type,brand,model,installation_date,warranty_expiry,status,member_since,last_service_date,created_at,updated_at'
        )
        .eq('alternate_phone', p)
        .limit(1)
        .maybeSingle();
      if (data) {
        customer = data;
        break;
      }
    }
  }

  let jobs = [];
  if (customer?.id) {
    const { data } = await db
      .from('jobs')
      .select(
        'id,job_number,status,service_type,scheduled_date,scheduled_time_slot,completed_at,total_amount,payment_method,payment_status,booking_source,created_at,address,visible_address'
      )
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(200);
    jobs = data || [];
  }

  const { data: consents } = await db
    .from('customer_consents')
    .select('id,purpose,channel,brand,notice_version,granted,consented_at,withdrawn_at,policy_url')
    .or(
      [
        customer?.id ? `customer_id.eq.${customer.id}` : null,
        `phone_e164.eq.91${phone}`,
        `phone_e164.eq.${phone}`,
      ]
        .filter(Boolean)
        .join(',')
    )
    .order('consented_at', { ascending: false })
    .limit(100);

  const pack = {
    exported_at: new Date().toISOString(),
    export_purpose: 'DPDP data principal access request',
    brand: requestRow?.brand || body.brand || 'hydrogenro',
    privacy_request: requestRow,
    lookup_phone: phone,
    customer: customer || null,
    customer_found: Boolean(customer),
    jobs,
    consents: consents || [],
    notes: customer
      ? null
      : 'No customer row matched this phone. Pack includes the privacy request and any consents for the number.',
  };

  await recordSecurityAudit(db, {
    eventType: 'privacy',
    action: 'privacy_data_export',
    result: 'ok',
    actorUserId: admin.userId,
    targetType: 'privacy_request',
    targetId: requestId || phone,
    meta: {
      phone_tail: phone.slice(-4),
      customer_found: Boolean(customer),
      jobs: jobs.length,
    },
  });

  return json(200, headers, { pack });
};
