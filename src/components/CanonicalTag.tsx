import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CanonicalTag = () => {
  const location = useLocation();

  useEffect(() => {
    // Pages that should not have canonical tags (they have noindex)
    const noIndexPages = ['/technician', '/admin', '/dashboard', '/search'];
    const shouldHaveCanonical = !noIndexPages.some(page => location.pathname.startsWith(page));
    
    // Get the base URL
    const baseUrl = 'https://hydrogenro.com';
    
    // Build the canonical URL - remove trailing slash except for homepage
    const pathname = location.pathname === '/' ? '' : location.pathname;
    // Remove trailing slash from pathname if it exists (except for root)
    const cleanPathname = pathname === '/' ? '' : pathname.replace(/\/$/, '');
    
    // Remove query parameters for canonical URL (canonical should be clean URL)
    const cleanPathWithoutQuery = cleanPathname.split('?')[0];
    const canonicalUrl = `${baseUrl}${cleanPathWithoutQuery}`;
    
    // Remove ALL existing canonical tags
    const existingCanonicals = document.querySelectorAll('link[rel="canonical"]');
    existingCanonicals.forEach(tag => tag.remove());
    
    // Only add canonical tag if page should be indexed
    if (shouldHaveCanonical) {
      // Create and add new canonical tag
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', canonicalUrl);
      document.head.appendChild(link);
    }
    
    // Also update og:url meta tag (always update this, but use clean URL without query params)
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', canonicalUrl);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:url');
      meta.setAttribute('content', canonicalUrl);
      document.head.appendChild(meta);
    }
    
    // Also update twitter:url if it exists
    const twitterUrl = document.querySelector('meta[name="twitter:url"]');
    if (twitterUrl) {
      twitterUrl.setAttribute('content', canonicalUrl);
    }
    
    // Cleanup function
    return () => {
      // Don't remove on cleanup as we want to keep the canonical tag
    };
  }, [location.pathname, location.search]);

  return null;
};

export default CanonicalTag;

