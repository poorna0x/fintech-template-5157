import { useMemo } from 'react';

export type LatLng = { lat: number; lng: number };

type CustomerTrackLiveMapProps = {
  tech: LatLng;
  customer?: LatLng | null;
  /** Unused here — road route comes from Google Maps directions embed. */
  routePolyline?: string | null;
  techLabel?: string;
  animate?: boolean;
};

/**
 * Google Maps directions embed (no Maps JavaScript API / no referrer allowlist needed).
 * Shows the real driving route between technician and customer.
 */
export default function CustomerTrackLiveMap({
  tech,
  customer,
}: CustomerTrackLiveMapProps) {
  const embedSrc = useMemo(() => {
    if (customer) {
      // Classic Google Maps directions embed — road route, interactive, no JS API key.
      const saddr = `${tech.lat},${tech.lng}`;
      const daddr = `${customer.lat},${customer.lng}`;
      return `https://maps.google.com/maps?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=d&hl=en&output=embed`;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(`${tech.lat},${tech.lng}`)}&z=15&hl=en&output=embed`;
  }, [tech.lat, tech.lng, customer?.lat, customer?.lng]);

  const openInMaps = useMemo(() => {
    if (customer) {
      return `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${customer.lat},${customer.lng}&travelmode=driving`;
    }
    return `https://www.google.com/maps?q=${tech.lat},${tech.lng}`;
  }, [tech.lat, tech.lng, customer?.lat, customer?.lng]);

  // Remount iframe when tech moves enough so the route refreshes.
  const iframeKey = customer
    ? `${tech.lat.toFixed(4)},${tech.lng.toFixed(4)}-${customer.lat.toFixed(4)},${customer.lng.toFixed(4)}`
    : `${tech.lat.toFixed(4)},${tech.lng.toFixed(4)}`;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <iframe
        key={iframeKey}
        title="Technician route on Google Maps"
        src={embedSrc}
        className="h-[280px] w-full border-0 sm:h-[320px]"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-sky-800 shadow-sm ring-1 ring-sky-100">
          Google Maps · live route
        </span>
        <a
          href={openInMaps}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-sky-700 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-sky-800"
        >
          Open in Maps
        </a>
      </div>
    </div>
  );
}

/** Kept for any callers that still import the decoder. */
export function decodeGooglePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
