import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';
import { startAdminDashboardPrefetch } from '@/lib/adminDashboardCache';

const adminDashboardImport = () => import('@/components/AdminDashboard');

function AdminPortalLoader({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen admin-page">
      <div className="text-center">
        <div className="flex items-center justify-center space-x-1 mb-4">
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-3 h-3 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/**
 * /admin entry. Security note: the dashboard chunk (and the admin-data chunk it
 * pulls in) MUST stay behind the auth gate. Anonymous visitors hitting /admin
 * should only ever download AdminLogin — never the chunk that contains RPC names
 * like `delete_job_admin`, `backfill_technician_payments`, or table names like
 * `tax_invoices` / `technician_payments`.
 */
export default function AdminPortal() {
  const { user, isAdmin, authInitializing } = useAuth();
  const [Dashboard, setDashboard] = useState<React.ComponentType | null>(null);

  // Only load the dashboard chunk after we've confirmed the user is an admin.
  // Previously this ran on every /admin visit (incl. anonymous), which is what
  // pulled `admin-data-*.js` over the wire for unauthenticated visitors.
  useEffect(() => {
    if (authInitializing) return;
    if (!user || !isAdmin) return;
    if (Dashboard) return;

    let cancelled = false;
    void adminDashboardImport().then((mod) => {
      if (!cancelled) setDashboard(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [authInitializing, user, isAdmin, Dashboard]);

  useEffect(() => {
    if (user && isAdmin) {
      void startAdminDashboardPrefetch();
    }
  }, [user, isAdmin]);

  const booting = authInitializing || (user && isAdmin && !Dashboard);

  if (booting) {
    return <AdminPortalLoader message="Loading..." />;
  }

  if (!user || !isAdmin) {
    return <AdminLogin />;
  }

  return <Dashboard />;
}
