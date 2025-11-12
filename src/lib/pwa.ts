interface RegisterOptions {
  swUrl: string;
  scope: string;
  label: string;
}

const registrationPromises = new Map<string, Promise<ServiceWorkerRegistration | null>>();
let globalInstallPromptHandler: ((event: Event) => void) | null = null;
let isPWAEnabled = false;

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
};

// Initialize global handler to prevent install prompts on non-PWA pages
const initGlobalInstallPromptHandler = () => {
  if (globalInstallPromptHandler) {
    return; // Already initialized
  }

  globalInstallPromptHandler = (event: Event) => {
    // Only allow install prompt on PWA-enabled pages
    if (!isPWAEnabled) {
      event.preventDefault();
      // Stop the event from propagating
      event.stopImmediatePropagation();
      console.log('[PWA] Install prompt blocked - not on PWA-enabled page');
    }
  };

  // Use capture phase to intercept before other handlers
  window.addEventListener('beforeinstallprompt', globalInstallPromptHandler, { capture: true });
  console.log('[PWA] Global install prompt handler initialized - blocking prompts on non-PWA pages');
};

// Initialize on module load
if (typeof window !== 'undefined') {
  initGlobalInstallPromptHandler();
}

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
    .register(swUrl, { scope, updateViaCache: 'none' })
    .then((registration) => {
      console.info(`[${label}] Service worker registered:`, registration.scope);
      
      // Prevent automatic page refresh on service worker update
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            // Don't automatically activate new service worker
            // It will activate when all tabs are closed
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log(`[${label}] New service worker available, but not activating to prevent refresh`);
            }
          });
        }
      });
      
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
  // Enable PWA for technician pages
  isPWAEnabled = true;
  console.log('[PWA] Technician PWA enabled - install prompts allowed');
  
  // Dynamically set manifest link for technician PWA
  if (typeof document !== 'undefined') {
    // Remove any existing manifest links first
    const existingManifests = document.querySelectorAll('link[rel="manifest"]');
    existingManifests.forEach(link => link.remove());
    
    // Create new manifest link for technician
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/technician-manifest.json';
    document.head.appendChild(manifestLink);
    console.log('[PWA] Technician manifest link set to /technician-manifest.json');
  }
  
  return registerPWA({
    swUrl: '/technician-sw.js',
    scope: '/technician/',
    label: 'Technician PWA',
  });
};

export const registerAdminPWA = () => {
  // Enable PWA for admin pages
  isPWAEnabled = true;
  console.log('[PWA] Admin PWA enabled - install prompts allowed');
  
  // Dynamically set manifest link for admin PWA
  if (typeof document !== 'undefined') {
    // Remove any existing manifest links first
    const existingManifests = document.querySelectorAll('link[rel="manifest"]');
    existingManifests.forEach(link => link.remove());
    
    // Create new manifest link for admin
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/admin-manifest.json';
    document.head.appendChild(manifestLink);
    console.log('[PWA] Admin manifest link set to /admin-manifest.json');
  }
  
  return registerPWA({
    swUrl: '/admin-sw.js',
    scope: '/admin/',
    label: 'Admin PWA',
  });
};

// Disable PWA when leaving PWA-enabled pages
export const disablePWA = () => {
  isPWAEnabled = false;
  console.log('[PWA] PWA disabled - install prompts blocked');
  
  // Reset manifest link to default
  if (typeof document !== 'undefined') {
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (manifestLink) {
      manifestLink.href = '/site.webmanifest';
    }
  }
};

export const getInstallPromptEvent = () => {
  return new Promise<BeforeInstallPromptEvent | null>((resolve) => {
    if (isStandalone()) {
      resolve(null);
      return;
    }

    // Only allow install prompt if PWA is enabled
    if (!isPWAEnabled) {
      console.log('[PWA] Install prompt request blocked - PWA not enabled on this page');
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

