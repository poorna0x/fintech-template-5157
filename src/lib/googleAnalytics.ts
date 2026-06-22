import { getAuthSession } from '@/lib/auth';
import { isTechnicianIdCardPath } from '@/lib/authPortal';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initializedForId: string | null = null;

function isCrmPortalPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/technician') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/calling')
  );
}

function isInternalNonMarketingPath(pathname: string): boolean {
  return pathname.startsWith('/product-verify') || isTechnicianIdCardPath(pathname);
}

export function isPublicMarketingPathForGa(pathname: string): boolean {
  return !isCrmPortalPath(pathname) && !isInternalNonMarketingPath(pathname);
}

export function isStaffAuthSessionForGa(): boolean {
  const session = getAuthSession();
  return session?.role === 'admin' || session?.role === 'technician';
}

/** Picks GA4 ID from hostname — both IDs can live in one .env.local. */
export function getGoogleAnalyticsMeasurementId(): string {
  const site = getPublicSiteKey();
  if (site === 'elevenro') {
    return String(import.meta.env.VITE_GA_MEASUREMENT_ID_ELEVENRO || '').trim();
  }
  return String(import.meta.env.VITE_GA_MEASUREMENT_ID_HYDROGENRO || '').trim();
}

/** GA4 only on public marketing pages, not staff CRM sessions. */
export function shouldSendToGoogleAnalytics(
  pathname: string,
  options?: { staffSession?: boolean }
): boolean {
  if (!getGoogleAnalyticsMeasurementId()) return false;
  if (!isPublicMarketingPathForGa(pathname)) return false;
  if (options?.staffSession || isStaffAuthSessionForGa()) return false;
  return true;
}

export function initGoogleAnalytics(): void {
  const measurementId = getGoogleAnalyticsMeasurementId();
  if (!measurementId || typeof window === 'undefined') return;
  if (initializedForId === measurementId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  initializedForId = measurementId;
}

export function trackGoogleAnalyticsPageView(
  pagePath: string,
  options?: { staffSession?: boolean }
): void {
  if (!shouldSendToGoogleAnalytics(pagePath.split('?')[0] || '/', options)) return;
  if (!window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
}
