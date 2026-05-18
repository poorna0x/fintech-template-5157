import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';
import { startAdminDashboardPrefetch } from '@/lib/adminDashboardCache';

const adminDashboardImport = () => import('@/components/AdminDashboard');

function AdminPortalLoader({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="flex items-center justify-center space-x-1 mb-4">
          <div
            className="w-3 h-3 bg-black rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-3 h-3 bg-black rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-3 h-3 bg-black rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

/** /admin entry — one loader: auth + dashboard chunk in parallel (no Suspense flash). */
export default function AdminPortal() {
  const { user, isAdmin, authInitializing } = useAuth();
  const [Dashboard, setDashboard] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    void adminDashboardImport().then((mod) => {
      if (!cancelled) setDashboard(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch jobs/roster/counts while the dashboard JS chunk downloads.
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
