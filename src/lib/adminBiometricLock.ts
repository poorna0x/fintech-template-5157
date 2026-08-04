/**
 * Admin APK app-lock: fingerprint / face / device PIN after login.
 *
 * - Preference lives in localStorage (per device).
 * - Only locks after the app has been in the background for LOCK_AFTER_MS (2 min).
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
/** Require fingerprint only after this long away. */
const LOCK_AFTER_MS = 2 * 60 * 1000;

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

/** True when away long enough that fingerprint is required. */
function shouldLockAfterAway(): boolean {
  if (!isAdminBiometricLockEnabled() || !isBiometricPluginPresent()) return false;
  const bg = readBackgroundedAt();
  if (bg == null) return false;
  return Date.now() - bg >= LOCK_AFTER_MS;
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
 * On resume / cold start: lock only if backgrounded for ≥ 2 minutes.
 * Short switches (notifications shade, quick app switch) stay unlocked.
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
      subtitle: 'Fingerprint, face, or phone PIN',
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
    title: 'Enable fingerprint lock',
    reason: 'Confirm fingerprint to turn on app lock',
    subtitle: 'Asked again only after 2 minutes away',
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
    title: 'Turn off fingerprint lock',
    reason: 'Confirm to disable app lock',
    subtitle: 'Fingerprint, face, or phone PIN',
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
  // Keep ENABLED_KEY — same phone still wants fingerprint after re-login.
  notify();
}

/**
 * Start listening for background timing. Call once when an admin is signed in
 * on the native Admin APK. Safe to call repeatedly.
 */
export async function startAdminBiometricLockController(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isBiometricPluginPresent()) return;

  // Cold start: lock only if we were away ≥ 2 minutes before the process died.
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
        // Start the 2-minute grace timer — do not lock yet.
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
