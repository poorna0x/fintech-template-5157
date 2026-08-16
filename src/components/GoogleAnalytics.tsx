import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initGoogleAnalytics,
  shouldEnableGoogleAnalytics,
  trackGaPageView,
} from '@/lib/googleAnalytics';
import { hasAcceptedAnalyticsCookies, useAnalyticsConsentAllowed } from '@/lib/cookieConsent';

/** GA4 on public website pages only — not admin, technician, or settings. Requires cookie consent. */
const GoogleAnalytics = () => {
  const location = useLocation();
  const consentOk = useAnalyticsConsentAllowed();
  const enabled = shouldEnableGoogleAnalytics(location.pathname) && consentOk;

  useEffect(() => {
    if (!enabled) return;
    if (!hasAcceptedAnalyticsCookies()) return;

    let cancelled = false;
    let idleId: number | undefined;
    let timerId: number | undefined;

    const initialize = () => {
      if (cancelled) return;
      void initGoogleAnalytics().then((ready) => {
        if (!cancelled && ready) {
          trackGaPageView(location.pathname, location.search);
        }
      });
    };

    // Analytics is consented but non-critical. Let the browser paint and start
    // the LCP image before opening the gtag request chain.
    const schedule = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(initialize, { timeout: 2500 });
      } else {
        timerId = window.setTimeout(initialize, 1200);
      }
    };

    if (document.readyState === 'complete') {
      schedule();
    } else {
      window.addEventListener('load', schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [enabled, location.pathname, location.search]);

  return null;
};

export default GoogleAnalytics;
