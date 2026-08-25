type PasskeyErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  error_code?: string;
  error?: string;
  msg?: string;
  status?: number;
};

export function passkeyHostnameHint(hostname?: string): string | null {
  const host = (hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!host || host === 'hydrogenro.com' || host === 'www.hydrogenro.com') return null;
  return 'Passkeys are bound to hydrogenro.com. Enroll and sign in there — localhost and the Android app cannot use the same key.';
}

export function mapPasskeyError(err: unknown, fallback = 'Passkey request failed. Please try again.'): string {
  if (err == null) return fallback;
  if (typeof err === 'string' && err.trim()) return mapPasskeyError({ message: err }, fallback);

  const e = err as PasskeyErrorLike;
  const name = e.name || '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Passkey was cancelled.';
  }
  if (name === 'InvalidStateError') {
    return 'This passkey is already registered on this account.';
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return (
      passkeyHostnameHint() ||
      'This browser or site cannot use passkeys. Open https://hydrogenro.com in Safari or Chrome.'
    );
  }

  const code = String(e.code || e.error_code || e.error || '').toLowerCase();
  const message = String(e.msg || e.message || '').toLowerCase();
  const status = typeof e.status === 'number' ? e.status : 0;
  if (
    status === 404 ||
    status === 501 ||
    code.includes('passkey_disabled') ||
    code.includes('not_enabled') ||
    (message.includes('passkey') && message.includes('disabled'))
  ) {
    return 'Passkeys are not enabled yet. In Supabase → Authentication → Passkeys, turn them on for hydrogenro.com.';
  }
  if (e.msg && typeof e.msg === 'string' && e.msg.trim()) return e.msg;
  if (e.message && typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}
