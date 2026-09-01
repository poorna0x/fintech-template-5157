import { supabase } from './supabaseClient';

/** Refresh access token when within this many seconds of expiry. */
const SESSION_REFRESH_BUFFER_SEC = 120;

/** Clock skew tolerance when deciding if JWT is still usable. */
const ACCESS_TOKEN_SKEW_SEC = 15;

function accessTokenFromSession(
  session: { access_token?: string; expires_at?: number } | null | undefined
): string | null {
  if (!session?.access_token) return null;
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && expiresAt <= nowSec + ACCESS_TOKEN_SKEW_SEC) return null;
  return session.access_token;
}

function accessTokenNeedsRefresh(
  session: { access_token?: string; expires_at?: number } | null | undefined
): boolean {
  if (!session?.access_token) return true;
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && expiresAt <= nowSec + ACCESS_TOKEN_SKEW_SEC) return true;
  return expiresAt - nowSec < SESSION_REFRESH_BUFFER_SEC;
}

async function refreshStoredSession() {
  return supabase.auth.refreshSession();
}

/**
 * Validates JWT with Supabase Auth server and reloads session from storage.
 * More reliable than getSession() alone when the access token just expired.
 */
async function reloadSessionAfterGetUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function resolveFreshSession() {
  let { data: { session } } = await supabase.auth.getSession();

  if (!accessTokenNeedsRefresh(session)) {
    return session;
  }

  const { data: { session: refreshed }, error: refreshError } = await refreshStoredSession();
  if (refreshed && accessTokenFromSession(refreshed)) {
    return refreshed;
  }

  const afterUser = await reloadSessionAfterGetUser();
  if (afterUser && accessTokenFromSession(afterUser)) {
    return afterUser;
  }

  if (refreshed) return refreshed;
  if (session && accessTokenFromSession(session)) return session;

  void refreshError;
  return session;
}

export type EnsureSessionResult =
  | { ok: true }
  | { ok: false; reason: 'no_session' | 'refresh_failed' };

/**
 * Ensures a valid Supabase Auth session before authenticated writes (e.g. GPS upload).
 * Avoids PostgREST running as `anon` when the access token expired mid-request.
 */
export async function ensureSupabaseSessionForWrite(): Promise<EnsureSessionResult> {
  const session = await resolveFreshSession();
  if (accessTokenFromSession(session)) {
    return { ok: true };
  }
  return { ok: false, reason: session ? 'refresh_failed' : 'no_session' };
}

/** Fresh user JWT for Netlify function calls (email, AMC save, PDF, etc.). */
export async function resolveSupabaseAccessTokenForApi(): Promise<string | null> {
  const session = await resolveFreshSession();
  return accessTokenFromSession(session);
}

/** Best-effort background refresh — safe to call on app focus / interval. */
export async function refreshSupabaseSessionInBackground(): Promise<void> {
  try {
    await resolveFreshSession();
  } catch {
    /* non-blocking */
  }
}

export function isPostgrestPermissionDenied(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42501') return true;
  return /permission denied for table/i.test(error.message ?? '');
}

export function locationUploadErrorMessage(
  error: unknown,
  options?: { autoUpdate?: boolean; sessionExpired?: boolean }
): string {
  if (options?.sessionExpired) {
    return options.autoUpdate
      ? 'Session needs refresh — will retry automatically.'
      : 'Could not update right now. Switch back to the app and try again.';
  }

  const errObj =
    error && typeof error === 'object'
      ? (error as { message?: string; code?: string })
      : null;

  if (isPostgrestPermissionDenied(errObj)) {
    return options.autoUpdate
      ? 'Could not update — please open the app and sign in again.'
      : 'Could not update — your session may have expired. Please sign in again.';
  }

  const msg =
    error instanceof Error
      ? error.message
      : errObj?.message ?? 'Unknown error';

  return `Couldn’t finish updating. Check your internet and try again. Error: ${msg}`;
}
