/**
 * Admin inbox Quick actions — start booking-bot steps (or cold template when 24h closed).
 * Auth: admin JWT. Gate: enabled (+ allow_booking_bot for book flows only; ask templates still send).
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
const {
  resolveWaTemplateName,
  isBlockedMarketingTemplateName,
} = require('./whatsapp-template-resolve');

const ACTIONS = new Set([
  'book_service',
  'request_location',
  'request_photo',
  'request_building_flat',
  'request_name',
  'water_filter_service',
  'book_location_photo',
]);

/** Full booking flows — require allow_booking_bot. Ask-only actions still send when bot is off. */
const BOOKING_FLOW_ACTIONS = new Set([
  'book_service',
  'book_location_photo',
  'water_filter_service',
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

function coldAskLocFlatPhotoParams(brand, customerName) {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const templateName =
    brand === 'elevenro'
      ? 'svc_wfs_ask_loc_flat_photo_ero_v1'
      : brand === 'hydrogenro'
        ? 'svc_wfs_ask_loc_flat_photo_hro_v1'
        : 'svc_wfs_ask_loc_flat_photo_v1';
  return { name: templateName, languageCode: 'en', bodyParams: [name] };
}

function coldAskLocationParams(brand, customerName) {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  // No "Share location" quick-reply — that forced a 2nd step before the native
  // Send location button. Plain ask → customer replies → bot sends Send location once.
  return {
    name: 'svc_ask_location',
    languageCode: 'en',
    bodyParams: [name, waterFilterFromLabel(brand)],
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
  templateName = resolveWaTemplateName(templateName);
  if (isBlockedMarketingTemplateName(templateName)) {
    return { ok: false, error: 'Marketing WhatsApp templates are not allowed', waId: null };
  }
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
          name: `existing_service_schedule_${suffix}_cta_v3`,
          languageCode: 'en',
          bodyParams: [name],
          seedPending: action === 'book_reinstall' ? 'book_reinstall' : 'book_service',
        }
      : {
          name: `unregistered_number_service_${suffix}_cta_v2`,
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

  if (action === 'request_building_flat') {
    return {
      primary: {
        name: 'svc_ask_flat',
        languageCode: 'en',
        bodyParams: [name, waterFilterFromLabel(brand)],
        seedPending: 'request_building_flat',
      },
      fallback: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [name, 'please reply with your building / flat number, or Skip'],
        seedPending: 'request_building_flat',
      },
      fallback2: {
        name: 'svc_smoke_update',
        languageCode: 'en',
        bodyParams: [name],
        seedPending: 'request_building_flat',
      },
    };
  }

  if (action === 'request_name') {
    const suffix =
      brand === 'elevenro' ? 'ero' : brand === 'hydrogenro' ? 'hro' : null;
    const primaryName = suffix
      ? `svc_wfs_ask_name_simple_${suffix}_v2`
      : 'svc_wfs_ask_name_simple_v2';
    const fallbackName = suffix
      ? `svc_wfs_ask_name_${suffix}_v2`
      : 'svc_wfs_ask_name_v2';
    return {
      primary: {
        name: primaryName,
        languageCode: 'en',
        bodyParams: [],
        seedPending: 'request_name',
      },
      fallback: {
        name: fallbackName,
        languageCode: 'en',
        bodyParams: [],
        seedPending: 'request_name',
      },
      fallback2: {
        name: 'svc_wfs_ask_name_simple_v2',
        languageCode: 'en',
        bodyParams: [],
        seedPending: 'request_name',
      },
    };
  }

  if (action === 'water_filter_service') {
    const locFlatPhoto = coldAskLocFlatPhotoParams(brand, customerName);
    const ask = coldAskLocationParams(brand, customerName);
    const collect = coldWfsCollectParams(brand, customerName);
    return {
      // Quick Customer cold opener: exact approved “Water Filter Service or
      // Installation” template. The reply opens 24h and resumes location-first.
      primary: { ...locFlatPhoto, seedPending: 'water_filter_service' },
      fallback: { ...ask, seedPending: 'water_filter_service' },
      fallback2: { ...collect, seedPending: 'water_filter_service' },
    };
  }

  if (action === 'book_location_photo') {
    const locFlatPhoto = coldAskLocFlatPhotoParams(brand, name);
    const ask = coldAskLocationParams(brand, name);
    return {
      primary: { ...locFlatPhoto, seedPending: 'book_location_photo' },
      fallback: { ...ask, seedPending: 'book_location_photo' },
      fallback2: {
        name: 'svc_visit_reminder',
        languageCode: 'en',
        bodyParams: [
          name,
          'reply here to book — we will ask location pin, flat / house number, then a front photo of the purifier',
        ],
        seedPending: 'book_location_photo',
      },
    };
  }

  // request_photo
  return {
    primary: {
      name: 'svc_ask_photo',
      languageCode: 'en',
      bodyParams: [name, waterFilterFromLabel(brand)],
      seedPending: 'request_photo',
    },
    fallback: {
      name: 'svc_visit_reminder',
      languageCode: 'en',
      bodyParams: [name, 'please reply with a photo of your water purifier'],
      seedPending: 'request_photo',
    },
    fallback2: {
      name: 'svc_smoke_update',
      languageCode: 'en',
      bodyParams: [name],
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
        'action must be book_service, request_location, request_photo, request_building_flat, request_name, water_filter_service, or book_location_photo',
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

  const settings = await loadCrmSettings(db);
  if (settings.enabled === false) {
    return json(403, headers, {
      code: 'WHATSAPP_FEATURE_DISABLED',
      feature: 'enabled',
      error: 'WhatsApp Cloud API is disabled in Settings → WhatsApp settings',
    });
  }

  const botOn = await isBookingBotEnabled(db);
  if (!botOn && BOOKING_FLOW_ACTIONS.has(action)) {
    return json(403, headers, {
      code: 'WHATSAPP_FEATURE_DISABLED',
      feature: 'booking_bot',
      error:
        'Booking flows are disabled in WhatsApp settings. Ask location / photo / name quick actions still work.',
    });
  }
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
  const whatsappLeadLineRaw = body.whatsappLeadLine ?? body.whatsapp_lead_line;
  const whatsappLeadLine =
    whatsappLeadLineRaw != null
      ? String(whatsappLeadLineRaw).trim().slice(0, 80)
      : body.includeLeadOnWhatsApp === true || body.include_lead_on_whatsapp === true
        ? leadSource
        : '';
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
    whatsappLeadLine,
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
    const name = resolveWaTemplateName(attempt.name);
    if (isBlockedMarketingTemplateName(name)) continue;
    sent = await sendTemplateMessage({
      db,
      phoneNumberId,
      accessToken,
      to,
      templateName: name,
      languageCode: attempt.languageCode || 'en',
      bodyParams: attempt.bodyParams,
      customerId,
    });
    used = { ...attempt, name };
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
    whatsappLeadLine,
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
