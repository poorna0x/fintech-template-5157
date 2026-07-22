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
  const hit = await peekRecentTechnicianCaller();
  return hit?.digits ?? null;
}

/** Digits + native ring timestamp (for dedupe against the same saved call). */
export async function peekRecentTechnicianCaller(): Promise<{
  digits: string;
  at: number;
} | null> {
  if (!isAvailable()) return null;
  try {
    if (typeof (RecentCall as RecentCallPlugin).peekRecentCall !== 'function') {
      const digits = await consumeRecentTechnicianCallerNumber();
      return digits ? { digits, at: Date.now() } : null;
    }
    const { number, at } = await RecentCall.peekRecentCall();
    const digits = normalizeFresh(number, at);
    if (!digits || typeof at !== 'number') return null;
    return { digits, at };
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

export type TechnicianCallerDebugInfo = {
  prefsNumber: string | null;
  prefsAt: number | null;
  callLogNumber: string | null;
  hasCallLogPermission: boolean;
  checkedAt: number;
  /** Best number to display (prefs or CallLog). */
  displayNumber: string | null;
  source: 'prefs' | 'call_log' | null;
};

/** Diagnostics for Moto/Truecaller tests — does not consume or notify. */
export async function debugReadTechnicianCallerCapture(): Promise<TechnicianCallerDebugInfo | null> {
  if (!isAvailable()) return null;
  try {
    const plugin = RecentCall as RecentCallPlugin & {
      debugReadRecentCall?: () => Promise<{
        prefsNumber?: string;
        prefsAt?: number;
        callLogNumber?: string;
        hasCallLogPermission?: boolean;
        checkedAt?: number;
      }>;
    };
    if (typeof plugin.debugReadRecentCall !== 'function') {
      const hit = await peekRecentTechnicianCaller();
      return {
        prefsNumber: hit?.digits ?? null,
        prefsAt: hit?.at ?? null,
        callLogNumber: null,
        hasCallLogPermission: true,
        checkedAt: Date.now(),
        displayNumber: hit?.digits ?? null,
        source: hit ? 'prefs' : null,
      };
    }
    const raw = await plugin.debugReadRecentCall();
    const prefsNumber = raw.prefsNumber
      ? normalizePhoneForSearch(raw.prefsNumber)
      : null;
    const callLogNumber = raw.callLogNumber
      ? normalizePhoneForSearch(raw.callLogNumber)
      : null;
    const displayNumber =
      (prefsNumber && prefsNumber.length >= 7 ? prefsNumber : null) ||
      (callLogNumber && callLogNumber.length >= 7 ? callLogNumber : null);
    const source: TechnicianCallerDebugInfo['source'] = prefsNumber
      ? 'prefs'
      : callLogNumber
        ? 'call_log'
        : null;
    return {
      prefsNumber: prefsNumber && prefsNumber.length >= 7 ? prefsNumber : null,
      prefsAt: typeof raw.prefsAt === 'number' ? raw.prefsAt : null,
      callLogNumber: callLogNumber && callLogNumber.length >= 7 ? callLogNumber : null,
      hasCallLogPermission: raw.hasCallLogPermission !== false,
      checkedAt: typeof raw.checkedAt === 'number' ? raw.checkedAt : Date.now(),
      displayNumber,
      source,
    };
  } catch {
    return null;
  }
}
