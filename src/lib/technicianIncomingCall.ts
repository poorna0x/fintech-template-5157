/**
 * Technician app: read the last incoming call captured natively / CallLog
 * so we can JWT-notify admins when native FCM POST missed.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';

type RecentCallPlugin = {
  consumeRecentCall(): Promise<{ number?: string; at?: number }>;
  peekRecentCall(): Promise<{ number?: string; at?: number }>;
};

const RecentCall = registerPlugin<RecentCallPlugin>('RecentCall');

const FRESH_CALL_MAX_AGE_MS = 15 * 60_000;

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
  return digits.length >= 10 ? digits : null;
}

export async function consumeRecentTechnicianCallerNumber(): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    const { number, at } = await RecentCall.consumeRecentCall();
    return normalizeFresh(number, at);
  } catch {
    return null;
  }
}

export async function peekRecentTechnicianCallerNumber(): Promise<string | null> {
  const hit = await peekRecentTechnicianCaller();
  return hit?.digits ?? null;
}

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

export function reportRecentTechnicianCallToAdmins(): void {
  void peekRecentTechnicianCallerNumber().then((digits) => {
    if (digits) notifyAdminsTechnicianCall(digits);
  });
}
