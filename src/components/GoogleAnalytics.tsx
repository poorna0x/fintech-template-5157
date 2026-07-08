import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initGoogleAnalytics,
  shouldEnableGoogleAnalytics,
  trackGaPageView,
} from '@/lib/googleAnalytics';

/** GA4 on public website pages only — not admin, technician, or settings. */
const GoogleAnalytics = () => {
  const location = useLocation();
  const enabled = shouldEnableGoogleAnalytics(location.pathname);

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
