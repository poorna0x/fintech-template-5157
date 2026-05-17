// Technician authentication system using database credentials
// Note: Admin authentication is handled by Supabase Auth (see AdminLogin.tsx)
import { supabase } from './supabase';
import { chromeStorage } from './storage';
import { getSupabaseConfigError } from './supabaseConfig';

const FUNCTION_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = FUNCTION_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out — check your connection or try again');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  technicianId?: string;
  fullName?: string;
}

// Track if technician was found (to prevent Supabase auth fallback)
let technicianFound = false;

export const authenticateUser = async (email: string, password: string): Promise<AuthUser | null> => {
  console.log('[auth.ts] 🔐 authenticateUser() called');
  console.log('[auth.ts] Email:', email);
  console.log('[auth.ts] Password length:', password.length);
  
  try {
    console.log('[auth.ts] Authenticating technician:', email);
    technicianFound = false; // Reset flag
    
    // Authenticate technician (admin auth is handled by Supabase Auth)
    
    // First, let's check if the technicians table has the required columns
    console.log('[auth.ts] Querying technicians table...');
    const { data: technician, error } = await supabase
      .from('technicians')
      .select('id, full_name, email, password, account_status')
      .eq('email', email.toLowerCase())
      .single();

    console.log('[auth.ts] Technician query result received');
    console.log('[auth.ts] Technician found:', technician ? { id: technician.id, email: technician.email, full_name: technician.full_name, account_status: technician.account_status, has_password: !!technician.password } : null);
    console.log('[auth.ts] Query error:', error);
    
    // If technician not found, return null (don't try Supabase auth - that's for admins only)
    if (error) {
      console.error('[auth.ts] ❌ Database error:', error);
      console.error('[auth.ts] Error code:', error.code);
      console.error('[auth.ts] Error message:', error.message);
      console.error('[auth.ts] Error details:', error.details);
      console.error('[auth.ts] Error hint:', error.hint);
      
      // If the error is about missing columns, let's try without them
      if (error.message.includes('password') || error.message.includes('account_status')) {
        console.log('[auth.ts] ⚠️ Missing password/account_status columns, trying without them...');
        const { data: techWithoutAuth, error: techError } = await supabase
          .from('technicians')
          .select('id, full_name, email')
          .eq('email', email.toLowerCase())
          .single();
        
        console.log('[auth.ts] Query without auth columns result:', { techWithoutAuth, techError });
        
        if (techWithoutAuth && !techError) {
          console.log('[auth.ts] ❌ Found technician but missing auth columns. Please run the SQL scripts to add password and account_status fields.');
          return null;
        }
      }
      // If technician not found in database, return null (don't try Supabase auth)
      console.log('[auth.ts] ❌ Technician not found in database - returning null (will not try Supabase auth)');
      return null;
    }
    
    // If no technician found, return null (don't try Supabase auth)
    if (!technician) {
      console.log('[auth.ts] ❌ No technician found with this email - returning null');
      technicianFound = false;
      return null;
    }
    
    // Mark that we found a technician
    technicianFound = true;
    console.log('[auth.ts] ✅ Technician found in database');
    
    if (technician) {
      // Check if password and account_status exist
      if (!technician.password) {
        console.log('[auth.ts] ❌ Technician found but no password set');
        return null;
      }
      
      console.log('[auth.ts] Checking account status:', technician.account_status);
      if (technician.account_status !== 'ACTIVE') {
        console.log('[auth.ts] ❌ Technician account is not active:', technician.account_status);
        return null;
      }
      
      console.log('[auth.ts] ✅ Account is active, proceeding with password verification...');
      
      // SECURE: Use server-side password verification instead of plaintext comparison
      // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const isHashed = technician.password.startsWith('$2a$') || 
                       technician.password.startsWith('$2b$') || 
                       technician.password.startsWith('$2y$');
      
      if (isHashed) {
        // Password is hashed - use server-side verification
        // Detect if we're on mobile/local network and use the correct API URL
        const apiUrl = '/.netlify/functions/verify-technician-password';

        try {
          console.log('[auth.ts] 🔐 Password is hashed, calling verification API...');
          console.log('[auth.ts] API URL:', apiUrl);
          console.log('[auth.ts] Request body:', { password_length: password.length, hashed_password_length: technician.password.length });
          
          const verifyResponse = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              password: password,
              hashedPassword: technician.password,
            }),
          });

          console.log('[auth.ts] Verification response received');
          console.log('[auth.ts] Response status:', verifyResponse.status);
          console.log('[auth.ts] Response ok:', verifyResponse.ok);
          
          if (!verifyResponse.ok) {
            console.error('[auth.ts] ❌ Password verification API error');
            console.error('[auth.ts] Status:', verifyResponse.status);
            console.error('[auth.ts] Status text:', verifyResponse.statusText);
            const errorText = await verifyResponse.text();
            console.error('[auth.ts] Error response body:', errorText);
            // If verification API is unavailable (404 or network error), show helpful error
            if (verifyResponse.status === 404 || verifyResponse.status === 0) {
              console.error('[auth.ts] ❌ Password verification API not found or unreachable.');
              console.error('[auth.ts] ⚠️ Make sure dev server is running: npm run dev:server');
              console.error('[auth.ts] ⚠️ API URL attempted:', apiUrl);
              throw new Error('Password verification service unavailable. Please ensure the development server is running on port 8888.');
            }
            return null;
          }

          const verifyResult = await verifyResponse.json();
          console.log('[auth.ts] Verification result:', verifyResult);
          console.log('[auth.ts] Verified:', verifyResult.verified);
          
          if (verifyResult.verified) {
            console.log('[auth.ts] ✅ Password verification successful - technician authenticated');
            const authUser = {
              id: technician.id,
              email: technician.email,
              role: 'technician' as const,
              technicianId: technician.id,
              fullName: technician.full_name
            };
            console.log('[auth.ts] Returning auth user:', { id: authUser.id, email: authUser.email, role: authUser.role });
            return authUser;
          } else {
            console.log('[auth.ts] ❌ Password verification failed');
            console.log('[auth.ts] Error from API:', verifyResult.error || 'Unknown error');
            return null;
          }
        } catch (verifyError: any) {
          console.error('[auth.ts] ❌ Password verification exception caught');
          console.error('[auth.ts] Error name:', verifyError?.name);
          console.error('[auth.ts] Error message:', verifyError?.message);
          console.error('[auth.ts] Error stack:', verifyError?.stack);
          // If verification API fails, we cannot verify hashed passwords
          // DO NOT fallback to plaintext - this would be a security issue
          // Since technician was found, we should NOT try Supabase auth
          console.error('[auth.ts] ❌ Cannot verify password - verification API unavailable');
          console.error('[auth.ts] ⚠️ Make sure dev server is running: npm run dev:server');
          console.error('[auth.ts] ⚠️ API URL attempted:', apiUrl);
          
          // Check if it's a network error (CORS, connection refused, etc.)
          if (verifyError.message?.includes('Failed to fetch') || verifyError.message?.includes('NetworkError') || verifyError.name === 'TypeError') {
            console.error('[auth.ts] ❌ Network error detected - cannot connect to verification service');
            throw new Error('Cannot connect to password verification service. Please ensure the development server is running on port 8888 and accessible from your network.');
          }
          
          // Throw error to prevent Supabase auth fallback
          throw new Error('Password verification failed - service unavailable');
        }
      } else {
        // Password is plaintext - compare directly (NOT RECOMMENDED for production)
        console.log('[auth.ts] ⚠️ Password is plaintext (not hashed) - comparing directly');
        if (technician.password === password) {
          console.log('[auth.ts] ✅ Password match (plaintext) - technician authenticated');
          const authUser = {
            id: technician.id,
            email: technician.email,
            role: 'technician' as const,
            technicianId: technician.id,
            fullName: technician.full_name
          };
          console.log('[auth.ts] Returning auth user:', { id: authUser.id, email: authUser.email, role: authUser.role });
          return authUser;
        } else {
          console.log('[auth.ts] ❌ Password mismatch (plaintext)');
          return null;
        }
      }
    }
    
    console.log('[auth.ts] ❌ No technician data to process - returning null');
    return null;
  } catch (error: any) {
    console.error('[auth.ts] ❌ Authentication exception caught');
    console.error('[auth.ts] Error name:', error?.name);
    console.error('[auth.ts] Error message:', error?.message);
    console.error('[auth.ts] Error stack:', error?.stack);
    // If technician was found but verification failed, throw error to prevent Supabase auth fallback
    if (technicianFound) {
      console.error('[auth.ts] ⚠️ Technician found but verification failed - re-throwing to prevent Supabase fallback');
      throw error; // Re-throw to prevent fallback to Supabase auth
    }
    return null;
  }
};

/** Create/update Supabase Auth user after password verified server-side (migration). */
export const provisionTechnicianAuthOnLogin = async (
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetchWithTimeout('/.netlify/functions/provision-technician-auth-on-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error || body?.hint || `HTTP ${res.status}`;
      if (import.meta.env.DEV) {
        console.error('[provisionTechnicianAuthOnLogin]', msg);
      }
      return { ok: false, error: msg };
    }
    return { ok: !!body?.ok };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    if (import.meta.env.DEV) {
      console.error('[provisionTechnicianAuthOnLogin]', msg);
    }
    return { ok: false, error: msg };
  }
};

/** Technician login via Supabase Auth (auth.users.id must equal technicians.id). */
export const loginTechnicianWithSupabase = async (
  email: string,
  password: string
): Promise<AuthUser | null> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (error || !data.user) {
    return null;
  }

  const role =
    data.user.app_metadata?.role || data.user.user_metadata?.role || 'technician';
  if (role !== 'technician') {
    await supabase.auth.signOut();
    return null;
  }

  const { data: tech, error: techError } = await supabase
    .from('technicians')
    .select('id, full_name, email, account_status')
    .eq('id', data.user.id)
    .single();

  if (techError || !tech || tech.account_status !== 'ACTIVE') {
    await supabase.auth.signOut();
    return null;
  }

  return {
    id: tech.id,
    email: tech.email,
    role: 'technician',
    technicianId: tech.id,
    fullName: tech.full_name,
  };
};

/**
 * Technician login — Supabase Auth only (no localStorage-only session).
 * 1. signInWithPassword (auth.users.id must equal technicians.id)
 * 2. If missing Auth user: provision via Netlify (verifies DB password, creates Auth user)
 * 3. signInWithPassword again — must succeed or login fails
 */
export const loginTechnician = async (
  email: string,
  password: string
): Promise<AuthUser | null> => {
  const configError = getSupabaseConfigError();
  if (configError) {
    throw new Error(configError);
  }

  let user = await loginTechnicianWithSupabase(email, password);
  if (user) return user;

  const provision = await provisionTechnicianAuthOnLogin(email, password);
  if (!provision.ok) {
    return null;
  }

  user = await loginTechnicianWithSupabase(email, password);
  return user;
};

/** True when the current Supabase session is a technician linked to technicians.id */
export async function hasTechnicianSupabaseSession(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const role =
    session.user.app_metadata?.role || session.user.user_metadata?.role || 'technician';
  return role === 'technician';
}

// Export a function to check if technician exists (to prevent Supabase auth fallback)
export const isTechnicianEmail = async (email: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('is_technician_email', {
      p_email: email.toLowerCase().trim(),
    });
    if (error) {
      if (import.meta.env.DEV) {
        console.warn('[isTechnicianEmail] RPC failed:', error.message);
      }
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
};

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
