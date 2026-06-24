export type VibrationPattern = number | number[];

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

export function hasVibrationApi(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
  return typeof nav.vibrate === 'function';
}

/** True when some haptic path may work (Vibration API or iOS Safari switch). */
export function canHaptic(): boolean {
  return hasVibrationApi() || isIOS();
}

/** @deprecated Prefer canHaptic — kept for existing call sites. */
export function canVibrate(): boolean {
  return hasVibrationApi();
}

function iosSwitchPulse(): void {
  if (!isIOS() || typeof document === 'undefined') return;
  try {
    const id = `ios-haptic-${Date.now()}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = id;
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    document.body.appendChild(label);
    label.click();
    input.remove();
    label.remove();
  } catch {
    // iOS 26.5+ blocks programmatic switch toggles — direct tap overlays still work.
  }
}

export function vibrate(pattern: VibrationPattern = 50): void {
  if (typeof window === 'undefined') return;

  if (!isIOS() && hasVibrationApi()) {
    try {
      const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
      nav.vibrate?.(pattern);
      return;
    } catch {
      // ignore
    }
  }

  iosSwitchPulse();
}

export function hapticTap(): void {
  vibrate(50);
}

export function hapticSwitch(): void {
  vibrate(35);
}

export function hapticConfirm(): void {
  if (!isIOS() && hasVibrationApi()) {
    vibrate([40, 30, 40]);
    return;
  }
  iosSwitchPulse();
  window.setTimeout(iosSwitchPulse, 70);
}
