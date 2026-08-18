export type AuthPortal = 'admin' | 'technician' | 'public';

/** Public QR page — must not be treated as the technician app (/technician/*). */
export function isTechnicianIdCardPath(pathname: string): boolean {
  return pathname.startsWith('/technician-id/');
}

export function isTechnicianPortalPath(pathname: string): boolean {
  if (isTechnicianIdCardPath(pathname)) return false;
  return pathname === '/technician' || pathname.startsWith('/technician/');
}

export function getAuthPortal(pathname: string): AuthPortal {
  if (isTechnicianPortalPath(pathname)) return 'technician';
  if (pathname.startsWith('/admin') || pathname.startsWith('/settings')) {
    return 'admin';
  }
  return 'public';
}
