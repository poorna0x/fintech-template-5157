import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearAuthSession } from './auth';

export type AuthPortal = 'admin' | 'technician' | 'public';

export function getAuthPortal(pathname: string): AuthPortal {
  if (pathname.startsWith('/technician')) return 'technician';
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/calling')
  ) {
    return 'admin';
  }
  return 'public';
}

export function sessionRoleFromSupabaseUser(
  user: SupabaseUser | null | undefined
): 'admin' | 'technician' | null {
  if (!user) return null;
  const role = user.app_metadata?.role ?? user.user_metadata?.role ?? 'admin';
  return role === 'technician' ? 'technician' : 'admin';
}

export function isSessionRoleAllowedForPortal(
  role: 'admin' | 'technician' | null,
  portal: AuthPortal
): boolean {
  if (portal === 'public' || !role) return portal === 'public' || role === null;
  return role === portal;
}

/** Sign out Supabase session when it belongs to the other portal (admin vs technician). */
export async function clearWrongPortalSession(expectedPortal: AuthPortal): Promise<void> {
  if (expectedPortal === 'public') return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      clearAuthSession();
      return;
    }
    const role = sessionRoleFromSupabaseUser(session.user);
    if (!isSessionRoleAllowedForPortal(role, expectedPortal)) {
      await supabase.auth.signOut();
      clearAuthSession();
    }
  } catch {
    clearAuthSession();
  }
}
