import { isIOS } from '@/lib/haptics';

const MOVE_THRESHOLD_PX = 10;
const SUPPRESS_AFTER_SCROLL_MS = 350;

let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;
let suppressTapUntil = 0;
let initialized = false;

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchMoved = false;
}

function onTouchMove(e: TouchEvent): void {
  if (e.touches.length !== 1) return;
  const dx = Math.abs(e.touches[0].clientX - touchStartX);
  const dy = Math.abs(e.touches[0].clientY - touchStartY);
  if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
    touchMoved = true;
    suppressTapUntil = Date.now() + SUPPRESS_AFTER_SCROLL_MS;
  }
}

function onTouchEnd(): void {
  if (touchMoved) {
    suppressTapUntil = Date.now() + SUPPRESS_AFTER_SCROLL_MS;
  }
  touchMoved = false;
}

function onClickCapture(e: MouseEvent): void {
  if (!shouldSuppressIOSTap()) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

/** Suppress ghost taps on iOS while / right after the user is scrolling. */
export function shouldSuppressIOSTap(): boolean {
  if (!isIOS()) return false;
  return Date.now() < suppressTapUntil;
}

/** Call once at app root on iOS. */
export function initIOSScrollTapGuard(): () => void {
  if (typeof document === 'undefined' || !isIOS() || initialized) {
    return () => {};
  }
  initialized = true;

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener('touchstart', onTouchStart, opts);
  document.addEventListener('touchmove', onTouchMove, opts);
  document.addEventListener('touchend', onTouchEnd, opts);
  document.addEventListener('touchcancel', onTouchEnd, opts);
  document.addEventListener('click', onClickCapture, true);

  return () => {
    document.removeEventListener('touchstart', onTouchStart, opts);
    document.removeEventListener('touchmove', onTouchMove, opts);
    document.removeEventListener('touchend', onTouchEnd, opts);
    document.removeEventListener('touchcancel', onTouchEnd, opts);
    document.removeEventListener('click', onClickCapture, true);
    initialized = false;
  };
}
