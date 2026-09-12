/**
 * One-time reload after SW bumps so installed PWAs pick up FCM web push
 * handlers (msgTitle/msgBody) + network-first navigation. Safe no-op when
 * already migrated or in dev.
 */

function ensureSwUpdated(opts: {
  migrationKey: string;
  registrationScope: string;
}): void {
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (localStorage.getItem(opts.migrationKey)) return;

  const markDone = () => localStorage.setItem(opts.migrationKey, '1');

  const reloadOnce = () => {
    markDone();
    window.location.reload();
  };

  void (async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration(opts.registrationScope);
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

const TECHNICIAN_SW_MIGRATION_KEY = 'hro-technician-sw-v6';
const ADMIN_SW_MIGRATION_KEY = 'hro-admin-sw-v8';

export function ensureTechnicianSwUpdated(): void {
  ensureSwUpdated({
    migrationKey: TECHNICIAN_SW_MIGRATION_KEY,
    registrationScope: '/technician',
  });
}

export function ensureAdminSwUpdated(): void {
  ensureSwUpdated({
    migrationKey: ADMIN_SW_MIGRATION_KEY,
    registrationScope: '/admin',
  });
}
