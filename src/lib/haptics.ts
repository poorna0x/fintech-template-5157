export type VibrationPattern = number | number[];

function isIOSLike(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  // iOS Safari + iOS webviews generally don't support navigator.vibrate.
  return /iPad|iPhone|iPod/.test(ua);
}

export function canVibrate(): boolean {
  if (typeof window === 'undefined') return false;
  if (isIOSLike()) return false;
  const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
  return typeof nav.vibrate === 'function';
}

export function vibrate(pattern: VibrationPattern = 20): void {
  if (!canVibrate()) return;
  try {
    const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
    nav.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function hapticTap(): void {
  vibrate(20);
}

export function hapticSwitch(): void {
  vibrate(15);
}

export function hapticConfirm(): void {
  vibrate([25, 20, 25]);
}

