/**
 * Admin Cloud API WhatsApp send — shared by inbox, composer, Calling, pending payments.
 * Falls back to wa.me when the 24h customer-service window is closed (or on request).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import type { DocumentBrand } from '@/lib/service-brands';
import {
  coldDocBodyParams,
  coldDocTemplateForKind,
  coldDocTemplateSlug,
  directDocBodyParams,
  resolveDirectDocTemplate,
} from '@/lib/whatsappColdTemplates';
import { resolveWaTemplateName } from '@/lib/whatsappTemplateResolve';
import type { WhatsAppSendSource } from '@/lib/whatsappCrmSettings';
import {
  getCachedMediaBytes,
  getCachedMediaObjectUrl,
  peekCachedMediaObjectUrl,
  putCachedMediaBlob,
  whatsappMediaCacheKey,
} from '@/lib/whatsappMediaCache';
import { noteWhatsAppOutboundInLocalCaches } from '@/lib/whatsappInbox';

export type AdminWhatsAppSendVia = 'api' | 'wa_me';

export type AdminWhatsAppSendResult = {
  ok: boolean;
  via?: AdminWhatsAppSendVia;
  error?: string;
  /** DB row id when Cloud API persist succeeded. */
  messageId?: string | null;
  /** True when API failed because Meta requires an open session / template. */
  needsWindowOrTemplate?: boolean;
  /** True when Settings → WhatsApp toggled this surface off. */
  featureDisabled?: boolean;
};

function noteApiSendInInboxCaches(
  to: string,
  data: Record<string, unknown> | null | undefined,
  extras?: {
    body?: string | null;
    msgType?: string | null;
    filename?: string | null;
    mediaMime?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    templateName?: string | null;
  }
): void {
  try {
    noteWhatsAppOutboundInLocalCaches({
      phoneE164: to,
      body: (typeof data?.body === 'string' ? data.body : null) || extras?.body || null,
      msgType:
        (typeof data?.msgType === 'string' ? data.msgType : null) || extras?.msgType || null,
      filename:
        (typeof data?.filename === 'string' ? data.filename : null) || extras?.filename || null,
      mediaMime:
        (typeof data?.mediaMime === 'string' ? data.mediaMime : null) || extras?.mediaMime || null,
      mediaUrl: typeof data?.mediaUrl === 'string' ? data.mediaUrl : null,
      messageId:
        data?.messageId != null
          ? String(data.messageId)
          : null,
      customerId:
        (typeof data?.customerId === 'string' ? data.customerId : null) ||
        extras?.customerId ||
        null,
      customerName: extras?.customerName || null,
      templateName:
        (typeof data?.templateName === 'string' ? data.templateName : null) ||
        extras?.templateName ||
        null,
    });
  } catch {
    // Soft-fail — send already succeeded
  }
}

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
      noteApiSendInInboxCaches(to, data, {
        body: text,
        msgType: 'text',
        customerId: options.customerId,
        customerName: options.customerName,
      });
      return {
        ok: true,
        via: 'api',
        messageId: data?.messageId ? String(data.messageId) : null,
      };
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

export type SendAdminWhatsAppCtaUrlOptions = {
  to: string;
  text: string;
  url: string;
  displayText?: string;
  customerId?: string | null;
  customerName?: string | null;
  source?: WhatsAppSendSource;
  fallbackWaMe?: boolean;
};

/** 24h interactive Pay now (or any HTTPS CTA) button. */
export async function sendAdminWhatsAppCtaUrl(
  options: SendAdminWhatsAppCtaUrlOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const text = String(options.text || '').trim();
  const url = String(options.url || '').trim();
  const displayText = String(options.displayText || 'Pay now').trim().slice(0, 20) || 'Pay now';
  if (!to) return { ok: false, error: 'Phone required' };
  if (!text) return { ok: false, error: 'Message required' };
  if (!url || !/^https:\/\//i.test(url)) return { ok: false, error: 'HTTPS URL required' };

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
        type: 'cta_url',
        text,
        url,
        displayText,
        ...(options.customerId ? { customerId: options.customerId } : {}),
        ...(options.customerName ? { customerName: options.customerName } : {}),
        ...(options.source ? { source: options.source } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      noteApiSendInInboxCaches(to, data, {
        body: `${text}\n\n[${displayText}]`,
        msgType: 'interactive',
        customerId: options.customerId,
        customerName: options.customerName,
      });
      return {
        ok: true,
        via: 'api',
        messageId: data?.messageId ? String(data.messageId) : null,
      };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    if (isFeatureDisabledResponse(data)) {
      return { ok: false, error: errMsg, featureDisabled: true };
    }
    const needsWindow = isWindowOrTemplateError(errMsg);
    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(to, `${text}\n\n${url}`);
      return {
        ok: true,
        via: 'wa_me',
        needsWindowOrTemplate: needsWindow,
        error: errMsg,
      };
    }
    return { ok: false, error: errMsg, needsWindowOrTemplate: needsWindow };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Send failed';
    if (options.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(to, `${text}\n\n${url}`);
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
      noteApiSendInInboxCaches(to, data, {
        body: caption || filename,
        msgType: 'document',
        filename,
        mediaMime: 'application/pdf',
        customerId: options.customerId,
      });
      return {
        ok: true,
        via: 'api',
        messageId: data?.messageId ? String(data.messageId) : null,
      };
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
      noteApiSendInInboxCaches(to, data, {
        body: caption || filename,
        msgType: type === 'image' ? 'image' : 'document',
        filename,
        mediaMime: mimeType,
        customerId: options.customerId,
      });
      return {
        ok: true,
        via: 'api',
        messageId: data?.messageId ? String(data.messageId) : null,
      };
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

export type WhatsAppTemplateButtonUrlParam = {
  /** Button index (0 = first). Pay now on balance-due v4 is index 1 after Call us. */
  index?: number | string;
  text: string;
};

export type SendAdminWhatsAppTemplateOptions = {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  /** Dynamic URL suffix for template URL buttons (e.g. UPI short-link code). */
  buttonUrlParams?: Array<WhatsAppTemplateButtonUrlParam | string>;
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
  /** For IMAGE-header templates — attach JPEG/PNG (e.g. UPI QR) in the same cold send. */
  headerImage?: {
    imageBase64: string;
    filename?: string;
    mimeType?: string;
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
        ...(options.buttonUrlParams?.length
          ? { buttonUrlParams: options.buttonUrlParams }
          : {}),
        ...(options.headerDocument?.pdfBase64
          ? {
              headerDocument: {
                pdfBase64: options.headerDocument.pdfBase64,
                filename: options.headerDocument.filename || 'document.pdf',
              },
            }
          : {}),
        ...(options.headerImage?.imageBase64
          ? {
              headerImage: {
                imageBase64: options.headerImage.imageBase64,
                filename: options.headerImage.filename || 'image.jpg',
                mimeType: options.headerImage.mimeType || 'image/jpeg',
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
      noteApiSendInInboxCaches(to, data, {
        body:
          Array.isArray(options.bodyParams) && options.bodyParams.length
            ? `${templateName}: ${options.bodyParams.map(String).join(' · ')}`
            : templateName,
        msgType: options.headerImage
          ? 'image'
          : options.headerDocument
            ? 'document'
            : 'template',
        filename:
          options.headerImage?.filename || options.headerDocument?.filename || null,
        mediaMime: options.headerImage?.mimeType || null,
        customerId: options.customerId,
        customerName: options.customerName,
        templateName,
      });
      return {
        ok: true,
        via: 'api',
        messageId: data?.messageId ? String(data.messageId) : null,
      };
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
    buttonUrlParams?: Array<WhatsAppTemplateButtonUrlParam | string>;
    headerDocument?: SendAdminWhatsAppTemplateOptions['headerDocument'];
    headerImage?: SendAdminWhatsAppTemplateOptions['headerImage'];
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
      buttonUrlParams: options.coldTemplate?.buttonUrlParams,
      headerDocument: options.coldTemplate?.headerDocument,
      headerImage: options.coldTemplate?.headerImage,
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

let templatesCacheMem: {
  at: number;
  templates: WhatsAppTemplateListItem[];
  recommended?: Array<{ name: string; language: string; hint: string }>;
} | null = null;

export async function fetchApprovedWhatsAppTemplates(opts?: {
  force?: boolean;
}): Promise<{
  ok: boolean;
  templates: WhatsAppTemplateListItem[];
  recommended?: Array<{ name: string; language: string; hint: string }>;
  error?: string;
}> {
  const TTL_MS = 10 * 60 * 1000;
  const now = Date.now();
  if (
    !opts?.force &&
    templatesCacheMem &&
    now - templatesCacheMem.at < TTL_MS
  ) {
    return {
      ok: true,
      templates: templatesCacheMem.templates,
      recommended: templatesCacheMem.recommended,
    };
  }

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
    const templates = Array.isArray(data.templates) ? data.templates : [];
    const recommended = data.recommended;
    templatesCacheMem = { at: now, templates, recommended };
    return {
      ok: true,
      templates,
      recommended,
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
 * Cold PDF outside 24h: DOCUMENT-header Utility with PDF attached (direct send — no Accept).
 * Prefer per-kind svc_doc_*_v3 → svc_doc_direct_* (any label) → v2 → svc_doc_pdf_v2.
 * Custom / generic label uses svc_doc_direct_* immediately.
 */
export async function sendColdDocumentInvite(
  options: SendColdDocumentInviteOptions
): Promise<AdminWhatsAppSendResult> {
  const pdfBase64 = String(options.pdfBase64 || '').trim();
  if (!pdfBase64) {
    return { ok: false, error: 'PDF required for cold document send' };
  }
  const customLabel = String(options.documentLabel || '').trim();
  const useDirect =
    Boolean(customLabel) || coldDocTemplateSlug(options.kind) === 'generic';

  if (useDirect) {
    const meta = resolveDirectDocTemplate(options.brand);
    return sendAdminWhatsAppTemplate({
      to: options.to,
      templateName: meta.name,
      languageCode: meta.language,
      bodyParams: directDocBodyParams(
        options.customerName,
        options.kind,
        options.documentLabel
      ),
      headerDocument: {
        pdfBase64,
        filename: options.filename || 'document.pdf',
      },
      customerId: options.customerId,
      source: options.source || 'documents',
    });
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

/**
 * Display URL for inbox media: IndexedDB blob URL when cached (survives APK reopen),
 * else download once via proxy / signed URL and store on device.
 */
export async function resolveWhatsAppMediaDisplayUrl(opts: {
  mediaUrl?: string | null;
  messageId?: string | null;
  mimeHint?: string | null;
}): Promise<{ ok: boolean; url?: string; error?: string; fromCache?: boolean }> {
  const mediaUrl = String(opts.mediaUrl || '').trim();
  if (!mediaUrl) return { ok: false, error: 'No media' };

  const cacheKey = whatsappMediaCacheKey(mediaUrl, opts.messageId);
  if (cacheKey) {
    const mem = peekCachedMediaObjectUrl(cacheKey);
    if (mem) return { ok: true, url: mem, fromCache: true };
    const disk = await getCachedMediaObjectUrl(cacheKey);
    if (disk) return { ok: true, url: disk, fromCache: true };
  }

  // Public https (non-r2) — cache by URL after first fetch when possible
  const isPrivateRef =
    mediaUrl.startsWith('r2:') ||
    mediaUrl.startsWith('whatsapp-media:') ||
    mediaUrl.startsWith('whatsapp/inbound/') ||
    mediaUrl.startsWith('whatsapp/outbound/') ||
    mediaUrl.startsWith('whatsapp/accept/');

  if (!isPrivateRef && /^https:\/\//i.test(mediaUrl)) {
    if (!cacheKey) return { ok: true, url: mediaUrl };
    try {
      const res = await fetch(mediaUrl);
      if (!res.ok) return { ok: true, url: mediaUrl };
      const blob = await res.blob();
      const url = await putCachedMediaBlob(cacheKey, blob, blob.type || opts.mimeHint || undefined);
      return { ok: true, url, fromCache: false };
    } catch {
      return { ok: true, url: mediaUrl };
    }
  }

  const fetched = await fetchWhatsAppR2MediaBytes({
    mediaUrl,
    messageId: opts.messageId,
  });
  if (!fetched.ok) {
    // Fall back to signed URL (may not persist on device)
    const signed = await fetchWhatsAppR2SignedUrl({
      mediaUrl,
      messageId: opts.messageId,
    });
    if (signed.ok && signed.url) return { ok: true, url: signed.url, fromCache: false };
    return { ok: false, error: fetched.error || signed.error || 'Media failed' };
  }

  if (fetched.bytes && cacheKey) {
    const mime =
      opts.mimeHint ||
      (/\.pdf$/i.test(mediaUrl) ? 'application/pdf' : 'application/octet-stream');
    const blob = new Blob([fetched.bytes], { type: mime });
    const url = await putCachedMediaBlob(cacheKey, blob, mime);
    return { ok: true, url, fromCache: false };
  }

  if (fetched.url && cacheKey) {
    try {
      const res = await fetch(fetched.url);
      if (res.ok) {
        const blob = await res.blob();
        const url = await putCachedMediaBlob(
          cacheKey,
          blob,
          blob.type || opts.mimeHint || undefined
        );
        return { ok: true, url, fromCache: false };
      }
    } catch {
      /* use remote URL */
    }
    return { ok: true, url: fetched.url, fromCache: false };
  }

  if (fetched.url) return { ok: true, url: fetched.url, fromCache: false };
  return { ok: false, error: 'No media bytes' };
}

/** PDF thumbnails / download — prefer device cache, else network + store. */
export async function getWhatsAppMediaBytesCached(opts: {
  mediaUrl?: string | null;
  messageId?: string | null;
  mimeHint?: string | null;
}): Promise<{ ok: boolean; bytes?: ArrayBuffer; url?: string; error?: string; fromCache?: boolean }> {
  const mediaUrl = String(opts.mediaUrl || '').trim();
  if (!mediaUrl) return { ok: false, error: 'No media' };
  const cacheKey = whatsappMediaCacheKey(mediaUrl, opts.messageId);
  if (cacheKey) {
    const hit = await getCachedMediaBytes(cacheKey);
    if (hit) return { ok: true, bytes: hit.bytes, fromCache: true };
  }

  const fetched = await fetchWhatsAppR2MediaBytes({
    mediaUrl,
    messageId: opts.messageId,
  });
  if (!fetched.ok) return { ok: false, error: fetched.error || 'Media failed' };

  if (fetched.bytes && cacheKey) {
    const mime =
      opts.mimeHint ||
      (/\.pdf$/i.test(mediaUrl) ? 'application/pdf' : 'application/octet-stream');
    void putCachedMediaBlob(cacheKey, new Blob([fetched.bytes], { type: mime }), mime);
    return { ok: true, bytes: fetched.bytes, fromCache: false };
  }

  if (fetched.url && cacheKey) {
    try {
      const res = await fetch(fetched.url);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const mime =
          res.headers.get('content-type') ||
          opts.mimeHint ||
          'application/octet-stream';
        void putCachedMediaBlob(cacheKey, new Blob([buf], { type: mime }), mime);
        return { ok: true, bytes: buf, fromCache: false };
      }
    } catch {
      /* fall through */
    }
    return { ok: true, url: fetched.url, fromCache: false };
  }

  if (fetched.bytes) return { ok: true, bytes: fetched.bytes, fromCache: false };
  if (fetched.url) return { ok: true, url: fetched.url, fromCache: false };
  return { ok: false, error: 'No media bytes' };
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
  messageId?: string;
  messageIds?: string[];
  dryRun?: boolean;
  /** When true, delete inbox rows only — photos/PDFs stay on R2 / Cloudinary. */
  keepMedia?: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  deletedRows?: number;
  deletedMedia?: number;
  keptMedia?: number;
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
      keptMedia: data.keptMedia,
      wouldDeleteRows: data.wouldDeleteRows,
      withMedia: data.withMedia,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Purge failed' };
  }
}
