import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import {
  deliverAdminIncomingCallSearch,
  hasAdminIncomingCallSearchHandler,
} from '@/lib/adminIncomingCallBridge';
import { adminDashboardLocation, buildAdminDashboardSearch } from '@/lib/adminDashboardUrl';

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
  const navigate = useNavigate();
  const onSettings = pathname.startsWith('/settings');
  const onSettingsRef = useRef(onSettings);
  onSettingsRef.current = onSettings;
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

  // Keep caller lookup alive on Settings too — AdminDashboard unmounts there, so
  // without this a ring while in Settings never stashes/searches on return.
  useEffect(() => {
    if (!user || !isAdmin) return;

    let cancelled = false;
    let cleanupLocal: (() => void) | null = null;
    let cleanupShared: (() => void) | null = null;

    const goHomeAndSearch = (digits: string) => {
      navigate(
        adminDashboardLocation(buildAdminDashboardSearch({ search: digits }, '')),
        { replace: false }
      );
    };

    const onLocalCall = (digits: string, at: number) => {
      if (onSettingsRef.current) {
        deliverAdminIncomingCallSearch(
          digits,
          { offerNotFound: true, ringAt: at },
          false
        );
        goHomeAndSearch(digits);
        return;
      }
      const live = deliverAdminIncomingCallSearch(digits, {
        offerNotFound: true,
        ringAt: at,
      });
      if (!live && !hasAdminIncomingCallSearchHandler()) {
        goHomeAndSearch(digits);
      }
    };

    const onSharedCall = (digits: string, ringAt: number) => {
      if (onSettingsRef.current) {
        deliverAdminIncomingCallSearch(
          digits,
          { offerNotFound: false, ringAt },
          false
        );
        goHomeAndSearch(digits);
        return;
      }
      const live = deliverAdminIncomingCallSearch(digits, {
        offerNotFound: false,
        ringAt,
      });
      if (!live && !hasAdminIncomingCallSearchHandler()) {
        goHomeAndSearch(digits);
      }
    };

    void import('@/lib/adminIncomingCall').then(async ({ initAdminCallerLookup }) => {
      if (cancelled) return;
      const dispose = await initAdminCallerLookup((digits, { at }) =>
        onLocalCall(digits, at)
      );
      if (cancelled) dispose();
      else cleanupLocal = dispose;
    });

    void import('@/lib/adminSharedIncomingCall').then(({ initAdminSharedCallLookup }) => {
      if (cancelled) return;
      const dispose = initAdminSharedCallLookup((digits, ringAt) =>
        onSharedCall(digits, ringAt)
      );
      if (cancelled) dispose();
      else cleanupShared = dispose;
    });

    return () => {
      cancelled = true;
      cleanupLocal?.();
      cleanupShared?.();
    };
  }, [user, isAdmin, navigate]);

  // Returning from Settings (or landing on /admin): pick up a ring that was
  // stored natively while the dashboard was unmounted and never resumed.
  useEffect(() => {
    if (!user || !isAdmin || onSettings) return;
    let cancelled = false;

    void (async () => {
      const [{ consumePendingAdminIncomingCall }, { checkSharedIncomingCall }] =
        await Promise.all([
          import('@/lib/adminIncomingCall'),
          import('@/lib/adminSharedIncomingCall'),
        ]);
      if (cancelled) return;

      const fresh = await consumePendingAdminIncomingCall();
      if (cancelled) return;
      if (fresh) {
        const live = deliverAdminIncomingCallSearch(fresh.digits, {
          offerNotFound: true,
          ringAt: fresh.at,
        });
        if (!live) {
          navigate(
            adminDashboardLocation(
              buildAdminDashboardSearch({ search: fresh.digits }, '')
            ),
            { replace: true }
          );
        }
        return;
      }

      await checkSharedIncomingCall((digits, ringAt) => {
        if (cancelled) return;
        const live = deliverAdminIncomingCallSearch(digits, {
          offerNotFound: false,
          ringAt,
        });
        if (!live) {
          navigate(
            adminDashboardLocation(buildAdminDashboardSearch({ search: digits }, '')),
            { replace: true }
          );
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, onSettings, navigate]);

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
