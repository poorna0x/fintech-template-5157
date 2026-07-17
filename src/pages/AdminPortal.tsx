import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';
import { startAdminDashboardPrefetch } from '@/lib/adminDashboardCache';
import { isNativeApp } from '@/lib/isNativeApp';
import { markNativeBootReady } from '@/lib/nativeBootReady';

const adminDashboardImport = () => import('@/components/AdminDashboard');
const settingsImport = () => import('./Settings');

function AdminPortalLoader({ message }: { message: string }) {
  // APK boot already shows a straight-line loader — no bounce dots here.
  if (isNativeApp()) {
    return <div className="min-h-screen bg-[#FAFAFA] admin-page" aria-hidden />;
  }
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
 * /admin and /settings entry. Only one heavy shell mounts at a time; dashboard tab
 * state is restored from adminDashboardCache on remount when returning from Settings.
 *
 * Security note: the dashboard chunk (and the admin-data chunk it pulls in) MUST stay
 * behind the auth gate. Anonymous visitors should only ever download AdminLogin.
 */
export default function AdminPortal() {
  const { pathname } = useLocation();
  const onSettings = pathname.startsWith('/settings');
  const { user, isAdmin, authInitializing } = useAuth();
  const [Dashboard, setDashboard] = useState<React.ComponentType | null>(null);
  const [Settings, setSettings] = useState<React.ComponentType | null>(null);

  // Load dashboard chunk as soon as admin is signed in (including while on /settings)
  // so returning to /admin or opening Settings deep-links does not wait on the chunk.
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
    if (!onSettings) return;
    if (Settings) return;

    let cancelled = false;
    void settingsImport().then((mod) => {
      if (!cancelled) setSettings(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [onSettings, Settings]);

  useEffect(() => {
    if (user && isAdmin) {
      void startAdminDashboardPrefetch();
    }
  }, [user, isAdmin]);

  const booting =
    authInitializing ||
    (user && isAdmin && (onSettings ? !Settings : !Dashboard));

  // Signed-in shell is painted (dashboard/settings). Login marks itself ready.
  useEffect(() => {
    if (booting) return;
    if (user && isAdmin) markNativeBootReady();
  }, [booting, user, isAdmin]);

  if (booting) {
    return (
      <AdminPortalLoader
        message={onSettings ? 'Loading settings...' : 'Loading...'}
      />
    );
  }

  if (!user || !isAdmin) {
    return <AdminLogin />;
  }

  if (onSettings) {
    return Settings ? <Settings /> : null;
  }

  return Dashboard ? <Dashboard /> : null;
}
