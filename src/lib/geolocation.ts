import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

interface LocationRiskResult {
  isMockLocation?: boolean;
  riskLevel?: string;
  reasons?: string[];
  locationUsable?: boolean;
}

const LocationRisk = registerPlugin<{
  assessCurrent(): Promise<LocationRiskResult>;
}>('LocationRisk');

/** Shown when the admin (or booking) phone is using a mock location. */
export const MOCK_DEVICE_LOCATION_MESSAGE =
  'This phone is using a mock location, so it was not used. Turn off the mock-location app, then in Developer options set “Select mock location app” to Nothing, and try again.';

const UNSTEADY_DEVICE_LOCATION_MESSAGE =
  'This reading moved too far from the previous one to use. Wait for a steady GPS fix and try again.';

class UnusableDeviceLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnusableDeviceLocationError';
  }
}

/**
 * Native admin and technician apps only. A missing plugin, a missing fix,
 * or a desktop browser is not treated as spoofing.
 */
async function assertNativeLocationUsable(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('LocationRisk')) return;
  let result: LocationRiskResult | undefined;
  try {
    result = await LocationRisk.assessCurrent();
  } catch {
    return;
  }
  if (!result || result.reasons?.includes('location_unavailable')) return;
  if (result.isMockLocation) {
    throw new UnusableDeviceLocationError(MOCK_DEVICE_LOCATION_MESSAGE);
  }
  if (
    result.locationUsable === false &&
    (result.riskLevel === 'high' || result.riskLevel === 'confirmed')
  ) {
    throw new UnusableDeviceLocationError(UNSTEADY_DEVICE_LOCATION_MESSAGE);
  }
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
    await assertNativeLocationUsable();
    return readPosition(position);
  } catch (firstError) {
    if (isGeolocationPositionError(firstError) && firstError.code === firstError.PERMISSION_DENIED) {
      throw firstError;
    }
    if (firstError instanceof UnusableDeviceLocationError) throw firstError;
  }

  // GPS fallback — slower but more precise on phones.
  const position = await getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 45000,
    maximumAge: 300000,
  });
  await assertNativeLocationUsable();
  return readPosition(position);
}
