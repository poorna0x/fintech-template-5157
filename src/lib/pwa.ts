interface RegisterOptions {
  swUrl: string;
  scope: string;
  label: string;
}

const registrationPromises = new Map<string, Promise<ServiceWorkerRegistration | null>>();

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
};

const registerPWA = ({ swUrl, scope, label }: RegisterOptions) => {
  if (import.meta.env.DEV) {
    return Promise.resolve(null);
  }

  if (!('serviceWorker' in navigator)) {
    console.warn(`[${label}] Service workers are not supported in this browser.`);
    return Promise.resolve(null);
  }

  const key = `${swUrl}|${scope}`;
  const cachedPromise = registrationPromises.get(key);
  if (cachedPromise) {
    return cachedPromise;
  }

  const registrationPromise = navigator.serviceWorker
    .register(swUrl, { scope })
    .then((registration) => {
      console.info(`[${label}] Service worker registered:`, registration.scope);
      return registration;
    })
    .catch((error) => {
      console.error(`[${label}] Service worker registration failed:`, error);
      registrationPromises.delete(key);
      return null;
    });

  registrationPromises.set(key, registrationPromise);
  return registrationPromise;
};

export const registerTechnicianPWA = () => {
  return registerPWA({
    swUrl: '/technician-sw.js',
    scope: '/technician/',
    label: 'Technician PWA',
  });
};

export const registerAdminPWA = () => {
  return registerPWA({
    swUrl: '/admin-sw.js',
    scope: '/admin/',
    label: 'Admin PWA',
  });
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

