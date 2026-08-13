import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { extractMapsUrlFromText, isGoogleMapsUrl } from '@/lib/googleMapsLink';

export function parseLatLngFromWhatsAppLocationBody(
  body: string | null | undefined
): { lat: number; lng: number } | null {
  const m = String(body || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function isWhatsAppLocationMessage(row: {
  msg_type?: string | null;
  body?: string | null;
}): boolean {
  if (String(row.msg_type || '').toLowerCase() === 'location') return true;
  if (parseLatLngFromWhatsAppLocationBody(row.body) != null) return true;
  const mapsUrl = extractMapsUrlFromText(row.body || '');
  return Boolean(mapsUrl && isGoogleMapsUrl(mapsUrl));
}

export function isWhatsAppImageMessage(row: {
  msg_type?: string | null;
  media_mime?: string | null;
  media_url?: string | null;
}): boolean {
  if (!row.media_url) return false;
  return (
    row.msg_type === 'image' ||
    String(row.media_mime || '').startsWith('image/')
  );
}

type ApplyResult = { ok: boolean; error?: string; address?: string };

async function postApply(payload: Record<string, unknown>): Promise<ApplyResult> {
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch('/.netlify/functions/whatsapp-inbox-apply-to-customer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      address?: string;
    };
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || `HTTP ${res.status}`) };
    }
    return { ok: true, address: data.address };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export async function addWhatsAppPhotoToCustomerGallery(opts: {
  messageId: string;
  customerId?: string | null;
}): Promise<ApplyResult> {
  return postApply({
    action: 'gallery_photo',
    messageId: opts.messageId,
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
  });
}
