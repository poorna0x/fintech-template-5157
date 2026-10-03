/** Screen blur for the admin website. The page keeps running underneath. */

export const ADMIN_PRIVACY_IDLE_MS = 3 * 60 * 1000;

const ENABLED_KEY = 'hro.adminPrivacyBlur';
/** Same tab only. A reload keeps the cover; a new tab starts clear. */
const LOCKED_KEY = 'hro.adminPrivacyBlurLocked';
const enabledListeners = new Set<() => void>();

function privacyBlurStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Missing value stays on, matching the lock that already ships. */
export function readAdminPrivacyBlurEnabled(): boolean {
  try {
    return privacyBlurStorage()?.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAdminPrivacyBlurEnabled(enabled: boolean): void {
  try {
    privacyBlurStorage()?.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (!enabled) writeAdminPrivacyBlurLocked(false);
  enabledListeners.forEach((listener) => listener());
}

function blurLockStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** True when this tab was already locked, including after a reload. */
export function readAdminPrivacyBlurLocked(): boolean {
  if (!readAdminPrivacyBlurEnabled()) return false;
  try {
    return blurLockStorage()?.getItem(LOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAdminPrivacyBlurLocked(locked: boolean): void {
  try {
    const storage = blurLockStorage();
    if (!storage) return;
    if (locked) storage.setItem(LOCKED_KEY, '1');
    else storage.removeItem(LOCKED_KEY);
  } catch {
    /* private mode */
  }
}

export function subscribeAdminPrivacyBlurEnabled(listener: () => void): () => void {
  enabledListeners.add(listener);
  return () => enabledListeners.delete(listener);
}

export type AdminPrivacyChord = 'lock' | 'unlock';

type ChordEvent = {
  code?: string;
  key?: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat?: boolean;
};

export function isMacPrivacyPlatform(platform = ''): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** Phones, tablets, and the admin app do not get the blur. */
export function isDesktopPrivacyTarget(opts: {
  nativeApp: boolean;
  hover: boolean;
  finePointer: boolean;
}): boolean {
  if (opts.nativeApp) return false;
  return opts.hover && opts.finePointer;
}

/** Mac: Command+Shift+L / U. Windows: Control+Shift+L / U. */
export function adminPrivacyChord(event: ChordEvent, mac: boolean): AdminPrivacyChord | null {
  if (event.repeat || event.altKey || !event.shiftKey) return null;
  const code = event.code || '';
  const key = (event.key || '').toLowerCase();
  const letter = code === 'KeyL' || key === 'l' ? 'l' : code === 'KeyU' || key === 'u' ? 'u' : '';
  if (!letter) return null;
  const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier) return null;
  return letter === 'l' ? 'lock' : 'unlock';
}
