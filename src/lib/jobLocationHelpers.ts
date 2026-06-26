/** Shared job/customer location helpers for admin assign/reassign/measure flows (slim + full rows). */

import {
  buildGoogleMapsOpenUrl,
  extractCoordinatesFromGoogleMapsLink,
  extractPlaceNameFromMapsUrl,
  isCoordinateOnlyMapsUrl,
  isGoogleMapsShortLink,
} from '@/lib/googleMapsLink';

function getCompactGoogleMapsLink(url: string): string {
  const value = url.trim();
  if (!value) return '';

  if (extractPlaceNameFromMapsUrl(value)) {
    return value;
  }

  if (value.includes('maps.app.goo.gl') || value.includes('goo.gl/maps')) {
    return value;
  }

  const coordinatePatterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of coordinatePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return buildGoogleMapsOpenUrl(value, { latitude, longitude });
    }
  }

  return value;
}

function getAddressFromLocationObject(location: any): string {
  if (!location) return '';
  const candidates = [
    location.formattedAddress,
    location.formatted_address,
    location.address,
    location.fullAddress,
    location.full_address,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 5) return c.trim();
  }
  return '';
}

function getCoordOptionsFromLocationObject(location: any) {
  const lat = location?.latitude ?? location?.lat;
  const lng = location?.longitude ?? location?.lng;
  const latitude = typeof lat === 'number' ? lat : parseFloat(String(lat ?? ''));
  const longitude = typeof lng === 'number' ? lng : parseFloat(String(lng ?? ''));
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0)
  ) {
    return { latitude, longitude };
  }
  return undefined;
}

export function getLocationLinkFromObject(location: any): string {
  if (!location) return '';

  const address = getAddressFromLocationObject(location);
  const coordOpts = getCoordOptionsFromLocationObject(location);

  if (location.googleLocation || location.google_location) {
    const googleLoc = location.googleLocation || location.google_location;
    if (
      googleLoc &&
      typeof googleLoc === 'string' &&
      (googleLoc.includes('google.com/maps') ||
        googleLoc.includes('maps.app.goo.gl') ||
        googleLoc.includes('goo.gl/maps')) &&
      !googleLoc.includes('localhost') &&
      !googleLoc.includes('127.0.0.1')
    ) {
      if (
        extractPlaceNameFromMapsUrl(googleLoc) &&
        !isCoordinateOnlyMapsUrl(googleLoc)
      ) {
        return getCompactGoogleMapsLink(googleLoc);
      }
      if (isCoordinateOnlyMapsUrl(googleLoc) || isGoogleMapsShortLink(googleLoc)) {
        const coordsFromUrl = extractCoordinatesFromGoogleMapsLink(googleLoc);
        return buildGoogleMapsOpenUrl(googleLoc, {
          address,
          latitude: coordOpts?.latitude ?? coordsFromUrl?.latitude,
          longitude: coordOpts?.longitude ?? coordsFromUrl?.longitude,
        });
      }
      return getCompactGoogleMapsLink(googleLoc);
    }
  }
  if (coordOpts) {
    return buildGoogleMapsOpenUrl('', coordOpts);
  }
  if (
    location.formattedAddress &&
    typeof location.formattedAddress === 'string' &&
    (location.formattedAddress.includes('google.com/maps') ||
      location.formattedAddress.includes('maps.app.goo.gl')) &&
    !location.formattedAddress.includes('localhost') &&
    !location.formattedAddress.includes('127.0.0.1')
  ) {
    return getCompactGoogleMapsLink(location.formattedAddress);
  }
  return '';
}

export function getGoogleMapsLinkForJobRow(jobRow: any): string {
  const customer = jobRow?.customer || {};
  const customerLocation = customer?.location || {};
  const serviceLocation = jobRow?.service_location || jobRow?.serviceLocation || {};
  return getLocationLinkFromObject(customerLocation) || getLocationLinkFromObject(serviceLocation);
}

export async function getFreshGoogleMapsLinkForJobRow(
  jobRow: any,
  loaders: {
    getCustomerById?: (customerId: string) => Promise<{ data?: any; error?: any }>;
    getJobByIdFull?: (jobId: string) => Promise<{ data?: any; error?: any }>;
  } = {}
): Promise<string> {
  const customer = jobRow?.customer || {};
  const embeddedCustomerLink = getLocationLinkFromObject(customer?.location);
  if (embeddedCustomerLink) return embeddedCustomerLink;

  const customerId = customer?.id || jobRow?.customer_id || jobRow?.customerId;
  if (customerId && loaders.getCustomerById) {
    const { data, error } = await loaders.getCustomerById(String(customerId));
    if (!error) {
      const freshCustomerLink = getLocationLinkFromObject(data?.location);
      if (freshCustomerLink) return freshCustomerLink;
    }
  }

  if (jobRow?.id && loaders.getJobByIdFull) {
    const { data, error } = await loaders.getJobByIdFull(String(jobRow.id));
    if (!error && data) {
      return getGoogleMapsLinkForJobRow(data);
    }
  }

  return getGoogleMapsLinkForJobRow(jobRow);
}

export function getJobLatLngFromJobRow(jobRow: any): { lat: number; lng: number } | null {
  const customer = jobRow?.customer || {};
  const customerLocation = customer?.location || {};
  const serviceLocation = jobRow?.service_location || jobRow?.serviceLocation || {};
  if (
    customerLocation.latitude &&
    customerLocation.longitude &&
    customerLocation.latitude !== 0 &&
    customerLocation.longitude !== 0
  ) {
    return { lat: customerLocation.latitude, lng: customerLocation.longitude };
  }
  if (
    serviceLocation.latitude &&
    serviceLocation.longitude &&
    serviceLocation.latitude !== 0 &&
    serviceLocation.longitude !== 0
  ) {
    return { lat: serviceLocation.latitude, lng: serviceLocation.longitude };
  }
  return null;
}
