import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPublicSiteSeo } from '@/lib/publicSiteSeo';

/** Keeps per-brand canonical URLs, meta tags, and JSON-LD in sync on client navigation. */
const PublicSiteSeo = () => {
  const location = useLocation();

  useEffect(() => {
    applyPublicSiteSeo(location.pathname);
  }, [location.pathname]);

  return null;
};

export default PublicSiteSeo;
