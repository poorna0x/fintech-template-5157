/** Shared portal cookie verification (not an Edge Function — do not place under edge-functions/). */
export type PortalRole = 'admin' | 'technician';

const COOKIE_VERSION = 'v1';

function getSecret(): string {
  return (
    Netlify.env.get('PORTAL_SESSION_SECRET') ||
    Netlify.env.get('ALTCHA_HMAC_KEY') ||
    ''
  );
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function verifyPortalCookie(
  value: string | undefined
): Promise<{ ok: boolean; role?: PortalRole }> {
  const secret = getSecret();
  if (!value || !secret) return { ok: false };

  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return { ok: false };

  const payload = parts[1];
  const sig = parts[2];
  const expected = await hmacSign(`${COOKIE_VERSION}.${payload}`, secret);
  if (sig.length !== expected.length) return { ok: false };

  let match = 0;
  for (let i = 0; i < sig.length; i++) match |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (match !== 0) return { ok: false };

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payload));
    const data = JSON.parse(json) as { r?: string; exp?: number };
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return { ok: false };
    const role: PortalRole = data.r === 't' ? 'technician' : 'admin';
    return { ok: true, role };
  } catch {
    return { ok: false };
  }
}
