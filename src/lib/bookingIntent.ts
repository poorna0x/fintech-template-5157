import type { BookingAltchaContext } from '@/lib/bookingCustomer';

export interface WebsiteBookingIntentRow {
  full_name: string;
  phone: string;
  phone_normalized: string;
  current_step: number;
  site_key: 'hydrogenro' | 'elevenro';
}

async function bookingIntentFetch(
  body: Record<string, unknown>,
  opts?: { keepalive?: boolean }
): Promise<{ error: { message: string } | null }> {
  try {
    const res = await fetch('/.netlify/functions/booking-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // keepalive lets the request complete even if the tab is closing/navigating
      // away — critical for capturing the lead the moment they bail.
      keepalive: opts?.keepalive === true,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: { message: json.error || json.message || `HTTP ${res.status}` } };
    }
    return { error: null };
  } catch (e) {
    return {
      error: { message: e instanceof Error ? e.message : 'Request failed' },
    };
  }
}

/** Public /book — ALTCHA-gated; never calls Supabase RPC with anon key. */
export async function pushWebsiteBookingIntent(
  row: WebsiteBookingIntentRow,
  ctx: BookingAltchaContext,
  opts?: { keepalive?: boolean }
) {
  return bookingIntentFetch(
    {
      action: 'upsert',
      full_name: row.full_name,
      phone: row.phone,
      phone_normalized: row.phone_normalized,
      current_step: row.current_step,
      site_key: row.site_key,
      altchaLoginToken: ctx.altchaLoginToken,
      altchaPayload: ctx.altchaPayload,
    },
    opts
  );
}

export async function markWebsiteBookingIntentBooked(
  row: {
    phone_normalized: string;
    site_key: 'hydrogenro' | 'elevenro';
    job_number: string;
    phone?: string;
  },
  ctx: BookingAltchaContext
) {
  return bookingIntentFetch({
    action: 'mark-booked',
    phone: row.phone || row.phone_normalized,
    phone_normalized: row.phone_normalized,
    site_key: row.site_key,
    job_number: row.job_number,
    altchaLoginToken: ctx.altchaLoginToken,
    altchaPayload: ctx.altchaPayload,
  });
}
