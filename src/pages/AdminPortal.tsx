import { Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';

const AdminDashboard = lazy(() => import('@/components/AdminDashboard'));

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

/** /admin entry — show login immediately; load dashboard bundle only after auth. */
export default function AdminPortal() {
  const { user, isAdmin, authInitializing } = useAuth();

  if (authInitializing) {
    return <AdminPortalLoader message="Checking authentication..." />;
  }

  if (!user || !isAdmin) {
    return <AdminLogin />;
  }

  return (
    <Suspense fallback={<AdminPortalLoader message="Loading dashboard..." />}>
      <AdminDashboard />
    </Suspense>
  );
}
