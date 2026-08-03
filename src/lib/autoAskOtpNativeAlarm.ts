/**
 * Native AlarmManager schedule for Auto Ask OTP dwell.
 * Web / missing plugin: no-op (server cron + in-app flush still apply).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

type AutoAskOtpPlugin = {
  scheduleDwellAlarm(opts: {
    jobId: string;
    delayMs: number;
    accessToken: string;
    endpointUrl: string;
    customerName?: string;
  }): Promise<{ ok?: boolean }>;
  cancelDwellAlarm(opts: { jobId: string }): Promise<{ ok?: boolean }>;
};

const AutoAskOtp = registerPlugin<AutoAskOtpPlugin>('AutoAskOtp');

const scheduledJobIds = new Set<string>();

function absoluteAutoAskEndpoint(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/.netlify/functions/auto-ask-otp-on-site`;
  }
  return 'https://hydrogenro.com/.netlify/functions/auto-ask-otp-on-site';
}

/** Persist arm marker so a cold open can still flush (web + APK). */
export function rememberAutoAskArmed(jobId: string, fireAtMs: number): void {
  try {
    const key = 'hro_auto_ask_otp_armed';
    const raw = localStorage.getItem(key);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[jobId] = fireAtMs;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function clearAutoAskArmed(jobId: string): void {
  try {
    const key = 'hro_auto_ask_otp_armed';
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, number>;
    delete map[jobId];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function scheduleNativeAutoAskDwell(opts: {
  jobId: string;
  remainingMs: number;
  accessToken: string;
  customerName?: string;
}): Promise<void> {
  const { jobId, remainingMs, accessToken, customerName } = opts;
  if (!jobId || !accessToken || remainingMs <= 0) return;

  const fireAt = Date.now() + remainingMs;
  rememberAutoAskArmed(jobId, fireAt);

  if (!Capacitor.isNativePlatform()) return;
  if (scheduledJobIds.has(jobId)) return;

  try {
    await AutoAskOtp.scheduleDwellAlarm({
      jobId,
      delayMs: remainingMs,
      accessToken,
      endpointUrl: absoluteAutoAskEndpoint(),
      ...(customerName ? { customerName } : {}),
    });
    scheduledJobIds.add(jobId);
    console.log('[auto-ask-otp] native dwell alarm scheduled', {
      jobId,
      remainingMs,
    });
  } catch (err) {
    console.warn('[auto-ask-otp] native alarm schedule failed', err);
  }
}

export async function cancelNativeAutoAskDwell(jobId: string): Promise<void> {
  clearAutoAskArmed(jobId);
  scheduledJobIds.delete(jobId);
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AutoAskOtp.cancelDwellAlarm({ jobId });
  } catch {
    /* plugin missing */
  }
}
