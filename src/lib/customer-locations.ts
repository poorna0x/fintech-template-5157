import { Customer } from '@/types';
import { extractCoordinates } from '@/lib/maps';

export type CustomerLocationVariant = 'primary' | 'secondary';

/** Quick-pick labels for a customer's second site (not area names). */
export const SECONDARY_LOCATION_LABEL_PRESETS = [
  'Office',
  'Shop',
  'Restaurant',
  'Second Home',
  'Warehouse',
  'Factory',
  'Branch',
  'Guest House',
] as const;

export interface CustomerLocationSlice {
  visibleAddress: string;
  address: Customer['address'];
  location: Customer['location'] & { googleLocation?: string | null };
}

const trim = (v: unknown) => String(v ?? '').trim();

export const getAlternateVisibleAddress = (customer: unknown): string =>
  trim(
    (customer as any)?.alternate_visible_address ??
      (customer as any)?.alternateVisibleAddress ??
      (customer as any)?.alternate_address?.visible_address ??
      ''
  );

export const getAlternateAddress = (customer: unknown): Customer['address'] | null => {
  const raw = (customer as any)?.alternate_address ?? (customer as any)?.alternateAddress;
  if (!raw || typeof raw !== 'object') return null;
  const street = trim(raw.street);
  if (!street) return null;
  return {
    street,
    area: trim(raw.area),
    city: trim(raw.city),
    state: trim(raw.state),
    pincode: trim(raw.pincode),
    landmark: raw.landmark ? trim(raw.landmark) : undefined,
    visible_address: getAlternateVisibleAddress(customer) || undefined,
  };
};

export const getAlternateLocation = (customer: unknown): CustomerLocationSlice['location'] | null => {
  const raw = (customer as any)?.alternate_location ?? (customer as any)?.alternateLocation;
  if (!raw || typeof raw !== 'object') return null;
  return {
    latitude: Number(raw.latitude) || 0,
    longitude: Number(raw.longitude) || 0,
    formattedAddress: trim(raw.formattedAddress || raw.formatted_address),
    googlePlaceId: raw.googlePlaceId || raw.google_place_id,
    googleLocation: raw.googleLocation || raw.google_location || null,
  };
};

export const hasAlternateLocation = (customer: unknown): boolean => {
  const vis = getAlternateVisibleAddress(customer);
  const addr = getAlternateAddress(customer);
  const loc = getAlternateLocation(customer);
  const hasCoords =
    Boolean(loc?.latitude && loc?.longitude && (loc.latitude !== 0 || loc.longitude !== 0));
  const hasMapLink =
    typeof loc?.googleLocation === 'string' &&
    (loc.googleLocation.includes('google.com/maps') ||
      loc.googleLocation.includes('maps.app.goo.gl') ||
      loc.googleLocation.includes('goo.gl/maps'));
  return Boolean(vis || addr?.street || hasCoords || hasMapLink);
};

export const hasMultipleCustomerLocations = (customer: unknown): boolean =>
  hasAlternateLocation(customer);

export const getCustomerLocationSlice = (
  customer: Customer,
  variant: CustomerLocationVariant
): CustomerLocationSlice => {
  if (variant === 'secondary') {
    const visibleAddress = getAlternateVisibleAddress(customer);
    const address = getAlternateAddress(customer) ?? {
      street: '',
      area: '',
      city: '',
      state: '',
      pincode: '',
      visible_address: visibleAddress || undefined,
    };
    const location = getAlternateLocation(customer) ?? {
      latitude: 0,
      longitude: 0,
      formattedAddress: '',
      googleLocation: null,
    };
    return { visibleAddress, address, location };
  }

  const visibleAddress = trim(
    (customer as any)?.visible_address ??
      customer.address?.visible_address ??
      ''
  );
  return {
    visibleAddress,
    address: {
      ...customer.address,
      visible_address: visibleAddress || customer.address?.visible_address,
    },
    location: customer.location as CustomerLocationSlice['location'],
  };
};

export const openCustomerLocationInMaps = (
  customer: Customer,
  variant: CustomerLocationVariant
): boolean => {
  const slice = getCustomerLocationSlice(customer, variant);
  const locAny = slice.location as any;
  const googleLoc =
    (typeof locAny?.googleLocation === 'string' && locAny.googleLocation) ||
    (typeof locAny?.google_location === 'string' && locAny.google_location) ||
    '';
  if (
    googleLoc &&
    (googleLoc.includes('google.com/maps') ||
      googleLoc.includes('maps.app.goo.gl') ||
      googleLoc.includes('goo.gl/maps')) &&
    !googleLoc.includes('localhost') &&
    !googleLoc.includes('127.0.0.1')
  ) {
    window.open(googleLoc, '_blank', 'noopener,noreferrer');
    return true;
  }
  const coords = extractCoordinates(slice.location);
  if (coords && coords.latitude !== 0 && coords.longitude !== 0) {
    window.open(
      `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`,
      '_blank',
      'noopener,noreferrer'
    );
    return true;
  }
  return false;
};

export const getPrimaryLocationLabel = (customer: Customer): string => {
  const vis = trim(
    (customer as any)?.visible_address ??
      customer.address?.visible_address ??
      ''
  );
  return vis || 'Primary';
};

export const getSecondaryLocationLabel = (customer: Customer): string => {
  const vis = getAlternateVisibleAddress(customer);
  return vis || 'Secondary';
};
