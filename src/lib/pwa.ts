const SW_URL = '/technician-sw.js';
const SW_SCOPE = '/technician/';

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
};

export const registerTechnicianPWA = () => {
  if (import.meta.env.DEV) {
    return Promise.resolve(null);
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[Technician PWA] Service workers are not supported in this browser.');
    return Promise.resolve(null);
  }

  if (registrationPromise) {
    return registrationPromise;
  }

  registrationPromise = navigator.serviceWorker
    .register(SW_URL, { scope: SW_SCOPE })
    .then((registration) => {
      console.info('[Technician PWA] Service worker registered:', registration.scope);
      return registration;
    })
    .catch((error) => {
      console.error('[Technician PWA] Service worker registration failed:', error);
      registrationPromise = null;
      return null;
    });

  return registrationPromise;
};

export const getInstallPromptEvent = () => {
  return new Promise<BeforeInstallPromptEvent | null>((resolve) => {
    if (isStandalone()) {
      resolve(null);
      return;
    }

    const handler = (event: Event) => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
      event.preventDefault();
      resolve(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener, { once: true });

    // Fallback resolve after delay if event never fires
    setTimeout(() => resolve(null), 10000);
  });
};

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

