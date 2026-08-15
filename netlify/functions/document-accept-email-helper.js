/**
 * Email Document Accept:
 * watermarked preview email → opaque one-time web link → original PDF email.
 * Token plaintext is emailed once; only its SHA-256 hash is stored.
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getFixedFromAddress, getBrandMailMeta } = require('./email-guard');
const {
  getServiceSupabase,
  sha256Hex,
  normalizeBrand,
  markExpiredIfNeeded,
  DEFAULT_TTL_HOURS,
} = require('./document-accept-helper');
const {
  uploadAcceptOriginalToR2,
  getR2ObjectBytes,
  deleteR2Object,
} = require('./r2-helper');
const {
  fileBase64ToBuffer,
  pdfBase64ToBuffer,
} = require('./whatsapp-helper');
const {
  normalizeDocType,
  previewAuthenticitySourceKey,
  recordDocumentPdfAuthenticityServer,
  todayYmdIst,
} = require('./document-pdf-authenticity-record');
const {
  buildBrandEmailHtml,
  emailParagraph,
  EMAIL_FONT: SHELL_FONT,
  EMAIL_SHELL_COLORS: SHELL_COLORS,
} = require('./brand-email-shell');

const MAX_PDF_BYTES = 4.5 * 1024 * 1024;
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return '';
  return email;
}

function decodePdfBuffer(value) {
  return fileBase64ToBuffer(value) || pdfBase64ToBuffer(value);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 120) || 'Customer';
}

function brandInfo(brand) {
  if (normalizeBrand(brand) === 'elevenro') {
    return {
      label: 'Eleven RO',
      webHost: 'elevenro.com',
      // Shared Accept backend/page is deployed from HydrogenRO first.
      origin: 'https://hydrogenro.com',
    };
  }
  return {
    label: 'Hydrogen RO',
    webHost: 'hydrogenro.com',
    origin: 'https://hydrogenro.com',
  };
}

function acceptOrigin(brand) {
  const configured = String(
    process.env.DOCUMENT_ACCEPT_PUBLIC_ORIGIN ||
      process.env.DOCUMENT_ACCEPT_PUBLIC_BASE_URL ||
      ''
  )
    .trim()
    .split(/\s+/)[0];
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
  return brandInfo(brand).origin;
}

function createTransporter() {
  const fromAddress = getFixedFromAddress();
  const password = String(process.env.HOSTINGER_EMAIL_PASS || '');
  if (!fromAddress || !password) return null;
  return {
    fromAddress,
    transporter: nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false,
      auth: { user: fromAddress, pass: password },
      tls: {},
    }),
  };
}

function acceptDetailRow(label, value, last) {
  const border = last ? '' : `border-bottom:1px solid ${SHELL_COLORS.BORDER};`;
  return `
    <tr>
      <td class="email-detail-label" style="padding:10px 0;${border}font-family:${SHELL_FONT};font-size:11px;width:42%;vertical-align:top;text-transform:uppercase;letter-spacing:0.4px;font-weight:500;color:${SHELL_COLORS.LABEL};">${escapeHtml(label)}</td>
      <td class="email-detail-value" style="padding:10px 0 10px 12px;${border}font-family:${SHELL_FONT};font-size:14px;font-weight:700;vertical-align:top;line-height:1.45;color:${SHELL_COLORS.HEADING};">${escapeHtml(value)}</td>
    </tr>`;
}

async function sendPreviewEmail({ row, previewBuffer, previewFilename, acceptUrl }) {
  const mail = createTransporter();
  if (!mail) return { ok: false, error: 'Email configuration missing' };
  const meta = getBrandMailMeta(row.brand);
  const label = String(row.document_label || 'document').trim() || 'document';
  const name = plainName(row.customer_name);
  const reference = String(row.document_ref || '').trim();
  const subject = `Review and accept your ${label} — ${brandInfo(row.brand).label}`;
  const html = buildBrandEmailHtml({
    brand: row.brand,
    previewText: `Review your preview ${label} and accept securely.`,
    eyebrow: 'Document review',
    heading: `Review your ${label}`,
    introHtml:
      emailParagraph(
        `Hi <strong class="email-text-strong" style="font-weight:600;">${escapeHtml(name)}</strong>, your watermarked <strong class="email-text-strong" style="font-weight:600;">preview ${escapeHtml(label)}</strong> is attached.`
      ) +
      emailParagraph(
        'Please check the scope, pricing, validity and policies. When everything looks right, accept securely below and we will email the verified original PDF.'
      ),
    badgeHtml: reference
      ? `Ref&nbsp;<strong class="email-text-strong" style="font-weight:700;letter-spacing:-0.02em;">${escapeHtml(reference)}</strong>&nbsp;&middot;&nbsp;<span class="email-badge-success" style="font-weight:600;">Preview</span>`
      : '',
    cta: { href: acceptUrl, label: 'Review & Accept' },
    noteHtml:
      'This private link expires in 48 hours and can be accepted once. Please do not forward this email.',
    whatsappText: `Hi, I have a question about my ${label}${reference ? ` (${reference})` : ''}.`,
  });
  const text = `Hi ${name},\n\nYour watermarked preview ${label} is attached. Review it, then accept securely:\n${acceptUrl}\n\nAfter acceptance, we will email the verified original PDF. This private link expires in 48 hours and can be accepted once.`;

  try {
    const info = await mail.transporter.sendMail({
      from: { name: meta.fromName, address: mail.fromAddress },
      to: row.recipient_email,
      subject,
      html,
      text,
      replyTo: meta.replyTo,
      attachments: [{
        filename: previewFilename,
        content: previewBuffer,
        contentType: 'application/pdf',
      }],
      headers: { 'X-Mailer': `${meta.mailer} Document Accept`, 'X-Priority': '3' },
    });
    console.log('[document-accept-email] preview sent', {
      to: row.recipient_email,
      inviteId: row.id || null,
      messageId: info.messageId || null,
      acceptHost: (() => {
        try {
          return new URL(acceptUrl).origin;
        } catch {
          return null;
        }
      })(),
    });
    return { ok: true, messageId: info.messageId || null };
  } catch (error) {
    console.error('[document-accept-email] preview send failed', error?.message);
    return { ok: false, error: 'Could not send preview email' };
  }
}

async function sendOriginalEmail(row, pdfBuffer) {
  const mail = createTransporter();
  if (!mail) return { ok: false, error: 'Email configuration missing' };
  const meta = getBrandMailMeta(row.brand);
  const info = brandInfo(row.brand);
  const label = String(row.document_label || 'document').trim() || 'document';
  const name = plainName(row.customer_name);
  const confirmation = String(row.confirmation_id || '').trim();
  const verifyCode = String(row.original_verify_code || '').trim();
  const reference = String(row.document_ref || '').trim();
  const subject = `Original ${label} — ${info.label}`;
  const detailRows = [
    confirmation ? acceptDetailRow('Confirmation ID', confirmation, !verifyCode) : '',
    verifyCode ? acceptDetailRow('Authenticity code', verifyCode, true) : '',
  ].join('');
  const html = buildBrandEmailHtml({
    brand: row.brand,
    previewText: `Your accepted ${label} is attached.`,
    eyebrow: 'Accepted',
    heading: `Your original ${label}`,
    showSuccessIcon: true,
    introHtml:
      emailParagraph(
        `Hi <strong class="email-text-strong" style="font-weight:600;">${escapeHtml(name)}</strong>, thank you. Your acceptance has been recorded and the verified original PDF is attached.`
      ),
    badgeHtml: reference
      ? `Ref&nbsp;<strong class="email-text-strong" style="font-weight:700;letter-spacing:-0.02em;">${escapeHtml(reference)}</strong>&nbsp;&middot;&nbsp;<span class="email-badge-success" style="font-weight:600;">Accepted</span>`
      : '',
    infoBoxHtml: detailRows
      ? `<p class="email-details-title" style="margin:0 0 6px;font-family:${SHELL_FONT};font-size:13px;font-weight:600;text-align:center;color:${SHELL_COLORS.HEADING};">Keep this for your records</p>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${detailRows}</table>`
      : '',
    noteHtml: verifyCode
      ? `Verify this document any time at ${escapeHtml(info.webHost)}/authenticity using the code above.`
      : '',
    whatsappText: `Hi, I have a question about my ${label}${reference ? ` (${reference})` : ''}.`,
  });
  const text = `Hi ${name},\n\nYour acceptance has been recorded. The verified original ${label} is attached.${confirmation ? `\nConfirmation ID: ${confirmation}` : ''}${verifyCode ? `\nAuthenticity code: ${verifyCode}\nVerify at ${info.webHost}/authenticity` : ''}`;

  try {
    const result = await mail.transporter.sendMail({
      from: { name: meta.fromName, address: mail.fromAddress },
      to: row.recipient_email,
      subject,
      html,
      text,
      replyTo: meta.replyTo,
      attachments: [{
        filename: row.original_filename || 'document.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
      headers: { 'X-Mailer': `${meta.mailer} Document Accept`, 'X-Priority': '3' },
    });
    return { ok: true, messageId: result.messageId || null };
  } catch (error) {
    console.error('[document-accept-email] original send failed', error?.message);
    return { ok: false, error: 'Accepted, but the original email could not be sent' };
  }
}

async function createAndSendEmailAcceptInvite(opts) {
  const db = getServiceSupabase();
  if (!db) return { ok: false, error: 'Service unavailable' };
  const email = normalizeEmail(opts.to || opts.email);
  if (!email) return { ok: false, error: 'Invalid recipient email' };

  const originalBuffer = decodePdfBuffer(opts.originalPdfBase64);
  const previewBuffer = decodePdfBuffer(opts.previewPdfBase64);
  if (!originalBuffer || originalBuffer.length < 32) {
    return { ok: false, error: 'Invalid original PDF' };
  }
  if (!previewBuffer || previewBuffer.length < 32) {
    return { ok: false, error: 'Invalid preview PDF' };
  }
  if (originalBuffer.length > MAX_PDF_BYTES || previewBuffer.length > MAX_PDF_BYTES) {
    return { ok: false, error: 'PDF too large (max ~4.5MB)' };
  }

  const brand = normalizeBrand(opts.brand);
  const docType = String(opts.docType || 'generic').trim() || 'generic';
  const documentLabel = String(opts.documentLabel || 'document').trim().slice(0, 120) || 'document';
  const filename = String(opts.filename || 'document.pdf').trim().slice(0, 180) || 'document.pdf';
  const customerName = plainName(opts.customerName);
  const sourceKey =
    String(opts.sourceKey || opts.documentRef || '').trim() ||
    filename.replace(/\.pdf$/i, '');
  const documentRef = String(opts.documentRef || sourceKey).trim() || sourceKey;
  const previewVerifyCode = String(opts.previewVerifyCode || '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const verifyCode = String(opts.verifyCode || '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const ttlHours = Math.min(72, Math.max(1, Number(opts.ttlHours) || DEFAULT_TTL_HOURS));
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  const originalSha = sha256Hex(originalBuffer);

  if (previewVerifyCode.length === 8) {
    const previewFp = await recordDocumentPdfAuthenticityServer(db, {
      docType: normalizeDocType(docType),
      sourceKey: previewAuthenticitySourceKey(sourceKey),
      verifyCode: previewVerifyCode,
      pdfBuffer: previewBuffer,
      filename: `PREVIEW_${filename}`,
      customerId: opts.customerId,
      documentRef: `${documentRef} (preview)`,
      createdBy: opts.createdBy,
      generatedOnYmd: todayYmdIst(),
    });
    if (!previewFp.ok) {
      console.warn('[document-accept-email] preview fingerprint failed:', previewFp.error);
    }
  }

  const uploaded = await uploadAcceptOriginalToR2(originalBuffer, 'application/pdf', filename);
  if (!uploaded?.key) return { ok: false, error: 'Could not store original PDF (check R2)' };

  const plaintextToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(Buffer.from(plaintextToken, 'utf8'));
  const row = {
    token_hash: tokenHash,
    status: 'pending',
    channel: 'email',
    brand,
    doc_type: docType,
    document_label: documentLabel,
    document_ref: opts.documentRef || null,
    source_key: opts.sourceKey || opts.documentRef || null,
    customer_id: opts.customerId || null,
    customer_name: customerName,
    phone_e164: null,
    recipient_email: email,
    amount_display: opts.amountDisplay != null ? String(opts.amountDisplay) : null,
    summary: opts.summary && typeof opts.summary === 'object' ? opts.summary : {},
    original_filename: filename,
    original_sha256_hex: originalSha,
    original_verify_code: verifyCode || null,
    original_byte_length: originalBuffer.length,
    original_delivery_status: 'pending',
    r2_object_key: uploaded.key,
    expires_at: expiresAt,
    created_by: opts.createdBy || null,
  };

  const { data: invite, error: insertError } = await db
    .from('document_accept_invites')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (insertError || !invite?.id) {
    await deleteR2Object(uploaded.key).catch(() => {});
    return { ok: false, error: insertError?.message || 'Could not create email accept invite' };
  }

  const acceptUrl = `${acceptOrigin(brand)}/accept/${encodeURIComponent(plaintextToken)}`;
  const previewFilename = `PREVIEW_${filename}`;
  const sent = await sendPreviewEmail({
    row: { ...row, id: invite.id },
    previewBuffer,
    previewFilename,
    acceptUrl,
  });
  if (!sent.ok) {
    await db.from('document_accept_invites')
      .update({ status: 'failed', original_delivery_error: sent.error, updated_at: new Date().toISOString() })
      .eq('id', invite.id);
    await deleteR2Object(uploaded.key).catch(() => {});
    return sent;
  }

  await db.from('document_accept_invites')
    .update({ preview_email_message_id: sent.messageId, updated_at: new Date().toISOString() })
    .eq('id', invite.id);

  return {
    ok: true,
    inviteId: invite.id,
    expiresAt,
    emailMessageId: sent.messageId,
    originalSha256: originalSha,
  };
}

function confirmationId(brand) {
  const prefix = normalizeBrand(brand) === 'elevenro' ? 'ERO' : 'HRO';
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-AC-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function getEmailAcceptInviteByToken(db, token) {
  const tokenHash = sha256Hex(Buffer.from(String(token), 'utf8'));
  const { data, error } = await db
    .from('document_accept_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('channel', 'email')
    .maybeSingle();
  if (error) {
    console.warn('[document-accept-email] lookup failed', error.message);
    return null;
  }
  if (!data) return null;
  return markExpiredIfNeeded(db, data);
}

async function publicEmailAcceptSummary(db, token) {
  const row = await getEmailAcceptInviteByToken(db, token);
  if (!row) return { ok: false, error: 'invalid' };
  if (row.status === 'failed' || row.status === 'revoked') {
    return { ok: false, error: 'invalid' };
  }
  return {
    ok: true,
    invite: {
      brand: normalizeBrand(row.brand),
      documentLabel: row.document_label || 'document',
      documentRef: row.document_ref || null,
      customerName: plainName(row.customer_name),
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at || null,
      confirmationId: row.confirmation_id || null,
      deliveryStatus: row.original_delivery_status || 'pending',
    },
  };
}

async function acceptEmailInvite(db, token, audit) {
  let row = await getEmailAcceptInviteByToken(db, token);
  if (!row) return { ok: false, error: 'invalid' };
  if (row.status === 'expired') return { ok: false, error: 'expired' };
  if (!['pending', 'accepted'].includes(row.status)) return { ok: false, error: 'invalid' };

  let newlyAccepted = false;
  if (row.status === 'pending') {
    const now = new Date().toISOString();
    const confirm = confirmationId(row.brand);
    const { data: claimed, error } = await db
      .from('document_accept_invites')
      .update({
        status: 'accepted',
        accepted_at: now,
        accepted_ip: String(audit?.ip || '').slice(0, 120) || null,
        accepted_ua: String(audit?.userAgent || '').slice(0, 500) || null,
        confirmation_id: confirm,
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) {
      console.warn('[document-accept-email] claim failed', error.message);
      return { ok: false, error: 'failed' };
    }
    if (claimed) {
      row = claimed;
      newlyAccepted = true;
    } else {
      row = await getEmailAcceptInviteByToken(db, token);
      if (!row || row.status !== 'accepted') return { ok: false, error: 'failed' };
    }
  }

  if (row.original_delivery_status === 'sent') {
    return {
      ok: true,
      alreadyAccepted: true,
      confirmationId: row.confirmation_id,
      deliveryStatus: 'sent',
    };
  }

  const staleSending =
    row.original_delivery_status === 'sending' &&
    Date.now() - new Date(row.updated_at || row.accepted_at || 0).getTime() > 2 * 60_000;
  if (row.original_delivery_status === 'sending' && !staleSending) {
    return {
      ok: true,
      alreadyAccepted: !newlyAccepted,
      confirmationId: row.confirmation_id,
      deliveryStatus: 'sending',
    };
  }

  const previousDelivery = row.original_delivery_status || 'pending';
  const { data: deliveryClaim } = await db
    .from('document_accept_invites')
    .update({
      original_delivery_status: 'sending',
      original_delivery_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('original_delivery_status', previousDelivery)
    .select('*')
    .maybeSingle();

  if (!deliveryClaim) {
    return {
      ok: true,
      alreadyAccepted: !newlyAccepted,
      confirmationId: row.confirmation_id,
      deliveryStatus: 'sending',
    };
  }
  row = deliveryClaim;

  const object = row.r2_object_key ? await getR2ObjectBytes(row.r2_object_key) : null;
  if (!object?.buffer?.length) {
    await db.from('document_accept_invites')
      .update({
        original_delivery_status: 'failed',
        original_delivery_error: 'Original PDF missing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, accepted: true, error: 'delivery_failed', confirmationId: row.confirmation_id };
  }
  if (row.original_sha256_hex && sha256Hex(object.buffer) !== row.original_sha256_hex) {
    await db.from('document_accept_invites')
      .update({
        original_delivery_status: 'failed',
        original_delivery_error: 'Original PDF integrity check failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, accepted: true, error: 'delivery_failed', confirmationId: row.confirmation_id };
  }

  const sent = await sendOriginalEmail(row, object.buffer);
  if (!sent.ok) {
    await db.from('document_accept_invites')
      .update({
        original_delivery_status: 'failed',
        original_delivery_error: String(sent.error || 'Email failed').slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, accepted: true, error: 'delivery_failed', confirmationId: row.confirmation_id };
  }

  const { error: updateError } = await db.from('document_accept_invites')
    .update({
      original_delivery_status: 'sent',
      original_email_message_id: sent.messageId,
      original_delivery_error: null,
      r2_object_key: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (!updateError && row.r2_object_key) {
    await deleteR2Object(row.r2_object_key).catch(() => {});
  }

  return {
    ok: true,
    alreadyAccepted: !newlyAccepted,
    confirmationId: row.confirmation_id,
    deliveryStatus: 'sent',
  };
}

module.exports = {
  normalizeEmail,
  createAndSendEmailAcceptInvite,
  publicEmailAcceptSummary,
  acceptEmailInvite,
};
