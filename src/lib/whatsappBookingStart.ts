import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type WhatsAppBookingQuickAction =
  | 'book_service'
  | 'request_location'
  | 'request_photo'
  | 'request_building_flat'
  | 'request_name'
  | 'water_filter_service'
  | 'book_location_photo';

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

/** Same options as Edit Job lead source. */
export const WHATSAPP_BOOKING_LEAD_SOURCES = [
  'Website',
  'Direct call',
  'Google-Leads',
  'RO care india',
  'Home Triangle',
  'Home Triangle-Srujan',
  'Home Triangle-3',
  'Local Ramu',
  'Other',
] as const;

export async function startWhatsAppBookingQuickAction(opts: {
  phone: string;
  action: WhatsAppBookingQuickAction;
  customerId?: string | null;
  customerName?: string | null;
  brand?: 'hydrogenro' | 'elevenro' | null;
  leadSource?: string | null;
  /** Optional line shown as “From *…* — Water Filter Service”. Empty = skip. */
  whatsappLeadLine?: string | null;
  serviceSubType?: string | null;
  serviceLabel?: string | null;
  leadCost?: number | null;
  requireOtp?: boolean | null;
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
        ...(opts.leadSource ? { leadSource: opts.leadSource } : {}),
        ...(opts.whatsappLeadLine != null
          ? { whatsappLeadLine: String(opts.whatsappLeadLine).trim().slice(0, 80) }
          : {}),
        ...(opts.serviceSubType ? { serviceSubType: opts.serviceSubType } : {}),
        ...(opts.serviceLabel ? { serviceLabel: opts.serviceLabel } : {}),
        ...(opts.leadCost != null && Number.isFinite(Number(opts.leadCost))
          ? { leadCost: Number(opts.leadCost) }
          : {}),
        ...(opts.requireOtp != null ? { requireOtp: Boolean(opts.requireOtp) } : {}),
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

/** Start Water Filter Service: location first, then date → time → photo. */
export async function startWaterFilterServiceBooking(opts: {
  phone: string;
  customerName: string;
  leadSource: string;
  /** Empty / omit = skip “From …” line on WhatsApp. */
  whatsappLeadLine?: string | null;
  brand?: 'hydrogenro' | 'elevenro' | null;
  customerId?: string | null;
  serviceSubType?: string | null;
  serviceLabel?: string | null;
  leadCost?: number | null;
  requireOtp?: boolean | null;
}): Promise<WhatsAppBookingStartResult> {
  return startWhatsAppBookingQuickAction({
    phone: opts.phone,
    action: 'water_filter_service',
    customerId: opts.customerId,
    customerName: opts.customerName,
    leadSource: opts.leadSource,
    whatsappLeadLine: opts.whatsappLeadLine ?? '',
    brand: opts.brand,
    serviceSubType: opts.serviceSubType,
    serviceLabel: opts.serviceLabel,
    leadCost: opts.leadCost,
    requireOtp: opts.requireOtp,
  });
}

/** Tools → Quick customer: ask location first; CRM customer created only after full booking confirm. */
export async function startQuickCustomerCreateBooking(opts: {
  phone: string;
  customerName: string;
  leadSource: string;
  whatsappLeadLine?: string | null;
  serviceSubType: string;
  serviceLabel: string;
  leadCost: number;
  requireOtp: boolean;
  brand?: 'hydrogenro' | 'elevenro' | null;
  customerId?: string | null;
}): Promise<WhatsAppBookingStartResult> {
  return startWaterFilterServiceBooking(opts);
}
