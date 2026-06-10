// Public client for the /warranty page. POSTs to the Netlify function (service-role
// read) rather than calling Supabase directly, so the public page never ships the
// admin data layer or anon-key table access.
//
// Security tokens are carried through to the server, which is the layer that actually
// enforces them: an ALTCHA proof-of-work login token (anti-bot) and, when OTP is
// enforced, a Firebase phone token bound to the looked-up number (anti-PII-harvest).
import type { PublicWarrantyLookupResult } from '@/lib/warranty';

export interface WarrantyLookupResponse extends PublicWarrantyLookupResult {
  error?: string;
  /** Server signalled that a (matching) phone OTP is required. */
  otpRequired?: boolean;
}

export interface WarrantyLookupOptions {
  altchaLoginToken?: string;
  altchaPayload?: string;
  /** Firebase ID token from a verified OTP for this exact phone. */
  phoneToken?: string;
}

/**
 * Fire-and-forget warmup so the real verify + lookup hits a warm Netlify container
 * with firebase-admin already initialized (kills cold-start latency on the OTP path).
 * Exposes nothing and does no DB work server-side. Safe to call repeatedly.
 */
export function warmWarrantyLookup(): void {
  try {
    void fetch('/.netlify/functions/warranty-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warmup: true }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export async function lookupWarrantiesByPhone(
  phone: string,
  opts: WarrantyLookupOptions = {}
): Promise<WarrantyLookupResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('/.netlify/functions/warranty-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        altchaLoginToken: opts.altchaLoginToken,
        altchaPayload: opts.altchaPayload,
        phoneToken: opts.phoneToken,
      }),
      signal: controller.signal,
    });
    const jsonBody = (await res.json().catch(() => ({}))) as {
      error?: string;
      otpRequired?: boolean;
    };
    if (!res.ok) {
      if (res.status === 404) {
        return {
          found: false,
          error:
            'Warranty lookup is not running. Restart the dev server (npm run dev) or redeploy, then try again.',
        };
      }
      if (res.status === 403) {
        return {
          found: false,
          otpRequired: jsonBody?.otpRequired === true,
          error: jsonBody?.error || 'Security verification required. Please try again.',
        };
      }
      if (res.status === 429) {
        return {
          found: false,
          error: jsonBody?.error || 'Too many attempts. Please wait a moment and try again.',
        };
      }
      return { found: false, error: jsonBody?.error || 'Lookup failed. Please try again.' };
    }
    return jsonBody as WarrantyLookupResponse;
  } catch (e: unknown) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return {
      found: false,
      error: aborted ? 'Request timed out. Please try again.' : 'Network error. Please try again.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
