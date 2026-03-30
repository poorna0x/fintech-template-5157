export type VibrationPattern = number | number[];

export function vibrate(pattern: VibrationPattern = 20): void {
  if (typeof window === 'undefined') return;
  const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  nav.vibrate(pattern);
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

