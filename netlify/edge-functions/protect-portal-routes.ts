import type { Config, Context } from '@netlify/edge-functions';
import { verifyPortalCookie, type PortalRole } from '../edge-shared/portal-session-crypto.ts';

const COOKIE_NAME = 'hro_portal';

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
}

function isPublicPortalPath(pathname: string): boolean {
  return (
    pathname === '/admin/login' ||
    pathname === '/admin/login/' ||
    pathname === '/technician/login' ||
    pathname === '/technician/login/'
  );
}

function requiredPortalRole(pathname: string): PortalRole | null {
  if (pathname.startsWith('/technician-id/')) return null;
  if (pathname === '/technician' || pathname.startsWith('/technician/')) {
    if (isPublicPortalPath(pathname)) return null;
    return 'technician';
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (isPublicPortalPath(pathname)) return null;
    return 'admin';
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'admin';
  return null;
}

/** Dashboard entry URLs — SPA shows inline login; do not redirect to /admin/login. */
function isPortalDashboardEntry(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname === '/admin/' ||
    pathname === '/technician' ||
    pathname === '/technician/'
  );
}

function forbiddenResponse(): Response {
  return new Response('Forbidden — sign in required.', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function handler(request: Request, context: Context) {
  const url = new URL(request.url);
  const needed = requiredPortalRole(url.pathname);

  if (!needed) {
    return context.next();
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return context.next();
  }

  const cookies = parseCookies(request.headers.get('cookie'));
  const session = await verifyPortalCookie(cookies[COOKIE_NAME]);

  if (!session.ok) {
    if (isPortalDashboardEntry(url.pathname)) {
      return context.next();
    }
    return forbiddenResponse();
  }

  if (session.role !== needed) {
    return forbiddenResponse();
  }

  return context.next();
}

export const config: Config = {
  path: ['/admin', '/admin/*', '/technician', '/technician/*', '/settings', '/settings/*'],
};
