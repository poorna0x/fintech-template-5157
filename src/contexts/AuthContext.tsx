import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { authenticateUser, setAuthSession, getAuthSession, clearAuthSession, isTechnicianEmail, type AuthUser } from '@/lib/auth';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  fullName?: string;
  technicianId?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isTechnician: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const technicianSessionRef = useRef(false);
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const existingSession = getAuthSession();
    if (existingSession) {
      technicianSessionRef.current = existingSession.role === 'technician';
      return existingSession;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Detect Chrome mobile for aggressive timeouts
    const isChromeMobile = typeof window !== 'undefined' && 
      /Chrome/i.test(navigator.userAgent) && 
      /Mobile|Android/i.test(navigator.userAgent);
    
    // Aggressive timeout for Chrome mobile (1 second), normal for others (2 seconds)
    const sessionTimeout = isChromeMobile ? 1000 : 2000;
    const overallTimeout = isChromeMobile ? 1500 : 3000;

    // Check for existing session on app load with aggressive timeout for Chrome mobile
    const checkSession = async () => {
      // Set a timeout to prevent infinite loading - VERY AGGRESSIVE for Chrome mobile
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Session check timeout - proceeding without session');
        setLoading(false);
        setInitialized(true);
      }, overallTimeout);

      try {
        // First check custom auth session (for technicians) - this is synchronous and fast
        const customSession = getAuthSession();
        if (customSession) {
          clearTimeout(timeoutId);
          setUser(customSession);
          setLoading(false);
          technicianSessionRef.current = true;
          setInitialized(true);
          return;
        }

        // Then check Supabase auth session (for admins) with aggressive timeout for Chrome mobile
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((_, reject) => 
          setTimeout(() => reject(new Error('Session check timeout')), sessionTimeout)
        );

        const result = await Promise.race([sessionPromise, timeoutPromise]);
        const { data: { session } } = result;
        
        clearTimeout(timeoutId);
        
        if (session?.user) {
          const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role || 'admin';
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            role: userRole,
            fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name
          });
          technicianSessionRef.current = false;
        }
      } catch (error) {
        clearTimeout(timeoutId);
        // Don't log timeout errors in production - they're expected on Chrome mobile
        if (import.meta.env.DEV && !(error instanceof Error && error.message.includes('timeout'))) {
          console.error('Auth session check error:', error);
        }
        // Don't block app loading on auth errors - user can still use the app
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        setInitialized(true);
      }
    };

    checkSession();

    // Listen for Supabase auth changes (for admins)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role || 'admin';
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          role: userRole,
          fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name
        });
        technicianSessionRef.current = false;
        setLoading(false);
        return;
      }

      const customSession = getAuthSession();
      if (customSession) {
        setUser(prev => {
          if (prev && prev.id === customSession.id && prev.role === customSession.role) {
            return prev;
          }
          return customSession;
        });
        technicianSessionRef.current = customSession.role === 'technician';
        setLoading(false);
        return;
      }

      // Only clear user if it's a SIGNED_OUT event AND no custom session exists
      // Don't clear on TOKEN_REFRESHED for technicians (they use localStorage, not Supabase tokens)
      if (event === 'SIGNED_OUT') {
        // Double-check for technician session before clearing
        const techSession = getAuthSession();
        if (!techSession) {
          setUser(null);
          setLoading(false);
          setInitialized(true); // Mark as initialized so login page can render
        }
      }
      // Don't clear user on TOKEN_REFRESHED - technicians don't use Supabase tokens
      // Don't clear on INITIAL_SESSION - let the session check handle it

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep technician session in sync from localStorage
  // This is especially important for iOS PWA where localStorage can be cleared
  useEffect(() => {
    const restoreSessionFromStorage = () => {
      try {
        const storedSession = getAuthSession();
        if (storedSession) {
          setUser(prev => {
            // Avoid unnecessary state updates if session is unchanged
            if (prev && prev.id === storedSession.id && prev.role === storedSession.role) {
              return prev;
            }
            return storedSession;
          });
          technicianSessionRef.current = storedSession.role === 'technician';
        } else if (user && user.role === 'technician') {
          // If we had a technician session but it's now missing from localStorage,
          // it was likely cleared by logout - clear user state
          console.log('Technician session cleared from localStorage, clearing user state');
          setUser(null);
          technicianSessionRef.current = false;
        }
      } catch (error) {
        console.error('Error restoring session from storage:', error);
      }
    };

    // Only attempt to restore if user is missing AND we're initialized
    // Don't restore if we're on login page (user should be null there)
    if (initialized && !user) {
      // Check if we're on a login page - if so, don't restore
      const isLoginPage = window.location.pathname.includes('/login');
      if (!isLoginPage) {
        restoreSessionFromStorage();
      }
    }

    // Listen for storage events (cross-tab sync)
    window.addEventListener('storage', restoreSessionFromStorage);
    
    // iOS PWA specific: Restore session when app comes back to foreground
    // iOS PWAs can clear localStorage when app goes to background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // App came back to foreground - restore session
        restoreSessionFromStorage();
      }
    };
    
    const handleFocus = () => {
      // Window regained focus - restore session
      restoreSessionFromStorage();
    };
    
    // Listen for visibility changes (iOS PWA)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    // Periodic check for iOS PWA (every 30 seconds)
    // iOS can clear localStorage without firing events
    const intervalId = setInterval(() => {
      if (user && user.role === 'technician') {
        const storedSession = getAuthSession();
        if (!storedSession) {
          // Session was cleared - try to restore from current user state
          // This is a fallback for iOS PWA localStorage clearing
          console.warn('Technician session cleared from localStorage, attempting to restore');
          try {
            setAuthSession(user);
          } catch (error) {
            console.error('Failed to restore session to localStorage:', error);
          }
        } else if (storedSession.id !== user.id) {
          // Session changed - update user state
          setUser(storedSession);
          technicianSessionRef.current = storedSession.role === 'technician';
        }
      } else if (!user) {
        // No user - try to restore
        restoreSessionFromStorage();
      }
    }, 30000); // Check every 30 seconds
    
    return () => {
      window.removeEventListener('storage', restoreSessionFromStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [initialized, user]);

  const login = async (email: string, password: string): Promise<boolean> => {
    console.log('[AuthContext] 🔐 login() called');
    console.log('[AuthContext] Email:', email);
    console.log('[AuthContext] Password length:', password.length);
    console.log('[AuthContext] Current path:', typeof window !== 'undefined' ? window.location.pathname : 'N/A');
    
    try {
      setLoading(true);
      console.log('[AuthContext] Set loading to true');
      
      // Detect Chrome mobile for timeout handling
      const isChromeMobile = typeof window !== 'undefined' && 
        /Chrome/i.test(navigator.userAgent) && 
        /Mobile|Android/i.test(navigator.userAgent);
      
      console.log('[AuthContext] Browser:', isChromeMobile ? 'Chrome Mobile' : 'Other');
      console.log('[AuthContext] Auth timeout:', isChromeMobile ? '10s' : '20s');
      
      // Add timeout wrapper for Chrome mobile
      console.log('[AuthContext] Calling authenticateUser()...');
      const authPromise = authenticateUser(email, password);
      const timeoutPromise = new Promise<AuthUser | null>((_, reject) => 
        setTimeout(() => reject(new Error('Authentication timeout')), isChromeMobile ? 10000 : 20000)
      );
      
      // First try custom authentication (for technicians)
      console.log('[AuthContext] Waiting for authenticateUser() response...');
      const customUser = await Promise.race([authPromise, timeoutPromise]);
      console.log('[AuthContext] authenticateUser() response received');
      console.log('[AuthContext] Custom user result:', customUser ? { id: customUser.id, email: customUser.email, role: customUser.role } : null);
      
      if (customUser) {
        console.log('[AuthContext] ✅ Technician authentication successful');
        console.log('[AuthContext] User details:', { id: customUser.id, email: customUser.email, role: customUser.role, fullName: customUser.fullName });
        
        // Ensure any existing Supabase session is cleared so it doesn't override technician auth on reload
        console.log('[AuthContext] Clearing any existing Supabase session...');
        try {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) {
            console.warn('[AuthContext] ⚠️ Warning clearing Supabase session after technician login:', signOutError);
          } else {
            console.log('[AuthContext] ✅ Supabase session cleared successfully');
          }
        } catch (signOutErr) {
          console.warn('[AuthContext] ⚠️ Failed to clear Supabase session after technician login:', signOutErr);
        }
        
        console.log('[AuthContext] Setting user state...');
        setUser(customUser);
        console.log('[AuthContext] Saving auth session to storage...');
        setAuthSession(customUser);
        technicianSessionRef.current = true;
        console.log('[AuthContext] ✅ Technician login complete, showing success toast...');
        toast.success(`Welcome back, ${customUser.fullName || customUser.email}!`);
        console.log('[AuthContext] Returning true');
        return true;
      }

      console.log('[AuthContext] Custom authentication returned null, checking if email belongs to technician...');
      // Before trying Supabase auth, check if this email belongs to a technician
      // If it does, don't try Supabase auth (even if technician auth failed)
      const isTechnician = await isTechnicianEmail(email);
      console.log('[AuthContext] isTechnicianEmail() result:', isTechnician);
      
      if (isTechnician) {
        console.log('[AuthContext] ❌ Email belongs to a technician but authentication failed - not trying Supabase auth');
        toast.error('Invalid credentials. Please check your email and password.');
        return false;
      }
      
      // If not a technician, try Supabase auth (for admins only)
      // BUT: Only do this if we're not on the technician login page
      // Check the current path to determine context
      const isTechnicianLoginPage = typeof window !== 'undefined' && 
        window.location.pathname.includes('/technician/login');
      
      console.log('[AuthContext] Is technician login page?', isTechnicianLoginPage);
      
      if (isTechnicianLoginPage) {
        // On technician login page - don't try admin auth
        console.log('[AuthContext] ❌ On technician login page - not trying Supabase auth for admin');
        toast.error('Invalid credentials. Please check your email and password.');
        return false;
      }
      
      console.log('[AuthContext] Not a technician email, trying Supabase auth for admin...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      console.log('[AuthContext] Supabase auth response received');
      console.log('[AuthContext] Supabase error:', error);
      console.log('[AuthContext] Supabase user:', data?.user ? { id: data.user.id, email: data.user.email } : null);

      if (error) {
        console.error('[AuthContext] ❌ Supabase auth error:', error.message);
        toast.error('Invalid email or password');
        return false;
      }

      if (data.user) {
        const userRole = data.user.user_metadata?.role || data.user.app_metadata?.role || 'admin';
        const user = {
          id: data.user.id,
          email: data.user.email || '',
          role: userRole,
          fullName: data.user.user_metadata?.full_name || data.user.user_metadata?.name
        };
        console.log('[AuthContext] ✅ Supabase auth successful');
        console.log('[AuthContext] User role:', userRole);
        console.log('[AuthContext] Setting user state...');
        setUser(user);
        technicianSessionRef.current = false;
        console.log('[AuthContext] ✅ Admin login complete, showing success toast...');
        toast.success(`Welcome back, ${user.fullName || user.email}!`);
        return true;
      }
      
      console.log('[AuthContext] ❌ No user data returned from Supabase');
      return false;
    } catch (error: any) {
      console.error('[AuthContext] ❌ Login exception caught:', error);
      console.error('[AuthContext] Error name:', error?.name);
      console.error('[AuthContext] Error message:', error?.message);
      console.error('[AuthContext] Error stack:', error?.stack);
      toast.error('Login failed. Please try again.');
      return false;
    } finally {
      console.log('[AuthContext] Login process finished, setting loading to false');
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Clear custom auth session (for technicians) - do this first
      clearAuthSession();
      technicianSessionRef.current = false;
      setUser(null); // Clear user state immediately
      setLoading(false); // Stop loading state
      setInitialized(true); // Mark as initialized so login page can render
      
      // Sign out from Supabase auth (for admins) with timeout
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign out timeout')), 5000)
      );
      
      try {
        await Promise.race([signOutPromise, timeoutPromise]);
      } catch (error) {
        // Even if signOut fails, we've already cleared local state
        console.warn('Supabase signOut timeout or error (non-critical):', error);
      }
      
      // Clear any Supabase session storage
      try {
        localStorage.removeItem('sb-' + (supabase as any).supabaseUrl?.split('//')[1]?.split('.')[0] + '-auth-token');
        // Also clear any other Supabase storage keys
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') && key.includes('auth')) {
            localStorage.removeItem(key);
          }
        });
      } catch (storageError) {
        console.warn('Error clearing Supabase storage:', storageError);
      }
      
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Even on error, clear local state
      clearAuthSession();
      setUser(null);
      setLoading(false);
      setInitialized(true);
      toast.error('Logged out (some cleanup may have failed)');
    }
  };

  const value: AuthContextType = {
    user,
    // Don't block login pages - they should render immediately
    // Only show loading for protected routes that need user data
    loading: loading && initialized === false, // Only loading if not initialized yet
    login,
    logout,
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
