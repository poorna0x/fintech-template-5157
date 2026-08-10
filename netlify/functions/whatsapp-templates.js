/**
 * List approved WhatsApp message templates from Meta (for cold outreach).
 * Auth: admin JWT. Env/secrets: WHATSAPP_ACCESS_TOKEN + WHATSAPP_WABA_ID (or app_secrets).
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase, getWhatsAppCredentials, GRAPH_VERSION } = require('./whatsapp-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function countBodyPlaceholders(components) {
  const body = (components || []).find((c) => c.type === 'BODY' || c.type === 'body');
  if (!body?.text) return 0;
  const named = body.text.match(/\{\{[a-z0-9_]+\}\}/gi) || [];
  const positional = body.text.match(/\{\{\d+\}\}/g) || [];
  // Prefer named count if present, else positional
  if (named.length) return named.length;
  return positional.length;
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return json(405, headers, { error: 'Method not allowed' });
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(401, headers, { error: auth.error || 'Unauthorized' });
  }

  const db = getServiceSupabase();
  const { accessToken, wabaId } = await getWhatsAppCredentials(db);
  if (!accessToken || !wabaId) {
    return json(500, headers, {
      error:
        'Set WHATSAPP_WABA_ID (WhatsApp Business Account ID) and access token in env or app_secrets',
    });
  }

  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`
    );
    url.searchParams.set('limit', '50');
    url.searchParams.set('fields', 'name,status,language,category,components');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(res.status >= 400 && res.status < 600 ? res.status : 502, headers, {
        error: data?.error?.message || 'Failed to list templates',
        meta: data,
      });
    }

    const mapped = (data.data || [])
      .filter((t) => String(t.status || '').toUpperCase() === 'APPROVED')
      .map((t) => ({
        name: t.name,
        language: t.language,
        category: t.category,
        bodyParamCount: countBodyPlaceholders(t.components),
        bodyPreview:
          (t.components || []).find((c) => c.type === 'BODY' || c.type === 'body')?.text || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const templates = mapped.filter(
      (t) => String(t.category || '').toUpperCase() !== 'MARKETING'
    );
    const marketingBlocked = mapped.filter(
      (t) => String(t.category || '').toUpperCase() === 'MARKETING'
    );

    return json(200, headers, {
      templates,
      marketingBlocked,
      recommended: [
        { name: 'svc_balance_due', language: 'en', hint: 'Balance due ({{1}} name, {{2}} amount)' },
        { name: 'svc_visit_reminder', language: 'en', hint: 'Visit reminder ({{1}} name, {{2}} when)' },
        { name: 'svc_visit_confirmed', language: 'en', hint: 'Booking confirmed ({{1}} name, {{2}} ref, {{3}} when)' },
        { name: 'svc_tech_assigned', language: 'en', hint: 'Tech assigned ({{1}} name, {{2}} tech)' },
        { name: 'svc_job_done', language: 'en', hint: 'Service done ({{1}} name, {{2}} amount)' },
        { name: 'svc_payment_received', language: 'en', hint: 'Payment thanks ({{1}} name, {{2}} amount)' },
        { name: 'svc_doc_pdf_v2', language: 'en', hint: 'Cold PDF (DOCUMENT header · {{1}} name, {{2}} label)' },
        { name: 'svc_service_request', language: 'en', hint: 'Service request open ({{1}} name) — UTILITY replacement for booking menu' },
        { name: 'svc_booking_confirmed_ero', language: 'en', hint: 'Booking confirmed Eleven RO (phone-only UTILITY)' },
        { name: 'svc_booking_confirmed_hro', language: 'en', hint: 'Booking confirmed Hydrogen RO (phone-only UTILITY)' },
        { name: 'svc_amc_expiry_notice', language: 'en', hint: 'AMC expiry (replaces marketing amc_renewal)' },
        { name: 'svc_parts_ready', language: 'en', hint: 'Spare parts arrived ({{1}} name)' },
        { name: 'svc_tech_delayed', language: 'en', hint: 'Technician delayed ({{1}} name, {{2}} when)' },
        { name: 'svc_visit_cancelled_ero', language: 'en', hint: 'Visit cancelled Eleven RO' },
        { name: 'svc_visit_cancelled_hro', language: 'en', hint: 'Visit cancelled Hydrogen RO' },
        { name: 'reschedule_visit_ero_cta', language: 'en', hint: 'Reschedule Eleven RO' },
        { name: 'reschedule_visit_hro_cta', language: 'en', hint: 'Reschedule Hydrogen RO' },
        { name: 'unregistered_number_service_ero_cta', language: 'en', hint: 'Unregistered number Eleven RO' },
        { name: 'unregistered_number_service_hro_cta', language: 'en', hint: 'Unregistered number Hydrogen RO' },
        { name: 'missed_call_callback_ero_cta', language: 'en', hint: 'Missed call Eleven RO' },
        { name: 'missed_call_callback_hro_cta', language: 'en', hint: 'Missed call Hydrogen RO' },
      ],
    });
  } catch (err) {
    console.error('[whatsapp-templates]', err?.message || err);
    return json(502, headers, { error: err?.message || 'Request failed' });
  }
};
