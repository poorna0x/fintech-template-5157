import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/** Keeps admin vs technician Supabase sessions aligned with the current route. */
export function AuthPortalCoordinator() {
  const { pathname } = useLocation();
  const { reconcileAuthPortal } = useAuth();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    void reconcileAuthPortal(pathname);
  }, [pathname, reconcileAuthPortal]);

  return null;
}
