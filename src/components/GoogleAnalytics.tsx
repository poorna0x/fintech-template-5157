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

    void initGoogleAnalytics().then((ready) => {
      if (ready) {
        trackGaPageView(location.pathname, location.search);
      }
    });
  }, [enabled, location.pathname, location.search]);

  return null;
};

export default GoogleAnalytics;
