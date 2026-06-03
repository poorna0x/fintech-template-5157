import type { BookingAltchaContext } from '@/lib/bookingCustomer';

/** Public /book flow — ALTCHA-gated proxy (no direct jobs RPC for anon). */
export async function createBookingJob(
  phone: string,
  row: Record<string, unknown>,
  ctx: BookingAltchaContext,
  options?: { consumeToken?: boolean; phoneToken?: string }
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('/.netlify/functions/booking-job-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        row,
        altchaLoginToken: ctx.altchaLoginToken,
        altchaPayload: ctx.altchaPayload,
        consumeToken: options?.consumeToken !== false,
        // Firebase ID token from Phone Auth; verified server-side when OTP is enforced.
        phoneToken: options?.phoneToken,
      }),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        data: null,
        error: { message: json.error || json.message || `HTTP ${res.status}` },
      };
    }

    return { data: json.data ?? null, error: null };
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
