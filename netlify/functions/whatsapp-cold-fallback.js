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
    /template|not (found|exist)|doesn'?t exist|translation|approved|parameter|language|1320|131058/i.test(msg) ||
    ['132000', '132001', '132005', '132007', '132012', '132015', '132016', '131058'].includes(
      code
    )
  );
}

function customerNameFrom(params) {
  const n = String(params?.[0] || '').trim();
  return n || 'there';
}

function buildTemplatePayload(to, templateName, languageCode, bodyParams, headerComponents = [], buttonUrlParams = []) {
  const components = [...(headerComponents || [])];
  if (bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((p) => ({ type: 'text', text: String(p ?? '') })),
    });
  }
  for (const btn of buttonUrlParams || []) {
    const text = String(btn?.text ?? btn ?? '').trim();
    if (!text) continue;
    const index = String(btn?.index ?? '1');
    components.push({
      type: 'button',
      sub_type: 'url',
      index,
      parameters: [{ type: 'text', text }],
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

/** Balance-due letter v4+ / IMAGE — dynamic Pay now URL `/p/{{1}}`. */
function templateUsesDynamicPayNowUrl(name) {
  return /svc_balance_due_letter_(ero|hro)_(img_v?\d*|v[4-8])$/i.test(String(name || ''))
    || /svc_balance_due_letter_(ero|hro)_img_/i.test(String(name || ''));
}

/**
 * @returns {Array<{ name: string, params: string[], headerComponents: object[] }>}
 */
function buildFallbackAttempts(primaryName, bodyParams, hasDocHeader, headerComponents = []) {
  const name = customerNameFrom(bodyParams);
  const attempts = [];
  const seen = new Set([primaryName]);

  const push = (name, params, headerComponents = []) => {
    if (seen.has(name)) return;
    seen.add(name);
    attempts.push({ name, params, headerComponents });
  };

  // Balance-due IMAGE header (QR) → older img (keep QR) → text letter v7…
  if (/^svc_balance_due_letter_(ero|hro)_img_/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const amount = String(bodyParams?.[1] || '0').replace(/[^\d.]/g, '') || '0';
    const imgHeaders = Array.isArray(headerComponents) ? headerComponents : [];
    if (/_img_v4$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_img_v3`, bodyParams.slice(0, 4).map(String), imgHeaders);
      push(`svc_balance_due_letter_${suffix}_img_v2`, bodyParams.slice(0, 4).map(String), imgHeaders);
      push(`svc_balance_due_letter_${suffix}_img_v1`, bodyParams.slice(0, 4).map(String), imgHeaders);
    } else if (/_img_v3$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_img_v2`, bodyParams.slice(0, 4).map(String), imgHeaders);
      push(`svc_balance_due_letter_${suffix}_img_v1`, bodyParams.slice(0, 4).map(String), imgHeaders);
    } else if (/_img_v2$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_img_v1`, bodyParams.slice(0, 4).map(String), imgHeaders);
    }
    push(`svc_balance_due_letter_${suffix}_v8`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v7`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v6`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v5`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v4`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
    push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    push('svc_balance_due', [name, amount]);
  }

  // DOCUMENT-header cold PDF — v3 letter → direct (any label) → v2 → svc_doc_pdf_v2
  if (/^svc_doc_accept_preview_/i.test(primaryName)) {
    const label = String(bodyParams?.[1] || '').trim() || 'document';
    push(SMOKE, [name, label]);
  }

  if (hasDocHeader || /^svc_doc_/i.test(primaryName) || /^svc_doc_direct_/i.test(primaryName)) {
    const labelMap = {
      bill: 'service bill',
      invoice: 'tax invoice',
      amc: 'AMC agreement',
      quotation: 'quotation',
      warranty: 'warranty card',
      receipt: 'payment receipt',
      generic: 'document',
    };
    const v3Match = String(primaryName || '').match(/^svc_doc_([a-z]+)_(ero|hro)_v3$/i);
    const v2Match = String(primaryName || '').match(/^svc_doc_([a-z]+)_(ero|hro)_v2$/i);
    const directMatch = String(primaryName || '').match(/^svc_doc_direct_(ero|hro)_v1$/i);
    const labelFromParams = String(bodyParams?.[1] || '').trim();

    if (v3Match) {
      const slug = v3Match[1].toLowerCase();
      const suffix = v3Match[2].toLowerCase();
      const label = labelFromParams || labelMap[slug] || 'document';
      push(`svc_doc_direct_${suffix}_v1`, [name, label]);
      push(`svc_doc_${slug}_${suffix}_v2`, [name]);
      push('svc_doc_pdf_v2', [name, label]);
    } else if (directMatch) {
      const suffix = directMatch[1].toLowerCase();
      const label = labelFromParams || 'document';
      push(`svc_doc_generic_${suffix}_v3`, [name]);
      push(`svc_doc_generic_${suffix}_v2`, [name]);
      push('svc_doc_pdf_v2', [name, label]);
    } else if (v2Match) {
      const slug = v2Match[1].toLowerCase();
      push('svc_doc_pdf_v2', [name, labelMap[slug] || 'document']);
    }
    push(SMOKE, [name]);
  }

  // Missed-call CTA not approved yet → plain UTILITY missed-call body
  if (/^missed_call_callback_/i.test(primaryName)) {
    push(MISSED_CALL, [name]);
  }

  // Job-done letter v4 (emoji) → v3 → v2 → v1 → short svc_job_done
  if (/^svc_job_done_letter_(ero|hro)(_v4|_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const amount = String(bodyParams?.[1] || '0').replace(/[^\d.]/g, '') || '0';
    if (/_v4$/i.test(primaryName)) {
      push(`svc_job_done_letter_${suffix}_v3`, bodyParams.slice(0, 3).map(String));
      push(`svc_job_done_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
      push(`svc_job_done_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else if (/_v3$/i.test(primaryName)) {
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

  // Job-done plain v2 (emoji, no buttons) → plain v1
  if (/^svc_job_done_letter_(ero|hro)_plain_v2$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    push(`svc_job_done_letter_${suffix}_plain_v1`, bodyParams.slice(0, 3).map(String));
    push(`svc_job_done_letter_${suffix}_v4`, bodyParams.slice(0, 3).map(String));
  }

  // Balance-due letter v8 → v7 → v6 → …
  if (/^svc_balance_due_letter_(ero|hro)(_v8|_v7|_v6|_v5|_v4|_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const amount = String(bodyParams?.[1] || '0').replace(/[^\d.]/g, '') || '0';
    if (/_v8$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v7`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v6`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v5`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v4`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v7$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v6`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v5`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v4`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v6$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v5`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v4`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v5$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v4`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v4$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v3`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v3$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else if (/_v2$/i.test(primaryName)) {
      push(`svc_balance_due_letter_${suffix}`, bodyParams.slice(0, 4).map(String));
    } else {
      push(`svc_balance_due_letter_${suffix}_v2`, bodyParams.slice(0, 4).map(String));
    }
    push('svc_balance_due', [name, amount]);
  }

  // Service-due letter v4 (Book now) → v3 → v2 → v1 → Book-only CTA → schedule CTA → visit reminder
  if (/^svc_service_due_letter_(ero|hro)(_v4|_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    const when = String(bodyParams?.[1] || '').trim() || 'your upcoming service visit';
    if (/_v4$/i.test(primaryName)) {
      push(`svc_service_due_letter_${suffix}_v3`, bodyParams.slice(0, 2).map(String));
      push(`svc_service_due_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
      push(`svc_service_due_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else if (/_v3$/i.test(primaryName)) {
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

  // Booking confirm letter v4 emoji → v3 → v2 → v1 → phone-only / visit confirmed
  if (/^svc_booking_confirmed_letter_(ero|hro)(_v4|_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    if (/_v4$/i.test(primaryName)) {
      push(`svc_booking_confirmed_letter_${suffix}_v3`, bodyParams.slice(0, 3).map(String));
      push(`svc_booking_confirmed_letter_${suffix}_v2`, bodyParams.slice(0, 3).map(String));
      push(`svc_booking_confirmed_letter_${suffix}`, bodyParams.slice(0, 3).map(String));
    } else if (/_v3$/i.test(primaryName)) {
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

  // Booking cancel letter v5 (no BOOK) → v4 → v3 → …
  if (/^svc_booking_cancelled_letter_(ero|hro)(_v5|_v4|_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/.test(primaryName) ? 'hro' : 'ero';
    if (/_v5$/i.test(primaryName)) {
      push(`svc_booking_cancelled_letter_${suffix}_v4`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}_v3`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else if (/_v4$/i.test(primaryName)) {
      push(`svc_booking_cancelled_letter_${suffix}_v3`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}_v2`, bodyParams.slice(0, 2).map(String));
      push(`svc_booking_cancelled_letter_${suffix}`, bodyParams.slice(0, 2).map(String));
    } else if (/_v3$/i.test(primaryName)) {
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

  // WFS minimal hello → branded hi → svc_hello → smoke
  if (/^svc_wfs_just_hi(_(hro|ero))?(_v3)?$/i.test(primaryName)) {
    const suffix = /_hro/i.test(primaryName) ? 'hro' : /_ero/i.test(primaryName) ? 'ero' : null;
    if (suffix) {
      push(`svc_wfs_just_hi_${suffix}_v3`, [name]);
      push(`svc_wfs_hello_${suffix}_v2`, [name]);
      push(`svc_wfs_hi_${suffix}_v2`, [name]);
    } else {
      push('svc_wfs_just_hi_v3', [name]);
      push('svc_wfs_hello_v3', [name]);
    }
    push('svc_hello', [name]);
  }
  if (/^svc_wfs_hi_from(_(hro|ero))?(_v3|_v2)?$/i.test(primaryName)) {
    const suffix = /_hro/i.test(primaryName) ? 'hro' : /_ero/i.test(primaryName) ? 'ero' : null;
    if (suffix) {
      push(`svc_wfs_hello_${suffix}_v2`, [name]);
      push(`svc_wfs_hi_${suffix}_v2`, [name]);
    } else {
      push('svc_wfs_hello_v3', [name]);
    }
    push('svc_hello', [name]);
  }
  if (/^svc_wfs_hello(_v3)?$/i.test(primaryName)) {
    push('svc_wfs_hello_v3', [name]);
    push('svc_hello', [name]);
  }
  if (/^svc_wfs_hi(_v3)?$/i.test(primaryName) && !/^svc_wfs_hi_from/i.test(primaryName)) {
    push('svc_wfs_hello_v3', [name]);
    push('svc_hello', [name]);
  }

  // Ask location “from WFS” → v3 Share location → approved svc_ask_location
  if (/^svc_wfs_ask_loc_from_(hro|ero)_v1$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push('svc_wfs_ask_loc_from_v1', [name]);
    push(`svc_wfs_ask_loc_${suffix}_v3`, [name]);
    push('svc_ask_location', [name]);
  }
  if (/^svc_wfs_ask_loc_from_v1$/i.test(primaryName)) {
    push('svc_wfs_ask_loc_v3', [name]);
    push('svc_ask_location', [name]);
  }

  // Ask location v3 (Share location + emoji) → v2 → v1 → legacy
  if (/^svc_wfs_ask_loc_simple_(hro|ero)_v3$/i.test(primaryName)) {
    const suffix = /_hro_v3$/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_wfs_ask_loc_simple_${suffix}_v2`, [name]);
    push(`svc_wfs_ask_loc_${suffix}_v3`, [name]);
  }
  if (/^svc_wfs_ask_loc_(hro|ero)_v3$/i.test(primaryName) || primaryName === 'svc_wfs_ask_loc_v3') {
    const suffix = /_hro_v3$/i.test(primaryName) ? 'hro' : /_ero_v3$/i.test(primaryName) ? 'ero' : null;
    if (suffix) {
      push(`svc_wfs_ask_loc_${suffix}_v2`, [name]);
      push(`svc_wfs_ask_loc_${suffix}`, [name]);
    } else {
      push('svc_wfs_ask_loc_v2', [name]);
      push('svc_wfs_ask_loc', [name]);
    }
  }
  if (/^svc_wfs_ask_loc_simple_v3$/i.test(primaryName)) {
    push('svc_wfs_ask_loc_simple_v2', [name]);
    push('svc_wfs_ask_loc_v3', [name]);
  }
  if (/^svc_wfs_ask_loc_simple_(hro|ero)_v2$/i.test(primaryName)) {
    const suffix = /_hro_v2$/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_wfs_ask_loc_simple_${suffix}`, [name]);
    push(`svc_wfs_ask_loc_${suffix}_v2`, [name]);
  }
  if (/^svc_wfs_ask_loc_(hro|ero)_v2$/i.test(primaryName) || primaryName === 'svc_wfs_ask_loc_v2') {
    const suffix = /_hro_v2$/i.test(primaryName) ? 'hro' : /_ero_v2$/i.test(primaryName) ? 'ero' : null;
    if (suffix) push(`svc_wfs_ask_loc_${suffix}`, [name]);
    else push('svc_wfs_ask_loc', [name]);
  }
  if (/^svc_wfs_ask_loc_simple_v2$/i.test(primaryName)) {
    push('svc_wfs_ask_loc_simple', [name]);
    push('svc_wfs_ask_loc_v2', [name]);
  }
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

  // Ask name (no body vars) — UTILITY v2 only (avoid “Hi from” *_v1 MARKETING)
  if (/^svc_wfs_ask_name_simple_(hro|ero)_v2$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push('svc_wfs_ask_name_simple_v2', []);
    push(`svc_wfs_ask_name_${suffix}_v2`, []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_simple_(hro|ero)_v1$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_wfs_ask_name_simple_${suffix}_v2`, []);
    push('svc_wfs_ask_name_simple_v2', []);
    push(`svc_wfs_ask_name_${suffix}_v2`, []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_simple_v2$/i.test(primaryName)) {
    push('svc_wfs_ask_name_v2', []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_simple_v1$/i.test(primaryName)) {
    push('svc_wfs_ask_name_simple_v2', []);
    push('svc_wfs_ask_name_v2', []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_(hro|ero)_v2$/i.test(primaryName)) {
    push('svc_wfs_ask_name_v2', []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_(hro|ero)_v1$/i.test(primaryName)) {
    const suffix = /_hro_/i.test(primaryName) ? 'hro' : 'ero';
    push(`svc_wfs_ask_name_${suffix}_v2`, []);
    push('svc_wfs_ask_name_v2', []);
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_v2$/i.test(primaryName)) {
    push(SMOKE, [name || 'there']);
  }
  if (/^svc_wfs_ask_name_v1$/i.test(primaryName)) {
    push('svc_wfs_ask_name_v2', []);
    push(SMOKE, [name || 'there']);
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
  buttonUrlParams = [],
  enableFallback = true,
}) {
  const params = Array.isArray(bodyParams) ? bodyParams : [];
  const headers = Array.isArray(headerComponents) ? headerComponents : [];
  const urlButtons = Array.isArray(buttonUrlParams) ? buttonUrlParams : [];

  let result = await callWhatsAppApi(
    phoneNumberId,
    accessToken,
    buildTemplatePayload(to, templateName, languageCode, params, headers, urlButtons)
  );

  if (result.ok) {
    return {
      ok: true,
      result,
      templateName,
      bodyParams: params,
      headerComponents: headers,
      buttonUrlParams: urlButtons,
    };
  }

  if (!enableFallback || !isTemplateMetaError(result)) {
    return {
      ok: false,
      result,
      templateName,
      bodyParams: params,
      headerComponents: headers,
      buttonUrlParams: urlButtons,
    };
  }

  // Only DOCUMENT headers should enter the PDF doc-fallback chain (not IMAGE headers).
  const hasDocHeader = headers.some((c) => {
    if (String(c.type || '').toLowerCase() !== 'header') return false;
    const p = c.parameters?.[0];
    return String(p?.type || '').toLowerCase() === 'document' || Boolean(p?.document);
  });
  for (const fb of buildFallbackAttempts(templateName, params, hasDocHeader, headers)) {
    const fbButtons = templateUsesDynamicPayNowUrl(fb.name) ? urlButtons : [];
    const fbResult = await callWhatsAppApi(
      phoneNumberId,
      accessToken,
      buildTemplatePayload(to, fb.name, languageCode, fb.params, fb.headerComponents, fbButtons)
    );
    if (fbResult.ok) {
      return {
        ok: true,
        result: fbResult,
        templateName: fb.name,
        bodyParams: fb.params,
        headerComponents: fb.headerComponents,
        buttonUrlParams: fbButtons,
        usedFallback: true,
        primaryTemplate: templateName,
      };
    }
    result = fbResult;
  }

  return {
    ok: false,
    result,
    templateName,
    bodyParams: params,
    headerComponents: headers,
    buttonUrlParams: urlButtons,
  };
}

module.exports = {
  SMOKE,
  VISIT,
  JOB_DONE,
  isTemplateMetaError,
  buildTemplatePayload,
  buildFallbackAttempts,
  templateUsesDynamicPayNowUrl,
  sendTemplateWithColdFallbacks,
};
