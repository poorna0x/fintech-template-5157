import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';
import { startAdminDashboardPrefetch } from '@/lib/adminDashboardCache';
import { markNativeBootReady } from '@/lib/nativeBootReady';
import { PortalBootLoader } from '@/components/PortalBootLoader';

const adminDashboardImport = () => import('@/components/AdminDashboard');
const settingsImport = () => import('./Settings');

function AdminPortalLoader({ message }: { message: string }) {
  return <PortalBootLoader showName message={message} className="min-h-screen bg-[#FAFAFA] flex items-center justify-center admin-page p-4" />;
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

  // Settings shell ready. Dashboard marks ready after its own initial data load
  // (avoids a second "Loading dashboard..." flash after the APK overlay).
  useEffect(() => {
    if (booting) return;
    if (user && isAdmin && onSettings) markNativeBootReady();
  }, [booting, user, isAdmin, onSettings]);

  if (booting) {
    return (
      <AdminPortalLoader
        message={onSettings ? 'Loading settings...' : ''}
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
