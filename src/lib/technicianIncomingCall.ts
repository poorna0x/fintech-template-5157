/**
 * Technician app: read CallLog / native cache so we can JWT-notify admins
 * when the native deferred POST missed (OEM / killed process).
 *
 * Open-app: one batch of recent inbound rows → one Netlify invocation.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhoneForSearch } from '@/lib/utils';
import {
  notifyAdminsTechnicianCall,
  notifyAdminsTechnicianCallsBatch,
} from '@/lib/technicianCallAlert';
import { isTechnicianCallDetectEnabled } from '@/lib/technicianPush';

type RecentCallRow = {
  number?: string;
  at?: number;
  callLogDate?: number;
  callId?: string;
  missed?: boolean;
  alerted?: boolean;
};

type RecentCallPlugin = {
  consumeRecentCall(): Promise<RecentCallRow>;
  peekRecentCall(): Promise<RecentCallRow>;
  listRecentIncomingCalls?(opts?: {
    sinceMs?: number;
    max?: number;
  }): Promise<{ calls?: RecentCallRow[] }>;
};

const RecentCall = registerPlugin<RecentCallPlugin>('RecentCall');

const FRESH_CALL_MAX_AGE_MS = 15 * 60_000;
const CATCHUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const CATCHUP_MAX = 20;

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
  missed?: boolean;
} | null> {
  if (!isAvailable()) return null;
  try {
    if (typeof RecentCall.peekRecentCall !== 'function') {
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
      typeof result.callId === 'string' && result.callId.trim()
        ? result.callId.trim()
        : callAt
          ? `${digits}:${callAt}`
          : undefined;
    return {
      digits,
      at: result.at,
      callAt,
      callId,
      alreadyAlerted: false,
      missed: result.missed === true,
    };
  } catch {
    return null;
  }
}

/**
 * On open/resume: batch catch-up of last 24h CallLog (one function invoke).
 * Falls back to single peek on older APKs without listRecentIncomingCalls.
 */
export function reportRecentTechnicianCallToAdmins(): void {
  if (!isTechnicianCallDetectEnabled()) return;
  void (async () => {
    if (!isAvailable()) return;

    if (typeof RecentCall.listRecentIncomingCalls === 'function') {
      try {
        const sinceMs = Date.now() - CATCHUP_WINDOW_MS;
        const result = await RecentCall.listRecentIncomingCalls({
          sinceMs,
          max: CATCHUP_MAX,
        });
        const rows = Array.isArray(result?.calls) ? result.calls : [];
        const items = rows
          .filter((r) => r && !r.alerted)
          .map((r) => {
            const digits = normalizePhoneForSearch(String(r.number || ''));
            const callAt =
              typeof r.callLogDate === 'number' && r.callLogDate > 0
                ? r.callLogDate
                : 0;
            const callId =
              (typeof r.callId === 'string' && r.callId.trim()) ||
              (digits.length >= 10 && callAt > 0 ? `${digits}:${callAt}` : '');
            return {
              number: digits,
              callId,
              callAt,
              missed: r.missed === true,
            };
          })
          .filter((r) => r.number.length >= 10 && r.callId && r.callAt > 0);
        if (items.length > 0) {
          notifyAdminsTechnicianCallsBatch(items);
          return;
        }
      } catch {
        /* fall through to peek */
      }
    }

    const hit = await peekRecentTechnicianCaller();
    if (!hit || hit.alreadyAlerted || !hit.callId || !hit.callAt) return;
    notifyAdminsTechnicianCall(hit.digits, {
      callId: hit.callId,
      callAt: hit.callAt,
      missed: hit.missed,
    });
  })();
}
