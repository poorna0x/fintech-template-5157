/**
 * APK cold-open: native line loader dismisses only when real UI is painted.
 * Blank Suspense / auth placeholders must NOT set this.
 */
declare global {
  interface Window {
    __hroBootReady?: boolean;
  }
}

export function markNativeBootReady(): void {
  if (typeof window === 'undefined') return;
  // Wait two frames so login/dashboard is actually painted under the overlay.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__hroBootReady = true;
      try {
        document.documentElement.setAttribute('data-hro-boot-ready', '1');
      } catch {
        // ignore
      }
    });
  });
}
