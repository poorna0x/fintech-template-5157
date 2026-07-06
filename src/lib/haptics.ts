import { shouldSuppressIOSTap } from '@/lib/iosScrollTapGuard';

export type VibrationPattern = number | number[];

const HAPTIC_COOLDOWN_MS = 220;

let lastHapticAt = 0;
/** After a real iOS switch tap, skip programmatic haptics triggered by forwarded button clicks. */
let nativeSwitchHapticUntil = 0;

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

/** Call when the invisible iOS switch overlay fires a native Taptic pulse. */
export function markNativeSwitchHaptic(): void {
  const now = Date.now();
  lastHapticAt = now;
  nativeSwitchHapticUntil = now + 450;
}

function canFireProgrammaticHaptic(): boolean {
  const now = Date.now();
  if (now < nativeSwitchHapticUntil) return false;
  if (now - lastHapticAt < HAPTIC_COOLDOWN_MS) return false;
  return true;
}

function recordProgrammaticHaptic(): void {
  lastHapticAt = Date.now();
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
  if (!canFireProgrammaticHaptic()) return;

  if (!isIOS() && hasVibrationApi()) {
    try {
      const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
      nav.vibrate?.(pattern);
      recordProgrammaticHaptic();
      return;
    } catch {
      // ignore
    }
  }

  iosSwitchPulse();
  recordProgrammaticHaptic();
}

export function hapticTap(): void {
  vibrate(50);
}

export function hapticSwitch(): void {
  vibrate(35);
}

export function hapticConfirm(): void {
  if (!canFireProgrammaticHaptic()) return;

  if (!isIOS() && hasVibrationApi()) {
    try {
      const nav = window.navigator as Navigator & { vibrate?: (pattern: VibrationPattern) => boolean };
      nav.vibrate?.([40, 30, 40]);
      recordProgrammaticHaptic();
      return;
    } catch {
      // ignore
    }
  }

  iosSwitchPulse();
  recordProgrammaticHaptic();
}

export const IOS_HAPTIC_ATTR = 'data-ios-haptic-attached';

/** Native <button> gets IOSSwitchHapticOverlay in button.tsx — global scan targets other controls only. */
export const IOS_INTERACTIVE_SELECTOR =
  '[role="button"]:not(button):not([data-haptic-skip]),[data-haptic-interactive]:not([data-haptic-skip]),a[role="button"]:not([data-haptic-skip])';

function isHapticTargetDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.getAttribute('data-disabled') === 'true'
  );
}

export function hasIOSHapticOverlay(el: HTMLElement): boolean {
  return (
    el.getAttribute(IOS_HAPTIC_ATTR) === 'true' ||
    Boolean(el.querySelector(':scope > input[type="checkbox"][switch]'))
  );
}

/** Attach invisible iOS switch overlay so direct taps trigger Taptic Engine (Safari 17.4+). */
export function attachIOSHapticOverlay(el: HTMLElement): boolean {
  if (!isIOS() || typeof document === 'undefined') return false;
  if (el.closest('[data-haptic-skip]')) return false;
  if (hasIOSHapticOverlay(el)) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
  if (tag === 'a' && el.hasAttribute('href')) return false;

  el.setAttribute(IOS_HAPTIC_ATTR, 'true');

  const computed = window.getComputedStyle(el);
  if (computed.position === 'static') {
    el.style.position = 'relative';
  }

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  input.className = 'ios-haptic-overlay';
  input.style.cssText =
    'position:absolute;inset:0;z-index:1;margin:0;height:100%;width:100%;cursor:pointer;opacity:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;clip-path:inset(0 round 999px);';

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shouldSuppressIOSTap() || isHapticTargetDisabled(el)) return;
    el.click();
  });

  input.addEventListener('change', () => {
    markNativeSwitchHaptic();
    input.checked = false;
    input.disabled = isHapticTargetDisabled(el);
  });

  input.disabled = isHapticTargetDisabled(el);
  el.appendChild(input);
  return true;
}
