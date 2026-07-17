/**
 * APK cold-open handoff:
 * - Native shows logo (admin + text) until the website loader paints
 * - Website bounce spinner takes over; login/dashboard also clears the overlay
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

/** Real portal UI painted (login / dashboard). */
export function markNativeBootReady(): void {
  signalReady('__hroBootReady', 'data-hro-boot-ready');
}

/** Website branded loader painted — native logo overlay can dismiss. */
export function markNativeWebLoaderReady(): void {
  signalReady('__hroWebLoaderReady', 'data-hro-web-loader-ready');
}
