import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminLogin from '@/components/AdminLogin';
import { startAdminDashboardPrefetch } from '@/lib/adminDashboardCache';
import { markNativeBootReady } from '@/lib/nativeBootReady';
import { AdminScreenLoader } from '@/components/admin/AdminLoaders';
import { AdminBiometricLockScreen } from '@/components/admin/AdminBiometricLockScreen';
import {
  startAdminBiometricLockController,
  stopAdminBiometricLockController,
} from '@/lib/adminBiometricLock';

const adminDashboardImport = () => import('@/components/AdminDashboard');
const settingsImport = () => import('./Settings');

/**
 * /admin and /settings entry. Only one heavy shell mounts at a time; dashboard tab
 * state is restored from adminDashboardCache on remount when returning from Settings.
 *
 * Security note: the dashboard chunk (and the admin-data chunk it pulls in) MUST stay
 * behind the auth gate. Anonymous visitors should only ever download AdminLogin.
 *
 * In-portal waits (settings chunk, dashboard chunk, auth settle) use plain bounce dots.
 * Branded logo+name is only on true app entry (App Suspense / native APK overlay).
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

  // Admin APK: fingerprint lock controller (no-op in browser / old APKs).
  useEffect(() => {
    if (!user || !isAdmin) {
      stopAdminBiometricLockController();
      return;
    }
    void startAdminBiometricLockController();
    return () => {
      stopAdminBiometricLockController();
    };
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
    return <AdminScreenLoader message={onSettings ? 'Loading settings...' : ''} />;
  }

  if (!user || !isAdmin) {
    return <AdminLogin />;
  }

  const shell = onSettings
    ? Settings
      ? <Settings />
      : null
    : Dashboard
      ? <Dashboard />
      : null;

  return (
    <>
      {shell}
      <AdminBiometricLockScreen />
    </>
  );
}
