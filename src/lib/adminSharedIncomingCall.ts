/**
 * Shared incoming-call board (admin_incoming_calls): a call received on ONE
 * admin phone becomes searchable on EVERY admin page for 3 minutes.
 * The auto-filled search also clears itself when that 3-minute window ends.
 *
 *  - fetch-on-open / resume: one slim SELECT (backup path).
 *  - realtime INSERT: immediately refetch the latest row (do NOT trust the
 *    postgres_changes payload alone — with RLS it can arrive thin/empty, which
 *    made searches only appear after a tab focus). Still tiny egress.
 *
 * Dedup per device (localStorage) so the same call isn't re-searched.
 */
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { normalizePhoneForSearch } from '@/lib/utils';

const WINDOW_MS = 3 * 60_000;
/** Same window as shared board — auto-search only within 3 min of the ring. */
export const INCOMING_CALL_SEARCH_WINDOW_MS = WINDOW_MS;
const LAST_HANDLED_KEY = 'hro_admin_shared_call_handled_at';
const AUTO_SEARCH_KEY = 'hro_admin_incoming_auto_search';
const CHANNEL_NAME = 'admin-incoming-calls';

export type IncomingAutoSearchRecord = { phone: string; at: number };

export function readIncomingAutoSearch(): IncomingAutoSearchRecord | null {
  try {
    const raw = sessionStorage.getItem(AUTO_SEARCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IncomingAutoSearchRecord>;
    if (!parsed.phone || typeof parsed.at !== 'number') return null;
    return { phone: parsed.phone, at: parsed.at };
  } catch {
    return null;
  }
}

/** Mark a search as auto-triggered by incoming call (not manual). Used to drop stale ?search= URLs. */
export function markIncomingAutoSearch(
  phone: string,
  at = Date.now()
): IncomingAutoSearchRecord | null {
  const digits = normalizePhoneForSearch(phone);
  if (digits.length < 7) return null;
  const record: IncomingAutoSearchRecord = { phone: digits, at };
  try {
    sessionStorage.setItem(AUTO_SEARCH_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
  return record;
}

/** True when ?search= matches a past incoming-call auto-search older than 3 min. */
export function isIncomingAutoSearchStale(phone: string, now = Date.now()): boolean {
  const parsed = readIncomingAutoSearch();
  if (!parsed) return false;
  const q = normalizePhoneForSearch(phone);
  if (q !== parsed.phone) return false;
  return now - parsed.at > WINDOW_MS;
}

export function clearIncomingAutoSearch(): void {
  try {
    sessionStorage.removeItem(AUTO_SEARCH_KEY);
  } catch {
    /* ignore */
  }
}

function readLastHandled(): number {
  try {
    return Number(localStorage.getItem(LAST_HANDLED_KEY) || '0') || 0;
  } catch {
    return 0;
  }
}

function markHandled(atMs: number): void {
  try {
    localStorage.setItem(LAST_HANDLED_KEY, String(atMs));
  } catch {
    /* ignore */
  }
}

/** Deliver a fresh, not-yet-handled caller number to `onNumber`. */
function consider(
  phone: string | undefined,
  createdAt: string | undefined,
  onNumber: (digits: string, ringAt: number) => void
): boolean {
  if (!phone || !createdAt) return false;
  const atMs = new Date(createdAt).getTime();
  if (Number.isNaN(atMs)) return false;
  if (Date.now() - atMs > WINDOW_MS) return false;
  if (atMs <= readLastHandled()) return false;
  const digits = normalizePhoneForSearch(phone);
  if (digits.length < 7) return false;
  markHandled(atMs);
  onNumber(digits, atMs);
  return true;
}

/** One slim read of the most recent shared call; auto-search if fresh + new. */
export async function checkSharedIncomingCall(
  onNumber: (digits: string, ringAt: number) => void
): Promise<void> {
  try {
    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('admin_incoming_calls')
      .select('phone, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return;
    consider(data.phone as string, data.created_at as string, onNumber);
  } catch {
    /* table missing or transient — ignore */
  }
}

/**
 * Fetch-on-open + resume (web visibility + native appState), plus a realtime
 * subscription. On INSERT we refetch (payload can be incomplete under RLS).
 * Returns a cleanup function.
 */
export function initAdminSharedCallLookup(
  onNumber: (digits: string, ringAt: number) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let disposed = false;
  let appListener: PluginListenerHandle | null = null;
  let resubTimer: ReturnType<typeof setTimeout> | null = null;

  const deliver = () => {
    void checkSharedIncomingCall(onNumber);
  };

  deliver();

  const onVisible = () => {
    if (document.visibilityState === 'visible') deliver();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', deliver);

  const subscribe = () => {
    if (disposed) return;
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }

    channel = supabase
      .channel(CHANNEL_NAME)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_incoming_calls' },
        (payload: { new?: Record<string, unknown> | null }) => {
          // Prefer payload when complete (zero extra egress); otherwise refetch.
          const row = (payload?.new || {}) as {
            phone?: string;
            created_at?: string;
          };
          const usedPayload = consider(row.phone, row.created_at, onNumber);
          if (!usedPayload) deliver();
        }
      )
      .subscribe((status) => {
        if (disposed) return;
        // WebView / flaky networks drop the socket — resubscribe so live
        // updates keep working without needing a tab switch.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (resubTimer) clearTimeout(resubTimer);
          resubTimer = setTimeout(subscribe, 1500);
        }
      });
  };

  subscribe();

  // APK: visibilitychange alone can miss resumes on some OEMs.
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) deliver();
        })
      )
      .then((handle) => {
        if (disposed) void handle?.remove();
        else appListener = handle ?? null;
      })
      .catch(() => {
        /* App plugin unavailable */
      });
  }

  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', deliver);
    if (resubTimer) clearTimeout(resubTimer);
    void appListener?.remove();
    if (channel) void supabase.removeChannel(channel);
  };
}
