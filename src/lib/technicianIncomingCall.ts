/**
 * Technician app: read the last incoming call captured natively by
 * CallAlertReceiver so the customer search dialog can offer "did this
 * customer just call you?". One-shot per call, and only if the phone rang
 * within the last 5 minutes — an hour-old call must not prompt.
 * No-op in the browser and in APKs without the RecentCall plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';

type RecentCallPlugin = {
  consumeRecentCall(): Promise<{ number?: string; at?: number }>;
};

const RecentCall = registerPlugin<RecentCallPlugin>('RecentCall');

const FRESH_CALL_MAX_AGE_MS = 5 * 60_000;

/** Normalized caller number if the phone rang < 5 minutes ago, else null. */
export async function consumeRecentTechnicianCallerNumber(): Promise<string | null> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('RecentCall')) {
    return null;
  }
  try {
    const { number, at } = await RecentCall.consumeRecentCall();
    if (!number || !at) return null;
    if (Date.now() - at > FRESH_CALL_MAX_AGE_MS) return null;
    const digits = normalizePhoneForSearch(number);
    return digits.length >= 7 ? digits : null;
  } catch {
    return null;
  }
}
