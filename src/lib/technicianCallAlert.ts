/**
 * Admin oversight: when a technician's phone rang a known customer,
 * ping admin devices. Uses the technician session JWT — same trust path as
 * search alerts — so it still works when native FCM-token auth fails.
 *
 * Dedupes by callId (CallLog DATE) so native hangup POST + JS catch-up for the
 * *same* call never double-send. A new call (new CallLog DATE) notifies again.
 *
 * Open-app path: one batch POST for many CallLog rows (≤20) = one Netlify invoke.
 */
import { supabase } from '@/lib/supabase';
import { normalizePhoneForSearch } from '@/lib/utils';

const recentlyNotified = new Map<string, number>();
const POSTED_IDS_KEY = 'hro_tech_call_posted_ids_v1';
const POSTED_TTL_MS = 24 * 60 * 60 * 1000;
const POSTED_IDS_MAX = 80;
const BATCH_COOLDOWN_KEY = 'hro_tech_call_batch_at_v1';
/** Don't hammer on every visibility flicker. */
const BATCH_COOLDOWN_MS = 90_000;
/**
 * Native defers ~45s (late retry ~90s). Skip fresher rows on catch-up so we
 * don't race the native one-shot (would burn a 2nd invoke for the same call).
 */
export const NATIVE_DEFER_GRACE_MS = 100_000;

export type TechCallCatchupItem = {
  number: string;
  callId: string;
  callAt: number;
  missed?: boolean;
};

function loadPostedIds(): Map<string, number> {
  try {
    const raw = localStorage.getItem(POSTED_IDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    const out = new Map<string, number>();
    for (const [id, at] of Object.entries(parsed || {})) {
      if (typeof at === 'number' && now - at < POSTED_TTL_MS) out.set(id, at);
    }
    return out;
  } catch {
    return new Map();
  }
}

function rememberPostedId(callId: string): void {
  const map = loadPostedIds();
  map.set(callId, Date.now());
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, POSTED_IDS_MAX);
  try {
    localStorage.setItem(POSTED_IDS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

function rememberPostedIds(callIds: string[]): void {
  if (callIds.length === 0) return;
  const map = loadPostedIds();
  const now = Date.now();
  for (const id of callIds) map.set(id, now);
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, POSTED_IDS_MAX);
  try {
    localStorage.setItem(POSTED_IDS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

function markRecently(callId: string, phone: string): boolean {
  const now = Date.now();
  if (loadPostedIds().has(callId)) return false;
  const last = recentlyNotified.get(callId);
  if (last && now - last < 15 * 60_000) return false;
  const phoneKey = `phone:${phone}`;
  const lastPhone = recentlyNotified.get(phoneKey);
  if (lastPhone && now - lastPhone < 45_000) return false;
  recentlyNotified.set(callId, now);
  recentlyNotified.set(phoneKey, now);
  if (recentlyNotified.size > 80) {
    for (const [k, t] of recentlyNotified) {
      if (now - t > 15 * 60_000) recentlyNotified.delete(k);
    }
  }
  return true;
}

/** Single-call path (live peek / auto-search). Prefer batch for open-app. */
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
  const callId =
    (opts?.callId && String(opts.callId).trim()) ||
    (callAt > 0 ? `${digits}:${callAt}` : '');
  if (!callId) return;
  if (!markRecently(callId, digits)) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        recentlyNotified.delete(callId);
        return;
      }
      const res = await fetch('/.netlify/functions/tech-call-customer-alert', {
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
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload && payload.reason === 'throttled') {
          recentlyNotified.delete(callId);
          return;
        }
        rememberPostedId(callId);
      } else {
        recentlyNotified.delete(callId);
      }
    } catch {
      recentlyNotified.delete(callId);
    }
  })();
}

/**
 * One Netlify invocation for many recent CallLog rows.
 * Filters: local posted ids, native defer grace, max 20.
 * No-op (0 network) when nothing left to send.
 */
export function notifyAdminsTechnicianCallsBatch(items: TechCallCatchupItem[]): void {
  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem(BATCH_COOLDOWN_KEY) || 0);
    if (last > 0 && now - last < BATCH_COOLDOWN_MS) return;
  } catch {
    /* ignore */
  }

  const posted = loadPostedIds();
  const calls: Array<{ number: string; callId: string; callAt: number; missed: boolean }> = [];
  const seen = new Set<string>();

  for (const raw of items) {
    if (calls.length >= 20) break;
    const digits = normalizePhoneForSearch(raw.number);
    if (digits.length < 10) continue;
    const callAt =
      typeof raw.callAt === 'number' && raw.callAt > 1_000_000_000_000
        ? Math.floor(raw.callAt)
        : 0;
    const callId = (raw.callId && String(raw.callId).trim()) || (callAt > 0 ? `${digits}:${callAt}` : '');
    if (!callId || !callAt) continue;
    if (seen.has(callId) || posted.has(callId)) continue;
    // Let native deferred POST own fresh rings.
    if (now - callAt < NATIVE_DEFER_GRACE_MS) continue;
    if (!markRecently(callId, digits)) continue;
    seen.add(callId);
    calls.push({
      number: digits,
      callId,
      callAt,
      missed: raw.missed === true,
    });
  }

  if (calls.length === 0) return;

  try {
    sessionStorage.setItem(BATCH_COOLDOWN_KEY, String(now));
  } catch {
    /* ignore */
  }

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        for (const c of calls) recentlyNotified.delete(c.callId);
        return;
      }
      const res = await fetch('/.netlify/functions/tech-call-customer-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ calls }),
        keepalive: true,
      });
      if (!res.ok) {
        for (const c of calls) recentlyNotified.delete(c.callId);
        return;
      }
      const payload = await res.json().catch(() => null);
      if (payload?.reason === 'throttled') {
        for (const c of calls) recentlyNotified.delete(c.callId);
        return;
      }
      // Remember all attempted ids (incl. no_customer / deduped) so we don't
      // re-POST the same CallLog rows every open.
      rememberPostedIds(calls.map((c) => c.callId));
    } catch {
      for (const c of calls) recentlyNotified.delete(c.callId);
    }
  })();
}
