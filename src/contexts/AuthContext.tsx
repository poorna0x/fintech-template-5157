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
import { supabase } from '@/lib/supabase';
import {
  setAuthSession,
  getAuthSession,
  clearAuthSession,
  purgeSupabaseAuthStorage,
  isTechnicianEmail,
  loginTechnician,
  hasTechnicianSupabaseSession,
} from '@/lib/auth';
import { secureAuthLogin } from '@/lib/secureAuthLogin';
import type { AuthLoginResult } from '@/lib/loginResult';
import {
  getAuthPortal,
  resolveSessionRoleFromSupabaseUser,
  isSessionRoleAllowedForPortal,
  clearWrongPortalSession,
} from '@/lib/authPortal';
import { isPWAMode } from '@/lib/pwa';
import { formatWelcomeDisplayName } from '@/lib/welcomeDisplayName';
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
    altchaPayload?: string
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

    const role = await resolveSessionRoleFromSupabaseUser(session.user);
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

    const sessionTimeoutMs = pwa ? 20_000 : isChromeMobile ? 8_000 : 12_000;
    const overallTimeoutMs = pwa ? 25_000 : isChromeMobile ? 10_000 : 15_000;

    let cancelled = false;

    const finishInit = () => {
      if (!cancelled) setAuthInitializing(false);
    };

    const timeoutId = setTimeout(finishInit, overallTimeoutMs);

    const checkSession = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((_, reject) =>
            setTimeout(() => reject(new Error('Session check timeout')), sessionTimeoutMs)
          ),
        ]);
        if (cancelled) return;

        const session = result.data.session;
        if (session?.user) {
          await applySessionUser(session);
        } else {
          const stored = getAuthSession();
          if (stored?.role === 'technician' && portalRef.current === 'technician') {
            setUser({
              id: stored.id,
              email: stored.email,
              role: 'technician',
              fullName: stored.fullName,
              technicianId: stored.technicianId,
            });
            technicianSessionRef.current = true;
          } else {
            if (stored?.role !== 'technician') clearAuthSession();
            setUser(null);
          }
        }
      } catch {
        // Do not wipe session on slow getSession (common in installed PWA); onAuthStateChange will reconcile
        if (!cancelled && import.meta.env.DEV) {
          console.warn('[Auth] Initial session check timed out');
        }
      } finally {
        clearTimeout(timeoutId);
        finishInit();
      }
    };

    void checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearAuthSession();
        setUser(null);
        technicianSessionRef.current = false;
        setAuthInitializing(false);
        return;
      }

      if (session?.user) {
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          void applySessionUser(session);
        }
        setAuthInitializing(false);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        setAuthInitializing(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [applySessionUser]);

  const login = async (
    email: string,
    password: string,
    altchaLoginToken: string,
    altchaPayload?: string
  ): Promise<AuthLoginResult> => {
    try {
      setLoading(true);

      if (!altchaLoginToken) {
        const msg = 'Complete security verification before signing in.';
        toast.error(msg);
        return { ok: false, error: msg };
      }

      const isTechnicianLoginPage =
        typeof window !== 'undefined' &&
        window.location.pathname.includes('/technician/login');
      const isTechnician = isTechnicianLoginPage || (await isTechnicianEmail(email));

      if (isTechnician) {
        await clearWrongPortalSession('technician');
        const techResult = await loginTechnician(
          email,
          password,
          altchaLoginToken,
          altchaPayload
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
        const linked = await hasTechnicianSupabaseSession();
        if (!linked) {
          const msg =
            'Login could not start a Supabase session. Ensure SUPABASE_SERVICE_ROLE_KEY is set on Netlify and try again.';
          toast.error(msg);
          await supabase.auth.signOut();
          return { ok: false, error: msg };
        }
        setUser(techUser);
        setAuthSession(techUser);
        technicianSessionRef.current = true;
        portalRef.current = 'technician';
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
        altchaPayload
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

  const logout = async (): Promise<void> => {
    loggingOutRef.current = true;
    try {
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
