import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type WhatsAppBookingQuickAction =
  | 'book_service'
  | 'request_location'
  | 'request_photo';

export type WhatsAppBookingStartResult = {
  ok: boolean;
  via?: 'interactive' | 'template';
  windowOpen?: boolean;
  action?: WhatsAppBookingQuickAction;
  templateName?: string;
  usedTemplate?: boolean;
  error?: string;
  needsWindowOrTemplate?: boolean;
  featureDisabled?: boolean;
};

export async function startWhatsAppBookingQuickAction(opts: {
  phone: string;
  action: WhatsAppBookingQuickAction;
  customerId?: string | null;
  customerName?: string | null;
  brand?: 'hydrogenro' | 'elevenro' | null;
}): Promise<WhatsAppBookingStartResult> {
  const phone = String(opts.phone || '').trim();
  const action = opts.action;
  if (!phone) return { ok: false, error: 'Phone required' };
  if (!action) return { ok: false, error: 'Action required' };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };

  try {
    const res = await fetch('/.netlify/functions/whatsapp-booking-start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        phone,
        action,
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
        ...(opts.customerName ? { customerName: opts.customerName } : {}),
        ...(opts.brand ? { brand: opts.brand } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      return {
        ok: true,
        via: data.via === 'template' ? 'template' : 'interactive',
        windowOpen: data.windowOpen === true,
        action,
        templateName: data.templateName || undefined,
        usedTemplate: data.usedTemplate === true,
      };
    }
    return {
      ok: false,
      error: String(data?.error || `HTTP ${res.status}`),
      needsWindowOrTemplate: data?.needsWindowOrTemplate === true,
      featureDisabled: String(data?.code || '') === 'WHATSAPP_FEATURE_DISABLED',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Request failed',
    };
  }
}
