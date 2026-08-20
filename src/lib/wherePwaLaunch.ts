const STORAGE_KEY = 'hro_where_pwa_token_v1';
const TOKEN_RE = /^[A-Za-z0-9_-]{40,48}$/;

export function whereTokenFromPath(pathname: string): string | null {
  const m = String(pathname || '').match(/^\/where\/([A-Za-z0-9_-]{40,48})\/?$/);
  if (!m) return null;
  return TOKEN_RE.test(m[1]) ? m[1] : null;
}

export function wherePwaPath(token: string): string {
  return `/where/${encodeURIComponent(token)}`;
}

export function saveWherePwaToken(token: string): void {
  const t = String(token || '').trim();
  if (!TOKEN_RE.test(t)) return;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

export function readWherePwaToken(): string | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t && TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function buildWhereWebManifest(startPath: string) {
  const token = whereTokenFromPath(String(startPath || '').split('?')[0]);
  const start_url = token ? `/where/${token}` : '/where/';
  return {
    name: 'Office status',
    short_name: 'Office',
    description: 'See if they are in the office, or how long to arrive',
    id: start_url,
    scope: '/where/',
    start_url,
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: '#16a34a',
    theme_color: '#16a34a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    lang: 'en-IN',
    dir: 'ltr',
  };
}
