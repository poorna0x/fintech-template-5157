/**
 * Technician app: read the last incoming call captured natively by
 * CallAlertReceiver so the customer search dialog can offer "did this
 * customer just call you?", and so we can JWT-notify admins on resume
 * when the native FCM POST failed.
 * No-op in the browser and in APKs without the RecentCall plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';

type RecentCallPlugin = {
  /** One-shot: marks call consumed (search prompt). */
  consumeRecentCall(): Promise<{ number?: string; at?: number }>;
  /** Read without consuming — for admin notify on app resume. */
  peekRecentCall(): Promise<{ number?: string; at?: number }>;
};

const RecentCall = registerPlugin<RecentCallPlugin>('RecentCall');

const FRESH_CALL_MAX_AGE_MS = 5 * 60_000;

function isAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('RecentCall');
}

function normalizeFresh(
  number: string | undefined,
  at: number | undefined
): string | null {
  if (!number || !at) return null;
  if (Date.now() - at > FRESH_CALL_MAX_AGE_MS) return null;
  const digits = normalizePhoneForSearch(number);
  return digits.length >= 7 ? digits : null;
}

/** Normalized caller number if the phone rang < 5 minutes ago, else null. Consumes. */
export async function consumeRecentTechnicianCallerNumber(): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    const { number, at } = await RecentCall.consumeRecentCall();
    return normalizeFresh(number, at);
  } catch {
    return null;
  }
}

/** Same as consume, but does not mark the call used (resume notify path). */
export async function peekRecentTechnicianCallerNumber(): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    // Older APKs only have consume — fall back so notify still works once.
    if (typeof (RecentCall as RecentCallPlugin).peekRecentCall !== 'function') {
      return consumeRecentTechnicianCallerNumber();
    }
    const { number, at } = await RecentCall.peekRecentCall();
    return normalizeFresh(number, at);
  } catch {
    return null;
  }
}

/**
 * If a customer just rang this phone, notify admins via JWT (same path as
 * search alerts). Safe to call on resume / search open — deduped server+client.
 */
export function reportRecentTechnicianCallToAdmins(): void {
  void peekRecentTechnicianCallerNumber().then((digits) => {
    if (digits) notifyAdminsTechnicianCall(digits);
  });
}
