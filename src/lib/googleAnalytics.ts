import { shouldIndexPath } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initializedId: string | null = null;
let resolvedMeasurementId: string | null = null;
const scriptPromises = new Map<string, Promise<void>>();

function parseMeasurementId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getMeasurementIdCandidates(): string[] {
  const site = getPublicSiteKey();
  if (site === 'elevenro') {
    const elevenro = parseMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID_ELEVENRO);
    return elevenro ? [elevenro] : [];
  }
  const hydrogen =
    parseMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID) ||
    parseMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID_HYDROGENRO);
  return hydrogen ? [hydrogen] : [];
}

export function getGaMeasurementId(): string | null {
  return resolvedMeasurementId ?? getMeasurementIdCandidates()[0] ?? null;
}

export function shouldTrackGaPath(pathname: string): boolean {
  return shouldIndexPath(pathname);
}

/** Public marketing pages only — never load gtag on /admin, /technician, /settings, etc. */
export function shouldEnableGoogleAnalytics(pathname: string): boolean {
  return getMeasurementIdCandidates().length > 0 && shouldTrackGaPath(pathname);
}

async function isMeasurementIdValid(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
      { method: 'HEAD', cache: 'no-store' },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveValidMeasurementId(): Promise<string | null> {
  for (const id of getMeasurementIdCandidates()) {
    if (await isMeasurementIdValid(id)) return id;
  }
  if (getMeasurementIdCandidates().length > 0) {
    console.error(
      '[GA4] Invalid measurement ID in env. Check VITE_GA_MEASUREMENT_ID / VITE_GA_MEASUREMENT_ID_ELEVENRO and redeploy.',
    );
  }
  return null;
}

function loadGtagScript(measurementId: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`,
  );
  if (existing?.dataset.loaded === 'true') {
    return Promise.resolve();
  }

  const cached = scriptPromises.get(measurementId);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.appendChild(script);
    }

    const finish = () => {
      script.dataset.loaded = 'true';
      resolve();
    };

    if (script.dataset.loaded === 'true') {
      finish();
      return;
    }

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      scriptPromises.delete(measurementId);
      reject(new Error('Failed to load gtag.js'));
    }, { once: true });
  });

  scriptPromises.set(measurementId, promise);
  return promise;
}

function ensureGtagStub(): void {
  window.dataLayer = window.dataLayer || [];
  if (window.gtag) return;
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
}

/** Load gtag.js once and configure the property for SPA page_view events. */
export async function initGoogleAnalytics(): Promise<boolean> {
  const measurementId = await resolveValidMeasurementId();
  if (!measurementId) return false;

  resolvedMeasurementId = measurementId;
  ensureGtagStub();

  if (initializedId === measurementId && typeof window.gtag === 'function') {
    return true;
  }

  try {
    await loadGtagScript(measurementId);
    ensureGtagStub();
    window.gtag?.('js', new Date());
    window.gtag?.('config', measurementId, {
      send_page_view: false,
      ...(import.meta.env.DEV ? { debug_mode: true } : {}),
    });
    initializedId = measurementId;
    return true;
  } catch {
    return false;
  }
}

export function trackGaPageView(pathname: string, search = ''): void {
  if (!shouldTrackGaPath(pathname)) return;

  const measurementId = resolvedMeasurementId;
  if (!measurementId || initializedId !== measurementId || typeof window.gtag !== 'function') {
    return;
  }

  const pagePath = `${pathname}${search}` || '/';
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
}
