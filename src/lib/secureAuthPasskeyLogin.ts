import { supabase } from './supabaseClient';
import { isPWAMode } from './pwa';
import { createPasskeyAssertion, mapPasskeyError } from './passkeys';
import type { WebAuthnRequestOptionsJSON } from './webauthnJson';
import type { SecureAuthLoginResult } from './secureAuthLogin';

function loginFetchTimeoutMs(): number {
  if (typeof window !== 'undefined' && isPWAMode()) return 60_000;
  return 25_000;
}

async function postPasskeyGate(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/.netlify/functions/secure-auth-passkey-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

function failFromResponse(
  res: Response,
  data: Record<string, unknown>
): SecureAuthLoginResult {
  if (res.status === 429) {
    return {
      ok: false,
      locked: true,
      retryAfter:
        (typeof data.retryAfter === 'number' ? data.retryAfter : undefined) ??
        parseInt(res.headers.get('Retry-After') || '900', 10),
      error: String(data.message || data.error || 'Too many attempts. Please try again later.'),
    };
  }
  return {
    ok: false,
    error: String(data.error || data.message || 'Passkey sign-in failed.'),
    remainingAttempts: typeof data.remainingAttempts === 'number' ? data.remainingAttempts : undefined,
    locked: data.locked === true,
  };
}

/**
 * Admin passkey login via rate-limited Netlify proxy (ALTCHA + optional Turnstile).
 * WebAuthn runs in the browser; GoTrue verify stays on the server.
 */
export async function secureAuthPasskeyLogin(
  altchaLoginToken: string,
  altchaPayload?: string,
  captchaToken?: string
): Promise<SecureAuthLoginResult> {
  const timeoutMs = loginFetchTimeoutMs();

  try {
    const start = await postPasskeyGate(
      {
        step: 'start',
        altchaLoginToken,
        altchaPayload,
        captchaToken: captchaToken || undefined,
      },
      timeoutMs
    );
    if (!start.res.ok) return failFromResponse(start.res, start.data);

    const challengeId = String(start.data.challenge_id || '');
    const options = start.data.options as WebAuthnRequestOptionsJSON | undefined;
    if (!challengeId || !options) {
      return { ok: false, error: 'Could not start passkey sign-in.' };
    }

    let credential: Record<string, unknown>;
    try {
      credential = await createPasskeyAssertion(options);
    } catch (err) {
      return { ok: false, error: mapPasskeyError(err, 'Passkey sign-in was cancelled.') };
    }

    const verify = await postPasskeyGate(
      {
        step: 'verify',
        altchaLoginToken,
        altchaPayload,
        challenge_id: challengeId,
        credential,
      },
      timeoutMs
    );
    if (!verify.res.ok) return failFromResponse(verify.res, verify.data);

    const access_token = String(verify.data.access_token || '');
    const refresh_token = String(verify.data.refresh_token || '');
    if (!access_token || !refresh_token) {
      return { ok: false, error: 'Passkey sign-in failed. Please try again.' };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) {
      return { ok: false, error: sessionError.message };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'Login request timed out. Check your connection and try again.' };
    }
    if (e instanceof Error && e.name === 'NotAllowedError') {
      return { ok: false, error: mapPasskeyError(e) };
    }
    const msg = e instanceof Error ? e.message : 'Passkey sign-in failed';
    if (import.meta.env.DEV && msg.includes('Failed to fetch')) {
      return {
        ok: false,
        error: 'Cannot reach login service. Run npm run dev (Vite + Netlify functions).',
      };
    }
    return { ok: false, error: mapPasskeyError(e, msg) };
  }
}
