// Technician authentication system — Supabase Auth only.
// Note: Admin authentication is also Supabase Auth (see AdminLogin.tsx).
import { supabase } from './supabaseClient';
import { chromeStorage } from './storage';
import { getSupabaseConfigError } from './supabaseConfig';
import { secureAuthLogin } from './secureAuthLogin';
import type { AuthLoginResult } from './loginResult';

export type TechnicianLoginResult = AuthLoginResult & { user?: AuthUser };

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  technicianId?: string;
  fullName?: string;
}

/** Technician login via secure proxy (auth.users.id must equal technicians.id). */
export const loginTechnicianWithSupabase = async (
  email: string,
  password: string,
  altchaLoginToken: string,
  altchaPayload?: string,
  captchaToken?: string
): Promise<TechnicianLoginResult> => {
  const result = await secureAuthLogin(
    email,
    password,
    altchaLoginToken,
    'technician',
    altchaPayload,
    captchaToken
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      locked: result.locked,
      retryAfter: result.retryAfter,
      remainingAttempts: result.remainingAttempts,
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  const authUser = session?.user;
  if (!authUser) {
    return { ok: false, error: 'Login failed. Please try again.' };
  }

  const role =
    authUser.app_metadata?.role || authUser.user_metadata?.role || 'technician';
  if (role !== 'technician') {
    await supabase.auth.signOut();
    return { ok: false, error: 'Use the admin login page for this account.' };
  }

  const metaFullName =
    authUser.user_metadata?.full_name || authUser.user_metadata?.name;
  const metaEmail = authUser.email || '';

  if (metaFullName && metaEmail) {
    return {
      ok: true,
      user: {
        id: authUser.id,
        email: metaEmail,
        role: 'technician',
        technicianId: authUser.id,
        fullName: metaFullName,
      },
    };
  }

  const { data: tech, error: techError } = await supabase
    .from('technicians')
    .select('id, full_name, email, account_status')
    .eq('id', authUser.id)
    .single();

  if (techError || !tech || tech.account_status !== 'ACTIVE') {
    await supabase.auth.signOut();
    return { ok: false, error: 'Account is not active.' };
  }

  return {
    ok: true,
    user: {
      id: tech.id,
      email: tech.email,
      role: 'technician',
      technicianId: tech.id,
      fullName: tech.full_name,
    },
  };
};

/**
 * Technician login — Supabase Auth only (auth.users.id == technicians.id).
 *
 * The legacy "first login provisions Auth user from technicians.password" path
 * was removed alongside the `technicians.password` column drop (2026-05-24).
 * New technicians must be provisioned via Settings (which calls
 * `sync-technician-auth-user`) or `scripts/provision-technician-auth-users.mjs`
 * before they can log in.
 */
export const loginTechnician = async (
  email: string,
  password: string,
  altchaLoginToken: string,
  altchaPayload?: string,
  captchaToken?: string
): Promise<TechnicianLoginResult> => {
  const configError = getSupabaseConfigError();
  if (configError) {
    throw new Error(configError);
  }

  return loginTechnicianWithSupabase(
    email,
    password,
    altchaLoginToken,
    altchaPayload,
    captchaToken
  );
};

/** True when the current Supabase session is a technician linked to technicians.id */
export async function hasTechnicianSupabaseSession(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const role =
    session.user.app_metadata?.role || session.user.user_metadata?.role || 'technician';
  return role === 'technician';
}

/** Wait until admin Supabase JWT is available (needed before customers RLS queries). */
export async function ensureAdminSupabaseSession(maxWaitMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const role =
        session.user.app_metadata?.role ?? session.user.user_metadata?.role ?? 'admin';
      if (role !== 'technician') {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

// Simple session storage with Chrome-compatible fallback
export const setAuthSession = (user: AuthUser) => {
  try {
    const userString = JSON.stringify(user);
    chromeStorage.setItem('auth_user', userString);
    console.log('Session saved successfully');
  } catch (error) {
    console.error('💥 Error saving session:', error);
  }
};

export const getAuthSession = (): AuthUser | null => {
  try {
    const userData = chromeStorage.getItem('auth_user');
    
    if (!userData) {
      return null;
    }
    
    const user = JSON.parse(userData);
    
    // Validate user object has required fields
    if (!user || !user.id || !user.email || !user.role) {
      clearAuthSession();
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Error getting auth session:', error);
    clearAuthSession();
    return null;
  }
};

export const clearAuthSession = () => {
  try {
    chromeStorage.removeItem('auth_user');
    console.log('Session cleared');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};

/** Remove persisted Supabase JWT from storage when signOut is slow or fails (e.g. PWA). */
export const purgeSupabaseAuthStorage = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-')) keys.push(key);
    }
    keys.forEach((key) => chromeStorage.removeItem(key));
  } catch (error) {
    console.warn('[auth] purgeSupabaseAuthStorage failed:', error);
  }
};
