import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | null;

interface AdminRoleResult {
  adminRole: AdminRole;
  isSuperAdmin: boolean;
  isManager: boolean;
  isAdminRole: boolean;
  isLoading: boolean;
}

const STORAGE_PREFIX = 'admin_role_v1:';

function readCached(email: string): AdminRole | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + email.toLowerCase());
    if (raw === null) return undefined;
    if (raw === '') return null;
    if (raw === 'SUPER_ADMIN' || raw === 'ADMIN' || raw === 'MANAGER') return raw;
    return undefined;
  } catch {
    return undefined;
  }
}

function writeCached(email: string, role: AdminRole) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + email.toLowerCase(), role ?? '');
  } catch {
    // ignore quota / privacy mode
  }
}

/**
 * Resolve the calling admin's granular role (SUPER_ADMIN | ADMIN | MANAGER)
 * by looking up public.admin_users by JWT email.
 *
 * - Cached per-tab in sessionStorage so we hit the DB at most once per login.
 * - Returns null for technicians or unauthenticated callers.
 * - This is UI-only access control. RLS still gates the underlying data.
 */
export function useAdminRole(): AdminRoleResult {
  const { user, isAdmin } = useAuth();
  const email = user?.email?.toLowerCase() || '';

  const [adminRole, setAdminRole] = useState<AdminRole>(() => {
    if (!isAdmin || !email) return null;
    return readCached(email) ?? null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!isAdmin || !email) return false;
    return readCached(email) === undefined;
  });

  useEffect(() => {
    if (!isAdmin || !email) {
      setAdminRole(null);
      setIsLoading(false);
      return;
    }

    const cached = readCached(email);
    if (cached !== undefined) {
      setAdminRole(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('admin_users')
        .select('role, is_active')
        .ilike('email', email)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data || data.is_active === false) {
        setAdminRole(null);
        writeCached(email, null);
        setIsLoading(false);
        return;
      }

      const role =
        data.role === 'SUPER_ADMIN' || data.role === 'ADMIN' || data.role === 'MANAGER'
          ? (data.role as AdminRole)
          : null;
      setAdminRole(role);
      writeCached(email, role);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, email]);

  return {
    adminRole,
    isSuperAdmin: adminRole === 'SUPER_ADMIN',
    isManager: adminRole === 'MANAGER',
    isAdminRole: adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN',
    isLoading,
  };
}

/** Clear cached admin roles (call on logout). */
export function clearAdminRoleCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}
