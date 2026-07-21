/**
 * Caller lookup for the HRO Admin Android app.
 *
 * The native side (CallCaptureReceiver) saves the last incoming call number
 * on the phone while the app is in the background — no network, no polling,
 * zero egress. When the admin opens/resumes the app, we consume that number
 * and auto-search the customer. No-op in the browser and in old APKs
 * without the plugin.
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
  'Hello! Thank you for calling Water Filter Service.',
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
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Ignore calls older than this — a stale search hours later is confusing. */
const FRESH_CALL_MAX_AGE_MS = 30 * 60_000;

function isAvailable(): boolean {
  return (
    Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('IncomingCall')
  );
}

/** One system permission prompt per app install; never nag after a denial. */
async function ensurePermission(): Promise<boolean> {
  const { callerId } = await IncomingCall.checkPermissions();
  if (callerId === 'granted') return true;
  if (callerId !== 'prompt' && callerId !== 'prompt-with-rationale') return false;
  const res = await IncomingCall.requestPermissions();
  return res.callerId === 'granted';
}

async function consumeFreshNumber(): Promise<string | null> {
  const { number, at } = await IncomingCall.consumeLastCall();
  if (!number || !at) return null;
  if (Date.now() - at > FRESH_CALL_MAX_AGE_MS) return null;
  const digits = normalizePhoneForSearch(number);
  return digits.length >= 7 ? digits : null;
}

/**
 * Start caller lookup: checks for a pending call now and on every app resume,
 * delivering the normalized number to `onNumber`. Returns a cleanup function.
 */
export async function initAdminCallerLookup(
  onNumber: (digits: string) => void
): Promise<() => void> {
  if (!isAvailable()) return () => {};

  try {
    if (!(await ensurePermission())) return () => {};
  } catch {
    return () => {};
  }

  const deliver = async () => {
    try {
      const digits = await consumeFreshNumber();
      if (digits) onNumber(digits);
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
