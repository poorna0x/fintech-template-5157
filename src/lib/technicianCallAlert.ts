/**
 * Admin oversight: when a technician's phone just rang a known customer,
 * ping admin devices. Uses the technician session JWT — same trust path as
 * search alerts — so it still works when native FCM-token auth fails.
 *
 * Dedupes by callId (CallLog DATE) so native hangup POST + JS peek for the
 * *same* call never double-send. A new call (new CallLog DATE) notifies again.
 */
import { supabase } from '@/lib/supabase';
import { normalizePhoneForSearch } from '@/lib/utils';

const recentlyNotified = new Map<string, number>();

export function notifyAdminsTechnicianCall(
  phone: string,
  opts?: { callId?: string; callAt?: number; missed?: boolean }
): void {
  const digits = normalizePhoneForSearch(phone);
  if (digits.length < 10) return;

  const callAt =
    typeof opts?.callAt === 'number' && opts.callAt > 1_000_000_000_000
      ? Math.floor(opts.callAt)
      : 0;
  // Require a CallLog-stable id — never invent js:bucket (races native → multi-push).
  const callId =
    (opts?.callId && String(opts.callId).trim()) ||
    (callAt > 0 ? `${digits}:${callAt}` : '');
  if (!callId) return;

  const now = Date.now();
  const last = recentlyNotified.get(callId);
  if (last && now - last < 60_000) return;
  // Same customer within 45s (covers callId mismatch before server dedupe).
  const phoneKey = `phone:${digits}`;
  const lastPhone = recentlyNotified.get(phoneKey);
  if (lastPhone && now - lastPhone < 45_000) return;
  recentlyNotified.set(callId, now);
  recentlyNotified.set(phoneKey, now);
  if (recentlyNotified.size > 80) {
    for (const [k, t] of recentlyNotified) {
      if (now - t > 60_000) recentlyNotified.delete(k);
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
        body: JSON.stringify({
          number: digits,
          callId,
          callAt: callAt || undefined,
          missed: opts?.missed === true,
        }),
        keepalive: true,
      });
    } catch {
      /* silent — oversight ping is best-effort */
    }
  })();
}
