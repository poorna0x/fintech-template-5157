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

/** Full saved details — only returned by the server after Firebase phone-OTP
 *  verification proves the caller owns the number (see booking-customer-lookup). */
export interface BookingCustomerDetails {
  fullName: string;
  email: string;
  serviceType: 'RO' | 'SOFTENER' | string;
  brand: string;
  model: string;
  lastServiceDate: string | null;
  address: { street: string; area: string; city: string };
  location: {
    latitude: number | null;
    longitude: number | null;
    formattedAddress: string;
    googleLocation: string | null;
  };
  preferredTimeSlot: string | null;
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

/**
 * Fetch the customer's saved details after phone-OTP verification.
 * `phoneToken` is the Firebase ID token from verifyBookingOtp — the server
 * verifies it matches the phone before revealing any PII.
 */
export async function getBookingCustomerDetails(
  phone: string,
  options: BookingAltchaContext & { phoneToken: string }
): Promise<{ data: BookingCustomerDetails | null; error: { message: string } | null }> {
  const res = await bookingFetch('booking-customer-lookup', {
    phone,
    altchaLoginToken: options.altchaLoginToken,
    altchaPayload: options.altchaPayload,
    wantDetails: true,
    phoneToken: options.phoneToken,
  });

  if (res.error) return { data: null, error: res.error };

  const payload = res.data as { found?: boolean; details?: BookingCustomerDetails } | null;
  if (!payload?.found || !payload.details) {
    return { data: null, error: null };
  }
  return { data: payload.details, error: null };
}

/** Fire-and-forget warmup so the OTP-details path hits a warm function. */
export function warmBookingCustomerLookup(): void {
  try {
    void fetch('/.netlify/functions/booking-customer-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warmup: true }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
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
