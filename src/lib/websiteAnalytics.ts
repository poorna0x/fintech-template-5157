import { getPublicSiteKey, type PublicSiteKey } from '@/lib/websiteSiteKey';

export type WebsiteAnalyticsEventType =
  | 'page_view'
  | 'phone_click'
  | 'whatsapp_click'
  | 'booking_click'
  | 'booking_submit';

export type WebsiteAnalyticsPayload = {
  event_type: WebsiteAnalyticsEventType;
  page_path?: string;
  session_hash: string;
  site_key: PublicSiteKey;
  metadata?: Record<string, string | number | boolean>;
};

const SESSION_KEY = 'hro_wa_sid';
const PAGE_VIEW_PREFIX = 'hro_wa_pv:';
const PAGE_VIEW_TTL_MS = 30 * 60 * 1000;
const FLUSH_MS = 2_000;
const MAX_BATCH = 6;
const ENDPOINT = '/.netlify/functions/website-analytics';

let queue: WebsiteAnalyticsPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getWebsiteSessionHash(): string {
  if (typeof sessionStorage === 'undefined') return randomId();
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = randomId();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return randomId();
  }
}

export function maskPhoneForAnalytics(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return 'unknown';
  return `***${digits.slice(-4)}`;
}

export function isPublicMarketingPath(pathname: string): boolean {
  return (
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/technician') &&
    !pathname.startsWith('/settings') &&
    !pathname.startsWith('/calling')
  );
}

function currentPagePath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

function shouldSkipPageView(path: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const key = `${PAGE_VIEW_PREFIX}${path}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < PAGE_VIEW_TTL_MS;
  } catch {
    return false;
  }
}

function markPageViewSent(path: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${PAGE_VIEW_PREFIX}${path}`, String(Date.now()));
  } catch {
    /* quota */
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushWebsiteAnalytics();
  }, FLUSH_MS);
}

async function postEvents(events: WebsiteAnalyticsPayload[]): Promise<void> {
  if (!events.length) return;
  const body = JSON.stringify({ events });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  }
  await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export async function flushWebsiteAnalytics(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await postEvents(batch);
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

export function trackWebsiteEvent(
  eventType: WebsiteAnalyticsEventType,
  metadata?: Record<string, string | number | boolean>
): void {
  if (typeof window === 'undefined') return;
  if (!isPublicMarketingPath(window.location.pathname)) return;

  const pagePath = currentPagePath();

  if (eventType === 'page_view') {
    if (shouldSkipPageView(pagePath)) return;
    markPageViewSent(pagePath);
  }

  queue.push({
    event_type: eventType,
    page_path: pagePath,
    session_hash: getWebsiteSessionHash(),
    site_key: getPublicSiteKey(),
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  });

  if (queue.length >= MAX_BATCH) {
    void flushWebsiteAnalytics();
    return;
  }
  scheduleFlush();
}

export function trackWebsitePageView(path?: string): void {
  if (path && shouldSkipPageView(path)) return;
  if (path) markPageViewSent(path);
  trackWebsiteEvent('page_view', path ? { path } : undefined);
}

export function trackPublicPhoneCall(phone: string, source?: string): void {
  trackWebsiteEvent('phone_click', {
    source: source || 'unknown',
    phone_mask: maskPhoneForAnalytics(phone),
  });
}

export function trackPublicWhatsAppClick(source?: string): void {
  trackWebsiteEvent('whatsapp_click', { source: source || 'unknown' });
}

export function trackPublicBookingClick(source: string): void {
  trackWebsiteEvent('booking_click', { source });
}

export function trackPublicBookingSubmit(): void {
  trackWebsiteEvent('booking_submit');
}

export function openPublicPhoneCall(phone: string, source?: string): void {
  trackPublicPhoneCall(phone, source);
  const digits = phone.replace(/\D/g, '');
  if (digits) window.open(`tel:${digits}`, '_self');
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushWebsiteAnalytics();
  });
  window.addEventListener('pagehide', () => {
    void flushWebsiteAnalytics();
  });
}
