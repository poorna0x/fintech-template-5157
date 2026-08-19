/**
 * Technician incoming-call → silent background lookup (technician sees nothing).
 * Peeks CallLog/prefs and JWT-notifies admins when a known customer is found.
 * Same customer calling again gets a new CallLog/prefs `at` → notifies again.
 * Only skips an identical phone+at already sent (same single ring).
 */
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { peekRecentTechnicianCaller } from '@/lib/technicianIncomingCall';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';
import { isTechnicianCallDetectEnabled } from '@/lib/technicianPush';

const LAST_AUTO_KEY = 'hro_tech_incoming_bg_lookup';
const POLL_MS = 1_000;

function readLastAuto(): { phone: string; at: number } | null {
  try {
    const raw = sessionStorage.getItem(LAST_AUTO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { phone?: string; at?: number };
    if (!parsed.phone || typeof parsed.at !== 'number') return null;
    return { phone: parsed.phone, at: parsed.at };
  } catch {
    return null;
  }
}

function markLastAuto(phone: string, at: number): void {
  try {
    sessionStorage.setItem(LAST_AUTO_KEY, JSON.stringify({ phone, at }));
  } catch {
    /* ignore */
  }
}

/** Same capture event only — not "same customer forever". */
function alreadyHandled(phone: string, callAt: number): boolean {
  const last = readLastAuto();
  if (!last) return false;
  return last.phone === phone && last.at === callAt;
}

export function initTechnicianIncomingCallBackgroundLookup(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let disposed = false;
  let appListener: PluginListenerHandle | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const deliver = async () => {
    if (disposed) return;
    try {
      // Respect Device Tracker → Detect calls (JS CallLog backup must not bypass).
      if (!isTechnicianCallDetectEnabled()) return;
      const hit = await peekRecentTechnicianCaller();
      if (!hit || disposed) return;
      // Wait for CallLog DATE so callId matches native hangup POST (phone:dateMs).
      // Without it, a js:time-bucket id races native and admins get 2–4 pushes per call.
      if (!hit.callId || !hit.callAt) return;
      if (hit.alreadyAlerted) return;
      if (alreadyHandled(hit.digits, hit.callAt)) return;
      markLastAuto(hit.digits, hit.callAt);
      notifyAdminsTechnicianCall(hit.digits, { callId: hit.callId, callAt: hit.callAt });
    } catch {
      /* next resume / poll retries */
    }
  };

  void deliver();
  window.setTimeout(() => {
    if (!disposed) void deliver();
  }, 800);

  const onVisible = () => {
    if (document.visibilityState === 'visible') void deliver();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void deliver();
  }, POLL_MS);

  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void deliver();
      })
    )
    .then((handle) => {
      if (disposed) void handle?.remove();
      else appListener = handle ?? null;
    })
    .catch(() => {});

  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    if (pollTimer) clearInterval(pollTimer);
    void appListener?.remove();
  };
}
