/** Shared job/customer location helpers for admin assign/reassign/measure flows (slim + full rows). */

export function getLocationLinkFromObject(location: any): string {
  if (!location) return '';

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
      return googleLoc;
    }
  }
  if (location.latitude && location.longitude && location.latitude !== 0 && location.longitude !== 0) {
    return `https://www.google.com/maps/place/${location.latitude},${location.longitude}`;
  }
  if (
    location.formattedAddress &&
    typeof location.formattedAddress === 'string' &&
    (location.formattedAddress.includes('google.com/maps') ||
      location.formattedAddress.includes('maps.app.goo.gl')) &&
    !location.formattedAddress.includes('localhost') &&
    !location.formattedAddress.includes('127.0.0.1')
  ) {
    return location.formattedAddress;
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
