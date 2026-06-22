import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  initGoogleAnalytics,
  trackGoogleAnalyticsPageView,
} from '@/lib/googleAnalytics';

/** GA4 page views for public marketing routes only (SPA). */
export default function GoogleAnalytics() {
  const location = useLocation();
  const { user, isAdmin, isTechnician } = useAuth();
  const staffSession = useMemo(
    () => isAdmin || isTechnician || Boolean(user),
    [isAdmin, isTechnician, user]
  );
  const trackOptions = useMemo(() => ({ staffSession }), [staffSession]);

  useEffect(() => {
    initGoogleAnalytics();
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    trackGoogleAnalyticsPageView(path, trackOptions);
  }, [location.pathname, location.search, trackOptions]);

  return null;
}
