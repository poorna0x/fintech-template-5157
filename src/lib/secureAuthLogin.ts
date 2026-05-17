import { supabase } from './supabase';
import { isPWAMode } from './pwa';

export type AuthPortal = 'admin' | 'technician';

export interface SecureAuthLoginResult {
  ok: boolean;
  error?: string;
  locked?: boolean;
  retryAfter?: number;
  remainingAttempts?: number;
}

function loginFetchTimeoutMs(): number {
  if (typeof window !== 'undefined' && isPWAMode()) return 35_000;
  return 25_000;
}

/**
 * Password login via rate-limited Netlify proxy (requires ALTCHA login token).
 * Sets Supabase session on success — do not call signInWithPassword from the client.
 */
export async function secureAuthLogin(
  email: string,
  password: string,
  altchaLoginToken: string,
  portal: AuthPortal,
  altchaPayload?: string
): Promise<SecureAuthLoginResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), loginFetchTimeoutMs());

  try {
    const res = await fetch('/.netlify/functions/secure-auth-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        altchaLoginToken,
        altchaPayload,
        portal,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      return {
        ok: false,
        locked: true,
        retryAfter: data.retryAfter ?? parseInt(res.headers.get('Retry-After') || '900', 10),
        error: data.message || data.error || 'Too many attempts. Please try again later.',
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || data.message || 'Invalid email or password',
        remainingAttempts: data.remainingAttempts,
        locked: data.locked === true,
      };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    if (sessionError) {
      return { ok: false, error: sessionError.message };
    }

    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'Login request timed out. Check your connection and try again.' };
    }
    const msg = e instanceof Error ? e.message : 'Login failed';
    if (import.meta.env.DEV && msg.includes('Failed to fetch')) {
      return {
        ok: false,
        error: 'Cannot reach login service. Run npm run dev (Vite + Netlify functions).',
      };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}
