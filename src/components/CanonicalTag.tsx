import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CanonicalTag = () => {
  const location = useLocation();

  useEffect(() => {
    // Get the base URL
    const baseUrl = 'https://hydrogenro.com';
    
    // Build the canonical URL - remove trailing slash except for homepage
    const pathname = location.pathname === '/' ? '' : location.pathname;
    // Remove trailing slash from pathname if it exists (except for root)
    const cleanPathname = pathname === '/' ? '' : pathname.replace(/\/$/, '');
    const canonicalUrl = `${baseUrl}${cleanPathname}`;
    
    // Remove ALL existing canonical tags
    const existingCanonicals = document.querySelectorAll('link[rel="canonical"]');
    existingCanonicals.forEach(tag => tag.remove());
    
    // Create and add new canonical tag
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', canonicalUrl);
    document.head.appendChild(link);
    
    // Also update og:url meta tag
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', canonicalUrl);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:url');
      meta.setAttribute('content', canonicalUrl);
      document.head.appendChild(meta);
    }
    
    // Also update twitter:url if it exists
    let twitterUrl = document.querySelector('meta[name="twitter:url"]');
    if (twitterUrl) {
      twitterUrl.setAttribute('content', canonicalUrl);
    }
    
    // Cleanup function
    return () => {
      // Don't remove on cleanup as we want to keep the canonical tag
    };
  }, [location.pathname]);

  return null;
};

export default CanonicalTag;

