import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SecurityProvider } from '@/contexts/SecurityContext';
import { AuthPortalCoordinator } from '@/components/AuthPortalCoordinator';
import { isTechnicianPortalPath } from '@/lib/authPortal';

function PortalChunkWarmer() {
  const { pathname } = useLocation();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    // Keep sensitive admin data outside the anonymous entry graph. Only warm
    // it after the current Supabase session has been verified as an admin.
    if (pathname.startsWith('/admin') || pathname.startsWith('/settings')) {
      if (user && isAdmin) {
        void import('@/components/AdminDashboard');
        void import('@/lib/supabase');
      }
    } else if (isTechnicianPortalPath(pathname)) {
      void import('@/pages/TechnicianDashboard');
    }
  }, [pathname, user, isAdmin]);

  return null;
}

/**
 * Auth and anti-abuse state are portal-only. Keeping these providers behind a
 * lazy boundary prevents Supabase auth and CRM login code from entering the
 * public marketing site's first-load module graph.
 */
export default function PortalProviders({ children }: { children: ReactNode }) {
  return (
    <SecurityProvider>
      <AuthProvider>
        <AuthPortalCoordinator />
        <PortalChunkWarmer />
        {children}
      </AuthProvider>
    </SecurityProvider>
  );
}
