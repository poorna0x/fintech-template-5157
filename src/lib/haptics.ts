export type VibrationPattern = number | number[];

export function vibrate(pattern: VibrationPattern = 12): void {
  if (typeof window === 'undefined') return;
  const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
  if (typeof nav.vibrate !== 'function') return;
  nav.vibrate(pattern);
}

