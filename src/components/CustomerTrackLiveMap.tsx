import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type LatLng = { lat: number; lng: number };

type CustomerTrackLiveMapProps = {
  tech: LatLng;
  customer?: LatLng | null;
  /** Google encoded overview polyline */
  routePolyline?: string | null;
  techLabel?: string;
  animate?: boolean;
};

/** Decode Google encoded polyline → lat/lng pairs. */
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

function bikeIconHtml(): string {
  return `
    <div class="hro-track-bike" style="
      width:44px;height:44px;border-radius:9999px;
      background:linear-gradient(135deg,#0ea5e9,#0284c7);
      box-shadow:0 6px 16px rgba(2,132,199,.45);
      border:3px solid #fff;display:flex;align-items:center;justify-content:center;
    ">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="5.5" cy="17.5" r="3" stroke="#fff" stroke-width="1.8"/>
        <circle cx="18.5" cy="17.5" r="3" stroke="#fff" stroke-width="1.8"/>
        <path d="M5.5 17.5 L10 9.5 L14 9.5 L18.5 17.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 9.5 L12 5.5 L15.5 5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12.5" r="1.2" fill="#fff"/>
      </svg>
    </div>`;
}

function homeIconHtml(): string {
  return `
    <div style="
      width:38px;height:38px;border-radius:9999px;
      background:linear-gradient(135deg,#f97316,#ea580c);
      box-shadow:0 6px 16px rgba(234,88,12,.4);
      border:3px solid #fff;display:flex;align-items:center;justify-content:center;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 10.5 L12 4 L20 10.5 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M10 20 V13 H14 V20" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
    </div>`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Zepto-style live track map: soft colored tiles, road route line,
 * animated bike marker for the technician, home pin for the customer.
 */
export default function CustomerTrackLiveMap({
  tech,
  customer,
  routePolyline,
  techLabel = 'Technician',
  animate = true,
}: CustomerTrackLiveMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const techMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const animRef = useRef<number | null>(null);
  const displayedTechRef = useRef<LatLng>(tech);
  const fittedRef = useRef(false);

  // Init map once
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([tech.lat, tech.lng], 14);

    // Soft blue/teal tiles — different from default Google grey
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const bikeIcon = L.divIcon({
      className: 'hro-track-bike-icon',
      html: bikeIconHtml(),
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    techMarkerRef.current = L.marker([tech.lat, tech.lng], {
      icon: bikeIcon,
      zIndexOffset: 600,
      title: techLabel,
    }).addTo(map);

    displayedTechRef.current = tech;
    mapRef.current = map;

    // Fix Leaflet sizing inside rounded card
    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
      techMarkerRef.current = null;
      customerMarkerRef.current = null;
      routeLineRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Customer pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!customer) {
      if (customerMarkerRef.current) {
        customerMarkerRef.current.remove();
        customerMarkerRef.current = null;
      }
      return;
    }

    const homeIcon = L.divIcon({
      className: 'hro-track-home-icon',
      html: homeIconHtml(),
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    if (!customerMarkerRef.current) {
      customerMarkerRef.current = L.marker([customer.lat, customer.lng], {
        icon: homeIcon,
        zIndexOffset: 500,
        title: 'Your location',
      }).addTo(map);
    } else {
      customerMarkerRef.current.setLatLng([customer.lat, customer.lng]);
    }
  }, [customer?.lat, customer?.lng]);

  // Route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let path: LatLng[] = [];
    if (routePolyline) {
      try {
        path = decodeGooglePolyline(routePolyline);
      } catch {
        path = [];
      }
    }
    if (!path.length && customer) {
      path = [displayedTechRef.current, customer];
    }

    if (!path.length) {
      if (routeLineRef.current) {
        routeLineRef.current.remove();
        routeLineRef.current = null;
      }
      return;
    }

    const latlngs = path.map((p) => [p.lat, p.lng] as L.LatLngExpression);

    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latlngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    } else {
      routeLineRef.current.setLatLngs(latlngs);
    }

    if (!fittedRef.current) {
      const bounds = L.latLngBounds(latlngs);
      if (customer) bounds.extend([customer.lat, customer.lng]);
      bounds.extend([tech.lat, tech.lng]);
      map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [routePolyline, customer?.lat, customer?.lng, tech.lat, tech.lng]);

  // Animate bike to new tech position
  useEffect(() => {
    const marker = techMarkerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;

    const from = displayedTechRef.current;
    const to = tech;
    const dist =
      Math.abs(from.lat - to.lat) + Math.abs(from.lng - to.lng);

    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    // Tiny / first move — snap
    if (!animate || dist < 1e-7) {
      marker.setLatLng([to.lat, to.lng]);
      displayedTechRef.current = to;
      return;
    }

    const durationMs = Math.min(2200, Math.max(700, dist * 8_000_000));
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const e = 1 - Math.pow(1 - t, 3);
      const lat = lerp(from.lat, to.lat, e);
      const lng = lerp(from.lng, to.lng, e);
      marker.setLatLng([lat, lng]);
      displayedTechRef.current = { lat, lng };
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };

    animRef.current = requestAnimationFrame(step);
  }, [tech.lat, tech.lng, animate]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        ref={hostRef}
        className="h-[280px] w-full sm:h-[320px]"
        aria-label="Live technician map"
      />
      <style>{`
        .hro-track-bike-icon, .hro-track-home-icon {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-control-attribution {
          font-size: 9px;
          background: rgba(255,255,255,.75) !important;
        }
      `}</style>
    </div>
  );
}
