import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initGoogleAnalytics,
  isGoogleAnalyticsEnabled,
  trackGaPageView,
} from '@/lib/googleAnalytics';

/** GA4 — separate property per brand (hostname picks measurement ID). */
const GoogleAnalytics = () => {
  const location = useLocation();
  const enabled = isGoogleAnalyticsEnabled();

  useEffect(() => {
    if (!enabled) return;

    void initGoogleAnalytics().then((ready) => {
      if (ready) {
        trackGaPageView(location.pathname, location.search);
      }
    });
  }, [enabled, location.pathname, location.search]);

  return null;
};

export default GoogleAnalytics;
