import { getAuthSession } from '@/lib/auth';
import { isTechnicianIdCardPath } from '@/lib/authPortal';
import { getPublicSiteKey, type PublicSiteKey } from '@/lib/websiteSiteKey';

/** Crawlers / SEO tools — not counted as public marketing visits. */
const BOT_UA_PATTERN =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|headlesschrome|phantomjs/i;

export type WebsiteAnalyticsEventType =
  | 'page_view'
  | 'engagement'
  | 'phone_click'
  | 'whatsapp_click'
  | 'booking_click'
  | 'booking_submit';

/** Sessions with any of these count as an engaged visitor (not passive page loads). */
export const WEBSITE_ENGAGEMENT_EVENT_TYPES = [
  'engagement',
  'phone_click',
  'whatsapp_click',
  'booking_click',
  'booking_submit',
] as const;

export type WebsiteAnalyticsPayload = {
  event_type: WebsiteAnalyticsEventType;
  page_path?: string;
  session_hash: string;
  site_key: PublicSiteKey;
  metadata?: Record<string, string | number | boolean>;
};

const SESSION_KEY = 'hro_wa_sid';
const REFERRER_KEY = 'hro_wa_ref';
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

/** Admin / technician CRM routes — never tracked. */
export function isCrmPortalPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/technician') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/calling')
  );
}

/** Internal tools on public URLs (product QR, technician ID card) — not marketing visits. */
export function isInternalNonMarketingPath(pathname: string): boolean {
  return pathname.startsWith('/product-verify') || isTechnicianIdCardPath(pathname);
}

export function isPublicMarketingPath(pathname: string): boolean {
  return !isCrmPortalPath(pathname) && !isInternalNonMarketingPath(pathname);
}

export function isLikelyBotUserAgent(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return false;
  return BOT_UA_PATTERN.test(ua);
}

export function isStaffAuthSession(): boolean {
  const session = getAuthSession();
  return session?.role === 'admin' || session?.role === 'technician';
}

export type WebsiteAnalyticsTrackOptions = {
  /** Pass from AuthContext when available (covers session before localStorage sync). */
  staffSession?: boolean;
};

/** True when a public marketing event should be recorded for this path/session. */
export function shouldTrackWebsiteAnalytics(
  pathname?: string,
  options?: WebsiteAnalyticsTrackOptions
): boolean {
  if (typeof window === 'undefined') return false;
  const path = pathname ?? window.location.pathname;
  if (!isPublicMarketingPath(path)) return false;
  if (isLikelyBotUserAgent()) return false;
  if (options?.staffSession || isStaffAuthSession()) return false;
  return true;
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

function isOwnReferrerHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.includes('hydrogenro.com') ||
    host.includes('elevenro.com') ||
    host.includes('localhost') ||
    host === '127.0.0.1'
  );
}

function captureSessionReferrer(): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    let ref = sessionStorage.getItem(REFERRER_KEY);
    if (!ref && typeof document !== 'undefined' && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (!isOwnReferrerHost(host)) {
          ref = document.referrer.slice(0, 200);
          sessionStorage.setItem(REFERRER_KEY, ref);
        }
      } catch {
        /* ignore malformed referrer */
      }
    }
    return ref || undefined;
  } catch {
    return undefined;
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
  metadata?: Record<string, string | number | boolean>,
  options?: WebsiteAnalyticsTrackOptions
): void {
  if (typeof window === 'undefined') return;
  if (!shouldTrackWebsiteAnalytics(window.location.pathname, options)) return;

  const pagePath = currentPagePath();

  if (eventType === 'page_view') {
    if (shouldSkipPageView(pagePath)) return;
    markPageViewSent(pagePath);
  }

  const referrerUrl = captureSessionReferrer();

  queue.push({
    event_type: eventType,
    page_path: pagePath,
    session_hash: getWebsiteSessionHash(),
    site_key: getPublicSiteKey(),
    metadata: {
      client_at: new Date().toISOString(),
      ...(referrerUrl ? { referrer_url: referrerUrl } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? metadata : {}),
    },
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

function engagementLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria.slice(0, 48);
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 48);
  return 'unknown';
}

/** Any button/link tap on the public site (nav, CTA, internal links, etc.). */
export function trackWebsiteEngagement(
  element: HTMLElement,
  anchor?: HTMLAnchorElement | null
): void {
  const href = anchor?.getAttribute('href') || '';
  if (href.startsWith('tel:') || href.includes('wa.me') || href.includes('whatsapp.com')) {
    return;
  }

  trackWebsiteEvent('engagement', {
    kind: anchor ? 'link' : 'button',
    label: engagementLabel(element),
    ...(href && !href.startsWith('javascript:') ? { href: href.slice(0, 120) } : {}),
  });
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
