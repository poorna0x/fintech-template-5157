/**
 * Admin-only: anonymize CRM personal data for a privacy erasure request.
 * Keeps jobs / AMC / authenticity fingerprints linked for analytics & legal retention.
 * Does NOT hard-delete the customer row.
 */
const { getCorsHeaders } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { createClient } = require('@supabase/supabase-js');
const { recordSecurityAudit } = require('./privacy-consent-helper');
const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function getServiceDb() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function redactAmcInfo(info) {
  if (!info || typeof info !== 'object') return info;
  const next = { ...info };
  delete next.customer_name;
  delete next.customer_phone;
  delete next.customer_email;
  delete next.customer_address;
  if (next.customer_address && typeof next.customer_address === 'object') {
    next.customer_address = { visible_address: 'Redacted' };
  }
  next.privacy_redacted_at = new Date().toISOString();
  return next;
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

  if (String(body.confirm || '').trim().toUpperCase() !== 'ANONYMIZE') {
    return json(400, headers, {
      error: 'Type ANONYMIZE to confirm. This clears personal fields but keeps jobs/AMC for records.',
    });
  }

  const requestId = String(body.requestId || body.id || '').trim();
  if (!requestId) return json(400, headers, { error: 'requestId required' });

  const { data: requestRow, error: reqErr } = await db
    .from('privacy_requests')
    .select(
      'id,request_type,status,brand,requester_name,requester_phone,requester_email,customer_id,admin_notes'
    )
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr || !requestRow) return json(404, headers, { error: 'Privacy request not found' });

  const phone = String(requestRow.requester_phone || body.phone || '')
    .replace(/\D/g, '')
    .slice(-10);

  let customerId = requestRow.customer_id || null;
  if (!customerId && phone.length === 10) {
    const hit = await findCustomerByPhoneDigits(db, phone, 'id');
    customerId = hit?.id || null;
  }
  if (!customerId) {
    return json(404, headers, {
      error: 'No CRM customer linked to this request. Export first or link the customer.',
    });
  }

  const { data: customer, error: custErr } = await db
    .from('customers')
    .select(
      'id,customer_id,full_name,phone,alternate_phone,email,photos,status'
    )
    .eq('id', customerId)
    .maybeSingle();
  if (custErr || !customer) {
    return json(404, headers, { error: 'Customer row not found' });
  }

  // Already anonymized?
  if (
    String(customer.phone || '').startsWith('X-ERASED-') ||
    String(customer.full_name || '').startsWith('Erased customer')
  ) {
    return json(200, headers, {
      ok: true,
      already: true,
      customer_id: customer.customer_id,
      message: 'Customer already anonymized',
    });
  }

  const code = String(customer.customer_id || customer.id).slice(0, 12);
  const erasedPhone = `X-ERASED-${code}`;
  const nowIso = new Date().toISOString();

  const patch = {
    full_name: `Erased customer (${code})`,
    phone: erasedPhone,
    alternate_phone: null,
    email: null,
    address: null,
    location: null,
    visible_address: null,
    alternate_address: null,
    alternate_location: null,
    alternate_visible_address: null,
    photos: [],
    notes: `[Privacy anonymized ${nowIso.slice(0, 10)} · request ${requestId}]`,
    gst_number: null,
    updated_at: nowIso,
  };

  const { error: updErr } = await db.from('customers').update(patch).eq('id', customerId);
  if (updErr) {
    console.warn('[privacy-customer-anonymize] customer update', updErr.message);
    return json(500, headers, { error: 'Could not anonymize customer' });
  }

  // Withdraw marketing / booking consents for this identity.
  try {
    const consentOr = [
      `customer_id.eq.${customerId}`,
      phone.length === 10 ? `phone_e164.eq.91${phone}` : null,
      phone.length === 10 ? `phone_e164.eq.+91${phone}` : null,
      phone.length === 10 ? `phone_e164.eq.${phone}` : null,
    ]
      .filter(Boolean)
      .join(',');
    await db
      .from('customer_consents')
      .update({
        granted: false,
        withdrawn_at: nowIso,
        phone_e164: phone.length === 10 ? `erased:${phone.slice(-4)}` : null,
      })
      .or(consentOr)
      .is('withdrawn_at', null);
  } catch (err) {
    console.warn('[privacy-customer-anonymize] consents soft-fail', err?.message || err);
  }

  // Redact PII nested in AMC additional_info (keep contract dates/amounts).
  try {
    const { data: amcs } = await db
      .from('amc_contracts')
      .select('id,additional_info')
      .eq('customer_id', customerId)
      .limit(100);
    for (const row of amcs || []) {
      const redacted = redactAmcInfo(row.additional_info);
      if (redacted !== row.additional_info) {
        await db.from('amc_contracts').update({ additional_info: redacted }).eq('id', row.id);
      }
    }
  } catch (err) {
    console.warn('[privacy-customer-anonymize] amc soft-fail', err?.message || err);
  }

  // Unlink WhatsApp thread identity from CRM (messages retained by phone for ops/disputes).
  try {
    await db.from('whatsapp_messages').update({ customer_id: null }).eq('customer_id', customerId);
  } catch (err) {
    console.warn('[privacy-customer-anonymize] wa unlink soft-fail', err?.message || err);
  }

  // Gallery PDFs are personal files — drop R2 objects + rows (table may not exist yet).
  try {
    const { deleteR2Object } = require('./r2-helper');
    const { data: docs, error: docsErr } = await db
      .from('customer_documents')
      .select('id, media_url')
      .eq('customer_id', customerId)
      .limit(200);
    if (!docsErr && docs?.length) {
      for (const row of docs) {
        if (row.media_url) await deleteR2Object(row.media_url);
      }
      await db.from('customer_documents').delete().eq('customer_id', customerId);
    }
  } catch (err) {
    console.warn('[privacy-customer-anonymize] customer docs soft-fail', err?.message || err);
  }

  const noteLine = `Anonymized CRM ${code} on ${nowIso.slice(0, 10)} (jobs/AMC kept).`;
  const prevNotes = String(requestRow.admin_notes || body.admin_notes || '').trim();
  const adminNotes = prevNotes ? `${prevNotes}\n${noteLine}` : noteLine;

  await db
    .from('privacy_requests')
    .update({
      customer_id: customerId,
      status: 'completed',
      completed_at: nowIso,
      admin_notes: adminNotes,
      updated_at: nowIso,
    })
    .eq('id', requestId);

  await recordSecurityAudit(db, {
    eventType: 'privacy',
    action: 'privacy_customer_anonymize',
    result: 'ok',
    actorUserId: admin.userId,
    targetType: 'customer',
    targetId: customerId,
    meta: {
      request_id: requestId,
      customer_code: code,
      phone_tail: phone ? phone.slice(-4) : null,
      kept: ['jobs', 'amc_contracts', 'document_pdf_authenticity'],
      cleared: ['name', 'phone', 'email', 'address', 'location', 'photos', 'consents'],
    },
  });

  return json(200, headers, {
    ok: true,
    customer_id: code,
    internal_id: customerId,
    erased_phone: erasedPhone,
    message:
      'Personal data anonymized. Jobs, AMC, and document fingerprints kept for analytics / legal retention.',
  });
};
