/**
 * Caller lookup for the HRO Admin Android app.
 *
 * The native side (CallCaptureReceiver) saves the last incoming call number
 * on the phone while the app is in the background — no network, no polling,
 * zero egress. When the admin opens/resumes the app, we consume that number
 * and auto-search the customer — only if opened within 3 minutes of the
 * ring. Older calls are discarded so the dashboard opens normally. Unknown
 * callers get a search-bar chip (WhatsApp intro) for the same window.
 * No-op in the browser and in old APKs without the plugin.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PermissionState, PluginListenerHandle } from '@capacitor/core';
import { formatPhoneForWhatsApp, normalizePhoneForSearch } from '@/lib/utils';

type ConsumeLastCallResult = {
  number?: string;
  /** Epoch ms when the phone rang. */
  at?: number;
};

type IncomingCallPlugin = {
  consumeLastCall(): Promise<ConsumeLastCallResult>;
  checkPermissions(): Promise<{ callerId: PermissionState }>;
  requestPermissions(): Promise<{ callerId: PermissionState }>;
};

const IncomingCall = registerPlugin<IncomingCallPlugin>('IncomingCall');

/** Intro sent to a caller whose number isn't in the customer database yet. */
export const CALLER_INTRO_WHATSAPP_MESSAGE = [
  'Hi from Water Purifier Service.',
  '',
  'To help us serve you better, please share the following:',
  '',
  '1. Your location (please send your Google Maps location, along with your flat/building number and name)',
  '2. A photo of your water filter',
  '',
  'Thank you!',
].join('\n');

/** Open WhatsApp chat with the caller, intro message pre-filled. */
export function openCallerIntroWhatsApp(number: string): void {
  const url = `https://wa.me/${formatPhoneForWhatsApp(number)}?text=${encodeURIComponent(
    CALLER_INTRO_WHATSAPP_MESSAGE
  )}`;
  // APK WebView: window.open often drops ?text=; direct navigation keeps the template.
  if (Capacitor.isNativePlatform()) {
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Auto-search + unknown-caller chip window (matches shared incoming-call board). */
export const UNKNOWN_CALLER_WINDOW_MS = 3 * 60_000;

const FRESH_CALL_MAX_AGE_MS = UNKNOWN_CALLER_WINDOW_MS;
const UNKNOWN_CALLER_STORAGE_KEY = 'hro_admin_unknown_caller';

export type UnknownCallerRecord = { phone: string; at: number };

export function isAdminCallerLookupAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('IncomingCall')
  );
}

function isAvailable(): boolean {
  return isAdminCallerLookupAvailable();
}

export function isUnknownCallerFresh(
  record: UnknownCallerRecord | null | undefined,
  now = Date.now()
): boolean {
  if (!record?.phone) return false;
  return now - record.at <= UNKNOWN_CALLER_WINDOW_MS;
}

/** Read a persisted unknown caller (APK only; localStorage). */
export function readUnknownCaller(): UnknownCallerRecord | null {
  if (!isAdminCallerLookupAvailable()) return null;
  try {
    const raw = localStorage.getItem(UNKNOWN_CALLER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnknownCallerRecord>;
    if (!parsed.phone || typeof parsed.at !== 'number') return null;
    const record = { phone: String(parsed.phone), at: parsed.at };
    if (!isUnknownCallerFresh(record)) {
      localStorage.removeItem(UNKNOWN_CALLER_STORAGE_KEY);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function saveUnknownCaller(phone: string, at = Date.now()): void {
  if (!isAdminCallerLookupAvailable()) return;
  const digits = normalizePhoneForSearch(phone) || phone.trim();
  if (digits.length < 7) return;
  try {
    localStorage.setItem(
      UNKNOWN_CALLER_STORAGE_KEY,
      JSON.stringify({ phone: digits, at } satisfies UnknownCallerRecord)
    );
  } catch {
    /* ignore */
  }
}

export function clearUnknownCaller(): void {
  try {
    localStorage.removeItem(UNKNOWN_CALLER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** One system permission prompt per app install; never nag after a denial. */
async function ensurePermission(): Promise<boolean> {
  const { callerId } = await IncomingCall.checkPermissions();
  if (callerId === 'granted') return true;
  if (callerId !== 'prompt' && callerId !== 'prompt-with-rationale') return false;
  const res = await IncomingCall.requestPermissions();
  return res.callerId === 'granted';
}

async function consumeFreshCall(): Promise<{ digits: string; at: number } | null> {
  const { number, at } = await IncomingCall.consumeLastCall();
  if (!number || !at) return null;
  if (Date.now() - at > FRESH_CALL_MAX_AGE_MS) return null;
  const digits = normalizePhoneForSearch(number);
  return digits.length >= 7 ? { digits, at } : null;
}

/**
 * Start caller lookup: checks for a pending call now and on every app resume,
 * delivering the normalized number to `onNumber`. Returns a cleanup function.
 */
export async function initAdminCallerLookup(
  onNumber: (digits: string, meta: { at: number }) => void
): Promise<() => void> {
  if (!isAvailable()) return () => {};

  try {
    if (!(await ensurePermission())) return () => {};
  } catch {
    return () => {};
  }

  const deliver = async () => {
    try {
      const fresh = await consumeFreshCall();
      if (fresh) onNumber(fresh.digits, { at: fresh.at });
    } catch {
      // Plugin hiccup — next resume will try again.
    }
  };

  void deliver();

  let listener: PluginListenerHandle | null = null;
  try {
    const { App } = await import('@capacitor/app');
    listener = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void deliver();
    });
  } catch {
    // App plugin unavailable — launch-time check still works.
  }

  return () => {
    void listener?.remove();
  };
}
