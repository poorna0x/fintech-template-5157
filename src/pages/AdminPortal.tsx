import { Suspense, lazy, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';

const adminDashboardImport = () => import('@/components/AdminDashboard');
const AdminDashboard = lazy(adminDashboardImport);

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

/** /admin entry — loader until session settled; never flash login while session restores. */
export default function AdminPortal() {
  const { user, isAdmin, authInitializing } = useAuth();

  useEffect(() => {
    void adminDashboardImport();
  }, []);

  if (authInitializing) {
    return <AdminPortalLoader message="Loading..." />;
  }

  if (!user || !isAdmin) {
    return <AdminLogin />;
  }

  return (
    <Suspense fallback={<AdminPortalLoader message="Loading..." />}>
      <AdminDashboard />
    </Suspense>
  );
}
