// Public client for the /warranty page. POSTs to the Netlify function (service-role
// read) rather than calling Supabase directly, so the public page never ships the
// admin data layer or anon-key table access. OTP/captcha are skipped for now.
import type { PublicWarrantyLookupResult } from '@/lib/warranty';

export interface WarrantyLookupResponse extends PublicWarrantyLookupResult {
  error?: string;
}

export async function lookupWarrantiesByPhone(phone: string): Promise<WarrantyLookupResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('/.netlify/functions/warranty-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: controller.signal,
    });
    const jsonBody = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
    if (!res.ok) {
      if (res.status === 404) {
        return {
          found: false,
          error:
            'Warranty lookup is not running. Restart the dev server (npm run dev) or redeploy, then try again.',
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
