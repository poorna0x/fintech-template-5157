/**
 * Missed-call → customer WhatsApp callback (Cloud API UTILITY template).
 * Manual from admin banner / Calling; auto from Netlify tech-call-customer-alert.
 */
import { toast } from 'sonner';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import type { DocumentBrand } from '@/lib/service-brands';
import { supabase } from '@/lib/supabaseClient';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import { openWhatsAppMeDeepLink } from '@/lib/sendAdminWhatsAppApi';
import {
  buildMissedCallWhatsAppMessage,
  formatLastServiceDateLabel,
  resolveColdMissedCall,
  sendUtilityWhatsAppWithColdFallback,
} from '@/lib/whatsappUtilityTemplates';

async function loadMissedCallFacts(
  customerId?: string | null,
  brandHint?: DocumentBrand
): Promise<{ brand: DocumentBrand; lastServiceDate: string }> {
  const fallback: DocumentBrand = 'elevenro';
  if (!customerId) {
    return { brand: brandHint || fallback, lastServiceDate: formatLastServiceDateLabel(null) };
  }
  let brand = brandHint || fallback;
  try {
    const resolved = await resolveCustomerSendBrand(customerId, fallback);
    brand = resolved.sendBrand || fallback;
  } catch {
    /* keep fallback */
  }
  try {
    const { data } = await supabase
      .from('customers')
      .select('last_service_date')
      .eq('id', customerId)
      .maybeSingle();
    return {
      brand,
      lastServiceDate: formatLastServiceDateLabel(
        (data as { last_service_date?: string | null } | null)?.last_service_date
      ),
    };
  } catch {
    return { brand, lastServiceDate: formatLastServiceDateLabel(null) };
  }
}

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

  const facts = await loadMissedCallFacts(opts.customerId, opts.brand);
  const name = String(opts.customerName || '').trim() || 'there';
  const text = buildMissedCallWhatsAppMessage(name, facts.brand, facts.lastServiceDate);
  const cold = resolveColdMissedCall(name, facts.brand, facts.lastServiceDate);

  const { settings } = await fetchWhatsAppCrmSettings();
  if (!opts.force) {
    if (settings.enabled === false) {
      openWhatsAppMeDeepLink(phone, text);
      if (notify) toast.success('Opened phone WhatsApp (Cloud API is off)');
      return { ok: true };
    }
    if (settings.allow_calling === false) {
      if (notify) toast.error('Calling WhatsApp is off in Settings');
      return { ok: false, error: 'calling_off' };
    }
  }

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
