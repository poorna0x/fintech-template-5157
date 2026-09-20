/** Google Maps Distance Matrix helpers (lazy script load + driving distance). */

export type LatLng = { lat: number; lng: number };

export type DrivingDistanceResult = {
  distance: string;
  duration: string;
  distanceMeters: number;
  durationSeconds: number;
  isApproximate?: boolean;
};

let loadPromise: Promise<void> | null = null;

export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

function formatDistanceText(meters: number, fallbackText?: string): string {
  if (meters > 0 && meters < 1000) return `${(meters / 1000).toFixed(2)} km`;
  return fallbackText || formatDistanceKm(meters);
}

export function ensureGoogleMapsDistanceMatrixLoaded(): Promise<void> {
  if (
    (window as any).google?.maps?.DistanceMatrixService
  ) {
    return Promise.resolve();
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      loadPromise = null;
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    const isReady = () =>
      Boolean(
        (window as any).google?.maps?.DistanceMatrixService
      );

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const started = Date.now();
      const check = () => {
        if (isReady()) {
          resolve();
          return;
        }
        if (Date.now() - started > 10_000) {
          loadPromise = null;
          reject(new Error('Google Maps failed to load'));
          return;
        }
        window.setTimeout(check, 100);
      };
      check();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      const started = Date.now();
      const check = () => {
        if (isReady()) {
          resolve();
          return;
        }
        if (Date.now() - started > 5_000) {
          loadPromise = null;
          reject(new Error('DistanceMatrixService not available'));
          return;
        }
        window.setTimeout(check, 100);
      };
      check();
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

function requestDistanceMatrix(
  origin: LatLng,
  dest: LatLng,
  travelMode: string
): Promise<any | null> {
  return new Promise((resolve) => {
    const g = (window as any).google;
    const service = new g.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [dest],
        travelMode,
        unitSystem: g.maps.UnitSystem.METRIC,
        ...(travelMode === g.maps.TravelMode.DRIVING ? { avoidTolls: true } : {}),
      },
      (response: any, status: string) => {
        if (status === g.maps.DistanceMatrixStatus.OK && response) {
          resolve(response);
          return;
        }
        resolve(null);
      }
    );
  });
}

function parseMatrixElement(response: any): DrivingDistanceResult | null {
  const g = (window as any).google;
  const el = response.rows[0]?.elements[0];
  if (!el || el.status !== g.maps.DistanceMatrixElementStatus.OK) return null;

  const distanceMeters = el.distance?.value ?? 0;
  const durationSeconds = el.duration?.value ?? 0;
  return {
    distance: formatDistanceText(distanceMeters, el.distance?.text),
    duration: el.duration?.text || '',
    distanceMeters,
    durationSeconds,
  };
}

/** Driving distance via Google Distance Matrix; optional straight-line fallback. */
export async function calculateDrivingDistance(
  origin: LatLng,
  dest: LatLng,
  options?: { fallbackToHaversine?: boolean }
): Promise<DrivingDistanceResult> {
  await ensureGoogleMapsDistanceMatrixLoaded();

  const g = (window as any).google;

  const driving = await requestDistanceMatrix(
    origin,
    dest,
    g.maps.TravelMode.DRIVING
  );
  if (driving) {
    const parsed = parseMatrixElement(driving);
    if (parsed) return parsed;

    const el = driving.rows[0]?.elements[0];
    if (el?.status === g.maps.DistanceMatrixElementStatus.ZERO_RESULTS) {
      const bicycling = await requestDistanceMatrix(
        origin,
        dest,
        g.maps.TravelMode.BICYCLING
      );
      if (bicycling) {
        const bikeParsed = parseMatrixElement(bicycling);
        if (bikeParsed) return bikeParsed;
      }
    }
  }

  if (options?.fallbackToHaversine !== false) {
    const meters = haversineDistanceMeters(origin, dest);
    return {
      distance: formatDistanceKm(meters),
      duration: '',
      distanceMeters: meters,
      durationSeconds: 0,
      isApproximate: true,
    };
  }

  throw new Error('Route unavailable');
}

export type DrivingRoute = {
  path: google.maps.LatLngLiteral[];
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
};

const drivingRouteCache = new Map<string, DrivingRoute | null>();

export function drivingRouteCacheKey(origin: LatLng, dest: LatLng): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}>${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
}

function collectRoutePath(route: google.maps.DirectionsRoute): google.maps.LatLngLiteral[] {
  const path: google.maps.LatLngLiteral[] = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      for (const point of step.path || []) {
        path.push({ lat: point.lat(), lng: point.lng() });
      }
    }
  }
  if (path.length) return path;
  return (route.overview_path || []).map((point) => ({ lat: point.lat(), lng: point.lng() }));
}

function waitForDirectionsService(timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (window.google?.maps?.DirectionsService) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

function requestDirections(
  origin: LatLng,
  dest: LatLng,
  travelMode: google.maps.TravelMode
): Promise<google.maps.DirectionsResult | null> {
  return new Promise((resolve) => {
    const g = window.google;
    if (!g?.maps?.DirectionsService) {
      resolve(null);
      return;
    }
    const service = new g.maps.DirectionsService();
    service.route(
      {
        origin,
        destination: dest,
        travelMode,
        unitSystem: g.maps.UnitSystem.METRIC,
        ...(travelMode === g.maps.TravelMode.DRIVING ? { avoidTolls: true } : {}),
      },
      (result, status) => {
        if (String(status) === 'OK' && result) {
          resolve(result);
          return;
        }
        resolve(null);
      }
    );
  });
}

/** Road path for the map (Directions). DRIVING first, bicycle fallback like Distance Matrix. */
export async function fetchDrivingRoute(origin: LatLng, dest: LatLng): Promise<DrivingRoute | null> {
  const key = drivingRouteCacheKey(origin, dest);
  if (drivingRouteCache.has(key)) return drivingRouteCache.get(key) || null;

  const ready = await waitForDirectionsService();
  const g = window.google;
  if (!ready || !g?.maps?.DirectionsService) return null;

  let result = await requestDirections(origin, dest, g.maps.TravelMode.DRIVING);
  if (!result?.routes?.[0]) {
    result = await requestDirections(origin, dest, g.maps.TravelMode.BICYCLING);
  }
  const route = result?.routes?.[0];
  const leg = route?.legs?.[0];
  if (!route || !leg) return null;

  const parsed: DrivingRoute = {
    path: collectRoutePath(route),
    distanceMeters: leg.distance?.value ?? 0,
    durationText: leg.duration?.text || '',
    durationSeconds: leg.duration?.value ?? 0,
  };
  drivingRouteCache.set(key, parsed);
  return parsed;
}
