/**
 * Admin oversight: when a technician's phone just rang a known customer,
 * ping admin devices. Uses the technician session JWT — same trust path as
 * search alerts — so it still works when native FCM-token auth fails.
 *
 * Deduped per phone for a few minutes (native ring POST + JS resume may both fire).
 */
import { supabase } from '@/lib/supabase';
import { normalizePhoneForSearch } from '@/lib/utils';

const DEDUP_WINDOW_MS = 5 * 60_000;
const recentlyNotified = new Map<string, number>();

export function notifyAdminsTechnicianCall(phone: string): void {
  const digits = normalizePhoneForSearch(phone);
  if (digits.length < 10) return;

  const now = Date.now();
  const last = recentlyNotified.get(digits);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  recentlyNotified.set(digits, now);
  if (recentlyNotified.size > 100) {
    for (const [k, t] of recentlyNotified) {
      if (now - t > DEDUP_WINDOW_MS) recentlyNotified.delete(k);
    }
  }

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fetch('/.netlify/functions/tech-call-customer-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ number: digits }),
        keepalive: true,
      });
    } catch {
      /* silent — oversight ping is best-effort */
    }
  })();
}
