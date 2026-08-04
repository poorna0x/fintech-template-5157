/**
 * Admin APK app-lock: fingerprint / face / device PIN after login.
 *
 * - Preference lives in localStorage (per device).
 * - Locks after configurable away time: immediate / 2 min / 5 min / custom.
 * - Push deep-links are held in adminPushDeepLink until unlock, then delivered.
 */
import { Capacitor } from '@capacitor/core';
import {
  checkBiometricAvailable,
  isBiometricPluginPresent,
  promptBiometricUnlock,
} from '@/lib/biometricNative';

const ENABLED_KEY = 'hro_admin_biometric_lock_v1';
/** When the app last went to background (survives process kill). */
const BACKGROUNDED_AT_KEY = 'hro_admin_biometric_bg_at_v1';
/** Away delay in milliseconds before lock is required. */
const DELAY_MS_KEY = 'hro_admin_biometric_delay_ms_v1';

export type AdminLockDelayPreset = 'immediate' | '2m' | '5m' | 'custom';

export const ADMIN_LOCK_DELAY_PRESETS: {
  id: AdminLockDelayPreset;
  label: string;
  ms: number | null;
}[] = [
  { id: 'immediate', label: 'Immediately', ms: 0 },
  { id: '2m', label: 'After 2 minutes', ms: 2 * 60 * 1000 },
  { id: '5m', label: 'After 5 minutes', ms: 5 * 60 * 1000 },
  { id: 'custom', label: 'Custom…', ms: null },
];

const DEFAULT_DELAY_MS = 2 * 60 * 1000;
const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 120;

type Listener = () => void;

let locked = false;
let started = false;
let unlocking = false;
/** Bumps when app returns to foreground while locked — lock screen re-prompts. */
let resumeEpoch = 0;
let appStateHandle: { remove: () => void } | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

function readBackgroundedAt(): number | null {
  try {
    const raw = localStorage.getItem(BACKGROUNDED_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeBackgroundedAt(at: number): void {
  try {
    localStorage.setItem(BACKGROUNDED_AT_KEY, String(at));
  } catch {
    /* ignore */
  }
}

function clearBackgroundedAt(): void {
  try {
    localStorage.removeItem(BACKGROUNDED_AT_KEY);
  } catch {
    /* ignore */
  }
}

function clampDelayMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return DEFAULT_DELAY_MS;
  const max = MAX_CUSTOM_MINUTES * 60 * 1000;
  return Math.min(Math.round(ms), max);
}

/** Current lock-after-away delay in ms (0 = immediate). */
export function getAdminLockDelayMs(): number {
  try {
    const raw = localStorage.getItem(DELAY_MS_KEY);
    if (raw == null || raw === '') return DEFAULT_DELAY_MS;
    return clampDelayMs(Number(raw));
  } catch {
    return DEFAULT_DELAY_MS;
  }
}

export function setAdminLockDelayMs(ms: number): void {
  try {
    localStorage.setItem(DELAY_MS_KEY, String(clampDelayMs(ms)));
  } catch {
    /* ignore */
  }
  notify();
}

export function getAdminLockDelayPreset(): AdminLockDelayPreset {
  const ms = getAdminLockDelayMs();
  if (ms === 0) return 'immediate';
  if (ms === 2 * 60 * 1000) return '2m';
  if (ms === 5 * 60 * 1000) return '5m';
  return 'custom';
}

/** Custom minutes when preset is custom (rounded, at least 1). */
export function getAdminLockCustomMinutes(): number {
  const ms = getAdminLockDelayMs();
  const mins = Math.round(ms / 60_000);
  return Math.min(MAX_CUSTOM_MINUTES, Math.max(MIN_CUSTOM_MINUTES, mins || MIN_CUSTOM_MINUTES));
}

export function formatAdminLockDelayLabel(ms: number = getAdminLockDelayMs()): string {
  if (ms <= 0) return 'Immediately when you leave the app';
  const mins = Math.round(ms / 60_000);
  if (mins === 1) return 'After 1 minute away';
  return `After ${mins} minutes away`;
}

/** True when away long enough that fingerprint is required. */
function shouldLockAfterAway(): boolean {
  if (!isAdminBiometricLockEnabled() || !isBiometricPluginPresent()) return false;
  const bg = readBackgroundedAt();
  if (bg == null) return false;
  return Date.now() - bg >= getAdminLockDelayMs();
}

export function isAdminBiometricLockEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAdminBiometricLockEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(ENABLED_KEY, '1');
    else {
      localStorage.removeItem(ENABLED_KEY);
      clearBackgroundedAt();
    }
  } catch {
    /* ignore */
  }
  if (!enabled) {
    locked = false;
    notify();
  }
}

/** True when the lock overlay should cover the admin portal. */
export function isAdminAppLocked(): boolean {
  return locked && isAdminBiometricLockEnabled() && isBiometricPluginPresent();
}

export function subscribeAdminBiometricLock(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function lockAdminApp(): void {
  if (!isAdminBiometricLockEnabled() || !isBiometricPluginPresent()) return;
  if (locked) return;
  locked = true;
  notify();
}

/**
 * On resume / cold start: lock only if backgrounded longer than the chosen delay.
 */
function applyLockPolicyOnResume(): void {
  if (!isAdminBiometricLockEnabled() || !isBiometricPluginPresent()) {
    locked = false;
    notify();
    return;
  }
  if (shouldLockAfterAway()) {
    if (!locked) {
      locked = true;
      notify();
    }
    resumeEpoch += 1;
    notify();
    return;
  }
  // Still within grace — stay unlocked and reset the away timer.
  clearBackgroundedAt();
  if (locked) {
    locked = false;
    notify();
  }
}

async function flushPendingDeepLinkAfterUnlock(): Promise<void> {
  try {
    const { flushPendingAdminPushDeepLink } = await import('@/lib/adminPushDeepLink');
    flushPendingAdminPushDeepLink();
  } catch {
    /* ignore */
  }
}

export async function unlockAdminAppWithBiometric(): Promise<'ok' | 'canceled' | 'failed'> {
  if (!isAdminBiometricLockEnabled()) {
    locked = false;
    clearBackgroundedAt();
    notify();
    return 'ok';
  }
  if (unlocking) return 'canceled';
  unlocking = true;
  notify();
  try {
    const result = await promptBiometricUnlock({
      title: 'Unlock Admin',
      reason: 'Unlock Hydrogen RO Admin',
      subtitle: 'Confirm it is you',
    });
    if (result === 'ok') {
      locked = false;
      clearBackgroundedAt();
      notify();
      await flushPendingDeepLinkAfterUnlock();
    }
    return result;
  } finally {
    unlocking = false;
    notify();
  }
}

export function isAdminBiometricUnlocking(): boolean {
  return unlocking;
}

export function getAdminBiometricResumeEpoch(): number {
  return resumeEpoch;
}

/**
 * Enable lock: verify biometrics once, then persist. Leaves app unlocked.
 */
export async function enableAdminBiometricLock(): Promise<
  'ok' | 'canceled' | 'failed' | 'unavailable'
> {
  const avail = await checkBiometricAvailable();
  if (!avail.available) return 'unavailable';
  const result = await promptBiometricUnlock({
    title: 'Enable app lock',
    reason: 'Confirm to turn on app lock',
    subtitle: formatAdminLockDelayLabel(),
  });
  if (result !== 'ok') return result;
  setAdminBiometricLockEnabled(true);
  locked = false;
  clearBackgroundedAt();
  notify();
  return 'ok';
}

export async function disableAdminBiometricLock(): Promise<'ok' | 'canceled' | 'failed'> {
  if (!isAdminBiometricLockEnabled()) return 'ok';
  const result = await promptBiometricUnlock({
    title: 'Turn off app lock',
    reason: 'Confirm to disable app lock',
    subtitle: 'Confirm it is you',
  });
  if (result !== 'ok') return result;
  setAdminBiometricLockEnabled(false);
  locked = false;
  clearBackgroundedAt();
  notify();
  return 'ok';
}

/** Call on logout so the next account isn't stuck behind a lock. */
export function clearAdminBiometricLockOnLogout(): void {
  locked = false;
  clearBackgroundedAt();
  // Keep ENABLED_KEY + delay — same phone prefs after re-login.
  notify();
}

/**
 * Start listening for background timing. Call once when an admin is signed in
 * on the native Admin APK. Safe to call repeatedly.
 */
export async function startAdminBiometricLockController(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isBiometricPluginPresent()) return;

  // Cold start: lock only if away longer than the chosen delay.
  if (!started && isAdminBiometricLockEnabled()) {
    applyLockPolicyOnResume();
  }

  if (started) return;
  started = true;

  try {
    const { App } = await import('@capacitor/app');
    appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isAdminBiometricLockEnabled()) return;
      if (!isActive) {
        writeBackgroundedAt(Date.now());
        return;
      }
      applyLockPolicyOnResume();
    });
  } catch {
    /* old APK / web */
  }
}

export function stopAdminBiometricLockController(): void {
  try {
    appStateHandle?.remove();
  } catch {
    /* ignore */
  }
  appStateHandle = null;
  started = false;
  locked = false;
  notify();
}
