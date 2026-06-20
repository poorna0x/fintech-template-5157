import { supabase } from './supabaseClient';

/** Refresh access token when within this many seconds of expiry. */
const SESSION_REFRESH_BUFFER_SEC = 120;

function sessionAccessToken(
  session: { access_token?: string; expires_at?: number } | null | undefined
): string | null {
  if (!session?.access_token) return null;
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt <= nowSec) return null;
  return session.access_token;
}

function sessionExpiresWithinBuffer(session: { expires_at?: number } | null | undefined): boolean {
  if (!session) return true;
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  return expiresAt - nowSec < SESSION_REFRESH_BUFFER_SEC;
}

export type EnsureSessionResult =
  | { ok: true }
  | { ok: false; reason: 'no_session' | 'refresh_failed' };

/**
 * Ensures a valid Supabase Auth session before authenticated writes (e.g. GPS upload).
 * Avoids PostgREST running as `anon` when the access token expired mid-request.
 */
export async function ensureSupabaseSessionForWrite(): Promise<EnsureSessionResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error || !refreshed) {
      return { ok: false, reason: 'no_session' };
    }
    return { ok: true };
  }

  if (sessionExpiresWithinBuffer(session)) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (refreshed && sessionAccessToken(refreshed)) {
      return { ok: true };
    }
    // Refresh failed — still OK if current access token is not expired yet
    if (sessionAccessToken(session)) {
      return { ok: true };
    }
    return { ok: false, reason: error ? 'refresh_failed' : 'no_session' };
  }

  return { ok: true };
}

/** Fresh user JWT for Netlify function calls (email, AMC save, etc.). */
export async function resolveSupabaseAccessTokenForApi(): Promise<string | null> {
  const { data: { session: current } } = await supabase.auth.getSession();

  if (!current) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return sessionAccessToken(refreshed);
  }

  if (sessionExpiresWithinBuffer(current)) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    const freshToken = sessionAccessToken(refreshed);
    if (freshToken) return freshToken;
  }

  return sessionAccessToken(current);
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
      ? 'Session expired — location will retry after you sign in again.'
      : 'Your session expired. Please sign out and sign in again, then update your location.';
  }

  const errObj =
    error && typeof error === 'object'
      ? (error as { message?: string; code?: string })
      : null;

  if (isPostgrestPermissionDenied(errObj)) {
    return options?.autoUpdate
      ? 'Could not upload location — please open the app and sign in again.'
      : 'Could not upload location — your session may have expired. Please sign in again.';
  }

  const msg =
    error instanceof Error
      ? error.message
      : errObj?.message ?? 'Unknown error';

  return `Location captured but failed to upload to server. Please check your internet connection and try again. Error: ${msg}`;
}
