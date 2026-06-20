import { supabase } from './supabaseClient';

/** Refresh access token when within this many seconds of expiry. */
const SESSION_REFRESH_BUFFER_SEC = 60;

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

  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < SESSION_REFRESH_BUFFER_SEC) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error || !refreshed) {
      return { ok: false, reason: 'refresh_failed' };
    }
  }

  return { ok: true };
}

/** Fresh user JWT for Netlify function calls (email, AMC save, etc.). */
export async function resolveSupabaseAccessTokenForApi(): Promise<string | null> {
  const ready = await ensureSupabaseSessionForWrite();
  if (!ready.ok) return null;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  const token =
    refreshed.session?.access_token ??
    (await supabase.auth.getSession()).data.session?.access_token ??
    null;

  if (!token && refreshError) return null;
  return token;
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
