/** Screen blur for the admin website. The page keeps running underneath. */

export const ADMIN_PRIVACY_IDLE_MS = 3 * 60 * 1000;

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
