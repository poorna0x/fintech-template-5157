/**
 * Technician incoming-call → silent background lookup (technician sees nothing).
 *
 * Native CallAlertReceiver / CallLog saves the last ringing number. On app
 * open/resume (and a light poll while the dashboard is open) we consume it and
 * POST to tech-call-customer-alert. The server searches by phone and only
 * pushes admins when a customer is found; unknown numbers are ignored.
 */
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { consumeRecentTechnicianCallerNumber } from '@/lib/technicianIncomingCall';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';

const LAST_AUTO_KEY = 'hro_tech_incoming_bg_lookup';
/** Don't re-fire for the same caller within the CallLog fresh window. */
const FRESH_MS = 5 * 60_000;
const POLL_MS = 3_000;

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

function markLastAuto(phone: string, at = Date.now()): void {
  try {
    sessionStorage.setItem(LAST_AUTO_KEY, JSON.stringify({ phone, at }));
  } catch {
    /* ignore */
  }
}

function alreadyHandled(phone: string): boolean {
  const last = readLastAuto();
  if (!last) return false;
  return last.phone === phone && Date.now() - last.at < FRESH_MS;
}

/**
 * Watch for a fresh incoming caller and silently notify admins if known.
 * Returns cleanup.
 */
export function initTechnicianIncomingCallBackgroundLookup(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let disposed = false;
  let appListener: PluginListenerHandle | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const deliver = async () => {
    if (disposed) return;
    try {
      const digits = await consumeRecentTechnicianCallerNumber();
      if (!digits || disposed) return;
      if (alreadyHandled(digits)) return;
      markLastAuto(digits);
      // Server looks up customer; push only if found. Tech UI unchanged.
      notifyAdminsTechnicianCall(digits);
    } catch {
      /* next resume / poll retries */
    }
  };

  // Call log may write a moment after IDLE — try twice.
  void deliver();
  window.setTimeout(() => {
    if (!disposed) void deliver();
  }, 1500);

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
