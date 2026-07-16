export interface BookingAltchaContext {
  altchaLoginToken: string;
  altchaPayload?: string;
}

export interface BookingCustomerLookupOptions extends BookingAltchaContext {
  lat?: number;
  lng?: number;
}

/** Minimal row returned for existing-customer booking flow (no PII enumeration). */
export interface BookingCustomerLookupResult {
  id: string;
  keepPreviousLocation?: boolean;
}

async function bookingFetch(
  path: string,
  body: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string } | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`/.netlify/functions/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        data: null,
        error: { message: json.error || json.message || `HTTP ${res.status}` },
      };
    }

    return { data: json.data ?? json, error: null };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === 'AbortError'
        ? 'Request timed out — check your connection'
        : e instanceof Error
          ? e.message
          : 'Request failed';
    return { data: null, error: { message: msg } };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Public /book — ALTCHA-gated proxy; never calls Supabase RPC with anon key. */
export async function getBookingCustomerByPhone(
  phone: string,
  options: BookingCustomerLookupOptions
) {
  const res = await bookingFetch('booking-customer-lookup', {
    phone,
    altchaLoginToken: options.altchaLoginToken,
    altchaPayload: options.altchaPayload,
    lat: options.lat,
    lng: options.lng,
  });

  if (res.error) return { data: null, error: res.error };

  const payload = res.data as { found?: boolean; id?: string; keepPreviousLocation?: boolean } | null;
  if (!payload?.found) {
    return { data: null, error: null };
  }

  const row: BookingCustomerLookupResult = {
    id: payload.id as string,
    keepPreviousLocation: payload.keepPreviousLocation === true,
  };
  return { data: row, error: null };
}

export async function createBookingCustomer(
  row: Record<string, unknown>,
  ctx: BookingAltchaContext
) {
  return bookingFetch('booking-customer-mutate', {
    action: 'create',
    phone: row.phone,
    row,
    altchaLoginToken: ctx.altchaLoginToken,
    altchaPayload: ctx.altchaPayload,
  });
}

export async function updateBookingCustomer(
  customerId: string,
  phone: string,
  updates: Record<string, unknown>,
  ctx: BookingAltchaContext
) {
  return bookingFetch('booking-customer-mutate', {
    action: 'update',
    phone,
    customerId,
    updates,
    altchaLoginToken: ctx.altchaLoginToken,
    altchaPayload: ctx.altchaPayload,
  });
}
