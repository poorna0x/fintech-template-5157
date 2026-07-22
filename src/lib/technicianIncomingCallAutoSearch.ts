/**
 * Technician incoming-call → silent background lookup (technician sees nothing).
 *
 * Native CallAlertReceiver usually POSTs with FCM already. This is a JWT backup
 * via peek (does not consume) so a 2nd call within minutes still works.
 * Server searches by phone and only pushes admins when a customer is found.
 */
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { peekRecentTechnicianCaller } from '@/lib/technicianIncomingCall';
import { notifyAdminsTechnicianCall } from '@/lib/technicianCallAlert';

const LAST_AUTO_KEY = 'hro_tech_incoming_bg_lookup';
const POLL_MS = 2_000;

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

/** Already notified for this exact native ring (same phone + same at). */
function alreadyHandled(phone: string, callAt: number): boolean {
  const last = readLastAuto();
  if (!last) return false;
  return last.phone === phone && last.at === callAt;
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
      const hit = await peekRecentTechnicianCaller();
      if (!hit || disposed) return;
      if (alreadyHandled(hit.digits, hit.at)) return;
      markLastAuto(hit.digits, hit.at);
      notifyAdminsTechnicianCall(hit.digits);
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
