/**
 * WhatsApp message templates (Meta WABA).
 * GET  — approved list for inbox cold picker (default)
 * GET  ?manage=1 — all statuses + full components (Settings UI)
 * POST — create UTILITY template
 * DELETE ?name= — delete template by name
 *
 * Auth: admin JWT. Secrets: WHATSAPP_ACCESS_TOKEN + WHATSAPP_WABA_ID (or app_secrets).
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
  if (named.length) return named.length;
  return positional.length;
}

function summarizeButtons(components) {
  const btns =
    (components || []).find((c) => String(c.type || '').toUpperCase() === 'BUTTONS')?.buttons ||
    [];
  return btns.map((b) => {
    const type = String(b.type || '').toUpperCase();
    if (type === 'PHONE_NUMBER') {
      return { type: 'PHONE_NUMBER', text: b.text || 'Call us', phone: b.phone_number || null };
    }
    if (type === 'URL') {
      return { type: 'URL', text: b.text || 'Open', url: b.url || null };
    }
    if (type === 'QUICK_REPLY') {
      return { type: 'QUICK_REPLY', text: b.text || 'Reply' };
    }
    return { type, text: b.text || null };
  });
}

function headerSummary(components) {
  const header = (components || []).find((c) => String(c.type || '').toUpperCase() === 'HEADER');
  if (!header) return null;
  return {
    format: String(header.format || '').toUpperCase() || null,
  };
}

function mapTemplateRow(t) {
  const components = t.components || [];
  const body =
    components.find((c) => String(c.type || '').toUpperCase() === 'BODY')?.text || null;
  return {
    id: t.id || null,
    name: t.name,
    language: t.language,
    status: String(t.status || '').toUpperCase(),
    category: t.category || null,
    bodyParamCount: countBodyPlaceholders(components),
    bodyPreview: body,
    header: headerSummary(components),
    buttons: summarizeButtons(components),
    components,
  };
}

const RECOMMENDED = [
  {
    name: 'svc_balance_due_letter_hro_img_v5',
    language: 'en',
    hint: 'Balance due + QR IMAGE (HRO · no contact footer · Pay now)',
  },
  {
    name: 'svc_balance_due_letter_ero_img_v5',
    language: 'en',
    hint: 'Balance due + QR IMAGE (ERO · no contact footer · Pay now)',
  },
  {
    name: 'svc_balance_due_letter_hro_v9',
    language: 'en',
    hint: 'Balance due letter + Pay now (HRO · no contact footer)',
  },
  {
    name: 'svc_balance_due_letter_ero_v9',
    language: 'en',
    hint: 'Balance due letter + Pay now (ERO · no contact footer)',
  },
  { name: 'svc_visit_reminder', language: 'en', hint: 'Visit reminder ({{1}} name, {{2}} when)' },
  {
    name: 'svc_visit_confirmed',
    language: 'en',
    hint: 'Booking confirmed ({{1}} name, {{2}} ref, {{3}} when)',
  },
  { name: 'svc_tech_assigned', language: 'en', hint: 'Tech assigned ({{1}} name, {{2}} tech)' },
  { name: 'svc_job_done', language: 'en', hint: 'Service done ({{1}} name, {{2}} amount)' },
  {
    name: 'svc_payment_received',
    language: 'en',
    hint: 'Payment thanks ({{1}} name, {{2}} amount)',
  },
  {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    hint: 'Cold PDF (DOCUMENT header · {{1}} name, {{2}} label)',
  },
  {
    name: 'svc_service_request',
    language: 'en',
    hint: 'Service request open ({{1}} name) — UTILITY replacement for booking menu',
  },
  {
    name: 'svc_booking_confirmed_letter_hro_v4',
    language: 'en',
    hint: 'Booking confirmed letter Hydrogen RO v4',
  },
  {
    name: 'svc_booking_confirmed_letter_ero_v4',
    language: 'en',
    hint: 'Booking confirmed letter Eleven RO v4',
  },
  {
    name: 'svc_amc_expiry_notice',
    language: 'en',
    hint: 'AMC expiry (replaces marketing amc_renewal)',
  },
  { name: 'svc_parts_ready', language: 'en', hint: 'Spare parts arrived ({{1}} name)' },
  { name: 'svc_tech_delayed', language: 'en', hint: 'Technician delayed ({{1}} name, {{2}} when)' },
  { name: 'svc_visit_cancelled_ero', language: 'en', hint: 'Visit cancelled Eleven RO' },
  { name: 'svc_visit_cancelled_hro', language: 'en', hint: 'Visit cancelled Hydrogen RO' },
  { name: 'reschedule_visit_ero_cta', language: 'en', hint: 'Reschedule Eleven RO' },
  { name: 'reschedule_visit_hro_cta', language: 'en', hint: 'Reschedule Hydrogen RO' },
  {
    name: 'existing_service_schedule_hro_cta_v2',
    language: 'en',
    hint: 'Existing customer schedule HRO v2',
  },
  {
    name: 'existing_service_schedule_ero_cta_v2',
    language: 'en',
    hint: 'Existing customer schedule ERO v2',
  },
  {
    name: 'unregistered_number_service_ero_cta',
    language: 'en',
    hint: 'Unregistered number Eleven RO',
  },
  {
    name: 'unregistered_number_service_hro_cta',
    language: 'en',
    hint: 'Unregistered number Hydrogen RO',
  },
  {
    name: 'svc_missed_call',
    language: 'en',
    hint: 'Missed call callback ({{1}} name) — UTILITY',
  },
  {
    name: 'missed_call_callback_ero_cta',
    language: 'en',
    hint: 'Missed call Eleven RO (Call+Book CTA)',
  },
  {
    name: 'missed_call_callback_hro_cta',
    language: 'en',
    hint: 'Missed call Hydrogen RO (Call+Book CTA)',
  },
];

async function listAllTemplates(accessToken, wabaId) {
  const out = [];
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`
    );
    url.searchParams.set('limit', '100');
    url.searchParams.set('fields', 'id,name,status,language,category,components');
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || 'Failed to list templates');
      err.status = res.status;
      err.meta = data;
      throw err;
    }
    for (const row of data.data || []) out.push(row);
    after = data.paging?.cursors?.after || null;
    if (!after || !(data.data || []).length) break;
  }
  return out;
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return {};
  }
}

function sanitizeTemplateName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 512);
}

function placeholderIndexes(body) {
  const indexes = new Set();
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    indexes.add(Number(m[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

function buildCreatePayload(body) {
  const name = sanitizeTemplateName(body.name);
  const text = String(body.body || '').trim();
  const language = String(body.language || 'en').trim() || 'en';
  if (!name || name.length < 3) {
    return { error: 'Template name must be at least 3 characters (a-z, 0-9, _)' };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return { error: 'Name must start with a letter and use only lowercase letters, numbers, _' };
  }
  if (!text || text.length < 10) {
    return { error: 'Body text is required (min 10 characters)' };
  }
  if (text.length > 1024) {
    return { error: 'Body text max 1024 characters' };
  }

  const idxs = placeholderIndexes(text);
  const examplesIn = Array.isArray(body.examples) ? body.examples.map((x) => String(x ?? '')) : [];
  const examples = idxs.map((n, i) => {
    const fromIndex = examplesIn[n - 1];
    const fromPos = examplesIn[i];
    return String(fromIndex || fromPos || `Sample${n}`).slice(0, 60) || `Sample${n}`;
  });

  const components = [
    {
      type: 'BODY',
      text,
      ...(examples.length
        ? { example: { body_text: [examples] } }
        : {}),
    },
  ];

  const buttons = [];
  const callDigits = String(body.callPhone || '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (callDigits.length >= 10) {
    const phone_number =
      callDigits.length === 10
        ? `+91${callDigits}`
        : callDigits.startsWith('91')
          ? `+${callDigits}`
          : `+${callDigits}`;
    buttons.push({
      type: 'PHONE_NUMBER',
      text: String(body.callButtonText || 'Call us').slice(0, 25),
      phone_number,
    });
  }

  const urlButton = String(body.urlButtonUrl || '').trim();
  if (urlButton) {
    if (!/^https:\/\//i.test(urlButton)) {
      return { error: 'URL button must be an https:// link' };
    }
    buttons.push({
      type: 'URL',
      text: String(body.urlButtonText || 'Open').slice(0, 25),
      url: urlButton.slice(0, 2000),
    });
  }

  const quickReply = String(body.quickReply || '').trim();
  if (quickReply) {
    buttons.push({
      type: 'QUICK_REPLY',
      text: quickReply.slice(0, 25),
    });
  }

  if (buttons.length > 3) {
    return { error: 'Max 3 buttons (Call / URL / Quick reply)' };
  }
  if (buttons.length) {
    components.push({ type: 'BUTTONS', buttons });
  }

  return {
    payload: {
      name,
      language,
      category: 'UTILITY',
      allow_category_change: true,
      components,
    },
  };
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
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

  const method = String(event.httpMethod || 'GET').toUpperCase();
  const qs = event.queryStringParameters || {};

  try {
    if (method === 'GET') {
      const manage = qs.manage === '1' || qs.manage === 'true' || qs.all === '1';
      const raw = await listAllTemplates(accessToken, wabaId);

      if (manage) {
        const templates = raw.map(mapTemplateRow).sort((a, b) => {
          const statusRank = (s) =>
            s === 'APPROVED' ? 0 : s === 'PENDING' ? 1 : s === 'REJECTED' ? 2 : 3;
          const ra = statusRank(a.status);
          const rb = statusRank(b.status);
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
        const counts = {
          total: templates.length,
          approved: templates.filter((t) => t.status === 'APPROVED').length,
          pending: templates.filter((t) => t.status === 'PENDING').length,
          rejected: templates.filter((t) => t.status === 'REJECTED').length,
          other: templates.filter(
            (t) => !['APPROVED', 'PENDING', 'REJECTED'].includes(t.status)
          ).length,
        };
        return json(200, headers, { templates, counts, recommended: RECOMMENDED });
      }

      // Inbox / cold picker: APPROVED non-marketing only (compat)
      const mapped = raw
        .filter((t) => String(t.status || '').toUpperCase() === 'APPROVED')
        .map((t) => ({
          name: t.name,
          language: t.language,
          category: t.category,
          bodyParamCount: countBodyPlaceholders(t.components),
          bodyPreview:
            (t.components || []).find((c) => c.type === 'BODY' || c.type === 'body')?.text ||
            null,
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
        recommended: RECOMMENDED,
      });
    }

    if (method === 'DELETE') {
      const name = sanitizeTemplateName(qs.name || parseBody(event).name);
      if (!name) {
        return json(400, headers, { error: 'Missing template name' });
      }
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
        wabaId
      )}/message_templates?name=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json(res.status >= 400 && res.status < 600 ? res.status : 502, headers, {
          error: data?.error?.message || 'Failed to delete template',
          meta: data,
        });
      }
      return json(200, headers, { ok: true, name, meta: data });
    }

    if (method === 'POST') {
      const body = parseBody(event);
      const built = buildCreatePayload(body);
      if (built.error) {
        return json(400, headers, { error: built.error });
      }
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(built.payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json(res.status >= 400 && res.status < 600 ? res.status : 502, headers, {
          error: data?.error?.message || 'Failed to create template',
          meta: data,
        });
      }
      return json(200, headers, {
        ok: true,
        id: data.id || null,
        status: data.status || 'PENDING',
        category: data.category || 'UTILITY',
        name: built.payload.name,
        payload: built.payload,
        meta: data,
      });
    }

    return json(405, headers, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[whatsapp-templates]', err?.message || err);
    const status = err?.status >= 400 && err?.status < 600 ? err.status : 502;
    return json(status, headers, {
      error: err?.message || 'Request failed',
      meta: err?.meta,
    });
  }
};
