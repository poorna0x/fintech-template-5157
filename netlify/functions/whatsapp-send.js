/**
 * WhatsApp Cloud API — send text / PDF (document) / template.
 * Auth: admin JWT (CRM) OR local WHATSAPP_POC_SECRET for /whatsapp-test.
 * Credentials: env or app_secrets via whatsapp-helper.
 * Persists outbound rows to whatsapp_messages (7-day retention).
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const {
  digitsOnly,
  normalizePhoneE164,
  getServiceSupabase,
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  findCustomerIdByPhone,
  uploadOutboundPdfToWhatsAppMedia,
  pdfBase64ToBuffer,
} = require('./whatsapp-helper');

function json(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function isLocalPocAuthorized(body) {
  const pocSecret = (process.env.WHATSAPP_POC_SECRET || '').trim();
  if (!pocSecret) return false;
  return String(body.pocSecret || '').trim() === pocSecret;
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
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  const pocOk = isLocalPocAuthorized(body);
  let auth = { ok: false, userId: null };
  if (pocOk) {
    auth = { ok: true, userId: null, via: 'poc_secret' };
  } else {
    auth = await authorizeAdminRequest(event);
    if (!auth.ok) {
      return json(401, headers, { error: auth.error || 'Unauthorized' });
    }
  }

  const db = getServiceSupabase();
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
  if (!accessToken || !phoneNumberId) {
    return json(500, headers, {
      error:
        'Server misconfigured: set WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID (or app_secrets)',
    });
  }

  // CRM settings kill-switch / feature flags (singleton row)
  if (db) {
    const { data: waSettings } = await db
      .from('whatsapp_crm_settings')
      .select('enabled, allow_cold_templates, allow_pdf_send, allow_freeform')
      .eq('id', 1)
      .maybeSingle();
    if (waSettings) {
      if (waSettings.enabled === false) {
        return json(403, headers, {
          error: 'WhatsApp Cloud API is disabled in Settings → WhatsApp settings',
        });
      }
      const sendType = String(body.type || 'text').trim().toLowerCase();
      if (sendType === 'template' && waSettings.allow_cold_templates === false) {
        return json(403, headers, { error: 'Cold templates are disabled in WhatsApp settings' });
      }
      if (
        (sendType === 'document' || sendType === 'pdf') &&
        waSettings.allow_pdf_send === false
      ) {
        return json(403, headers, { error: 'PDF / document send is disabled in WhatsApp settings' });
      }
      if (sendType === 'text' && waSettings.allow_freeform === false) {
        return json(403, headers, { error: 'Free-form text is disabled in WhatsApp settings' });
      }
    }
  }

  const to = normalizePhoneE164(body.to || body.phone);
  if (!to || to.length < 10) {
    return json(400, headers, { error: 'Phone required (E.164 digits, e.g. 9198XXXXXXXX)' });
  }

  const type = String(body.type || 'text').trim().toLowerCase();
  let payload;
  let persist = {
    direction: 'outbound',
    phone_e164: to,
    msg_type: type === 'pdf' ? 'document' : type,
    body: null,
    media_url: null,
    filename: null,
    template_name: null,
    sent_by_user_id: auth.userId || null,
  };

  if (type === 'text') {
    const text = String(body.text || body.message || '').trim();
    if (!text) {
      return json(400, headers, { error: 'text required' });
    }
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    };
    persist.body = text;
    persist.msg_type = 'text';
  } else if (type === 'document' || type === 'pdf') {
    let link = String(body.link || body.pdfUrl || body.url || '').trim();
    let mediaId = String(body.mediaId || body.documentId || '').trim();
    const filename = String(body.filename || 'document.pdf').trim() || 'document.pdf';
    const caption = String(body.caption || '').trim();

    if (!mediaId && !link && body.pdfBase64) {
      const buf = pdfBase64ToBuffer(body.pdfBase64);
      if (!buf || buf.length < 100) {
        return json(400, headers, { error: 'Invalid pdfBase64' });
      }
      // Netlify / Meta practical limit — keep bills/AMC small
      if (buf.length > 4.5 * 1024 * 1024) {
        return json(413, headers, { error: 'PDF too large (max ~4.5MB for WhatsApp send)' });
      }
      // Prefer Meta media API — Cloudinary raw URLs are often not publicly fetchable by Meta (401 → Media upload error)
      const uploaded = await uploadOutboundPdfToWhatsAppMedia(
        phoneNumberId,
        accessToken,
        buf,
        filename
      );
      if (!uploaded?.id) {
        return json(502, headers, {
          error: 'Could not upload PDF to WhatsApp media API',
        });
      }
      mediaId = uploaded.id;
    }

    if (!mediaId && (!link || !/^https:\/\//i.test(link))) {
      return json(400, headers, { error: 'Public https PDF URL, mediaId, or pdfBase64 required' });
    }
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        ...(mediaId ? { id: mediaId } : { link }),
        filename,
        ...(caption ? { caption } : {}),
      },
    };
    persist.msg_type = 'document';
    persist.media_url = mediaId ? `whatsapp-media:${mediaId}` : link;
    persist.filename = filename;
    persist.body = caption || null;
  } else if (type === 'template') {
    const templateName = String(body.templateName || '').trim();
    if (!templateName) {
      return json(400, headers, { error: 'templateName required' });
    }
    if (templateName === 'hello_world') {
      return json(400, headers, {
        error:
          'hello_world only works on Meta public test numbers — create your own approved template',
      });
    }
    const languageCode = String(body.languageCode || 'en').trim() || 'en';
    const bodyParams = Array.isArray(body.bodyParams) ? body.bodyParams : [];
    const components = [];
    if (bodyParams.length) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((p) => ({
          type: 'text',
          text: String(p ?? ''),
        })),
      });
    }
    payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };
    persist.msg_type = 'template';
    persist.template_name = templateName;
    persist.body =
      bodyParams.length > 0
        ? `${templateName}: ${bodyParams.map(String).join(' · ')}`
        : templateName;
  } else {
    return json(400, headers, { error: 'type must be text, document, or template' });
  }

  if (body.customerId && typeof body.customerId === 'string') {
    persist.customer_id = body.customerId;
  } else {
    persist.customer_id = await findCustomerIdByPhone(db, to);
  }

  try {
    const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
    if (!result.ok) {
      const errMsg = result.data?.error?.message || 'WhatsApp API error';
      console.error('[whatsapp-send] Meta error', result.status, JSON.stringify(result.data));
      await insertWhatsAppMessage(db, {
        ...persist,
        status: 'failed',
        error_message: errMsg,
      });
      return json(result.status >= 400 && result.status < 600 ? result.status : 502, headers, {
        success: false,
        error: errMsg,
        meta: result.data,
      });
    }

    const waId =
      result.data?.messages?.[0]?.id ||
      result.data?.messages?.[0]?.message_id ||
      null;

    await insertWhatsAppMessage(db, {
      ...persist,
      wa_message_id: waId,
      status: 'sent',
    });

    return json(200, headers, { success: true, meta: result.data });
  } catch (err) {
    console.error('[whatsapp-send] failed', err?.message || err);
    await insertWhatsAppMessage(db, {
      ...persist,
      status: 'failed',
      error_message: err?.message || 'Request failed',
    });
    return json(502, headers, { success: false, error: err?.message || 'Request failed' });
  }
};

// re-export for tests / other callers
exports.digitsOnly = digitsOnly;
