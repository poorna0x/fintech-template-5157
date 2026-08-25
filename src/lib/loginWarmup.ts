/** Warm Netlify function containers while the user fills the login form. */
export function warmNetlifyFunctions(): void {
  const urls = [
    '/.netlify/functions/secure-auth-login',
    '/.netlify/functions/secure-auth-passkey-login',
    '/.netlify/functions/altcha-verify',
  ];
  for (const url of urls) {
    fetch(url, { method: 'OPTIONS', credentials: 'include' }).catch(() => undefined);
  }
}
