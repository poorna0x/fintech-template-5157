import { format } from 'date-fns';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import {
  buildAmcExpiryWhatsAppMessage,
  resolveColdAmcExpiry,
  sendUtilityWhatsAppWithColdFallback,
} from '@/lib/whatsappUtilityTemplates';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';

export type AmcExpiryWhatsAppResult = {
  ok: boolean;
  usedTemplate?: boolean;
  error?: string;
};

function formatAmcEndDate(endDate: string): string {
  const raw = String(endDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || 'soon';
  try {
    const [y, m, d] = raw.split('-').map(Number);
    return format(new Date(y, m - 1, d), 'd MMM yyyy');
  } catch {
    return raw;
  }
}

export async function sendAmcExpiryWhatsApp(opts: {
  phone: string;
  customerName: string;
  endDate: string;
  customerId?: string | null;
  brand?: DocumentBrand | string | null;
}): Promise<AmcExpiryWhatsAppResult> {
  const phone = formatPhoneForWhatsApp(opts.phone);
  if (!phone) return { ok: false, error: 'Phone required' };

  const settings = await fetchWhatsAppCrmSettings();
  if (!settings.enabled || !settings.allow_calling) {
    return { ok: false, error: 'WhatsApp calling/outreach is disabled in Settings' };
  }

  let brand: DocumentBrand = normalizeDocumentBrand(opts.brand) || 'hydrogenro';
  if (opts.customerId) {
    const resolved = await resolveCustomerSendBrand(opts.customerId, brand);
    brand = resolved.sendBrand;
  }
  const endLabel = formatAmcEndDate(opts.endDate);
  const text = buildAmcExpiryWhatsAppMessage(opts.customerName, endLabel, brand);
  const cold = resolveColdAmcExpiry(opts.customerName, endLabel);

  const result = await sendUtilityWhatsAppWithColdFallback({
    to: phone,
    text,
    customerId: opts.customerId,
    source: 'calling',
    coldTemplate: cold,
    fallbackWaMe: true,
  });

  return {
    ok: result.ok,
    usedTemplate: result.usedTemplate,
    error: result.error,
  };
}
