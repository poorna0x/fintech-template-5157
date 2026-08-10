import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import {
  buildCallingWhatsAppMessage,
  callingColdTemplateFor,
  callingContextFromCustomer,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import {
  fetchApprovedWhatsAppTemplates,
  sendAdminWhatsAppText,
  sendAdminWhatsAppTextWithOptionalTemplate,
} from '@/lib/sendAdminWhatsAppApi';
import type { WhatsAppSendSource } from '@/lib/whatsappCrmSettings';
import type { DocumentBrand } from '@/lib/service-brands';

export type CallingDeliveryMode = 'api' | 'wa_me';
export type CallingBulkBrandMode = 'auto' | DocumentBrand;

export type CallingBulkCustomer = {
  id: string;
  fullName?: string | null;
  name?: string | null;
  phone?: string | null;
  daysSinceService?: number | null;
  lastServiceSubType?: string | null;
  brand?: string | null;
  model?: string | null;
};

export function personalizeCallingBulkDraft(
  draft: string,
  customerName: string,
  sampleName?: string
): string {
  const name = (customerName || 'Customer').trim() || 'Customer';
  let text = draft;
  if (text.includes('{name}')) {
    text = text.split('{name}').join(name);
  }
  const sample = (sampleName || '').trim();
  if (sample && sample !== name && text.includes(sample)) {
    text = text.replace(sample, name);
  }
  return text;
}

export async function resolveCallingBulkBrand(
  customerId: string,
  mode: CallingBulkBrandMode
): Promise<DocumentBrand> {
  if (mode === 'hydrogenro' || mode === 'elevenro') return mode;
  try {
    const { sendBrand } = await resolveCustomerSendBrand(customerId);
    return sendBrand;
  } catch {
    return 'hydrogenro';
  }
}

export function buildCallingBulkMessage(opts: {
  customer: CallingBulkCustomer;
  template: CallingWhatsAppTemplate;
  brand: DocumentBrand;
  draftTouched: boolean;
  draftText: string;
  sampleName?: string;
}): string {
  const customerName =
    String(opts.customer.fullName || opts.customer.name || 'Customer').trim() || 'Customer';
  if (opts.draftTouched) {
    return personalizeCallingBulkDraft(opts.draftText, customerName, opts.sampleName).trim();
  }
  return buildCallingWhatsAppMessage(
    callingContextFromCustomer(opts.customer as any),
    opts.template,
    opts.brand
  ).trim();
}

export type CallingSendOneResult =
  | { ok: true; via: 'api' | 'wa_me'; usedTemplate?: boolean }
  | { ok: false; error: string; skipped?: boolean; needsWindowOrTemplate?: boolean };

/** Load APPROVED Meta template names (lowercase) for cold-fallback gating. */
export async function loadApprovedWhatsAppTemplateNameSet(): Promise<Set<string>> {
  try {
    const res = await fetchApprovedWhatsAppTemplates();
    if (!res.ok) return new Set();
    return new Set(
      (res.templates || [])
        .map((t) => String(t.name || '').trim().toLowerCase())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/** Send one customizable WhatsApp (API or wa.me). Does not record call history. */
export async function sendCallingWhatsAppOne(opts: {
  customer: CallingBulkCustomer;
  message: string;
  template: CallingWhatsAppTemplate;
  brand: DocumentBrand;
  deliveryMode: CallingDeliveryMode;
  /** Override phone (digits). Defaults to customer.phone */
  toPhone?: string;
  source?: WhatsAppSendSource;
  /** Cold template {{2}} for service_due / visit reminder */
  serviceWhenLabel?: string;
  /** When set (even empty), only attempt cold template if name is in the APPROVED set. Omit to always try cold + server fallback. */
  approvedTemplateNames?: Set<string>;
}): Promise<CallingSendOneResult> {
  const phone = String(opts.toPhone || opts.customer.phone || '').trim();
  const to = formatPhoneForWhatsApp(phone);
  if (!to || to.length < 10) {
    return { ok: false, error: 'No phone', skipped: true };
  }
  const message = opts.message.trim();
  if (!message) {
    return { ok: false, error: 'Empty message', skipped: true };
  }

  const customerName =
    String(opts.customer.fullName || opts.customer.name || 'Customer').trim() || 'Customer';

  const source = opts.source || 'calling';

  if (opts.deliveryMode === 'wa_me') {
    const result = await sendAdminWhatsAppText({
      to,
      text: message,
      customerId: opts.customer.id,
      source,
      forceWaMe: true,
      fallbackWaMe: false,
    });
    if (!result.ok) return { ok: false, error: result.error || 'Could not open WhatsApp' };
    return { ok: true, via: 'wa_me' };
  }

  const cold = callingColdTemplateFor(
    opts.template,
    customerName,
    message,
    opts.brand,
    opts.serviceWhenLabel
  );
  const coldName = String(cold?.name || '').trim();
  const approved = opts.approvedTemplateNames;
  const coldApproved =
    Boolean(coldName) &&
    (approved == null || approved.size === 0 || approved.has(coldName.toLowerCase()));

  const result = await sendAdminWhatsAppTextWithOptionalTemplate({
    to,
    text: message,
    customerId: opts.customer.id,
    source,
    fallbackWaMe: false,
    coldTemplate: coldApproved
      ? {
          name: coldName,
          languageCode: cold.languageCode,
          bodyParams: cold.bodyParams,
        }
      : null,
  });

  if (!result.ok || result.via !== 'api') {
    if (result.needsWindowOrTemplate || approved != null) {
      const hint = coldName
        ? coldApproved
          ? result.error ||
            `24h window closed — template "${coldName}" failed (not approved yet?)`
          : `24h window closed — "${coldName}" is not APPROVED in Meta yet. Customer must message first, or approve that template.`
        : result.error ||
          '24h window closed — no cold template. Customer must message first.';
      return {
        ok: false,
        error: hint,
        needsWindowOrTemplate: true,
      };
    }
    return {
      ok: false,
      error: result.error || 'WhatsApp API send failed',
      needsWindowOrTemplate: result.needsWindowOrTemplate,
    };
  }

  return {
    ok: true,
    via: 'api',
    usedTemplate: result.usedTemplate,
  };
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
