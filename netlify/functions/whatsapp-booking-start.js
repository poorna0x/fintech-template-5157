/**
 * Admin inbox Quick actions — start booking-bot steps (or cold template when 24h closed).
 * Auth: admin JWT. Gate: enabled + allow_booking_bot (+ allow_cold_templates for cold path).
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  findCustomerIdByPhone,
} = require('./whatsapp-helper');
const {
  isBookingBotEnabled,
  hasOpenCustomerServiceWindow,
  startAdminQuickAction,
  seedAdminPendingAction,
  lookupCustomerFull,
} = require('./whatsapp-booking-bot');

const ACTIONS = new Set([
  'book_service',
  'request_location',
  'request_photo',
  'water_filter_service',
  'book_location_photo',
]);

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function brandSuffix(brand) {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'ero' : 'hro';
}

function resolveBrandFromCustomer(customer) {
  const raw = String(customer?.brand || customer?.service_brand || '').toLowerCase();
  if (raw.includes('eleven')) return 'elevenro';
  return 'hydrogenro';
}

function waterFilterFromLabel(brand) {
  return brand === 'elevenro' ? 'Eleven RO Water Filter Service' : 'Hydrogen RO Water Filter Service';
}

function coldWfsCollectParams(brand, customerName) {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const templateName =
    brand === 'elevenro'
      ? 'svc_wfs_collect_ero'
      : brand === 'hydrogenro'
        ? 'svc_wfs_collect_hro'
        : 'svc_wfs_collect';
  return { name: templateName, languageCode: 'en', bodyParams: [name] };
}

function coldAskLocationParams(brand, customerName) {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const b = String(brand || '').toLowerCase();
  const templateName =
    b === 'elevenro'
      ? 'svc_wfs_ask_loc_ero'
      : b === 'hydrogenro'
        ? 'svc_wfs_ask_loc_hro'
        : 'svc_wfs_ask_loc';
  return {
    name: templateName,
    languageCode: 'en',
    bodyParams: [name],
  };
}

async function loadCrmSettings(db) {
  const { data } = await db
    .from('whatsapp_crm_settings')
    .select('enabled, allow_booking_bot, allow_cold_templates')
    .eq('id', 1)
    .maybeSingle();
  return data || {};
}

async function sendTemplateMessage({
  db,
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode,
  bodyParams,
  customerId,
}) {
  const components =
    Array.isArray(bodyParams) && bodyParams.length
      ? [
          {
            type: 'body',
            parameters: bodyParams.map((t) => ({
              type: 'text',
              text: String(t ?? '').slice(0, 1024) || '-',
            })),
          },
        ]
      : [];

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      ...(components.length ? { components } : {}),
    },
  };

  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  const errMsg = result.data?.error?.message || (!result.ok ? 'Template send failed' : null);

  await insertWhatsAppMessage(db, {
    direction: 'outbound',
    phone_e164: to,
    customer_id: customerId || null,
    msg_type: 'template',
    body: bodyParams?.length
      ? `${templateName}: ${bodyParams.map(String).join(' · ')}`
      : templateName,
    template_name: templateName,
    wa_message_id: waId,
    status: result.ok ? 'sent' : 'failed',
    error_message: errMsg,
  });

  return { ok: Boolean(result.ok), error: errMsg, waId };
}

function coldTemplateForAction(action, brand, customerName, hasCustomer) {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const suffix = brandSuffix(brand);

  // svc_booking_menu → MARKETING on Meta. Use UTILITY schedule CTAs + visit reminder fallbacks.
  if (action === 'book_service' || action === 'book_reinstall') {
    const want =
      action === 'book_reinstall'
        ? 'Reinstallation'
        : 'Service/Repair';
    const schedulePrimary = hasCustomer
      ? {
          name: `existing_service_schedule_${suffix}_cta`,
          languageCode: 'en',
          bodyParams: [name],
          seedPending: action === 'book_reinstall' ? 'book_reinstall' : 'book_service',
        }
      : {
          name: `unregistered_number_service_${suffix}_cta`,
          languageCode: 'en',
          bodyParams: [name === 'Customer' ? 'there' : name],
          seedPending: action === 'book_reinstall' ? 'book_reinstall' : 'book_service',
        };
    return {
      primary: schedulePrimary,
      fallback: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [
          name,
          `reply here for ${want} — we will send Service/Repair · Reinstallation · Chat options`,
        ],
        seedPending: 'show_menu',
      },
      fallback2: {
        name: 'svc_smoke_update',
        languageCode: 'en',
        bodyParams: [name],
        seedPending: 'show_menu',
      },
    };
  }

  if (action === 'request_location') {
    const ask = coldAskLocationParams(brand, customerName);
    return {
      primary: { ...ask, seedPending: 'request_location' },
      fallback: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [name, 'please reply and share your service location pin'],
        seedPending: 'request_location',
      },
      fallback2: {
        name: 'svc_smoke_update',
        languageCode: 'en',
        bodyParams: [name],
        seedPending: 'request_location',
      },
    };
  }

  if (action === 'water_filter_service') {
    const collect = coldWfsCollectParams(brand, customerName);
    const ask = coldAskLocationParams(brand, customerName);
    return {
      primary: { ...collect, seedPending: 'water_filter_service' },
      fallback: { ...ask, seedPending: 'water_filter_service' },
      fallback2: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [
          name,
          `${waterFilterFromLabel(brand)} — reply here and we will ask for your location pin next`,
        ],
        seedPending: 'water_filter_service',
      },
    };
  }

  if (action === 'book_location_photo') {
    return {
      primary: {
        name: 'svc_service_request',
        languageCode: 'en',
        bodyParams: [name],
        seedPending: 'book_location_photo',
      },
      fallback: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [
          name,
          'reply here to book — we will ask location pin, then purifier photo',
        ],
        seedPending: 'book_location_photo',
      },
      fallback2: {
        name: 'svc_smoke_update',
        languageCode: 'en',
        bodyParams: [name],
        seedPending: 'book_location_photo',
      },
    };
  }

  // request_photo
  return {
    primary: {
      name: 'svc_service_request',
      languageCode: 'en',
      bodyParams: [name],
      seedPending: 'request_photo',
    },
    fallback: {
      name: 'svc_visit_reminder',
      languageCode: 'en',
      bodyParams: [name, 'please reply with a photo of your water purifier'],
      seedPending: 'request_photo',
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

  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { error: auth.error || 'Unauthorized' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const action = String(body.action || '').trim();
  if (!ACTIONS.has(action)) {
    return json(400, headers, {
      error:
        'action must be book_service, request_location, request_photo, water_filter_service, or book_location_photo',
    });
  }

  const to = normalizePhoneE164(body.phone || body.to || '');
  if (!to || to.length < 12) {
    return json(400, headers, { error: 'Valid phone required' });
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(500, headers, { error: 'Database not configured' });
  }

  const botOn = await isBookingBotEnabled(db);
  if (!botOn) {
    return json(403, headers, {
      code: 'WHATSAPP_FEATURE_DISABLED',
      feature: 'booking_bot',
      error: 'Booking bot is disabled in WhatsApp settings',
    });
  }

  const settings = await loadCrmSettings(db);
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
  if (!accessToken || !phoneNumberId) {
    return json(500, headers, { error: 'WhatsApp credentials missing' });
  }

  const ctx = { db, accessToken, phoneNumberId, to };
  const windowOpen = await hasOpenCustomerServiceWindow(db, to);

  let customerId = body.customerId ? String(body.customerId).trim() : null;
  let customerName = String(body.customerName || '').trim();
  let brand = body.brand === 'elevenro' ? 'elevenro' : body.brand === 'hydrogenro' ? 'hydrogenro' : null;
  const leadSource = String(body.leadSource || body.lead_source || '').trim() || 'Direct call';
  const serviceSubType =
    String(body.serviceSubType || body.service_sub_type || '').trim() || 'Repair';
  const serviceLabel =
    String(body.serviceLabel || body.service_label || '').trim() ||
    (serviceSubType === 'Installation' ? 'Installation' : 'Water Filter Service');
  const leadCostRaw = body.leadCost ?? body.lead_cost;
  const leadCost =
    leadCostRaw != null && Number.isFinite(Number(leadCostRaw)) ? Number(leadCostRaw) : null;
  const requireOtp =
    body.requireOtp === true ||
    body.require_otp === true ||
    body.requireOtp === 'true' ||
    body.require_otp === 'true';

  if (action === 'water_filter_service' && !customerName) {
    return json(400, headers, { error: 'Customer name required for Water Filter Service' });
  }

  const customer = await lookupCustomerFull(db, to);
  if (customer?.id) {
    customerId = customerId || customer.id;
    customerName = customerName || String(customer.full_name || '').trim();
    if (!brand) brand = resolveBrandFromCustomer(customer);
  }
  if (!customerId) {
    customerId = (await findCustomerIdByPhone(db, to)) || null;
  }
  if (!brand) brand = 'hydrogenro';
  if (!customerName) customerName = 'Customer';

  const actionOpts = {
    customerName,
    leadSource,
    serviceSubType,
    serviceLabel,
    leadCost,
    requireOtp,
    customerId,
    brand,
  };

  // —— Open 24h window: interactive bot ——
  if (windowOpen) {
    const started = await startAdminQuickAction(ctx, action, actionOpts);
    if (!started?.ok) {
      return json(502, headers, {
        ok: false,
        error: started?.error || 'Could not start booking action',
      });
    }
    return json(200, headers, {
      ok: true,
      via: 'interactive',
      windowOpen: true,
      action,
      started: started.started,
      mode: started.mode || null,
    });
  }

  // —— Closed window: cold template + pending intent ——
  if (settings.allow_cold_templates === false) {
    return json(403, headers, {
      code: 'WHATSAPP_FEATURE_DISABLED',
      feature: 'cold_templates',
      error:
        '24h window closed and cold templates are disabled. Customer must message first, or enable cold templates.',
      needsWindowOrTemplate: true,
    });
  }

  const tplPlan = coldTemplateForAction(action, brand, customerName, Boolean(customerId));
  const attempts = [tplPlan.primary, tplPlan.fallback, tplPlan.fallback2].filter(
    (t) => t && t.name
  );

  let sent = { ok: false };
  let used = attempts[0] || { name: 'svc_visit_reminder', seedPending: action };

  for (const attempt of attempts) {
    sent = await sendTemplateMessage({
      db,
      phoneNumberId,
      accessToken,
      to,
      templateName: attempt.name,
      languageCode: attempt.languageCode || 'en',
      bodyParams: attempt.bodyParams,
      customerId,
    });
    used = attempt;
    if (sent.ok) break;
  }

  if (!sent.ok) {
    return json(502, headers, {
      ok: false,
      needsWindowOrTemplate: true,
      error:
        sent.error ||
        `24h window closed — template "${used.name}" not approved or rejected by Meta`,
    });
  }

  // Next customer reply resumes *session* interactive UX (same buttons/steps as 24h).
  await seedAdminPendingAction(db, to, used.seedPending || action, {
    name: customerName,
    customerName,
    leadSource,
    serviceSubType,
    serviceLabel,
    leadCost,
    requireOtp,
    brand,
    ...(customerId ? { existingCustomerId: customerId } : {}),
    waterFilterService: action === 'water_filter_service',
    locationThenPhoto: action === 'book_location_photo',
    startedByAdmin: true,
  });

  return json(200, headers, {
    ok: true,
    via: 'template',
    windowOpen: false,
    action,
    templateName: used.name,
    usedTemplate: true,
    sessionResume: used.seedPending || action,
  });
};
