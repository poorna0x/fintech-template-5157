/**
 * Admin Cloud API WhatsApp send — shared by inbox, composer, Calling, pending payments.
 * Falls back to wa.me when the 24h customer-service window is closed (or on request).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import type { DocumentBrand } from '@/lib/service-brands';
import { coldDocBodyParams, coldDocTemplateForKind } from '@/lib/whatsappColdTemplates';
import { resolveWaTemplateName } from '@/lib/whatsappTemplateResolve';
import type { WhatsAppSendSource } from '@/lib/whatsappCrmSettings';

export type AdminWhatsAppSendVia = 'api' | 'wa_me';

export type AdminWhatsAppSendResult = {
  ok: boolean;
  via?: AdminWhatsAppSendVia;
  error?: string;
  /** True when API failed because Meta requires an open session / template. */
  needsWindowOrTemplate?: boolean;
  /** True when Settings → WhatsApp toggled this surface off. */
  featureDisabled?: boolean;
};

function isFeatureDisabledResponse(data: { code?: string } | null | undefined): boolean {
  return String(data?.code || '') === 'WHATSAPP_FEATURE_DISABLED';
}

const WINDOW_ERROR_RE =
  /24\s*hour|customer care window|session|re-?engage|template|131047|131026|131051|132018|outside|expired|business.?initiated|not.?allowed.*session/i;

function isWindowOrTemplateError(message: string): boolean {
  return WINDOW_ERROR_RE.test(message);
}

export function resolveBillCustomerDisplayName(
  customer: { name?: string; fullName?: string; full_name?: string } | null | undefined
): string {
  if (!customer) return 'Customer';
  return (
    String(customer.fullName || customer.full_name || customer.name || '').trim() || 'Customer'
  );
}

export function openWhatsAppMeDeepLink(phone: string, message: string): void {
  const url = `https://wa.me/${formatPhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export type SendAdminWhatsAppTextOptions = {
  to: string;
  text: string;
  customerId?: string | null;
  customerName?: string | null;
  /** CRM surface — enforced by WhatsApp settings toggles. */
  source?: WhatsAppSendSource;
  /** After send, seed booking-bot pending for next customer reply. */
  seedPendingAction?: string | null;
  /** If API fails due to closed 24h window, open wa.me (default true for CRM compose). */
  fallbackWaMe?: boolean;
  /** Skip API and only open wa.me. */
  forceWaMe?: boolean;
};

export async function sendAdminWhatsAppText(
  options: SendAdminWhatsAppTextOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const text = String(options.text || '').trim();
  if (!to) return { ok: false, error: 'Phone required' };
  if (!text) return { ok: false, error: 'Message is empty' };

  if (options.forceWaMe) {
    openWhatsAppMeDeepLink(to, text);
    return { ok: true, via: 'wa_me' };
  }

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(to, text);
      return { ok: true, via: 'wa_me' };
    }
    return { ok: false, error: 'Not signed in' };
  }

  try {
    const res = await fetch('/.netlify/functions/whatsapp-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to,
        type: 'text',
        text,
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.customerName ? { customerName: options.customerName } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.seedPendingAction
          ? { seedPendingAction: options.seedPendingAction }
          : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }

    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    if (isFeatureDisabledResponse(data)) {
      return { ok: false, error: errMsg, featureDisabled: true };
    }
    const needsWindow = isWindowOrTemplateError(errMsg);

    if (options.fallbackWaMe !== false && needsWindow) {
      openWhatsAppMeDeepLink(to, text);
      return { ok: true, via: 'wa_me', needsWindowOrTemplate: true, error: errMsg };
    }

    if (options.fallbackWaMe !== false && !needsWindow) {
      // Network / misconfig — still offer phone WhatsApp so staff aren't blocked
      openWhatsAppMeDeepLink(to, text);
      return { ok: true, via: 'wa_me', error: errMsg };
    }

    return { ok: false, error: errMsg, needsWindowOrTemplate: needsWindow };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Send failed';
    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(to, text);
      return { ok: true, via: 'wa_me', error: errMsg };
    }
    return { ok: false, error: errMsg };
  }
}

export type SendAdminWhatsAppDocumentOptions = {
  to: string;
  pdfBase64: string;
  filename: string;
  caption?: string;
  customerId?: string | null;
  source?: WhatsAppSendSource;
  /** Documents cannot open via wa.me with file — no deep-link fallback. */
  fallbackWaMe?: boolean;
};

export async function sendAdminWhatsAppDocument(
  options: SendAdminWhatsAppDocumentOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const pdfBase64 = String(options.pdfBase64 || '').trim();
  const filename = String(options.filename || 'document.pdf').trim() || 'document.pdf';
  const caption = String(options.caption || '').trim();

  if (!to) return { ok: false, error: 'Phone required' };
  if (!pdfBase64) return { ok: false, error: 'PDF required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, error: 'Not signed in' };
  }

  try {
    const res = await fetch('/.netlify/functions/whatsapp-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to,
        type: 'document',
        pdfBase64,
        filename,
        mimeType: 'application/pdf',
        ...(caption ? { caption } : {}),
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.source ? { source: options.source } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    if (isFeatureDisabledResponse(data)) {
      return { ok: false, error: errMsg, featureDisabled: true };
    }
    return {
      ok: false,
      error: errMsg,
      needsWindowOrTemplate: isWindowOrTemplateError(errMsg),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export type SendAdminWhatsAppMediaOptions = {
  to: string;
  /** Raw base64 or data-URL base64 */
  fileBase64: string;
  filename: string;
  mimeType: string;
  caption?: string;
  customerId?: string | null;
  source?: WhatsAppSendSource;
};

/** Send image (jpeg/png/webp) or document (pdf) from inbox attachments. */
export async function sendAdminWhatsAppMedia(
  options: SendAdminWhatsAppMediaOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const fileBase64 = String(options.fileBase64 || '').trim();
  const filename = String(options.filename || 'file').trim() || 'file';
  const mimeType = String(options.mimeType || '').trim() || 'application/octet-stream';
  const caption = String(options.caption || '').trim();

  if (!to) return { ok: false, error: 'Phone required' };
  if (!fileBase64) return { ok: false, error: 'File required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, error: 'Not signed in' };
  }

  const isImage = /^image\/(jpeg|jpg|png|webp)$/i.test(mimeType);
  const type = isImage ? 'image' : 'document';

  try {
    const res = await fetch('/.netlify/functions/whatsapp-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to,
        type,
        fileBase64,
        filename,
        mimeType,
        ...(caption ? { caption } : {}),
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.source ? { source: options.source } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    if (isFeatureDisabledResponse(data)) {
      return { ok: false, error: errMsg, featureDisabled: true };
    }
    return {
      ok: false,
      error: errMsg,
      needsWindowOrTemplate: isWindowOrTemplateError(errMsg),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

/** Read a File into base64 (no data-URL prefix) for Netlify function payload. */
export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; filename: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] || '' : result;
      if (!base64) {
        reject(new Error('Empty file'));
        return;
      }
      resolve({
        base64,
        mimeType: file.type || 'application/octet-stream',
        filename: file.name || 'file',
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

export const WHATSAPP_ATTACH_ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

export const WHATSAPP_ATTACH_MAX_BYTES = 4 * 1024 * 1024;

export function validateWhatsAppAttachFile(file: File): string | null {
  if (!file) return 'No file selected';
  if (file.size > WHATSAPP_ATTACH_MAX_BYTES) {
    return 'File too large (max 4MB)';
  }
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const okMime =
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    mime === 'application/pdf';
  const okExt = /\.(jpe?g|png|webp|pdf)$/i.test(name);
  if (!okMime && !okExt) {
    return 'Only JPEG, PNG, WebP, or PDF';
  }
  return null;
}

export type SendAdminWhatsAppTemplateOptions = {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  customerId?: string | null;
  customerName?: string | null;
  source?: WhatsAppSendSource;
  /** After send, seed booking-bot pending (e.g. book_service) for next customer reply. */
  seedPendingAction?: string | null;
  /** For DOCUMENT-header templates — attach PDF in the same cold send. */
  headerDocument?: {
    pdfBase64: string;
    filename?: string;
  } | null;
};

export async function sendAdminWhatsAppTemplate(
  options: SendAdminWhatsAppTemplateOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const templateName = resolveWaTemplateName(String(options.templateName || '').trim());
  if (!to) return { ok: false, error: 'Phone required' };
  if (!templateName) return { ok: false, error: 'Template required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, error: 'Not signed in' };
  }

  try {
    const res = await fetch('/.netlify/functions/whatsapp-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to,
        type: 'template',
        templateName,
        languageCode: options.languageCode || 'en',
        bodyParams: options.bodyParams || [],
        ...(options.headerDocument?.pdfBase64
          ? {
              headerDocument: {
                pdfBase64: options.headerDocument.pdfBase64,
                filename: options.headerDocument.filename || 'document.pdf',
              },
            }
          : {}),
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.customerName ? { customerName: options.customerName } : {}),
        ...(options.source ? { source: options.source } : {}),
        ...(options.seedPendingAction
          ? { seedPendingAction: options.seedPendingAction }
          : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    if (isFeatureDisabledResponse(data)) {
      return { ok: false, error: errMsg, featureDisabled: true };
    }
    return { ok: false, error: errMsg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export type SendAdminWhatsAppTextWithTemplateOptions = SendAdminWhatsAppTextOptions & {
  /** When free-form fails due to closed 24h window, try this Meta template before wa.me. */
  coldTemplate?: {
    name: string;
    languageCode?: string;
    bodyParams: string[];
  } | null;
};

/**
 * Free-form API → optional cold template → wa.me backup (default).
 * Never reports ok when free-form failed due to closed window and the cold template also failed.
 */
export async function sendAdminWhatsAppTextWithOptionalTemplate(
  options: SendAdminWhatsAppTextWithTemplateOptions
): Promise<AdminWhatsAppSendResult & { usedTemplate?: boolean }> {
  const textResult = await sendAdminWhatsAppText({
    ...options,
    fallbackWaMe: false,
  });
  if (textResult.ok) {
    return textResult;
  }

  if (textResult.featureDisabled) {
    return textResult;
  }

  const coldName = String(options.coldTemplate?.name || '').trim();
  if (textResult.needsWindowOrTemplate && coldName) {
    const tpl = await sendAdminWhatsAppTemplate({
      to: options.to,
      templateName: coldName,
      languageCode: options.coldTemplate?.languageCode || 'en',
      bodyParams: options.coldTemplate?.bodyParams || [],
      customerId: options.customerId,
      customerName: options.customerName,
      source: options.source,
      seedPendingAction: options.seedPendingAction,
    });
    if (tpl.ok) {
      return { ...tpl, usedTemplate: true };
    }
    if (tpl.featureDisabled) {
      return tpl;
    }

    // Last resort: approved svc_smoke_update (1 param) so staff aren't blocked while Meta reviews specific templates.
    const smokeName = resolveWaTemplateName('svc_smoke_update');
    if (coldName !== smokeName) {
      const customerLabel =
        String(options.coldTemplate?.bodyParams?.[0] || '').trim() || 'there';
      const smoke = await sendAdminWhatsAppTemplate({
        to: options.to,
        templateName: smokeName,
        languageCode: 'en',
        bodyParams: [customerLabel],
        customerId: options.customerId,
        customerName: options.customerName,
        source: options.source,
        seedPendingAction: options.seedPendingAction,
      });
      if (smoke.ok) {
        return { ...smoke, usedTemplate: true };
      }
      if (smoke.featureDisabled) {
        return smoke;
      }
    }

    const templateFailError =
      tpl.error ||
      `Template "${coldName}" could not send (not approved or rejected by Meta)`;
    const combinedError = `24h window closed — ${templateFailError}`;

    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(options.to, options.text);
      return {
        ok: true,
        via: 'wa_me',
        needsWindowOrTemplate: true,
        error: combinedError,
      };
    }

    return {
      ok: false,
      needsWindowOrTemplate: true,
      error: combinedError,
    };
  }

  if (textResult.needsWindowOrTemplate) {
    const noTplError =
      textResult.error ||
      '24h window closed — send an approved Meta template, or wait for the customer to message first';
    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(options.to, options.text);
      return {
        ok: true,
        via: 'wa_me',
        needsWindowOrTemplate: true,
        error: noTplError,
      };
    }
    return {
      ok: false,
      needsWindowOrTemplate: true,
      error: noTplError,
    };
  }

  if (options.fallbackWaMe !== false) {
    openWhatsAppMeDeepLink(options.to, options.text);
    return {
      ok: true,
      via: 'wa_me',
      needsWindowOrTemplate: textResult.needsWindowOrTemplate,
      error: textResult.error,
    };
  }

  return textResult;
}

export type WhatsAppTemplateListItem = {
  name: string;
  language: string;
  category?: string;
  bodyParamCount: number;
  bodyPreview?: string | null;
};

export async function fetchApprovedWhatsAppTemplates(): Promise<{
  ok: boolean;
  templates: WhatsAppTemplateListItem[];
  recommended?: Array<{ name: string; language: string; hint: string }>;
  error?: string;
}> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, templates: [], error: 'Not signed in' };
  }
  try {
    const res = await fetch('/.netlify/functions/whatsapp-templates', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        templates: [],
        error: data?.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      templates: Array.isArray(data.templates) ? data.templates : [],
      recommended: data.recommended,
    };
  } catch (err) {
    return {
      ok: false,
      templates: [],
      error: err instanceof Error ? err.message : 'Failed to load templates',
    };
  }
}

export type SendColdDocumentInviteOptions = {
  to: string;
  kind: string;
  customerName: string;
  customerId?: string | null;
  brand?: DocumentBrand | string | null;
  amount?: number | string;
  ref?: string;
  documentLabel?: string;
  source?: WhatsAppSendSource;
  /** Required for one-shot cold PDF (DOCUMENT-header template). */
  pdfBase64: string;
  filename?: string;
};

/**
 * Cold PDF outside 24h: send DOCUMENT-header Utility template with the PDF attached
 * (no "reply YES" invite). Requires per-doc `svc_doc_*_{ero|hro}_v2` or fallback `svc_doc_pdf_v2`.
 */
export async function sendColdDocumentInvite(
  options: SendColdDocumentInviteOptions
): Promise<AdminWhatsAppSendResult> {
  const pdfBase64 = String(options.pdfBase64 || '').trim();
  if (!pdfBase64) {
    return { ok: false, error: 'PDF required for cold document send' };
  }
  const meta = coldDocTemplateForKind(options.kind, options.brand);
  return sendAdminWhatsAppTemplate({
    to: options.to,
    templateName: meta.name,
    languageCode: meta.language,
    bodyParams: coldDocBodyParams(options.kind, {
      customerName: options.customerName,
      amount: options.amount,
      ref: options.ref,
      documentLabel: options.documentLabel,
    }),
    headerDocument: {
      pdfBase64,
      filename: options.filename || 'document.pdf',
    },
    customerId: options.customerId,
    source: options.source || 'documents',
  });
}

export type SendAdminWhatsAppDocumentWithColdFallbackOptions = SendAdminWhatsAppDocumentOptions & {
  cold: {
    kind: string;
    customerName: string;
    brand?: DocumentBrand | string | null;
    amount?: number | string;
    ref?: string;
    documentLabel?: string;
  };
  /** When the CRM already knows the 24h window is closed — skip free-form document send. */
  preferColdTemplate?: boolean;
};

/**
 * Send PDF in-session when the 24h window is open; otherwise use DOCUMENT-header cold template.
 */
export async function sendAdminWhatsAppDocumentWithColdFallback(
  options: SendAdminWhatsAppDocumentWithColdFallbackOptions
): Promise<AdminWhatsAppSendResult & { viaColdTemplate?: boolean }> {
  const { cold, preferColdTemplate, ...docOpts } = options;

  const tryCold = async (): Promise<AdminWhatsAppSendResult & { viaColdTemplate?: boolean }> => {
    const invite = await sendColdDocumentInvite({
      to: docOpts.to,
      pdfBase64: docOpts.pdfBase64,
      filename: docOpts.filename,
      customerId: docOpts.customerId,
      source: docOpts.source || 'documents',
      kind: cold.kind,
      customerName: cold.customerName,
      brand: cold.brand,
      amount: cold.amount,
      ref: cold.ref,
      documentLabel: cold.documentLabel,
    });
    return invite.ok ? { ...invite, viaColdTemplate: true } : invite;
  };

  if (preferColdTemplate) {
    return tryCold();
  }

  const result = await sendAdminWhatsAppDocument(docOpts);
  if (result.ok) return result;
  if (result.featureDisabled) return result;

  if (result.needsWindowOrTemplate) {
    return tryCold();
  }

  return result;
}

export async function fetchWhatsAppR2SignedUrl(opts: {
  mediaUrl?: string | null;
  messageId?: string | null;
}): Promise<{ ok: boolean; url?: string; error?: string; expiresIn?: number | null }> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-r2-signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...(opts.mediaUrl ? { mediaUrl: opts.mediaUrl } : {}),
        ...(opts.messageId ? { messageId: opts.messageId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
    }
    return {
      ok: true,
      url: data.url,
      expiresIn: data.expiresIn ?? null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Signed URL failed' };
  }
}

/** Bytes via same-origin proxy (PDF thumbnails — avoids R2 browser CORS). */
export async function fetchWhatsAppR2MediaBytes(opts: {
  mediaUrl?: string | null;
  messageId?: string | null;
}): Promise<{ ok: boolean; bytes?: ArrayBuffer; url?: string; error?: string }> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-r2-signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        proxy: true,
        ...(opts.mediaUrl ? { mediaUrl: opts.mediaUrl } : {}),
        ...(opts.messageId ? { messageId: opts.messageId } : {}),
      }),
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      const data = ct.includes('json') ? await res.json().catch(() => ({})) : {};
      return { ok: false, error: String((data as { error?: string })?.error || `HTTP ${res.status}`) };
    }
    if (ct.includes('application/json')) {
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        tooLargeForProxy?: boolean;
        legacy?: boolean;
      };
      if (data.url) return { ok: true, url: data.url };
      return { ok: false, error: String(data.error || 'No media') };
    }
    return { ok: true, bytes: await res.arrayBuffer() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Media fetch failed' };
  }
}

export async function purgeWhatsAppMessages(opts: {
  olderThanDays?: number;
  phoneE164?: string;
  dryRun?: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  deletedRows?: number;
  deletedMedia?: number;
  wouldDeleteRows?: number;
  withMedia?: number;
}> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-purge-messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(opts),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
    }
    return {
      ok: true,
      deletedRows: data.deletedRows,
      deletedMedia: data.deletedMedia,
      wouldDeleteRows: data.wouldDeleteRows,
      withMedia: data.withMedia,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Purge failed' };
  }
}
