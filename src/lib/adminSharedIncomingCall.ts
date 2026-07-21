/**
 * Shared incoming-call board (admin_incoming_calls): a call received on ONE
 * admin phone becomes searchable on EVERY admin page for 3 minutes.
 *
 *  - fetch-on-open: read the latest row within the window when the app opens
 *    (one slim SELECT, no polling).
 *  - realtime: subscribe to INSERTs so an already-open admin searches live.
 *
 * Dedup per device (localStorage) so the same call isn't re-searched on every
 * resume or after a live event already handled it. No-op if the table/RPC
 * isn't present yet (SQL not run).
 */
import { supabase } from '@/lib/supabaseClient';
import { normalizePhoneForSearch } from '@/lib/utils';

const WINDOW_MS = 3 * 60_000;
const LAST_HANDLED_KEY = 'hro_admin_shared_call_handled_at';

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
function consider(phone: string | undefined, createdAt: string | undefined, onNumber: (digits: string) => void): void {
  if (!phone || !createdAt) return;
  const atMs = new Date(createdAt).getTime();
  if (Number.isNaN(atMs)) return;
  if (Date.now() - atMs > WINDOW_MS) return; // outside 3-min window
  if (atMs <= readLastHandled()) return; // already handled on this device
  const digits = normalizePhoneForSearch(phone);
  if (digits.length < 7) return;
  markHandled(atMs);
  onNumber(digits);
}

/** One slim read of the most recent shared call; auto-search if fresh + new. */
export async function checkSharedIncomingCall(onNumber: (digits: string) => void): Promise<void> {
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
 * Fetch-on-open + resume, plus a realtime subscription for live updates while
 * the page stays open. Returns a cleanup function.
 */
export function initAdminSharedCallLookup(onNumber: (digits: string) => void): () => void {
  void checkSharedIncomingCall(onNumber);

  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkSharedIncomingCall(onNumber);
  };
  document.addEventListener('visibilitychange', onVisible);

  const channel = supabase
    .channel('admin-incoming-calls')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'admin_incoming_calls' },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as { phone?: string; created_at?: string };
        consider(row.phone, row.created_at, onNumber);
      }
    )
    .subscribe();

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    supabase.removeChannel(channel);
  };
}
