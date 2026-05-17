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

/** Role only when explicitly set on JWT metadata (no default — avoids misclassifying technicians as admins). */
function jwtMetadataRole(
  user: SupabaseUser | null | undefined
): 'admin' | 'technician' | null {
  if (!user) return null;
  const raw = user.app_metadata?.role ?? user.user_metadata?.role;
  if (raw === 'technician') return 'technician';
  if (raw === 'admin') return 'admin';
  return null;
}

/**
 * Resolve portal role for the signed-in Auth user.
 * Legacy technician Auth users may omit role on JWT; those rows use auth.users.id = technicians.id.
 */
export async function resolveSessionRoleFromSupabaseUser(
  user: SupabaseUser
): Promise<'admin' | 'technician'> {
  const direct = jwtMetadataRole(user);
  if (direct !== null) return direct;

  const { data, error } = await supabase
    .from('technicians')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && data) return 'technician';
  return 'admin';
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
    const role = await resolveSessionRoleFromSupabaseUser(session.user);
    if (!isSessionRoleAllowedForPortal(role, expectedPortal)) {
      await supabase.auth.signOut();
      clearAuthSession();
    }
  } catch {
    clearAuthSession();
  }
}
