import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { authenticateUser, setAuthSession, getAuthSession, clearAuthSession } from '@/lib/auth';
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Check for existing session on app load
    const checkSession = async () => {
      try {
        // First check custom auth session (for technicians)
        const customSession = getAuthSession();
        if (customSession) {
          setUser(customSession);
          setLoading(false);
          return;
        }

        // Then check Supabase auth session (for admins)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role || 'admin';
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            role: userRole,
            fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name
          });
        }
      } catch (error) {
        // Silent error handling
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    checkSession();

    // Listen for Supabase auth changes (for admins)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role || 'admin';
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          role: userRole,
          fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      
      // First try custom authentication (for technicians)
      const customUser = await authenticateUser(email, password);
      if (customUser) {
        setUser(customUser);
        setAuthSession(customUser);
        toast.success(`Welcome back, ${customUser.fullName || customUser.email}!`);
        return true;
      }

      // If custom auth fails, try Supabase auth (for admins)
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
        setUser(user);
        toast.success(`Welcome back, ${user.fullName || user.email}!`);
        return true;
      }
      
      return false;
    } catch (error) {
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
