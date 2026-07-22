/**
 * Admin oversight: when a technician search returns any matches, ping every
 * admin device with the query they typed. Fire-and-forget — technician sees
 * nothing. Deduped per query for a few minutes so re-running the same search
 * doesn't spam.
 */
import { supabase } from '@/lib/supabase';

const DEDUP_WINDOW_MS = 5 * 60_000;
const recentlyNotified = new Map<string, number>();

export function notifyAdminsTechnicianSearch(
  query: string,
  resultCount: number
): void {
  const q = (query || '').trim();
  if (!q || resultCount < 1) return;

  const now = Date.now();
  const dedupeKey = q.toLowerCase();
  const last = recentlyNotified.get(dedupeKey);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  recentlyNotified.set(dedupeKey, now);
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
        body: JSON.stringify({ query: q, resultCount }),
        keepalive: true,
      });
    } catch {
      /* silent — oversight ping is best-effort */
    }
  })();
}
