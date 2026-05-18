import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthPortal, type AuthPortal } from '@/lib/authPortal';

/** Keeps admin vs technician Supabase sessions aligned with the current route. */
export function AuthPortalCoordinator() {
  const { pathname } = useLocation();
  const { reconcileAuthPortal } = useAuth();
  const lastPortalRef = useRef<AuthPortal | null>(null);

  useEffect(() => {
    const portal = getAuthPortal(pathname);
    if (lastPortalRef.current === portal) return;
    lastPortalRef.current = portal;
    void reconcileAuthPortal(pathname);
  }, [pathname, reconcileAuthPortal]);

  return null;
}
