/**
 * Admin oversight: tell all admin devices when a technician opens a customer
 * from the in-app search. Fire-and-forget — never blocks or surfaces errors to
 * the technician (they must not know this happens). Deduped per customer for a
 * few minutes so re-opening the same profile doesn't re-notify.
 */
import { supabase } from '@/lib/supabase';

const DEDUP_WINDOW_MS = 5 * 60_000;
const recentlyNotified = new Map<string, number>();

export function notifyAdminsTechnicianCustomerLookup(customerId: string): void {
  const id = (customerId || '').trim();
  if (!id) return;

  const now = Date.now();
  const last = recentlyNotified.get(id);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  recentlyNotified.set(id, now);
  // Keep the map small.
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
      await fetch('/.netlify/functions/tech-search-customer-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId: id }),
        keepalive: true,
      });
    } catch {
      /* silent — oversight ping is best-effort */
    }
  })();
}
