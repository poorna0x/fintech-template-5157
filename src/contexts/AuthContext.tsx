import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import {
  setAuthSession,
  getAuthSession,
  clearAuthSession,
  purgeSupabaseAuthStorage,
  loginTechnician,
} from '@/lib/auth';
import { secureAuthLogin } from '@/lib/secureAuthLogin';
import { secureAuthPasskeyLogin } from '@/lib/secureAuthPasskeyLogin';
import type { AuthLoginResult } from '@/lib/loginResult';
import {
  getAuthPortal,
  resolveSessionRoleFromSupabaseUser,
  isSessionRoleAllowedForPortal,
  clearWrongPortalSession,
} from '@/lib/authPortal';
import { isPWAMode } from '@/lib/pwa';
import { formatWelcomeDisplayName } from '@/lib/welcomeDisplayName';
import { syncPortalSessionCookie } from '@/lib/syncPortalSession';
import { refreshSupabaseSessionInBackground } from '@/lib/ensureSupabaseSession';
import type { Session } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  fullName?: string;
  technicianId?: string;
}

interface AuthContextType {
  user: User | null;
  /** True only during the first session resolution on app load. */
  authInitializing: boolean;
  /** True while login() is in progress. */
  loading: boolean;
  login: (
    email: string,
    password: string,
    altchaLoginToken: string,
    altchaPayload?: string,
    captchaToken?: string
  ) => Promise<AuthLoginResult>;
  loginWithPasskey: (
    altchaLoginToken: string,
    altchaPayload?: string,
    captchaToken?: string
  ) => Promise<AuthLoginResult>;
  logout: () => Promise<void>;
  reconcileAuthPortal: (pathname: string) => Promise<void>;
  isAdmin: boolean;
  isTechnician: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function userFromSession(session: Session, role: 'admin' | 'technician'): User {
  const isTechnician = role === 'technician';
  return {
    id: session.user.id,
    email: session.user.email || '',
    role: isTechnician ? 'technician' : 'admin',
    fullName:
      session.user.user_metadata?.full_name || session.user.user_metadata?.name,
    technicianId: isTechnician ? session.user.id : undefined,
  };
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const technicianSessionRef = useRef(false);
  const loggingOutRef = useRef(false);
  const roleCacheRef = useRef<Map<string, 'admin' | 'technician'>>(new Map());
  const portalRef = useRef(getAuthPortal(typeof window !== 'undefined' ? window.location.pathname : '/'));

  const [user, setUser] = useState<User | null>(null);

  const [authInitializing, setAuthInitializing] = useState(true);
  const [loading, setLoading] = useState(false);

  const applySessionUser = useCallback(async (session: Session | null, portal = portalRef.current) => {
    if (loggingOutRef.current) return;

    if (!session?.user) {
      setUser(null);
      technicianSessionRef.current = false;
      return;
    }

    const cachedRole = roleCacheRef.current.get(session.user.id);
    const role =
      cachedRole ?? (await resolveSessionRoleFromSupabaseUser(session.user));
    roleCacheRef.current.set(session.user.id, role);
    if (!isSessionRoleAllowedForPortal(role, portal)) {
      setUser(null);
      technicianSessionRef.current = false;
      return;
    }

    const nextUser = userFromSession(session, role);
    setUser(nextUser);
    technicianSessionRef.current = nextUser.role === 'technician';
    if (nextUser.role === 'technician') {
      setAuthSession(nextUser);
    } else {
      clearAuthSession();
    }
    if (portal !== 'public') {
      void syncPortalSessionCookie();
    }
  }, []);

  const reconcileAuthPortal = useCallback(
    async (pathname: string) => {
      const portal = getAuthPortal(pathname);
      portalRef.current = portal;

      if (portal === 'public') return;

      const { data: { session } } = await supabase.auth.getSession();
      const role = session?.user ? await resolveSessionRoleFromSupabaseUser(session.user) : null;

      if (session?.user && role && !isSessionRoleAllowedForPortal(role, portal)) {
        await supabase.auth.signOut();
        clearAuthSession();
        setUser(null);
        technicianSessionRef.current = false;
        return;
      }

      await applySessionUser(session, portal);
    },
    [applySessionUser]
  );

  useEffect(() => {
    const pwa = isPWAMode();
    const isChromeMobile =
      typeof window !== 'undefined' &&
      /Chrome/i.test(navigator.userAgent) &&
      /Mobile|Android/i.test(navigator.userAgent);

    const sessionTimeoutMs = pwa ? 25_000 : isChromeMobile ? 12_000 : 12_000;
    const overallTimeoutMs = pwa ? 30_000 : isChromeMobile ? 14_000 : 15_000;

    let cancelled = false;
    let authInitSettled = false;
    let initialSessionUserId: string | null = null;
    /** Session already applied this boot — ignore later null INITIAL_SESSION / getSession races. */
    let establishedSessionUserId: string | null = null;
    let initialAuthEventDone = false;
    let getSessionCheckDone = false;

    const settleAuthInit = () => {
      if (cancelled || authInitSettled) return;
      authInitSettled = true;
      clearTimeout(timeoutId);
      setAuthInitializing(false);
    };

    const maybeSettleAuthInit = () => {
      if (!initialAuthEventDone || !getSessionCheckDone) return;
      settleAuthInit();
    };

    const timeoutId = setTimeout(() => {
      initialAuthEventDone = true;
      getSessionCheckDone = true;
      settleAuthInit();
    }, overallTimeoutMs);

    const restoreTechnicianFromLocalStorage = async () => {
      const stored = getAuthSession();
      if (stored?.role === 'technician' && portalRef.current === 'technician') {
        // Do not optimistically setUser — that painted the dashboard before refresh
        // finished and caused a home→login flash when the JWT was already gone.
        try {
          const refreshResult = await Promise.race([
            supabase.auth.refreshSession(),
            new Promise<{ data: { session: null } }>((resolve) =>
              setTimeout(() => resolve({ data: { session: null } }), 4_000)
            ),
          ]);
          if (cancelled || loggingOutRef.current) return;
          const refreshed = refreshResult.data.session;
          if (refreshed?.user) {
            await applySessionUser(refreshed);
            return;
          }
        } catch {
          /* fall through and clear */
        }
        if (cancelled || loggingOutRef.current) return;
        clearAuthSession();
        setUser(null);
        technicianSessionRef.current = false;
        return;
      }
      if (stored?.role !== 'technician') clearAuthSession();
      setUser(null);
      technicianSessionRef.current = false;
    };

    const resolveInitialSession = async (session: Session | null) => {
      if (session?.user) {
        if (initialSessionUserId === session.user.id) return;
        initialSessionUserId = session.user.id;
        establishedSessionUserId = session.user.id;
        await applySessionUser(session);
        return;
      }
      if (establishedSessionUserId) return;
      initialSessionUserId = null;
      await restoreTechnicianFromLocalStorage();
    };

    const checkSession = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((_, reject) =>
            setTimeout(() => reject(new Error('Session check timeout')), sessionTimeoutMs)
          ),
        ]);
        if (cancelled) return;

        await resolveInitialSession(result.data.session);
      } catch {
        if (!cancelled && import.meta.env.DEV) {
          console.warn('[Auth] Initial session check timed out');
        }
      } finally {
        if (cancelled) return;
        getSessionCheckDone = true;
        maybeSettleAuthInit();
      }
    };

    void checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (!loggingOutRef.current) {
          const stored = getAuthSession();
          if (stored?.role === 'technician' && portalRef.current === 'technician') {
            void supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
              if (refreshed?.user) {
                void applySessionUser(refreshed);
                return;
              }
              clearAuthSession();
              setUser(null);
              technicianSessionRef.current = false;
            });
            settleAuthInit();
            return;
          }
        }
        clearAuthSession();
        setUser(null);
        technicianSessionRef.current = false;
        roleCacheRef.current.clear();
        settleAuthInit();
        return;
      }

      if (event === 'INITIAL_SESSION') {
        void resolveInitialSession(session).finally(() => {
          if (cancelled) return;
          initialAuthEventDone = true;
          maybeSettleAuthInit();
        });
        return;
      }

      if (session?.user) {
        if (event === 'SIGNED_IN') {
          void applySessionUser(session).finally(() => {
            if (cancelled) return;
            initialAuthEventDone = true;
            getSessionCheckDone = true;
            settleAuthInit();
          });
          return;
        }
        if (event === 'TOKEN_REFRESHED') {
          void applySessionUser(session);
        }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [applySessionUser]);

  // Keep JWT fresh while the app is open — especially for technician PWA all-day use.
  useEffect(() => {
    if (!user) return;

    const refresh = () => {
      void refreshSupabaseSessionInBackground();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    const intervalId = window.setInterval(refresh, 45 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(intervalId);
    };
  }, [user?.id, user?.role]);

  const login = async (
    email: string,
    password: string,
    altchaLoginToken: string,
    altchaPayload?: string,
    captchaToken?: string
  ): Promise<AuthLoginResult> => {
    try {
      setLoading(true);

      if (!altchaLoginToken) {
        const msg = 'Complete security verification before signing in.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      // Route by login page only — do not call is_technician_email RPC (enumeration risk).
      // Wrong portal → secure-auth-login returns 403 with a redirect hint.
      const isTechnician =
        typeof window !== 'undefined' &&
        window.location.pathname.includes('/technician/login');

      if (isTechnician) {
        await clearWrongPortalSession('technician');
        const techResult = await loginTechnician(
          email,
          password,
          altchaLoginToken,
          altchaPayload,
          captchaToken
        );
        if (!techResult.ok || !techResult.user) {
          const err =
            techResult.error || 'Invalid credentials. Please check your email and password.';
          toast.error(err);
          return {
            ok: false,
            error: err,
            locked: techResult.locked,
            retryAfter: techResult.retryAfter,
            remainingAttempts: techResult.remainingAttempts,
          };
        }
        const techUser = techResult.user;
        setUser(techUser);
        setAuthSession(techUser);
        technicianSessionRef.current = true;
        portalRef.current = 'technician';
        if (techUser.technicianId) {
          void import('@/lib/technicianPush').then(({ registerTechnicianPushToken }) =>
            registerTechnicianPushToken(techUser.technicianId as string)
          );
        }
        toast.success(
          `Welcome back, ${formatWelcomeDisplayName({
            fullName: techUser.fullName,
            email: techUser.email,
          })}!`
        );
        return { ok: true };
      }

      await clearWrongPortalSession('admin');
      const authResult = await secureAuthLogin(
        email,
        password,
        altchaLoginToken,
        'admin',
        altchaPayload,
        captchaToken
      );

      if (!authResult.ok) {
        const err = authResult.error || 'Invalid email or password';
        toast.error(err);
        return {
          ok: false,
          error: err,
          locked: authResult.locked,
          retryAfter: authResult.retryAfter,
          remainingAttempts: authResult.remainingAttempts,
        };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const msg = 'Login failed. Please try again.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      const userRole =
        session.user.user_metadata?.role ||
        session.user.app_metadata?.role ||
        'admin';
      if (userRole === 'technician') {
        await supabase.auth.signOut();
        const msg = 'Use the technician login page for this account.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      const adminUser: User = {
        id: session.user.id,
        email: session.user.email || '',
        role: 'admin',
        fullName:
          session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      };
      setUser(adminUser);
      technicianSessionRef.current = false;
      clearAuthSession();
      portalRef.current = 'admin';
      toast.success(
        `Welcome back, ${formatWelcomeDisplayName({
          fullName: adminUser.fullName,
          email: adminUser.email,
        })}!`
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.';
      toast.error(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const loginWithPasskey = async (
    altchaLoginToken: string,
    altchaPayload?: string,
    captchaToken?: string
  ): Promise<AuthLoginResult> => {
    try {
      setLoading(true);

      if (!altchaLoginToken) {
        const msg = 'Complete security verification before signing in.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      await clearWrongPortalSession('admin');
      const authResult = await secureAuthPasskeyLogin(
        altchaLoginToken,
        altchaPayload,
        captchaToken
      );

      if (!authResult.ok) {
        const err = authResult.error || 'Passkey sign-in failed';
        toast.error(err);
        return {
          ok: false,
          error: err,
          locked: authResult.locked,
          retryAfter: authResult.retryAfter,
          remainingAttempts: authResult.remainingAttempts,
        };
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        const msg = 'Login failed. Please try again.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      const userRole = await resolveSessionRoleFromSupabaseUser(session.user);
      if (userRole === 'technician') {
        await supabase.auth.signOut();
        const msg = 'Use the technician login page for this account.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      const adminUser: User = {
        id: session.user.id,
        email: session.user.email || '',
        role: 'admin',
        fullName:
          session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      };
      setUser(adminUser);
      technicianSessionRef.current = false;
      clearAuthSession();
      portalRef.current = 'admin';
      void syncPortalSessionCookie();
      toast.success(
        `Welcome back, ${formatWelcomeDisplayName({
          fullName: adminUser.fullName,
          email: adminUser.email,
        })}!`
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Passkey sign-in failed. Please try again.';
      toast.error(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    loggingOutRef.current = true;
    try {
      // Native apps: drop this device's push token while the session is
      // still valid, so a logged-out phone stops getting notifications.
      // Each helper is a no-op in the browser / in the other app.
      try {
        const { unregisterAdminPushToken } = await import('@/lib/adminPush');
        await unregisterAdminPushToken();
      } catch {
        /* best-effort */
      }
      try {
        const { clearAdminBiometricLockOnLogout } = await import('@/lib/adminBiometricLock');
        clearAdminBiometricLockOnLogout();
      } catch {
        /* best-effort */
      }
      try {
        const { unregisterTechnicianPushToken } = await import('@/lib/technicianPush');
        await unregisterTechnicianPushToken();
      } catch {
        /* best-effort */
      }

      clearAuthSession();
      technicianSessionRef.current = false;
      setUser(null);
      setAuthInitializing(false);

      // Clear local JWT immediately so dashboard cannot re-hydrate from stale storage
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.warn('Supabase local signOut:', error);
      }
      purgeSupabaseAuthStorage();

      try {
        await fetch('/.netlify/functions/clear-portal-session', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        /* non-blocking */
      }

      try {
        const signOutPromise = supabase.auth.signOut();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sign out timeout')), 15_000)
        );
        await Promise.race([signOutPromise, timeoutPromise]);
      } catch (error) {
        console.warn('Supabase global signOut timeout or error:', error);
      }

      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      clearAuthSession();
      purgeSupabaseAuthStorage();
      setUser(null);
      setAuthInitializing(false);
      toast.error('Logged out (some cleanup may have failed)');
    } finally {
      loggingOutRef.current = false;
    }
  };

  const value: AuthContextType = {
    user,
    authInitializing,
    loading,
    login,
    loginWithPasskey,
    logout,
    reconcileAuthPortal,
    isAdmin: user?.role === 'admin',
    isTechnician: user?.role === 'technician',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
