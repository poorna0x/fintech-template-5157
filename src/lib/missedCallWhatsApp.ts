/**
 * Missed-call → customer WhatsApp callback (Cloud API UTILITY template).
 * Manual from admin banner / Calling; auto from Netlify tech-call-customer-alert.
 */
import { toast } from 'sonner';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import type { DocumentBrand } from '@/lib/service-brands';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import {
  buildMissedCallWhatsAppMessage,
  resolveColdMissedCall,
  sendUtilityWhatsAppWithColdFallback,
} from '@/lib/whatsappUtilityTemplates';

export async function sendMissedCallCallbackWhatsApp(opts: {
  phone: string;
  customerId?: string | null;
  customerName?: string | null;
  brand?: DocumentBrand;
  /** Skip allow_calling check (not recommended). */
  force?: boolean;
  notify?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const notify = opts.notify !== false;
  const phone = formatPhoneForWhatsApp(opts.phone);
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    if (notify) toast.error('Invalid phone for WhatsApp');
    return { ok: false, error: 'Invalid phone' };
  }

  const { settings } = await fetchWhatsAppCrmSettings();
  if (!opts.force) {
    if (settings.enabled === false) {
      if (notify) toast.error('WhatsApp Cloud API is disabled in Settings');
      return { ok: false, error: 'disabled' };
    }
    if (settings.allow_calling === false) {
      if (notify) toast.error('Calling WhatsApp is off in Settings');
      return { ok: false, error: 'calling_off' };
    }
  }

  let brand: DocumentBrand = opts.brand || 'hydrogenro';
  if (opts.customerId) {
    try {
      const resolved = await resolveCustomerSendBrand(opts.customerId, brand);
      brand = resolved.sendBrand || brand;
    } catch {
      /* keep brand */
    }
  }

  const name = String(opts.customerName || '').trim() || 'there';
  const text = buildMissedCallWhatsAppMessage(name, brand);
  const cold = resolveColdMissedCall(name);

  const result = await sendUtilityWhatsAppWithColdFallback({
    to: phone,
    text,
    customerId: opts.customerId || undefined,
    source: 'calling',
    coldTemplate: cold,
    fallbackWaMe: true,
  });

  if (!result.ok) {
    if (notify) toast.error(result.error || 'WhatsApp send failed');
    return { ok: false, error: result.error };
  }

  if (notify) {
    toast.success(
      result.usedTemplate ? 'Missed-call callback WhatsApp sent' : 'Missed-call message opened in WhatsApp'
    );
  }
  return { ok: true };
}
