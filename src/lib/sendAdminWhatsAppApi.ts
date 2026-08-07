/**
 * Admin Cloud API WhatsApp send — shared by inbox, composer, Calling, pending payments.
 * Falls back to wa.me when the 24h customer-service window is closed (or on request).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { coldDocBodyParams, coldDocTemplateForKind } from '@/lib/whatsappColdTemplates';

export type AdminWhatsAppSendVia = 'api' | 'wa_me';

export type AdminWhatsAppSendResult = {
  ok: boolean;
  via?: AdminWhatsAppSendVia;
  error?: string;
  /** True when API failed because Meta requires an open session / template. */
  needsWindowOrTemplate?: boolean;
};

const WINDOW_ERROR_RE =
  /24\s*hour|customer care window|session|re-?engage|template|131047|131026|outside/i;

function isWindowOrTemplateError(message: string): boolean {
  return WINDOW_ERROR_RE.test(message);
}

export function openWhatsAppMeDeepLink(phone: string, message: string): void {
  const url = `https://wa.me/${formatPhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export type SendAdminWhatsAppTextOptions = {
  to: string;
  text: string;
  customerId?: string | null;
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
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }

    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
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
        ...(caption ? { caption } : {}),
        ...(options.customerId ? { customerId: options.customerId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
    return {
      ok: false,
      error: errMsg,
      needsWindowOrTemplate: isWindowOrTemplateError(errMsg),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Send failed' };
  }
}

export type SendAdminWhatsAppTemplateOptions = {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  customerId?: string | null;
};

export async function sendAdminWhatsAppTemplate(
  options: SendAdminWhatsAppTemplateOptions
): Promise<AdminWhatsAppSendResult> {
  const to = String(options.to || '').trim();
  const templateName = String(options.templateName || '').trim();
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
        ...(options.customerId ? { customerId: options.customerId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, via: 'api' };
    }
    const errMsg = String(data?.error || data?.meta?.error?.message || `HTTP ${res.status}`);
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

  if (textResult.needsWindowOrTemplate && options.coldTemplate?.name) {
    const tpl = await sendAdminWhatsAppTemplate({
      to: options.to,
      templateName: options.coldTemplate.name,
      languageCode: options.coldTemplate.languageCode || 'en',
      bodyParams: options.coldTemplate.bodyParams || [],
      customerId: options.customerId,
    });
    if (tpl.ok) {
      return { ...tpl, usedTemplate: true };
    }
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
  amount?: number | string;
  ref?: string;
  documentLabel?: string;
};

/**
 * Cold outreach when PDF can't send outside 24h: invite customer to reply,
 * then staff can resend the PDF in-window.
 */
export async function sendColdDocumentInvite(
  options: SendColdDocumentInviteOptions
): Promise<AdminWhatsAppSendResult> {
  const meta = coldDocTemplateForKind(options.kind);
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
    customerId: options.customerId,
  });
}
