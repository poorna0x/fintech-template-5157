import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  flushWebsiteAnalytics,
  shouldTrackWebsiteAnalytics,
  trackPublicPhoneCall,
  trackPublicWhatsAppClick,
  trackWebsiteEngagement,
  trackWebsiteEvent,
} from '@/lib/websiteAnalytics';

const INTERACTIVE_SELECTOR =
  'a[href], button:not(:disabled), [role="button"]:not([aria-disabled="true"]), input[type="submit"]:not(:disabled), input[type="button"]:not(:disabled)';

/** First-party analytics for public marketing pages (hydrogenro + elevenro). */
export default function WebsiteAnalyticsTracker() {
  const location = useLocation();
  const { user, isAdmin, isTechnician } = useAuth();
  const staffSession = useMemo(
    () => isAdmin || isTechnician || Boolean(user),
    [isAdmin, isTechnician, user]
  );
  const trackOptions = useMemo(() => ({ staffSession }), [staffSession]);

  useEffect(() => {
    if (!shouldTrackWebsiteAnalytics(location.pathname, trackOptions)) return;
    trackWebsiteEvent('page_view', undefined, trackOptions);
  }, [location.pathname, location.search, trackOptions]);

  useEffect(() => {
    if (!shouldTrackWebsiteAnalytics(location.pathname, trackOptions)) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (!interactive) return;

      const anchor = interactive.closest('a[href]') as HTMLAnchorElement | null;
      const href = anchor?.getAttribute('href') || '';

      if (href.startsWith('tel:')) {
        trackPublicPhoneCall(href.replace(/^tel:/i, ''), 'link');
        return;
      }
      if (href.includes('wa.me') || href.includes('whatsapp.com')) {
        trackPublicWhatsAppClick('link');
        return;
      }

      trackWebsiteEngagement(interactive, anchor);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [location.pathname, trackOptions]);

  useEffect(() => {
    const onHide = () => void flushWebsiteAnalytics();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
