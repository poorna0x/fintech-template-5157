/**
 * When a Meta template is PENDING / rejected / wrong param count, retry with
 * already-APPROVED UTILITY templates so CRM cold sends still work.
 */
const { callWhatsAppApi } = require('./whatsapp-helper');

const SMOKE = 'svc_smoke_update';
const VISIT = 'svc_visit_reminder';
const JOB_DONE = 'svc_job_done';
const VISIT_CONFIRMED = 'svc_visit_confirmed';
const MISSED_CALL = 'svc_missed_call';

function isTemplateMetaError(result) {
  if (!result || result.ok) return false;
  const msg = String(
    result.data?.error?.message || result.data?.error?.error_user_msg || ''
  );
  const code = String(result.data?.error?.code || '');
  return (
    /template|not (found|exist)|approved|parameter|language|1320|131058/i.test(msg) ||
    ['132000', '132001', '132005', '132007', '132012', '132015', '132016', '131058'].includes(
      code
    )
  );
}

function customerNameFrom(params) {
  const n = String(params?.[0] || '').trim();
  return n || 'there';
}

function buildTemplatePayload(to, templateName, languageCode, bodyParams, headerComponents = []) {
  const components = [...(headerComponents || [])];
  if (bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((p) => ({ type: 'text', text: String(p ?? '') })),
    });
  }
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      ...(components.length ? { components } : {}),
    },
  };
}

/**
 * @returns {Array<{ name: string, params: string[], headerComponents: object[] }>}
 */
function buildFallbackAttempts(primaryName, bodyParams, hasDocHeader) {
  const name = customerNameFrom(bodyParams);
  const attempts = [];
  const seen = new Set([primaryName]);

  const push = (name, params, headerComponents = []) => {
    if (seen.has(name)) return;
    seen.add(name);
    attempts.push({ name, params, headerComponents });
  };

  // DOCUMENT-header cold PDF v2 → legacy svc_doc_pdf_v2 → smoke (no attachment)
  if (hasDocHeader || /^svc_doc_/i.test(primaryName)) {
    const labelMap = {
      bill: 'service bill',
      invoice: 'tax invoice',
      amc: 'AMC agreement',
      quotation: 'quotation',
      warranty: 'warranty card',
      receipt: 'payment receipt',
      generic: 'document',
    };
    const slugMatch = String(primaryName || '').match(/^svc_doc_([a-z]+)_(ero|hro)_v2$/i);
    if (slugMatch) {
      const slug = slugMatch[1].toLowerCase();
      push('svc_doc_pdf_v2', [name, labelMap[slug] || 'document']);
    }
    push(SMOKE, [name]);
  }

  // Missed-call CTA not approved yet → plain UTILITY missed-call body
  if (/^missed_call_callback_/i.test(primaryName)) {
    push(MISSED_CALL, [name]);
  }

  // Job-done letter v3 → v2 → v1 → short svc_job_done
  if (/^svc_job_done_letter_(ero|hro)(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const amount = String(bodyParams?.[1] || '0').replace(/[^\d.]/g, '') || '0';
    if (/_v3$/i.test(primaryName)) {
      push(`svc_job_done_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
      push(`svc_job_done_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_job_done_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else {
      push(`svc_job_done_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
    }
    push(`svc_job_done_${suffix}_v3`, [
      name,
      'Your service has been completed successfully.',
      `Amount collected: INR ${amount}`,
    ]);
    push(`svc_job_done_${suffix}_v2`, [
      name,
      'Your service has been completed successfully.',
      `Amount collected: INR ${amount}`,
    ]);
    push(JOB_DONE, [name, amount]);
  }

  // Balance-due letter v3 → v2 → v1 → short svc_balance_due
  if (/^svc_balance_due_letter_(ero|hro)(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const amount = String(bodyParams?.[1] || '0').replace(/[^\d.]/g, '') || '0';
    if (/_v3$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else {
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
    }
    push('svc_balance_due', [name, amount]);
  }

  // Service-due letter v3 → v2 → v1 → Book-only CTA v2 → CTA v1 → schedule CTA → visit reminder
  if (/^svc_service_due_letter_(ero|hro)(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const when = String(bodyParams?.[1] || '').trim() || 'your upcoming service visit';
    if (/_v3$/i.test(primaryName)) {
      push(`svc_service_due_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
      push(`svc_service_due_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_service_due_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else {
      push(`svc_service_due_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
    }
    push(`svc_service_due_${suffix}_cta_v2`, [name, when]);
    push(`svc_service_due_${suffix}_cta`, [name, when]);
    push(`existing_service_schedule_${suffix}_cta_v2`, [name]);
    push(`existing_service_schedule_${suffix}_cta`, [name]);
    push(VISIT, [name, when]);
  }

  // Service-due Book-only CTA v2 → v1 → schedule CTA → visit reminder
  if (/^svc_service_due_(ero|hro)_cta(_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const when = String(bodyParams?.[1] || '').trim() || 'your upcoming service visit';
    if (/_v2$/i.test(primaryName)) {
      push(`svc_service_due_${suffix}_cta`, bodyParams.slice(0, 2).map(String));
    } else {
      push(`svc_service_due_${suffix}_cta_v2`, bodyParams.slice(0, 2).map(String));
    }
    push(`existing_service_schedule_${suffix}_cta_v2`, [name]);
    push(`existing_service_schedule_${suffix}_cta`, [name]);
    push(VISIT, [name, when]);
  }

  // Existing-customer schedule CTA v2 → v1 → visit reminder
  if (/^existing_service_schedule_(ero|hro)_cta(_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    if (/_v2$/i.test(primaryName)) {
      push(`existing_service_schedule_${suffix}_cta`, [name]);
    } else {
      push(`existing_service_schedule_${suffix}_cta_v2`, [name]);
    }
    push(VISIT, [name, 'your upcoming service visit']);
  }

  // Booking confirm letter v3 → v2 → v1 → v2 → phone-only / visit confirmed
  if (/^svc_booking_confirmed_letter_(ero|hro)(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    if (/_v3$/i.test(primaryName)) {
      push(`svc_booking_confirmed_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
      push(`svc_booking_confirmed_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_booking_confirmed_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else {
      push(`svc_booking_confirmed_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
    }
    push(`svc_booking_confirmed_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
    push(`svc_booking_confirmed_${suffix}`, bodyParams.slice(0, 3).map(String));
    push(VISIT_CONFIRMED, bodyParams.slice(0, 3).map(String));
  }

  // Booking confirm v2 not approved → phone-only confirm / visit confirmed
  if (/^svc_booking_confirmed_(ero|hro)_v2$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_booking_confirmed_${suffix}`, bodyParams.slice(0, 3).map(String));
    push(VISIT_CONFIRMED, bodyParams.slice(0, 3).map(String));
  }

  // Booking cancel letter v3 → v2 → v1 → v2 → legacy visit cancelled
  if (/^svc_booking_cancelled_letter_(ero|hro)(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    if (/_v3$/i.test(primaryName)) {
      push(`svc_booking_cancelled_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_booking_cancelled_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else {
      push(`svc_booking_cancelled_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
    }
    push(`svc_booking_cancelled_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
    push(`svc_visit_cancelled_${suffix}`, bodyParams.slice(0, 2).map(String));
  }

  // Booking cancel v2 not approved → legacy visit cancelled
  if (/^svc_booking_cancelled_(ero|hro)_v2$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_visit_cancelled_${suffix}`, bodyParams.slice(0, 2).map(String));
  }

  // Ask location (Call us + Text us cold templates) → legacy svc_ask_location → visit reminder
  if (/^svc_wfs_ask_loc_simple_(hro|ero)$/i.test(primaryName)) {
    const suffix = /_hro$/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_wfs_ask_loc_${suffix}`, [name]);
  }
  if (/^svc_wfs_ask_loc_(hro|ero)$/i.test(primaryName) || primaryName === 'svc_wfs_ask_loc') {
    const suffix = /_hro$/i.test(primaryName) ? 'hro' : /_ero$/i.test(primaryName) ? 'ero' : null;
    const fromLabel =
      suffix === 'hro'
        ? 'Hydrogen RO Water Filter Service'
        : suffix === 'ero'
          ? 'Eleven RO Water Filter Service'
          : 'Water Filter Service';
    push('svc_ask_location', [name, fromLabel]);
  }
  if (/^svc_wfs_ask_loc_simple$/i.test(primaryName)) {
    push('svc_wfs_ask_loc', [name]);
    push('svc_ask_location', [name, 'Water Filter Service']);
  }
  if (primaryName === 'svc_ask_location') {
    push(VISIT, [name, 'please share your Google Maps location pin on this chat']);
  }

  if (bodyParams.length >= 3) {
    push(VISIT_CONFIRMED, bodyParams.slice(0, 3).map(String));
  }

  if (bodyParams.length >= 2) {
    const detail =
      String(bodyParams.slice(1).join(' · ')).trim().slice(0, 160) ||
      'Please reply on this chat for details.';
    push(VISIT, [name, detail]);

    const amountRaw = String(bodyParams[1] || '').replace(/[^\d.]/g, '');
    const amount = amountRaw || '0';
    push(JOB_DONE, [name, amount]);
  }

  push(SMOKE, [name]);
  return attempts;
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   result: object,
 *   templateName: string,
 *   bodyParams: string[],
 *   headerComponents: object[],
 *   usedFallback?: boolean,
 *   primaryTemplate?: string,
 * }>}
 */
async function sendTemplateWithColdFallbacks({
  phoneNumberId,
  accessToken,
  to,
  templateName,
  languageCode,
  bodyParams,
  headerComponents = [],
  enableFallback = true,
}) {
  const params = Array.isArray(bodyParams) ? bodyParams : [];
  const headers = Array.isArray(headerComponents) ? headerComponents : [];

  let result = await callWhatsAppApi(
    phoneNumberId,
    accessToken,
    buildTemplatePayload(to, templateName, languageCode, params, headers)
  );

  if (result.ok) {
    return { ok: true, result, templateName, bodyParams: params, headerComponents: headers };
  }

  if (!enableFallback || !isTemplateMetaError(result)) {
    return { ok: false, result, templateName, bodyParams: params, headerComponents: headers };
  }

  const hasDocHeader = headers.some((c) => String(c.type || '').toLowerCase() === 'header');
  for (const fb of buildFallbackAttempts(templateName, params, hasDocHeader)) {
    const fbResult = await callWhatsAppApi(
      phoneNumberId,
      accessToken,
      buildTemplatePayload(to, fb.name, languageCode, fb.params, fb.headerComponents)
    );
    if (fbResult.ok) {
      return {
        ok: true,
        result: fbResult,
        templateName: fb.name,
        bodyParams: fb.params,
        headerComponents: fb.headerComponents,
        usedFallback: true,
        primaryTemplate: templateName,
      };
    }
    result = fbResult;
  }

  return { ok: false, result, templateName, bodyParams: params, headerComponents: headers };
}

module.exports = {
  SMOKE,
  VISIT,
  JOB_DONE,
  isTemplateMetaError,
  buildTemplatePayload,
  buildFallbackAttempts,
  sendTemplateWithColdFallbacks,
};
