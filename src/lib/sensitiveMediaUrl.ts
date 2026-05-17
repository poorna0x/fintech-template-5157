import { supabase } from '@/lib/supabase';

const PRIMARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
const SECONDARY_CLOUD = import.meta.env.VITE_CLOUDINARY_SECONDARY_CLOUD_NAME || '';

const SENSITIVE_PATH_HINTS = ['payment', 'receipt', 'qr', 'bill', 'ro-service'];

/** Payment receipts (secondary) and service bills (primary) need signed delivery. */
export function isSensitiveMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return false;
  const m = url.match(/res\.cloudinary\.com\/([^/]+)\//);
  const cloud = m?.[1];
  if (cloud && (cloud === SECONDARY_CLOUD || cloud === PRIMARY_CLOUD)) return true;
  const lower = url.toLowerCase();
  return SENSITIVE_PATH_HINTS.some((h) => lower.includes(h));
}

const cache = new Map<string, { url: string; exp: number }>();

function getCached(url: string): string | undefined {
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.url;
  return undefined;
}

export async function resolveSensitiveMediaUrl(
  rawUrl: string | null | undefined
): Promise<string | null> {
  if (!rawUrl) return null;
  if (!isSensitiveMediaUrl(rawUrl)) return rawUrl;

  const cached = getCached(rawUrl);
  if (cached) return cached;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return rawUrl;

  try {
    const res = await fetch('/.netlify/functions/cloudinary-signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session.access_token,
        urls: [rawUrl],
        ttlSeconds: 3600,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return rawUrl;
    const signed = data?.signed?.[rawUrl];
    if (typeof signed === 'string' && signed.startsWith('http')) {
      cache.set(rawUrl, { url: signed, exp: Date.now() + 50 * 60 * 1000 });
      return signed;
    }
  } catch {
    /* fallback */
  }
  return rawUrl;
}

export async function resolveSensitiveMediaUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((u) => resolveSensitiveMediaUrl(u).then((r) => r || u)));
}
