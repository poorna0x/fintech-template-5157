import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  flushWebsiteAnalytics,
  isPublicMarketingPath,
  trackPublicPhoneCall,
  trackPublicWhatsAppClick,
  trackWebsiteEvent,
} from '@/lib/websiteAnalytics';

/** First-party analytics for public marketing pages (hydrogenro + elevenro). */
export default function WebsiteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!isPublicMarketingPath(location.pathname)) return;
    trackWebsiteEvent('page_view');
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isPublicMarketingPath(location.pathname)) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('tel:')) {
        trackPublicPhoneCall(href.replace(/^tel:/i, ''), 'link');
        return;
      }
      if (href.includes('wa.me') || href.includes('whatsapp.com')) {
        trackPublicWhatsAppClick('link');
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [location.pathname]);

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
