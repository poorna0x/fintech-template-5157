/**
 * WhatsApp-only Accept: preview PDF → I Accept button → original PDF.
 * Minimal DB row (R2 key + phone) — no public web page or URL tokens.
 */
const crypto = require('crypto');
const {
  getServiceSupabase,
  getWhatsAppCredentials,
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
  pdfBase64ToBuffer,
  fileBase64ToBuffer,
  uploadOutboundPdfToWhatsAppMedia,
  uploadOutboundMediaToCloudinary,
} = require('./whatsapp-helper');
const {
  uploadAcceptOriginalToR2,
  getR2ObjectBytes,
  deleteR2Object,
} = require('./r2-helper');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');
const {
  brandLetterFooterLines,
  authenticityLine,
  brandContact,
  buildOriginalDocumentDeliveryBody,
} = require('./whatsapp-brand-contact');
const {
  normalizeDocType,
  previewAuthenticitySourceKey,
  recordDocumentPdfAuthenticityServer,
  todayYmdIst,
} = require('./document-pdf-authenticity-record');

const DEFAULT_TTL_HOURS = 48;
const MAX_PDF_BYTES = 4.5 * 1024 * 1024;
const ACCEPT_QUICK_REPLY = 'I Accept';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizeBrand(brand) {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

function buildAcceptPreviewMessageBody(customerName, documentLabel, brand, opts) {
  const label = String(documentLabel || 'document').trim() || 'document';
  const co = brandContact(brand).label;
  const lines = [
    `Hi ${customerName || 'there'}, 👋`,
    '',
    `📄 Your PREVIEW ${label} is attached above — not the original document.`,
    'Please download and save this PDF for your records.',
    '',
    'By tapping I Accept you confirm:',
    '• You have read and agree to all terms, conditions, scope, pricing, validity, and policies in this PDF.',
    `• You request ${co} to send the original ${label} on this WhatsApp chat.`,
    '',
    ...brandLetterFooterLines(brand),
    '',
    opts?.previewVerifyCode
      ? authenticityLine(brand, opts.previewVerifyCode)
      : `After Accept, your original PDF will include a verification code. Verify at ${brandContact(brand).webHost}/authenticity`,
    '',
    '💬 Reply on this chat if you need any help.',
    '',
    'Tap I Accept below.',
  ];
  return lines.join('\n').slice(0, 1024);
}

function buildOriginalDocumentCaption(row) {
  return buildOriginalDocumentDeliveryBody(
    row.customer_name,
    row.document_label,
    row.brand,
    row.original_verify_code
  );
}

async function sendAcceptPreviewCombinedMessage(
  creds,
  db,
  phone,
  inviteId,
  customerName,
  documentLabel,
  brand,
  mediaId,
  previewFilename,
  previewStore,
  opts
) {
  const body = buildAcceptPreviewMessageBody(customerName, documentLabel, brand, {
    previewVerifyCode: opts?.previewVerifyCode,
  });
  const sent = await callWhatsAppApi(creds.phoneNumberId, creds.accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'document',
        document: { id: mediaId, filename: previewFilename },
      },
      body: { text: body },
      footer: { text: 'Preview — save PDF · tap I Accept' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `doc_accept:${inviteId}`.slice(0, 256),
              title: 'I Accept',
            },
          },
        ],
      },
    },
  });
  if (!sent.ok) return sent;

  const waMessageId = sent.data?.messages?.[0]?.id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waMessageId,
    direction: 'outbound',
    phone_e164: phone,
    customer_id: opts?.customerId || null,
    msg_type: 'interactive',
    body: `${body} [I Accept]`,
    media_url: previewStore?.url || previewStore?.ref || null,
    media_mime: 'application/pdf',
    filename: previewFilename,
    status: 'sent',
    sent_by_user_id: opts?.createdBy || null,
  });
  return sent;
}

async function isColdTemplatesAllowed(db) {
  const { data } = await db.from('whatsapp_crm_settings').select('allow_cold_templates').maybeSingle();
  return data?.allow_cold_templates !== false;
}

function resolveAcceptPreviewColdTemplateName(brand) {
  const suffix = normalizeBrand(brand) === 'elevenro' ? 'ero' : 'hro';
  return `svc_doc_accept_preview_${suffix}_v8`;
}

async function sendAcceptPreviewColdTemplate(
  creds,
  db,
  phone,
  customerName,
  documentLabel,
  brand,
  mediaId,
  previewFilename,
  previewStore,
  opts
) {
  const templateName = resolveAcceptPreviewColdTemplateName(brand);
  const bodyParams = [customerName, documentLabel];
  const headerComponents = [
    {
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: { id: mediaId, filename: previewFilename },
        },
      ],
    },
  ];

  const sent = await sendTemplateWithColdFallbacks({
    phoneNumberId: creds.phoneNumberId,
    accessToken: creds.accessToken,
    to: phone,
    templateName,
    languageCode: 'en',
    bodyParams,
    headerComponents,
    buttonUrlParams: [],
    enableFallback: false,
  });

  if (!sent.ok) return { ok: false, data: sent.result?.data, templateName };

  const waMessageId = sent.result?.data?.messages?.[0]?.id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waMessageId,
    direction: 'outbound',
    phone_e164: phone,
    customer_id: opts?.customerId || null,
    msg_type: 'template',
    template_name: sent.templateName,
    body: `${sent.templateName}: ${bodyParams.map(String).join(' · ')} [${ACCEPT_QUICK_REPLY}]`,
    media_url: previewStore?.url || previewStore?.ref || null,
    media_mime: 'application/pdf',
    filename: previewFilename,
    status: 'sent',
    sent_by_user_id: opts?.createdBy || null,
  });

  return {
    ok: true,
    data: sent.result?.data,
    templateName: sent.templateName,
    waMessageId,
  };
}

function isOutsideServiceWindowError(result) {
  if (!result || result.ok) return false;
  const msg = String(
    result.data?.error?.message || result.data?.error?.error_user_msg || ''
  );
  const code = String(result.data?.error?.code || '');
  return (
    /24\s*hour|customer care window|session|re-?engage|131047|131026|131051|132018|outside|expired|business.?initiated|not.?allowed.*session/i.test(
      msg
    ) || ['131047', '131026', '131051', '132018'].includes(code)
  );
}

function decodePdfBuffer(b64) {
  return fileBase64ToBuffer(b64) || pdfBase64ToBuffer(b64);
}

async function markExpiredIfNeeded(db, row) {
  if (!row || row.status !== 'pending') return row;
  if (new Date(row.expires_at).getTime() > Date.now()) return row;
  await db
    .from('document_accept_invites')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending');
  if (row.r2_object_key) await deleteR2Object(row.r2_object_key).catch(() => {});
  return { ...row, status: 'expired', r2_object_key: null };
}

/**
 * Preview on WhatsApp + I Accept. Uses free-form interactive in 24h window; cold template v5 otherwise.
 */
async function createAndSendAcceptInvite(opts) {
  const db = getServiceSupabase();
  if (!db) return { ok: false, error: 'Service unavailable' };

  const phone = normalizePhoneE164(opts.phoneE164);
  if (!phone) return { ok: false, error: 'Invalid phone' };

  const originalBuf = decodePdfBuffer(opts.originalPdfBase64);
  const previewBuf = decodePdfBuffer(opts.previewPdfBase64);
  if (!originalBuf || originalBuf.length < 32) {
    return { ok: false, error: 'Invalid original PDF' };
  }
  if (!previewBuf || previewBuf.length < 32) {
    return { ok: false, error: 'Invalid preview PDF' };
  }
  if (originalBuf.length > MAX_PDF_BYTES || previewBuf.length > MAX_PDF_BYTES) {
    return { ok: false, error: 'PDF too large (max ~4.5MB)' };
  }

  const sourceKey =
    String(opts.sourceKey || opts.documentRef || '').trim() ||
    String(opts.filename || 'document').replace(/\.pdf$/i, '');
  const previewVerifyCode = String(opts.previewVerifyCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  const documentRef = String(opts.documentRef || sourceKey).trim() || sourceKey;
  const authDocType = normalizeDocType(opts.docType);

  if (previewVerifyCode.length === 8) {
    const previewFp = await recordDocumentPdfAuthenticityServer(db, {
      docType: authDocType,
      sourceKey: previewAuthenticitySourceKey(sourceKey),
      verifyCode: previewVerifyCode,
      pdfBuffer: previewBuf,
      filename: `PREVIEW_${String(opts.filename || 'document.pdf')}`,
      customerId: opts.customerId,
      documentRef: `${documentRef} (preview)`,
      createdBy: opts.createdBy,
      generatedOnYmd: todayYmdIst(),
    });
    if (!previewFp.ok) {
      console.warn('[document-accept] preview fingerprint insert failed:', previewFp.error);
    }
  }

  const brand = normalizeBrand(opts.brand);
  const docType = String(opts.docType || 'generic').trim() || 'generic';
  const documentLabel = String(opts.documentLabel || 'document').trim() || 'document';
  const filename =
    String(opts.filename || `${documentLabel.replace(/\s+/g, '_')}.pdf`).trim() || 'document.pdf';
  const customerName = String(opts.customerName || 'Customer').trim() || 'Customer';
  const ttlHours = Math.min(72, Math.max(1, Number(opts.ttlHours) || DEFAULT_TTL_HOURS));
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const originalSha = sha256Hex(originalBuf);
  const verifyCode = String(opts.verifyCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  const uploaded = await uploadAcceptOriginalToR2(originalBuf, 'application/pdf', filename);
  if (!uploaded?.key) {
    return { ok: false, error: 'Could not store original PDF (check R2)' };
  }

  // Internal id only — satisfies DB unique token_hash; never exposed to customer.
  const tokenHash = sha256Hex(crypto.randomBytes(32));

  const { data: invite, error: insertErr } = await db
    .from('document_accept_invites')
    .insert({
      token_hash: tokenHash,
      status: 'pending',
      brand,
      doc_type: docType,
      document_label: documentLabel,
      document_ref: opts.documentRef || null,
      source_key: opts.sourceKey || opts.documentRef || null,
      customer_id: opts.customerId || null,
      customer_name: customerName,
      phone_e164: phone,
      amount_display: opts.amountDisplay != null ? String(opts.amountDisplay) : null,
      original_filename: filename,
      original_sha256_hex: originalSha,
      original_verify_code: verifyCode || null,
      original_byte_length: originalBuf.length,
      r2_object_key: uploaded.key,
      expires_at: expiresAt,
      created_by: opts.createdBy || null,
    })
    .select('id')
    .maybeSingle();

  if (insertErr || !invite?.id) {
    await deleteR2Object(uploaded.key);
    return { ok: false, error: insertErr?.message || 'Could not create accept invite' };
  }

  const creds = await getWhatsAppCredentials(db);
  if (!creds?.accessToken || !creds?.phoneNumberId) {
    await db.from('document_accept_invites').update({ status: 'failed' }).eq('id', invite.id);
    await deleteR2Object(uploaded.key);
    return { ok: false, error: 'WhatsApp credentials missing' };
  }

  const previewFilename = `PREVIEW_${filename}`;
  const media = await uploadOutboundPdfToWhatsAppMedia(
    creds.phoneNumberId,
    creds.accessToken,
    previewBuf,
    previewFilename
  );
  if (!media?.id) {
    await db.from('document_accept_invites').update({ status: 'failed' }).eq('id', invite.id);
    await deleteR2Object(uploaded.key);
    return { ok: false, error: 'Could not upload preview PDF to WhatsApp' };
  }

  const previewStore = await uploadOutboundMediaToCloudinary(
    previewBuf,
    'application/pdf',
    previewFilename
  );

  let sent = await sendAcceptPreviewCombinedMessage(
    creds,
    db,
    phone,
    invite.id,
    customerName,
    documentLabel,
    brand,
    media.id,
    previewFilename,
    previewStore,
    { customerId: opts.customerId, createdBy: opts.createdBy, previewVerifyCode }
  );

  let via = 'interactive';

  if (!sent.ok && isOutsideServiceWindowError(sent)) {
    const coldOk = await isColdTemplatesAllowed(db);
    if (!coldOk) {
      const errMsg =
        sent.data?.error?.message || sent.data?.error?.error_user_msg || 'WhatsApp send failed';
      await db
        .from('document_accept_invites')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', invite.id);
      await deleteR2Object(uploaded.key);
      return {
        ok: false,
        error: `${errMsg} Cold templates are disabled in WhatsApp settings.`,
        meta: sent.data,
      };
    }

    const cold = await sendAcceptPreviewColdTemplate(
      creds,
      db,
      phone,
      customerName,
      documentLabel,
      brand,
      media.id,
      previewFilename,
      previewStore,
      { customerId: opts.customerId, createdBy: opts.createdBy, previewVerifyCode }
    );

    if (cold.ok) {
      sent = { ok: true, data: cold.data, waMessageId: cold.waMessageId };
      via = 'cold_template';
    } else {
      const coldErr =
        cold.data?.error?.message ||
        cold.data?.error?.error_user_msg ||
        'Cold accept-preview template send failed';
      const hint = /template|not exist|translation|approved/i.test(coldErr)
        ? ' Submit svc_doc_accept_preview_*_v8 in Meta (node scripts/submit-whatsapp-full-utility.mjs --submit --only-doc-accept).'
        : '';
      await db
        .from('document_accept_invites')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', invite.id);
      await deleteR2Object(uploaded.key);
      return { ok: false, error: `${coldErr}${hint}`, meta: cold.data };
    }
  }

  if (!sent.ok) {
    const errMsg =
      sent.data?.error?.message || sent.data?.error?.error_user_msg || 'WhatsApp send failed';
    const hint = isOutsideServiceWindowError(sent)
      ? ' Customer must message you on WhatsApp first (24h window), then send again.'
      : '';
    await db
      .from('document_accept_invites')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', invite.id);
    await deleteR2Object(uploaded.key);
    return { ok: false, error: `${errMsg}${hint}`, meta: sent.data };
  }

  const waMessageId = sent.waMessageId || sent.data?.messages?.[0]?.id || null;
  await db
    .from('document_accept_invites')
    .update({ preview_wa_message_id: waMessageId, updated_at: new Date().toISOString() })
    .eq('id', invite.id);

  return {
    ok: true,
    inviteId: invite.id,
    expiresAt,
    waMessageId,
    via,
    originalSha256: originalSha,
  };
}

async function sendOriginalAfterAccept(db, row) {
  if (!row?.r2_object_key) return { ok: false, error: 'Original PDF missing' };
  const obj = await getR2ObjectBytes(row.r2_object_key);
  if (!obj?.buffer?.length) return { ok: false, error: 'Could not load original PDF' };

  const serverSha = sha256Hex(obj.buffer);
  if (row.original_sha256_hex && row.original_sha256_hex !== serverSha) {
    return { ok: false, error: 'Original PDF integrity check failed' };
  }

  const creds = await getWhatsAppCredentials(db);
  if (!creds?.accessToken || !creds?.phoneNumberId) {
    return { ok: false, error: 'WhatsApp credentials missing' };
  }

  const filename = row.original_filename || 'document.pdf';
  const caption = buildOriginalDocumentCaption(row);

  const media = await uploadOutboundPdfToWhatsAppMedia(
    creds.phoneNumberId,
    creds.accessToken,
    obj.buffer,
    filename
  );
  if (!media?.id) return { ok: false, error: 'Could not upload original to WhatsApp' };

  const previewStore = await uploadOutboundMediaToCloudinary(
    obj.buffer,
    'application/pdf',
    filename
  );

  const sent = await callWhatsAppApi(creds.phoneNumberId, creds.accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: row.phone_e164,
    type: 'document',
    document: { id: media.id, filename, caption },
  });

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.data?.error?.message || 'WhatsApp send failed',
      meta: sent.data,
    };
  }

  const waMessageId = sent.data?.messages?.[0]?.id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waMessageId,
    direction: 'outbound',
    phone_e164: row.phone_e164,
    customer_id: row.customer_id || null,
    msg_type: 'document',
    body: caption,
    media_url: previewStore?.url || previewStore?.ref || null,
    media_mime: 'application/pdf',
    filename,
    status: 'sent',
  });

  await deleteR2Object(row.r2_object_key);

  return { ok: true, waMessageId, sha256: serverSha };
}

async function claimInviteAndSendOriginal(db, row) {
  if (!row?.id) return { ok: false, error: 'Invalid invite' };
  if (row.status === 'accepted') return { ok: true, alreadyAccepted: true };
  if (row.status !== 'pending') return { ok: false, error: 'This Accept is no longer valid' };

  row = await markExpiredIfNeeded(db, row);
  if (row.status !== 'pending') return { ok: false, error: 'This Accept has expired' };

  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('document_accept_invites')
    .update({
      status: 'accepted',
      accepted_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (claimErr || !claimed) {
    const { data: again } = await db
      .from('document_accept_invites')
      .select('status')
      .eq('id', row.id)
      .maybeSingle();
    if (again?.status === 'accepted') return { ok: true, alreadyAccepted: true };
    return { ok: false, error: 'Could not accept — try again' };
  }

  const send = await sendOriginalAfterAccept(db, claimed);
  if (!send.ok) {
    return {
      ok: false,
      error: send.error || 'Accepted but could not send original PDF',
      accepted: true,
    };
  }

  await db
    .from('document_accept_invites')
    .update({
      original_wa_message_id: send.waMessageId || null,
      r2_object_key: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimed.id);

  return { ok: true, waMessageId: send.waMessageId };
}

module.exports = {
  sha256Hex,
  normalizeBrand,
  markExpiredIfNeeded,
  createAndSendAcceptInvite,
  sendOriginalAfterAccept,
  claimInviteAndSendOriginal,
  getServiceSupabase,
  DEFAULT_TTL_HOURS,
  ACCEPT_QUICK_REPLY,
};
