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

    const templates = (data.data || [])
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

    return json(200, headers, {
      templates,
      recommended: [
        { name: 'svc_balance_due', language: 'en', hint: 'Balance due ({{1}} name, {{2}} amount)' },
        { name: 'svc_visit_reminder', language: 'en', hint: 'Visit reminder ({{1}} name, {{2}} when)' },
        { name: 'svc_visit_confirmed', language: 'en', hint: 'Booking confirmed ({{1}} name, {{2}} ref, {{3}} when)' },
        { name: 'svc_tech_assigned', language: 'en', hint: 'Tech assigned ({{1}} name, {{2}} tech)' },
        { name: 'svc_completed', language: 'en', hint: 'Service done ({{1}} name, {{2}} amount)' },
        { name: 'svc_payment_received', language: 'en', hint: 'Payment thanks ({{1}} name, {{2}} amount)' },
        { name: 'svc_document_pdf', language: 'en', hint: 'Cold PDF (DOCUMENT header · {{1}} name, {{2}} label)' },
      ],
    });
  } catch (err) {
    console.error('[whatsapp-templates]', err?.message || err);
    return json(502, headers, { error: err?.message || 'Request failed' });
  }
};
