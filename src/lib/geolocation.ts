export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

export function isGeolocationPositionError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as GeolocationPositionError).code === 'number'
  );
}

export function geolocationFailureMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Permission denied. Allow location access for this site.';
    case error.POSITION_UNAVAILABLE:
      return 'Location information unavailable. Check your device location settings.';
    case error.TIMEOUT:
      return 'Location request timed out. Please try again.';
    default:
      return 'Failed to get your location.';
  }
}

function readPosition(position: GeolocationPosition): DeviceLocation {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
  };
}

function getCurrentPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Reliable browser geolocation for admin/CRM distance features.
 * Tries a fast network/cached fix first (works on desktops), then GPS if needed.
 */
export async function getDeviceLocation(): Promise<DeviceLocation> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser');
  }

  // Fast path — Wi‑Fi / IP / recent cache (no GPS wait on laptops).
  try {
    const position = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 25000,
      maximumAge: 300000,
    });
    return readPosition(position);
  } catch (firstError) {
    if (isGeolocationPositionError(firstError) && firstError.code === firstError.PERMISSION_DENIED) {
      throw firstError;
    }
  }

  // GPS fallback — slower but more precise on phones.
  const position = await getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 45000,
    maximumAge: 300000,
  });
  return readPosition(position);
}
