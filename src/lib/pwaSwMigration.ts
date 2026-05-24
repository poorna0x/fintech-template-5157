/**
 * One-time reload after technician SW v4 so installed PWAs pick up network-first
 * navigation (fixes stale login shell). Safe no-op when already migrated or in dev.
 */
const TECHNICIAN_SW_MIGRATION_KEY = 'hro-technician-sw-v4';

export function ensureTechnicianSwUpdated(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (localStorage.getItem(TECHNICIAN_SW_MIGRATION_KEY)) return;

  const markDone = () => localStorage.setItem(TECHNICIAN_SW_MIGRATION_KEY, '1');

  const reloadOnce = () => {
    markDone();
    window.location.reload();
  };

  void (async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/technician');
      if (!reg) {
        markDone();
        return;
      }

      const activateWaiting = (worker: ServiceWorker) => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, {
          once: true,
        });
      };

      if (reg.waiting) {
        activateWaiting(reg.waiting);
        return;
      }

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            activateWaiting(worker);
          }
        });
      });

      await reg.update();

      if (!reg.waiting && !reg.installing) {
        markDone();
      }
    } catch {
      markDone();
    }
  })();
}
