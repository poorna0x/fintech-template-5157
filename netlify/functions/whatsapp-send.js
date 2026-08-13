/**
 * WhatsApp Cloud API — send text / PDF (document) / template.
 * Auth: admin JWT (CRM) OR local WHATSAPP_POC_SECRET for /whatsapp-test.
 * Credentials: env or app_secrets via whatsapp-helper.
 * Persists outbound rows to whatsapp_messages (long retention; manual timeline delete).
 * Media previews on private Cloudflare R2 (r2: keys).
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
  normalizeOutboundImageForWhatsApp,
  uploadOutboundMediaToCloudinary,
  pdfBase64ToBuffer,
  fileBase64ToBuffer,
} = require('./whatsapp-helper');
const { stampAwaitingMediaIfAsking } = require('./whatsapp-unsolicited-media');
const { resolveWaTemplateName } = require('./whatsapp-template-resolve');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');
const { seedAdminPendingAction } = require('./whatsapp-booking-bot');

const MAX_OUTBOUND_BYTES = 4.5 * 1024 * 1024;

function isImageMime(mime) {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(String(mime || ''));
}

function isPdfMime(mime, filename) {
  const m = String(mime || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  return m === 'application/pdf' || name.endsWith('.pdf');
}

/** Inbox-storable media ref: https (Cloudinary) or r2:key (private R2). */
function isPersistableMediaUrl(link) {
  const raw = String(link || '').trim();
  if (!raw) return false;
  if (/^https:\/\//i.test(raw)) return true;
  if (raw.startsWith('r2:') && raw.includes('whatsapp/')) return true;
  if (raw.startsWith('whatsapp/inbound/') || raw.startsWith('whatsapp/outbound/')) return true;
  return false;
}

function persistMediaUrl(link, mediaId) {
  if (isPersistableMediaUrl(link)) return String(link).trim();
  if (mediaId) return `whatsapp-media:${mediaId}`;
  return null;
}

/** Inbox preview text when caption is empty. */
function inboxBodyForOutboundMedia(caption, filename, kind) {
  const cap = String(caption || '').trim();
  if (cap) return cap;
  const name = String(filename || '').trim();
  if (name) return name;
  if (kind === 'image') return 'Photo';
  return 'Document';
}

/** Human-readable inbox body for Meta templates (especially pending payment). */
function inboxBodyForTemplate(templateName, bodyParams, opts = {}) {
  const name = String(templateName || '').trim();
  const params = Array.isArray(bodyParams) ? bodyParams.map((p) => String(p ?? '').trim()) : [];
  const payCode = String(opts.payCode || '').trim();
  const msgType = String(opts.msgType || 'template');
  const filename = String(opts.filename || '').trim();

  if (/balance_due/i.test(name)) {
    const [customer, amount, due, invoice] = params;
    const lines = [];
    if (msgType === 'image' || /_img_/i.test(name)) {
      lines.push(filename ? `UPI QR · ${filename}` : 'UPI QR');
    }
    lines.push('Pending payment reminder');
    if (customer) lines.push(`Hi ${customer}`);
    if (amount) lines.push(`Amount pending: ₹${amount.replace(/[^\d.]/g, '') || amount}`);
    if (due) lines.push(`Due: ${due}`);
    if (invoice) lines.push(`Invoice / Job: ${invoice}`);
    lines.push(payCode ? `Pay now: /p/${payCode}` : 'Pay now');
    return lines.join('\n');
  }

  if ((msgType === 'image' || msgType === 'document') && opts.preservedBody) {
    return String(opts.preservedBody);
  }

  if (params.length) return `${name}: ${params.join(' · ')}`;
  return name || 'Template';
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
        'enabled, allow_cold_templates, allow_pdf_send, allow_freeform, allow_booking_bot, allow_inbox, allow_calling, allow_service_reminder, allow_pending_payment, allow_documents, allow_composer, allow_tech_assigned, allow_tech_unassigned, allow_job_completion_whatsapp'
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
        job_completion: 'allow_job_completion_whatsapp',
        booking_bot: 'allow_booking_bot',
        online_booking: 'allow_online_booking_whatsapp',
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
          allow_job_completion_whatsapp: 'Job completion → customer',
          allow_booking_bot: 'Booking bot',
          allow_online_booking_whatsapp: 'Online booking confirmation',
        };
        return json(403, headers, {
          code: 'WHATSAPP_FEATURE_DISABLED',
          feature: source,
          error: `${labels[sourceKey] || source} WhatsApp sends are disabled in Settings → WhatsApp`,
        });
      }

      const sendType = String(body.type || 'text').trim().toLowerCase();
      const headerDocPayload =
        body.headerDocument && typeof body.headerDocument === 'object' ? body.headerDocument : null;
      const isDocumentColdTemplate =
        sendType === 'template' &&
        (headerDocPayload?.pdfBase64 ||
          headerDocPayload?.fileBase64 ||
          headerDocPayload?.mediaId ||
          headerDocPayload?.link ||
          body.headerPdfBase64 ||
          body.pdfBase64);
      const coldBlocked = waSettings.allow_cold_templates === false;
      const documentsAllowed = waSettings.allow_documents !== false;
      const composerAllowed = waSettings.allow_composer !== false;
      const docShareAllowed =
        (source === 'documents' && documentsAllowed) ||
        (source === 'composer' && composerAllowed);
      if (sendType === 'template' && coldBlocked) {
        // Cold PDF for quotations/bills uses DOCUMENT-header template — treat as document/composer share.
        if (!(isDocumentColdTemplate && docShareAllowed)) {
          return json(403, headers, {
            code: 'WHATSAPP_FEATURE_DISABLED',
            feature: 'cold_templates',
            error: 'Cold templates are disabled in WhatsApp settings',
          });
        }
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
  /** @type {{ templateName: string, languageCode: string, bodyParams: string[], headerComponents: object[], enableFallback: boolean } | null} */
  let templateSendOpts = null;
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
    // Keep customer-facing text clean; stamp ask-marker only on DB row for webhook allow-list.
    persist.body = stampAwaitingMediaIfAsking(text);
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
      let mime = wantImage
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

      // Meta only accepts JPEG/PNG for image messages (WebP → 131053 Media upload error)
      if (wantImage) {
        const normalized = await normalizeOutboundImageForWhatsApp(buf, mime, filename);
        buf = normalized.buffer;
        mime = normalized.mime;
        filename = normalized.filename;
      }

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
      // After normalize, outbound images are jpeg/png only (webp converted server-side)
      persist.media_mime = /\.png$/i.test(filename)
        ? 'image/png'
        : 'image/jpeg';
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
    // Prefer R2 / Cloudinary preview URL for CRM; fall back to opaque Meta media ref
    persist.media_url = persistMediaUrl(link, mediaId);
    persist.filename = filename;
    persist.body = stampAwaitingMediaIfAsking(
      inboxBodyForOutboundMedia(caption, filename, sendAsImage ? 'image' : 'document')
    );
  } else if (type === 'template') {
    const templateName = resolveWaTemplateName(String(body.templateName || '').trim());
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
    const buttonUrlParams = Array.isArray(body.buttonUrlParams)
      ? body.buttonUrlParams
          .map((b) => {
            if (b == null) return null;
            if (typeof b === 'string') return { index: '1', text: b };
            const text = String(b.text ?? '').trim();
            if (!text) return null;
            return { index: String(b.index ?? '1'), text };
          })
          .filter(Boolean)
      : [];
    const components = [];
    let templateHeaderComponents = [];

    // DOCUMENT-header templates (cold PDF): upload pdfBase64 → media id, attach as header
    const headerDoc = body.headerDocument && typeof body.headerDocument === 'object' ? body.headerDocument : null;
    const headerPdfB64 = headerDoc
      ? headerDoc.pdfBase64 || headerDoc.fileBase64 || body.pdfBase64 || ''
      : body.headerPdfBase64 || '';
    // IMAGE-header templates (e.g. pending payment + QR): imageBase64 / link / mediaId
    const headerImg = body.headerImage && typeof body.headerImage === 'object' ? body.headerImage : null;
    const headerImgB64 = headerImg
      ? headerImg.imageBase64 || headerImg.fileBase64 || body.imageBase64 || ''
      : body.headerImageBase64 || '';

    if (headerPdfB64 || headerDoc?.mediaId || headerDoc?.link) {
      let mediaId = String(headerDoc?.mediaId || '').trim();
      let link = String(headerDoc?.link || headerDoc?.url || '').trim();
      let filename =
        String(headerDoc?.filename || body.filename || 'document.pdf').trim() || 'document.pdf';

      if (!mediaId && headerPdfB64) {
        const buf = fileBase64ToBuffer(headerPdfB64) || pdfBase64ToBuffer(headerPdfB64);
        if (!buf || buf.length < 32) {
          return json(400, headers, { error: 'Invalid header PDF base64' });
        }
        if (buf.length > MAX_OUTBOUND_BYTES) {
          return json(413, headers, { error: 'File too large (max ~4.5MB for WhatsApp send)' });
        }
        const uploaded = await uploadOutboundPdfToWhatsAppMedia(
          phoneNumberId,
          accessToken,
          buf,
          filename
        );
        if (!uploaded?.id) {
          return json(502, headers, { error: 'Could not upload PDF for template header' });
        }
        mediaId = uploaded.id;
        filename = uploaded.filename || filename;
        const preview = await uploadOutboundMediaToCloudinary(buf, 'application/pdf', filename);
        if (preview?.url) link = preview.url;
      }

      if (!mediaId && (!link || !/^https:\/\//i.test(link))) {
        return json(400, headers, {
          error: 'headerDocument needs mediaId, https link, or pdfBase64',
        });
      }

      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              ...(mediaId ? { id: mediaId } : { link }),
              filename,
            },
          },
        ],
      });
      templateHeaderComponents = [...components];
      // Persist as document-like so inbox renders PDF thumbnail + download
      persist.msg_type = 'document';
      persist.media_mime = 'application/pdf';
      persist.filename = filename;
      persist.media_url = persistMediaUrl(link, mediaId);
    } else if (headerImgB64 || headerImg?.mediaId || headerImg?.link) {
      let mediaId = String(headerImg?.mediaId || '').trim();
      let link = String(headerImg?.link || headerImg?.url || '').trim();
      let filename =
        String(headerImg?.filename || body.filename || 'image.jpg').trim() || 'image.jpg';
      let mime = String(headerImg?.mimeType || headerImg?.mime || 'image/jpeg').trim() || 'image/jpeg';

      if (!mediaId && headerImgB64) {
        const buf = fileBase64ToBuffer(headerImgB64) || pdfBase64ToBuffer(headerImgB64);
        if (!buf || buf.length < 32) {
          return json(400, headers, { error: 'Invalid header image base64' });
        }
        if (buf.length > MAX_OUTBOUND_BYTES) {
          return json(413, headers, { error: 'File too large (max ~4.5MB for WhatsApp send)' });
        }
        const uploaded = await uploadOutboundFileToWhatsAppMedia(
          phoneNumberId,
          accessToken,
          buf,
          mime,
          filename
        );
        if (!uploaded?.id) {
          return json(502, headers, { error: 'Could not upload image for template header' });
        }
        mediaId = uploaded.id;
        filename = uploaded.filename || filename;
        mime = uploaded.mime || mime;
        const preview = await uploadOutboundMediaToCloudinary(buf, mime, filename);
        if (preview?.url) link = preview.url;
      }

      if (!mediaId && (!link || !/^https:\/\//i.test(link))) {
        return json(400, headers, {
          error: 'headerImage needs mediaId, https link, or imageBase64',
        });
      }

      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              ...(mediaId ? { id: mediaId } : { link }),
            },
          },
        ],
      });
      templateHeaderComponents = [...components];
      persist.msg_type = 'image';
      persist.media_mime = mime;
      persist.filename = filename;
      persist.media_url = persistMediaUrl(link, mediaId);
    }

    if (bodyParams.length) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((p) => ({
          type: 'text',
          text: String(p ?? ''),
        })),
      });
    }
    templateSendOpts = {
      templateName,
      languageCode,
      bodyParams,
      headerComponents: templateHeaderComponents,
      buttonUrlParams,
      enableFallback: body.coldFallback !== false,
    };
    if (!persist.msg_type || persist.msg_type === 'template') {
      persist.msg_type = 'template';
    }
    persist.template_name = templateName;
    if (persist.media_url && persist.filename && templateHeaderComponents.length) {
      const tplNote =
        bodyParams.length > 0 ? bodyParams.map(String).join(' · ') : templateName;
      persist.body = inboxBodyForOutboundMedia(
        tplNote,
        persist.filename,
        persist.msg_type === 'image' ? 'image' : 'document'
      );
    } else {
      persist.body =
        bodyParams.length > 0
          ? `${templateName}: ${bodyParams.map(String).join(' · ')}`
          : templateName;
    }
  } else {
    return json(400, headers, { error: 'type must be text, document, image, or template' });
  }

  const customerIdRaw =
    (typeof body.customerId === 'string' && body.customerId.trim()) ||
    (typeof body.customer_id === 'string' && body.customer_id.trim()) ||
    '';
  if (customerIdRaw) {
    persist.customer_id = customerIdRaw;
  } else {
    persist.customer_id = await findCustomerIdByPhone(db, to);
  }

  try {
    let result;
    if (templateSendOpts) {
      const sendResult = await sendTemplateWithColdFallbacks({
        phoneNumberId,
        accessToken,
        to,
        ...templateSendOpts,
      });
      result = sendResult.result;
      if (sendResult.ok) {
        persist.template_name = sendResult.templateName;
        if (
          sendResult.usedFallback &&
          templateSendOpts.headerComponents?.length &&
          !sendResult.headerComponents?.length
        ) {
          persist.msg_type = 'template';
          persist.media_url = null;
          persist.media_mime = null;
          persist.filename = null;
        }
        const payCode = Array.isArray(sendResult.buttonUrlParams)
          ? String(sendResult.buttonUrlParams[0]?.text || sendResult.buttonUrlParams[0] || '').trim()
          : Array.isArray(buttonUrlParams)
            ? String(buttonUrlParams[0]?.text || buttonUrlParams[0] || '').trim()
            : '';
        persist.body = inboxBodyForTemplate(sendResult.templateName, sendResult.bodyParams, {
          msgType: persist.msg_type,
          filename: persist.filename,
          payCode,
          preservedBody: persist.body,
        });
        if (sendResult.usedFallback && sendResult.primaryTemplate) {
          console.warn(
            '[whatsapp-send] cold template fallback',
            sendResult.primaryTemplate,
            '→',
            sendResult.templateName
          );
        }
      }
      if (!sendResult.ok) {
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
    } else {
      result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
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
    }

    const waId =
      result.data?.messages?.[0]?.id ||
      result.data?.messages?.[0]?.message_id ||
      null;

    const inserted = await insertWhatsAppMessage(db, {
      ...persist,
      wa_message_id: waId,
      status: 'sent',
    });
    if (!inserted?.id) {
      console.warn('[whatsapp-send] Meta sent OK but inbox row missing', {
        to,
        type: persist.msg_type,
        hasMedia: Boolean(persist.media_url),
      });
    }

    // After reminder / book invite: next customer reply resumes booking bot (date/time…).
    const seedPending = String(body.seedPendingAction || body.seed_pending_action || '').trim();
    const templateSeedMap = {
      svc_ask_location: 'request_location',
      svc_wfs_ask_loc: 'request_location',
      svc_wfs_ask_loc_hro: 'request_location',
      svc_wfs_ask_loc_ero: 'request_location',
      svc_wfs_ask_loc_v2: 'request_location',
      svc_wfs_ask_loc_hro_v2: 'request_location',
      svc_wfs_ask_loc_ero_v2: 'request_location',
      svc_wfs_ask_loc_v3: 'request_location',
      svc_wfs_ask_loc_hro_v3: 'request_location',
      svc_wfs_ask_loc_ero_v3: 'request_location',
      svc_wfs_ask_loc_simple: 'request_location',
      svc_wfs_ask_loc_simple_hro: 'request_location',
      svc_wfs_ask_loc_simple_ero: 'request_location',
      svc_wfs_ask_loc_simple_v2: 'request_location',
      svc_wfs_ask_loc_simple_hro_v2: 'request_location',
      svc_wfs_ask_loc_simple_ero_v2: 'request_location',
      svc_wfs_ask_loc_simple_v3: 'request_location',
      svc_wfs_ask_loc_simple_hro_v3: 'request_location',
      svc_wfs_ask_loc_simple_ero_v3: 'request_location',
      svc_wfs_ask_loc_from_v1: 'request_location',
      svc_wfs_ask_loc_from_hro_v1: 'request_location',
      svc_wfs_ask_loc_from_ero_v1: 'request_location',
      svc_ask_photo: 'request_photo',
      svc_ask_flat: 'request_building_flat',
      svc_wfs_ask_name_v1: 'request_name',
      svc_wfs_ask_name_v2: 'request_name',
      svc_wfs_ask_name_hro_v1: 'request_name',
      svc_wfs_ask_name_hro_v2: 'request_name',
      svc_wfs_ask_name_ero_v1: 'request_name',
      svc_wfs_ask_name_ero_v2: 'request_name',
      svc_wfs_ask_name_simple_v1: 'request_name',
      svc_wfs_ask_name_simple_v2: 'request_name',
      svc_wfs_ask_name_simple_hro_v1: 'request_name',
      svc_wfs_ask_name_simple_hro_v2: 'request_name',
      svc_wfs_ask_name_simple_ero_v1: 'request_name',
      svc_wfs_ask_name_simple_ero_v2: 'request_name',
      svc_wfs_hello: 'show_menu',
      svc_wfs_hello_v3: 'show_menu',
      svc_wfs_hello_hro_v2: 'show_menu',
      svc_wfs_hello_ero_v2: 'show_menu',
      svc_wfs_hi: 'show_menu',
      svc_wfs_hi_v3: 'show_menu',
      svc_wfs_hi_hro: 'show_menu',
      svc_wfs_hi_ero: 'show_menu',
      svc_wfs_hi_hro_v2: 'show_menu',
      svc_wfs_hi_ero_v2: 'show_menu',
      svc_wfs_just_hi: 'show_menu',
      svc_wfs_just_hi_v3: 'show_menu',
      svc_wfs_just_hi_hro: 'show_menu',
      svc_wfs_just_hi_ero: 'show_menu',
      svc_wfs_just_hi_hro_v3: 'show_menu',
      svc_wfs_just_hi_ero_v3: 'show_menu',
      svc_wfs_hi_from: 'show_menu',
      svc_wfs_hi_from_v3: 'show_menu',
      svc_wfs_hi_from_hro: 'show_menu',
      svc_wfs_hi_from_ero_v2: 'show_menu',
      svc_wfs_hi_from_hro_v3: 'show_menu',
      svc_wfs_hi_from_ero_v3: 'show_menu',
      svc_wfs_collect: 'water_filter_service',
      svc_wfs_collect_hro: 'water_filter_service',
      svc_wfs_collect_ero: 'water_filter_service',
    };
    const tplName = String(templateSendOpts?.templateName || '').trim();
    const resolvedSeed = seedPending || (tplName ? templateSeedMap[tplName] || '' : '');
    const seedBrand = /_ero(_|$)/i.test(tplName)
      ? 'elevenro'
      : /_hro(_|$)/i.test(tplName)
        ? 'hydrogenro'
        : null;
    if (resolvedSeed && db) {
      try {
        const source = String(body.source || '').trim();
        await seedAdminPendingAction(db, to, resolvedSeed, {
          name: String(body.customerName || body.customer_name || '').trim() || undefined,
          customerName: String(body.customerName || body.customer_name || '').trim() || undefined,
          startedByAdmin: true,
          ...(persist.customer_id ? { existingCustomerId: persist.customer_id } : {}),
          leadSource: 'Direct call',
          whatsappLeadLine: '',
          ...(source === 'service_reminder' ? { serviceReminder: true } : {}),
          ...(resolvedSeed === 'water_filter_service' ? { waterFilterService: true } : {}),
          ...(seedBrand ? { brand: seedBrand } : {}),
        });
      } catch (err) {
        console.warn('[whatsapp-send] seedPendingAction failed', err?.message || err);
      }
    }

    return json(200, headers, {
      success: true,
      meta: result.data,
      phone: to,
      messageId: inserted?.id || null,
      customerId: persist.customer_id || null,
      body: persist.body || null,
      msgType: persist.msg_type || null,
      templateName: persist.template_name || null,
      filename: persist.filename || null,
      mediaUrl: persist.media_url || null,
      mediaMime: persist.media_mime || null,
      seedPendingAction: seedPending || null,
    });
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
