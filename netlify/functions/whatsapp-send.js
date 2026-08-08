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
  uploadOutboundFileToWhatsAppMedia,
  uploadOutboundMediaToCloudinary,
  pdfBase64ToBuffer,
  fileBase64ToBuffer,
} = require('./whatsapp-helper');

const MAX_OUTBOUND_BYTES = 4.5 * 1024 * 1024;

function isImageMime(mime) {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(String(mime || ''));
}

function isPdfMime(mime, filename) {
  const m = String(mime || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  return m === 'application/pdf' || name.endsWith('.pdf');
}

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
      .select(
        'enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_tech_assigned, allow_tech_unassigned'
      )
      .eq('id', 1)
      .maybeSingle();
    if (waSettings) {
      if (waSettings.enabled === false) {
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: 'enabled',
          error: 'WhatsApp Cloud API is disabled in Settings → WhatsApp settings',
        });
      }

      const source = String(body.source || body.sendSource || '')
        .trim()
        .toLowerCase();
      const sourceKeyMap = {
        inbox: 'allow_inbox',
        calling: 'allow_calling',
        service_reminder: 'allow_service_reminder',
        pending_payment: 'allow_pending_payment',
        documents: 'allow_documents',
        composer: 'allow_composer',
        tech_assigned: 'allow_tech_assigned',
        tech_unassigned: 'allow_tech_unassigned',
        booking_bot: 'allow_booking_bot',
      };
      const sourceKey = sourceKeyMap[source];
      if (sourceKey && waSettings[sourceKey] === false) {
        const labels = {
          allow_inbox: 'WhatsApp inbox',
          allow_calling: 'Calling',
          allow_service_reminder: 'Service reminders',
          allow_pending_payment: 'Pending payments',
          allow_documents: 'Document / PDF share',
          allow_composer: 'Customer composer',
          allow_tech_assigned: 'Technician assigned → customer',
          allow_tech_unassigned: 'Technician unassigned → customer',
          allow_booking_bot: 'Booking bot',
        };
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: source,
          error: `${labels[sourceKey] || source} WhatsApp sends are disabled in Settings → WhatsApp`,
        });
      }

      const sendType = String(body.type || 'text').trim().toLowerCase();
      if (sendType === 'template' && waSettings.allow_cold_templates === false) {
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: 'cold_templates',
          error: 'Cold templates are disabled in WhatsApp settings',
        });
      }
      if (
        (sendType === 'document' || sendType === 'pdf' || sendType === 'image') &&
        waSettings.allow_pdf_send === false
      ) {
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: 'pdf_send',
          error: 'Media / document send is disabled in WhatsApp settings',
        });
      }
      if (sendType === 'text' && waSettings.allow_freeform === false) {
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: 'freeform',
          error: 'Free-form text is disabled in WhatsApp settings',
        });
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
    media_mime: null,
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
  } else if (type === 'document' || type === 'pdf' || type === 'image') {
    let link = String(body.link || body.pdfUrl || body.url || '').trim();
    let mediaId = String(body.mediaId || body.documentId || body.imageId || '').trim();
    const caption = String(body.caption || '').trim();
    const mimeHint = String(body.mimeType || body.mime || '').trim();
    let filename =
      String(body.filename || (type === 'image' ? 'image.jpg' : 'document.pdf')).trim() ||
      (type === 'image' ? 'image.jpg' : 'document.pdf');

    const fileB64 = body.fileBase64 || body.pdfBase64 || body.imageBase64 || '';
    let buf = null;
    if (!mediaId && !link && fileB64) {
      buf = fileBase64ToBuffer(fileB64) || pdfBase64ToBuffer(fileB64);
      if (!buf || buf.length < 32) {
        return json(400, headers, { error: 'Invalid file base64' });
      }
      if (buf.length > MAX_OUTBOUND_BYTES) {
        return json(413, headers, { error: 'File too large (max ~4.5MB for WhatsApp send)' });
      }

      const wantImage =
        type === 'image' || isImageMime(mimeHint) || /\.(jpe?g|png|webp)$/i.test(filename);
      const mime = wantImage
        ? mimeHint && isImageMime(mimeHint)
          ? mimeHint
          : /\.png$/i.test(filename)
            ? 'image/png'
            : /\.webp$/i.test(filename)
              ? 'image/webp'
              : 'image/jpeg'
        : isPdfMime(mimeHint, filename)
          ? 'application/pdf'
          : mimeHint || 'application/octet-stream';

      // Meta media id for delivery
      const uploaded = wantImage
        ? await uploadOutboundFileToWhatsAppMedia(
            phoneNumberId,
            accessToken,
            buf,
            filename,
            mime
          )
        : mime === 'application/pdf'
          ? await uploadOutboundPdfToWhatsAppMedia(phoneNumberId, accessToken, buf, filename)
          : await uploadOutboundFileToWhatsAppMedia(
              phoneNumberId,
              accessToken,
              buf,
              filename,
              mime
            );

      if (!uploaded?.id) {
        return json(502, headers, {
          error: 'Could not upload file to WhatsApp media API',
        });
      }
      mediaId = uploaded.id;
      filename = uploaded.filename || filename;

      // Best-effort Cloudinary copy so inbox can show/open the file (Meta media ids expire)
      const preview = await uploadOutboundMediaToCloudinary(buf, mime, filename);
      if (preview?.url) {
        link = preview.url;
      }
    }

    if (!mediaId && (!link || !/^https:\/\//i.test(link))) {
      return json(400, headers, {
        error: 'Public https URL, mediaId, or fileBase64 / pdfBase64 required',
      });
    }

    const sendAsImage =
      type === 'image' ||
      isImageMime(mimeHint) ||
      (filename && /\.(jpe?g|png|webp)$/i.test(filename) && !isPdfMime(mimeHint, filename));

    if (sendAsImage) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: {
          ...(mediaId ? { id: mediaId } : { link }),
          ...(caption ? { caption } : {}),
        },
      };
      persist.msg_type = 'image';
      persist.media_mime = mimeHint || 'image/jpeg';
    } else {
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
      persist.media_mime = mimeHint || 'application/pdf';
    }
    // Prefer Cloudinary preview URL for CRM; fall back to opaque Meta media ref
    persist.media_url = link && /^https:\/\//i.test(link) ? link : mediaId ? `whatsapp-media:${mediaId}` : null;
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
    return json(400, headers, { error: 'type must be text, document, image, or template' });
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
