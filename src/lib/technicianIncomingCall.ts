/**
 * Technician app: read the last incoming call captured natively / CallLog
 * so we can JWT-notify admins when native FCM POST missed.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';

type RecentCallPlugin = {
  consumeRecentCall(): Promise<{
    number?: string;
    at?: number;
    callLogDate?: number;
    alerted?: boolean;
  }>;
  peekRecentCall(): Promise<{
    number?: string;
    at?: number;
    callLogDate?: number;
    callId?: string;
    alerted?: boolean;
  }>;
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
  callAt?: number;
  callId?: string;
  alreadyAlerted?: boolean;
} | null> {
  if (!isAvailable()) return null;
  try {
    if (typeof (RecentCall as RecentCallPlugin).peekRecentCall !== 'function') {
      const digits = await consumeRecentTechnicianCallerNumber();
      return digits ? { digits, at: Date.now() } : null;
    }
    const result = await RecentCall.peekRecentCall();
    if (result?.alerted) {
      return {
        digits: normalizePhoneForSearch(String(result.number || '')) || 'x',
        at: typeof result.at === 'number' ? result.at : Date.now(),
        alreadyAlerted: true,
      };
    }
    const digits = normalizeFresh(result?.number, result?.at);
    if (!digits || typeof result?.at !== 'number') return null;
    const callAt =
      typeof result.callLogDate === 'number' && result.callLogDate > 0
        ? result.callLogDate
        : undefined;
    const callId =
      typeof (result as { callId?: string }).callId === 'string' &&
      (result as { callId?: string }).callId!.trim()
        ? (result as { callId?: string }).callId!.trim()
        : callAt
          ? `${digits}:${callAt}`
          : undefined;
    return { digits, at: result.at, callAt, callId, alreadyAlerted: false };
  } catch {
    return null;
  }
}

export function reportRecentTechnicianCallToAdmins(): void {
  void peekRecentTechnicianCaller().then((hit) => {
    if (!hit || hit.alreadyAlerted || !hit.callId || !hit.callAt) return;
    notifyAdminsTechnicianCall(hit.digits, { callId: hit.callId, callAt: hit.callAt });
  });
}
