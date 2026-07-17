/**
 * APK cold-open handoff:
 * Native keeps logo + bounce until login/dashboard paints (__hroBootReady).
 * Web loader ready is unused on APK (avoids a mid-boot logo size jump).
 */
declare global {
  interface Window {
    __hroBootReady?: boolean;
    __hroWebLoaderReady?: boolean;
  }
}

function signalReady(flag: '__hroBootReady' | '__hroWebLoaderReady', attr: string): void {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window[flag] = true;
      try {
        document.documentElement.setAttribute(attr, '1');
      } catch {
        // ignore
      }
    });
  });
}

/** Real portal UI painted (login / dashboard) — native overlay can dismiss. */
export function markNativeBootReady(): void {
  signalReady('__hroBootReady', 'data-hro-boot-ready');
}

/** Website branded loader painted (browser only; APK ignores this). */
export function markNativeWebLoaderReady(): void {
  signalReady('__hroWebLoaderReady', 'data-hro-web-loader-ready');
}
