import { supabase } from '@/lib/supabase';

export interface BookingCustomerLookupOptions {
  altchaLoginToken: string;
  altchaPayload?: string;
  lat?: number;
  lng?: number;
}

/** Minimal row returned for existing-customer booking flow (no PII enumeration). */
export interface BookingCustomerLookupResult {
  id: string;
  keepPreviousLocation?: boolean;
}

/** Public /book — ALTCHA-gated proxy; never calls Supabase RPC with anon key. */
export async function getBookingCustomerByPhone(
  phone: string,
  options: BookingCustomerLookupOptions
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch('/.netlify/functions/booking-customer-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        altchaLoginToken: options.altchaLoginToken,
        altchaPayload: options.altchaPayload,
        lat: options.lat,
        lng: options.lng,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        data: null,
        error: { message: data.error || data.message || `HTTP ${res.status}` },
      };
    }

    if (!data.found) {
      return { data: null, error: null };
    }

    const row: BookingCustomerLookupResult = {
      id: data.id,
      keepPreviousLocation: data.keepPreviousLocation === true,
    };
    return { data: row, error: null };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'AbortError'
        ? 'Request timed out — check your connection'
        : e instanceof Error
          ? e.message
          : 'Lookup failed';
    return { data: null, error: { message: msg } };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createBookingCustomer(row: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('create_customer_for_booking', {
    p_row: row,
  });
  return { data: data ?? null, error };
}

export async function updateBookingCustomer(
  customerId: string,
  phone: string,
  updates: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('update_customer_for_booking', {
    p_customer_id: customerId,
    p_phone: phone,
    p_updates: updates,
  });
  return { data: data ?? null, error };
}
