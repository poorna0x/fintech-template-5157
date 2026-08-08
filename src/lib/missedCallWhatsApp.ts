/**
 * Missed-call → customer WhatsApp callback (Cloud API template).
 * Manual from admin banner / Calling; auto from Netlify tech-call-customer-alert.
 */
import { toast } from 'sonner';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import { resolveBookingCta } from '@/lib/whatsappBookingCtaTemplates';
import { sendAdminWhatsAppTemplate } from '@/lib/sendAdminWhatsAppApi';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import type { DocumentBrand } from '@/lib/service-brands';

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
  const cta = resolveBookingCta('missed_call_book', brand, name);

  const result = await sendAdminWhatsAppTemplate({
    to: phone,
    customerId: opts.customerId || undefined,
    templateName: cta.name,
    languageCode: cta.language,
    bodyParams: cta.bodyParams,
    source: 'calling',
  });

  if (!result.ok) {
    // Fallback utility template if CTA not approved yet
    const fallback = await sendAdminWhatsAppTemplate({
      to: phone,
      customerId: opts.customerId || undefined,
      templateName: 'svc_visit_reminder',
      languageCode: 'en',
      bodyParams: [name, 'callback for your missed call'],
      source: 'calling',
    });
    if (!fallback.ok) {
      if (notify) toast.error(result.error || fallback.error || 'WhatsApp send failed');
      return { ok: false, error: result.error || fallback.error };
    }
    if (notify) toast.success('Missed-call callback sent (reminder template)');
    return { ok: true };
  }

  if (notify) toast.success('Missed-call callback WhatsApp sent');
  return { ok: true };
}
