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

  // DOCUMENT-header cold PDF failed → open with smoke (no attachment)
  if (hasDocHeader) {
    push(SMOKE, [name]);
  }

  // Missed-call CTA not approved yet → plain UTILITY missed-call body
  if (/^missed_call_callback_/i.test(primaryName)) {
    push(MISSED_CALL, [name]);
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
