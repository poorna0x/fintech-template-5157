import { haversineKm, readLocationLatLng } from '@/lib/maps';

/** Pins farther than this need an explicit keep-this-location choice on merge. */
export const MERGE_LOCATION_CHOICE_METERS = 200;

export type MergeLocationFrom = 'primary' | 'secondary';

export function mergePinsDistanceMeters(a: unknown, b: unknown): number | null {
  const pa = readLocationLatLng(a);
  const pb = readLocationLatLng(b);
  if (!pa || !pb) return null;
  return haversineKm(pa.lat, pa.lng, pb.lat, pb.lng) * 1000;
}

export function mergePinsNeedChoice(a: unknown, b: unknown): boolean {
  const meters = mergePinsDistanceMeters(a, b);
  return meters != null && meters > MERGE_LOCATION_CHOICE_METERS;
}

export function formatMergePinDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function mergeLocationSummary(row: {
  visible_address?: string | null;
  address?: { street?: string; area?: string; city?: string } | null;
  location?: unknown;
}): string {
  const vis = String(row.visible_address || '').trim();
  if (vis) return vis;
  const addr = row.address;
  if (addr && typeof addr === 'object') {
    const parts = [addr.street, addr.area, addr.city]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  const pin = readLocationLatLng(row.location);
  if (pin) return `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
  return 'No map pin';
}
