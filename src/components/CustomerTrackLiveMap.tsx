import { useEffect, useRef, useState } from 'react';

export type LatLng = { lat: number; lng: number };

type CustomerTrackLiveMapProps = {
  tech: LatLng;
  customer?: LatLng | null;
  /** Google encoded overview polyline from server Directions */
  routePolyline?: string | null;
  techLabel?: string;
  animate?: boolean;
};

/** Soft sky / water map — not default Google grey. */
const TRACK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#e8f4fc' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4b6478' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#b8d4e8' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8ebd8' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#c5d9e8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fef3c7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#fcd34d' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#7dd3fc' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#0369a1' }] },
];

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

function loadGoogleMapsJs(): Promise<typeof google.maps> {
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (g?.maps?.Map) {
      resolve(g.maps);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    const waitForMaps = () => {
      let attempts = 0;
      const t = setInterval(() => {
        attempts += 1;
        const maps = (window as any).google?.maps;
        if (maps?.Map) {
          clearInterval(t);
          resolve(maps);
        } else if (attempts >= 80) {
          clearInterval(t);
          reject(new Error('Google Maps failed to load (check API key referrer allowlist for /track)'));
        }
      }, 100);
    };

    if (existing) {
      waitForMaps();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => waitForMaps();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
}

function bikeIconUrl(): string {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="#0284c7" stroke="#fff" stroke-width="4"/>
      <g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="15" cy="31" r="5"/>
        <circle cx="33" cy="31" r="5"/>
        <path d="M15 31 L22 18 H28 L33 31"/>
        <path d="M22 18 L25 12 H31"/>
        <circle cx="25" cy="24" r="2" fill="#fff" stroke="none"/>
      </g>
    </svg>
  `);
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function homeIconUrl(): string {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r="17" fill="#ea580c" stroke="#fff" stroke-width="3.5"/>
      <path d="M12 20 L21 12 L30 20 V30 H12 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M18 30 V23 H24 V30" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
    </svg>
  `);
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function requestDrivingPath(
  maps: typeof google.maps,
  origin: LatLng,
  destination: LatLng
): Promise<LatLng[] | null> {
  return new Promise((resolve) => {
    try {
      const service = new maps.DirectionsService();
      service.route(
        {
          origin,
          destination,
          travelMode: maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status !== maps.DirectionsStatus.OK || !result?.routes?.[0]) {
            resolve(null);
            return;
          }
          const overview = result.routes[0].overview_path;
          if (overview?.length) {
            resolve(overview.map((p) => ({ lat: p.lat(), lng: p.lng() })));
            return;
          }
          resolve(null);
        }
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Zepto-style Google Map: custom colors, road route, animated bike marker.
 */
export default function CustomerTrackLiveMap({
  tech,
  customer,
  routePolyline,
  techLabel = 'Technician',
  animate = true,
}: CustomerTrackLiveMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const techMarkerRef = useRef<google.maps.Marker | null>(null);
  const customerMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const animRef = useRef<number | null>(null);
  const displayedTechRef = useRef<LatLng>(tech);
  const fittedRef = useRef(false);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Init Google Map once
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!hostRef.current) return;
      try {
        const maps = await loadGoogleMapsJs();
        if (cancelled || !hostRef.current) return;
        mapsRef.current = maps;

        const map = new maps.Map(hostRef.current, {
          center: tech,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          styles: TRACK_MAP_STYLES,
        });

        techMarkerRef.current = new maps.Marker({
          map,
          position: tech,
          title: techLabel,
          zIndex: 10,
          icon: {
            url: bikeIconUrl(),
            scaledSize: new maps.Size(48, 48),
            anchor: new maps.Point(24, 24),
          },
        });

        displayedTechRef.current = tech;
        mapRef.current = map;
        setReady(true);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not load Google Maps';
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      techMarkerRef.current?.setMap(null);
      customerMarkerRef.current?.setMap(null);
      routeLineRef.current?.setMap(null);
      techMarkerRef.current = null;
      customerMarkerRef.current = null;
      routeLineRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Customer pin
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !ready) return;

    if (!customer) {
      customerMarkerRef.current?.setMap(null);
      customerMarkerRef.current = null;
      return;
    }

    if (!customerMarkerRef.current) {
      customerMarkerRef.current = new maps.Marker({
        map,
        position: customer,
        title: 'Your location',
        zIndex: 5,
        icon: {
          url: homeIconUrl(),
          scaledSize: new maps.Size(42, 42),
          anchor: new maps.Point(21, 21),
        },
      });
    } else {
      customerMarkerRef.current.setPosition(customer);
    }
  }, [customer?.lat, customer?.lng, ready]);

  // Road route polyline (server encoded → client Directions fallback)
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !ready) return;

    let cancelled = false;

    void (async () => {
      let path: LatLng[] = [];
      if (routePolyline) {
        try {
          path = decodeGooglePolyline(routePolyline);
        } catch {
          path = [];
        }
      }

      if (!path.length && customer) {
        const fromDirections = await requestDrivingPath(maps, tech, customer);
        if (cancelled) return;
        if (fromDirections?.length) path = fromDirections;
      }

      if (cancelled) return;

      if (!path.length) {
        routeLineRef.current?.setMap(null);
        routeLineRef.current = null;
        return;
      }

      if (!routeLineRef.current) {
        routeLineRef.current = new maps.Polyline({
          map,
          path,
          geodesic: false,
          strokeColor: '#0284c7',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 2,
        });
      } else {
        routeLineRef.current.setPath(path);
        routeLineRef.current.setMap(map);
      }

      if (!fittedRef.current) {
        const bounds = new maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        bounds.extend(tech);
        if (customer) bounds.extend(customer);
        map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
        fittedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routePolyline, customer?.lat, customer?.lng, tech.lat, tech.lng, ready]);

  // Animate bike marker
  useEffect(() => {
    const marker = techMarkerRef.current;
    if (!marker || !ready) return;

    const from = displayedTechRef.current;
    const to = tech;
    const dist = Math.abs(from.lat - to.lat) + Math.abs(from.lng - to.lng);

    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    if (!animate || dist < 1e-7) {
      marker.setPosition(to);
      displayedTechRef.current = to;
      return;
    }

    const durationMs = Math.min(2200, Math.max(700, dist * 8_000_000));
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const e = 1 - Math.pow(1 - t, 3);
      const next = { lat: lerp(from.lat, to.lat, e), lng: lerp(from.lng, to.lng, e) };
      marker.setPosition(next);
      displayedTechRef.current = next;
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = null;
    };

    animRef.current = requestAnimationFrame(step);
  }, [tech.lat, tech.lng, animate, ready]);

  const openInMaps =
    customer != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${customer.lat},${customer.lng}&travelmode=driving`
      : `https://www.google.com/maps?q=${tech.lat},${tech.lng}`;

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        ref={hostRef}
        className="h-[280px] w-full bg-sky-50 sm:h-[320px]"
        aria-label="Live technician map"
      />
      {!ready && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-sky-50/80 text-xs text-slate-600">
          Loading Google Maps…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
          <p className="text-sm font-medium text-slate-800">Google Map could not load</p>
          <p className="text-xs text-slate-600">
            Add <span className="font-mono">https://hydrogenro.com/*</span> to your Maps API key
            HTTP referrer list in Google Cloud.
          </p>
          <a
            href={openInMaps}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-xs font-semibold text-sky-700 underline"
          >
            Open route in Google Maps
          </a>
        </div>
      ) : null}
    </div>
  );
}
