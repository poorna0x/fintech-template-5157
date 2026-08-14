/**
 * Admin-only: build a DSAR data pack for a privacy request (by id) or phone.
 * Returns slim JSON — client zips JSON + printable HTML for WhatsApp/email send.
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

const CUSTOMER_COLS =
  'id,customer_id,full_name,phone,alternate_phone,email,address,location,visible_address,service_type,brand,model,installation_date,warranty_expiry,status,customer_since,last_service_date,photos,notes,created_at,updated_at,gst_number,alternate_address,alternate_location,alternate_visible_address,alternate_brand,alternate_model,alternate_service_type,has_prefilter,raw_water_tds,preferred_time_slot,preferred_language,has_google_review';

const JOB_COLS =
  'id,job_number,status,service_type,service_sub_type,scheduled_date,scheduled_time_slot,completed_at,end_time,payment_amount,actual_cost,payment_method,payment_status,booking_source,created_at,service_address,service_location,service_brand,before_photos,after_photos,images,brand,model';

async function softSelect(db, table, columns, build) {
  let q = db.from(table).select(columns);
  q = build(q);
  const { data, error } = await q;
  if (error) {
    console.warn(`[privacy-data-export] ${table}`, error.message);
    return [];
  }
  return data || [];
}

async function loadCustomerFull(db, customerId) {
  if (!customerId) return null;
  const { data, error } = await db.from('customers').select(CUSTOMER_COLS).eq('id', customerId).maybeSingle();
  if (error) {
    console.warn('[privacy-data-export] customer select', error.message);
    // Retry with a smaller column set if a column is missing.
    const { data: fallback, error: err2 } = await db
      .from('customers')
      .select(
        'id,customer_id,full_name,phone,alternate_phone,email,address,location,visible_address,service_type,brand,model,photos,notes,created_at,updated_at,last_service_date,status'
      )
      .eq('id', customerId)
      .maybeSingle();
    if (err2) {
      console.warn('[privacy-data-export] customer fallback', err2.message);
      return null;
    }
    return fallback;
  }
  return data;
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

  let customer = null;
  if (requestRow?.customer_id) {
    customer = await loadCustomerFull(db, requestRow.customer_id);
  }
  if (!customer) {
    const hit = await findCustomerByPhoneDigits(db, phone, 'id');
    if (hit?.id) customer = await loadCustomerFull(db, hit.id);
  }

  // Back-fill this request + any other open/closed requests for the same phone.
  if (customer?.id && phone.length === 10) {
    try {
      await db
        .from('privacy_requests')
        .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
        .is('customer_id', null)
        .or(`requester_phone.eq.${phone},requester_phone.eq.91${phone},requester_phone.eq.+91${phone}`);
      if (requestRow) requestRow.customer_id = customer.id;
    } catch (err) {
      console.warn('[privacy-data-export] link customer soft-fail', err?.message || err);
    }
  }

  const customerId = customer?.id || null;

  const jobs = customerId
    ? await softSelect(db, 'jobs', JOB_COLS, (q) =>
        q.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(200)
      )
    : [];

  const amcContracts = customerId
    ? await softSelect(
        db,
        'amc_contracts',
        'id,status,start_date,end_date,years,service_period_months,service_brand,includes_prefilter,additional_info,created_at',
        (q) => q.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50)
      )
    : [];

  const pdfAuthenticity = customerId
    ? await softSelect(
        db,
        'document_pdf_authenticity',
        'id,doc_type,document_ref,verify_code,pdf_filename,generated_on,created_at,sha256_hex,pdf_byte_length',
        (q) => q.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100)
      )
    : [];

  const taxInvoices = customerId
    ? await softSelect(
        db,
        'tax_invoices',
        'id,invoice_number,invoice_date,invoice_type,customer_name,customer_phone,customer_email,total_amount,total_tax,service_type,created_at',
        (q) => q.eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100)
      )
    : [];

  const callHistory = customerId
    ? await softSelect(
        db,
        'call_history',
        'id,contact_type,contact_method,phone_number,message_sent,status,notes,contacted_at,created_at',
        (q) => q.eq('customer_id', customerId).order('contacted_at', { ascending: false }).limit(100)
      )
    : [];

  const waFilterParts = [
    customerId ? `customer_id.eq.${customerId}` : null,
    `phone_e164.eq.91${phone}`,
    `phone_e164.eq.+91${phone}`,
  ].filter(Boolean);

  const whatsappMessages = await softSelect(
    db,
    'whatsapp_messages',
    'id,direction,msg_type,body,filename,media_url,media_mime,status,template_name,created_at,phone_e164',
    (q) =>
      q
        .or(waFilterParts.join(','))
        .order('created_at', { ascending: false })
        .limit(100)
  );

  // Linked PDFs / files that were actually sent or received on WhatsApp (R2).
  const whatsappMediaRaw = await softSelect(
    db,
    'whatsapp_messages',
    'id,direction,msg_type,filename,media_url,media_mime,created_at',
    (q) =>
      q
        .or(waFilterParts.join(','))
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200)
  );

  const whatsappDocuments = [];
  const byBase = new Map();
  for (const row of whatsappMediaRaw) {
    const mime = String(row.media_mime || '').toLowerCase();
    const filename = String(row.filename || '').trim();
    const isPdf =
      mime.includes('pdf') ||
      /\.pdf$/i.test(filename) ||
      row.msg_type === 'document';
    if (!isPdf || !row.media_url) continue;
    const isPreview = /^PREVIEW_/i.test(filename);
    const baseKey = (filename.replace(/^PREVIEW_/i, '') || String(row.id)).toLowerCase();
    const prev = byBase.get(baseKey);
    if (!prev) {
      byBase.set(baseKey, { row, isPreview });
      continue;
    }
    // Prefer non-preview; if both same class, keep newer (already sorted desc).
    if (prev.isPreview && !isPreview) byBase.set(baseKey, { row, isPreview });
  }
  for (const { row, isPreview } of byBase.values()) {
    const filename = String(row.filename || '').trim() || `document-${String(row.id).slice(0, 8)}.pdf`;
    whatsappDocuments.push({
      id: row.id,
      direction: row.direction,
      filename,
      media_url: row.media_url,
      media_mime: row.media_mime || 'application/pdf',
      created_at: row.created_at,
      is_preview: isPreview,
    });
    if (whatsappDocuments.length >= 60) break;
  }

  const { count: whatsappTotal } = await db
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .or(waFilterParts.join(','));

  const { data: consents } = await db
    .from('customer_consents')
    .select('id,purpose,channel,brand,notice_version,granted,consented_at,withdrawn_at,policy_url')
    .or(
      [
        customerId ? `customer_id.eq.${customerId}` : null,
        `phone_e164.eq.91${phone}`,
        `phone_e164.eq.${phone}`,
        `phone_e164.eq.+91${phone}`,
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
    customer_code: customer?.customer_id || null,
    jobs,
    amc_contracts: amcContracts,
    pdf_authenticity: pdfAuthenticity,
    tax_invoices: taxInvoices,
    call_history: callHistory,
    whatsapp_messages: whatsappMessages,
    whatsapp_documents: whatsappDocuments,
    whatsapp_message_total: whatsappTotal ?? whatsappMessages.length,
    consents: consents || [],
    summary: {
      photos: Array.isArray(customer?.photos) ? customer.photos.length : 0,
      jobs: jobs.length,
      amc: amcContracts.length,
      pdf_fingerprints: pdfAuthenticity.length,
      tax_invoices: taxInvoices.length,
      call_history: callHistory.length,
      whatsapp_messages: whatsappTotal ?? whatsappMessages.length,
      whatsapp_documents: whatsappDocuments.length,
      consents: (consents || []).length,
      has_location: Boolean(customer?.location),
    },
    notes: customer
      ? 'Document files in the ZIP come from WhatsApp R2 copies (quotations, bills, AMC sent on chat) plus regenerated AMC from CRM contracts. Fingerprint rows are metadata only.'
      : 'No customer row matched this phone. Pack includes the privacy request and any consents for the number.',
    documents_note:
      'Bundled PDFs are real files from WhatsApp storage and/or regenerated AMC. Authenticity fingerprint list is not a download catalog.',
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
      customer_code: customer?.customer_id || null,
      ...pack.summary,
    },
  });

  return json(200, headers, { pack });
};
