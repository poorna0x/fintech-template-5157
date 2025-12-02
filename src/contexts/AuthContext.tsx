import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { authenticateUser, setAuthSession, getAuthSession, clearAuthSession, isTechnicianEmail } from '@/lib/auth';
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
    // Check for existing session on app load with timeout
    const checkSession = async () => {
      // Set a timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Session check timeout - proceeding without session');
        setLoading(false);
        setInitialized(true);
      }, 10000); // 10 second timeout

      try {
        // First check custom auth session (for technicians) - this is synchronous
        const customSession = getAuthSession();
        if (customSession) {
          clearTimeout(timeoutId);
          setUser(customSession);
          setLoading(false);
          technicianSessionRef.current = true;
          setInitialized(true);
          return;
        }

        // Then check Supabase auth session (for admins) with timeout
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((_, reject) => 
          setTimeout(() => reject(new Error('Session check timeout')), 8000)
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
        // Log errors in development for debugging
        if (import.meta.env.DEV) {
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
          // try to restore it (iOS PWA might have cleared it temporarily)
          // This shouldn't happen, but if it does, we'll detect it
          console.warn('Technician session missing from localStorage, but user state exists');
        }
      } catch (error) {
        console.error('Error restoring session from storage:', error);
      }
    };

    // Attempt to restore immediately if user is missing post-initialization
    if (initialized && !user) {
      restoreSessionFromStorage();
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
    try {
      setLoading(true);
      
      // First try custom authentication (for technicians)
      const customUser = await authenticateUser(email, password);
      if (customUser) {
        console.log('Technician authentication successful:', customUser);
        
        // Ensure any existing Supabase session is cleared so it doesn't override technician auth on reload
        try {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError && import.meta.env.DEV) {
            console.warn('Warning clearing Supabase session after technician login:', signOutError);
          }
        } catch (signOutErr) {
          if (import.meta.env.DEV) {
            console.warn('Failed to clear Supabase session after technician login:', signOutErr);
          }
        }
        
        setUser(customUser);
        setAuthSession(customUser);
        technicianSessionRef.current = true;
        toast.success(`Welcome back, ${customUser.fullName || customUser.email}!`);
        return true;
      }

      // Before trying Supabase auth, check if this email belongs to a technician
      // If it does, don't try Supabase auth (even if technician auth failed)
      const isTechnician = await isTechnicianEmail(email);
      
      if (isTechnician) {
        console.log('Email belongs to a technician - not trying Supabase auth');
        toast.error('Invalid credentials. Please check your email and password.');
        return false;
      }
      
      // If not a technician, try Supabase auth (for admins only)
      console.log('Not a technician email, trying Supabase auth for admin...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
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
        console.log('Supabase auth successful, user role:', userRole);
        setUser(user);
        technicianSessionRef.current = false;
        toast.success(`Welcome back, ${user.fullName || user.email}!`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Clear custom auth session (for technicians)
      clearAuthSession();
      technicianSessionRef.current = false;
      
      // Sign out from Supabase auth (for admins)
      await supabase.auth.signOut();
      
      setUser(null);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed');
    }
  };

  const value: AuthContextType = {
    user,
    loading: loading || !initialized,
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
