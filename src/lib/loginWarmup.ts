/** Warm Netlify function containers while the user fills the login form. */
export function warmNetlifyFunctions(): void {
  const urls = [
    '/.netlify/functions/secure-auth-login',
    '/.netlify/functions/altcha-verify',
  ];
  for (const url of urls) {
    fetch(url, { method: 'OPTIONS', credentials: 'include' }).catch(() => undefined);
  }
}

export type LoginPortal = 'technician' | 'admin';

export interface FastLoginCaptcha {
  loginToken: string;
  payload: string;
}

/**
 * Server-issued ALTCHA login token (no client PoW). Only used when Turnstile is enabled;
 * Turnstile + lockout + rate limits remain the primary gates.
 */
export async function fetchFastLoginCaptcha(
  portal: LoginPortal
): Promise<FastLoginCaptcha | null> {
  try {
    const res = await fetch(`/.netlify/functions/altcha-verify?fast=${portal}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.loginToken !== 'string' || typeof data.payload !== 'string') {
      return null;
    }
    return { loginToken: data.loginToken, payload: data.payload };
  } catch {
    return null;
  }
}
