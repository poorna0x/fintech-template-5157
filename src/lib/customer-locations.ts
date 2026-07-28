import { Customer } from '@/types';
import { extractCoordinates } from '@/lib/maps';
import { getMapsSearchLinkFromAddress, resolveJobDestinationCoordsAsync } from '@/lib/jobLocationHelpers';

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

const isValidGoogleMapsHref = (url: string): boolean =>
  Boolean(
    url &&
      (url.includes('google.com/maps') ||
        url.includes('maps.app.goo.gl') ||
        url.includes('goo.gl/maps')) &&
      !url.includes('localhost') &&
      !url.includes('127.0.0.1')
  );

const getGoogleLocationHref = (location: unknown): string => {
  const locAny = location as Record<string, unknown> | null | undefined;
  const googleLoc =
    (typeof locAny?.googleLocation === 'string' && locAny.googleLocation) ||
    (typeof locAny?.google_location === 'string' && locAny.google_location) ||
    '';
  return googleLoc.trim();
};

/** True when a location has a Maps URL or non-zero coordinates. */
export const locationHasMapPin = (location: unknown): boolean => {
  if (!location || typeof location !== 'object') return false;
  const googleLoc = getGoogleLocationHref(location);
  if (googleLoc && isValidGoogleMapsHref(googleLoc)) return true;
  const coords = extractCoordinates(location);
  return Boolean(coords && coords.latitude !== 0 && coords.longitude !== 0);
};

/**
 * Job snapshots often have address text but no pin (e.g. new customer). Pull the
 * customer's live map pin so technician Maps matches admin.
 */
export const mergeCustomerMapPinIntoJobLocation = (
  jobLocation: JobLocationDisplay['location'] | undefined,
  customerLocation: JobLocationDisplay['location'] | undefined | null
): JobLocationDisplay['location'] => {
  const base =
    jobLocation ||
    ({ latitude: 0, longitude: 0, formattedAddress: '' } as JobLocationDisplay['location']);

  if (!customerLocation || locationHasMapPin(base)) return base;
  if (!locationHasMapPin(customerLocation)) return base;

  const cust = customerLocation as Record<string, unknown>;
  const baseAny = base as Record<string, unknown>;
  return {
    ...base,
    latitude: Number(cust.latitude) || Number(base.latitude) || 0,
    longitude: Number(cust.longitude) || Number(base.longitude) || 0,
    formattedAddress:
      String(base.formattedAddress || cust.formattedAddress || cust.formatted_address || '').trim() ||
      base.formattedAddress,
    googlePlaceId:
      (base.googlePlaceId as string | undefined) ||
      (cust.googlePlaceId as string | undefined) ||
      (cust.google_place_id as string | undefined),
    googleLocation:
      (baseAny.googleLocation as string | null | undefined) ||
      (baseAny.google_location as string | null | undefined) ||
      (cust.googleLocation as string | null | undefined) ||
      (cust.google_location as string | null | undefined) ||
      null,
  };
};

/** Open a location slice the same way admin does — raw Maps URL first, not rewritten coords. */
const openLocationSliceInMaps = (
  location: JobLocationDisplay['location'],
  address?: Customer['address']
): boolean => {
  const googleLoc = getGoogleLocationHref(location);
  if (googleLoc && isValidGoogleMapsHref(googleLoc)) {
    window.open(googleLoc, '_blank', 'noopener,noreferrer');
    return true;
  }
  const coords = extractCoordinates(location);
  if (coords && coords.latitude !== 0 && coords.longitude !== 0) {
    window.open(
      `https://www.google.com/maps/place/${coords.latitude},${coords.longitude}`,
      '_blank',
      'noopener,noreferrer'
    );
    return true;
  }
  const searchLink = getMapsSearchLinkFromAddress(address);
  if (searchLink) {
    window.open(searchLink, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
};

export const openCustomerLocationInMaps = (
  customer: Customer,
  variant: CustomerLocationVariant
): boolean => {
  const slice = getCustomerLocationSlice(customer, variant);
  return openLocationSliceInMaps(slice.location, slice.address);
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

export interface SiteEquipment {
  serviceType: 'RO' | 'SOFTENER';
  brand: string;
  model: string;
}

const parseSiteServiceType = (raw: unknown): 'RO' | 'SOFTENER' => {
  const s = trim(raw).toUpperCase();
  return s === 'SOFTENER' ? 'SOFTENER' : 'RO';
};

/** Equipment stored on the given site (primary uses customer brand/model columns). */
export const getSiteEquipment = (
  customer: unknown,
  variant: CustomerLocationVariant
): SiteEquipment => {
  const c = customer as Record<string, unknown>;
  if (variant === 'secondary') {
    return {
      serviceType: parseSiteServiceType(c?.alternate_service_type ?? c?.alternateServiceType),
      brand: trim(c?.alternate_brand ?? c?.alternateBrand),
      model: trim(c?.alternate_model ?? c?.alternateModel),
    };
  }
  const serviceTypeRaw = trim(c?.service_type ?? c?.serviceType) || 'RO';
  const primaryType = parseSiteServiceType(
    serviceTypeRaw.includes(',') ? serviceTypeRaw.split(',')[0] : serviceTypeRaw
  );
  const brands = trim(c?.brand).split(',').map((s) => s.trim());
  const models = trim(c?.model).split(',').map((s) => s.trim());
  return {
    serviceType: primaryType,
    brand: brands[0] || '',
    model: models[0] || '',
  };
};

/** True when secondary address is set and secondary device (brand) is configured. */
export const hasDualSiteCustomer = (customer: unknown): boolean => {
  if (!hasAlternateLocation(customer)) return false;
  const eq = getSiteEquipment(customer, 'secondary');
  return Boolean(eq.brand?.trim());
};

export const getJobServiceSite = (job: unknown): CustomerLocationVariant => {
  const site = trim((job as any)?.service_site ?? (job as any)?.serviceSite);
  return site === 'secondary' ? 'secondary' : 'primary';
};

/** Short label for WhatsApp / assign (e.g. "Office" or "Home"). */
export const getJobLocationLabelForWhatsApp = (
  job: { service_site?: string; service_address?: Customer['address'] },
  customer?: unknown
): string => {
  const site = getJobServiceSite(job);
  if (site === 'secondary') {
    const vis = getAlternateVisibleAddress(customer);
    if (vis) return vis;
    const addr = getAlternateAddress(customer);
    return addr?.area || addr?.city || 'Secondary';
  }
  const serviceAddr = job.service_address;
  const visFromJob =
    trim(serviceAddr?.visible_address) || trim((serviceAddr as any)?.visibleAddress);
  if (visFromJob) return visFromJob;
  if (customer) {
    const vis = trim(
      (customer as any)?.visible_address ??
        (customer as Customer)?.address?.visible_address ??
        ''
    );
    if (vis) return vis;
  }
  const addr = serviceAddr || (customer as Customer)?.address;
  return addr?.area || addr?.city || '';
};

/** Display line for job cards: "Office · Aquaguard" */
export const getJobSiteDisplayLine = (
  job: unknown,
  customer: unknown
): string | null => {
  const site = getJobServiceSite(job);
  if (site !== 'secondary') return null;
  const label = getSecondaryLocationLabel(customer as Customer);
  const eq = getSiteEquipment(customer, 'secondary');
  const parts = [label, eq.brand].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Secondary site';
};

export interface JobLocationDisplay {
  variant: CustomerLocationVariant;
  visibleLabel: string;
  address: Customer['address'];
  location: Customer['location'] & { googleLocation?: string | null };
}

/** Location on technician job cards — live customer for this job's site (same as admin). */
export const getJobLocationDisplay = (
  job: unknown,
  customer?: unknown
): JobLocationDisplay => {
  const j = job as Record<string, unknown>;
  const site = getJobServiceSite(job);
  const serviceAddr = (j?.service_address ?? j?.serviceAddress) as Customer['address'] | undefined;
  const serviceLoc = (j?.service_location ?? j?.serviceLocation) as JobLocationDisplay['location'] | undefined;
  const visFromJob =
    trim(serviceAddr?.visible_address) || trim((serviceAddr as { visibleAddress?: string })?.visibleAddress);

  if (customer) {
    const slice = getCustomerLocationSlice(customer as Customer, site);
    return {
      variant: site,
      visibleLabel:
        slice.visibleAddress ||
        visFromJob ||
        getJobLocationLabelForWhatsApp(
          { service_site: site, service_address: serviceAddr },
          customer
        ) ||
        getPrimaryLocationLabel(customer as Customer),
      address: slice.address,
      location: slice.location,
    };
  }

  const hasJobAddress =
    Boolean(visFromJob) ||
    Boolean(trim(serviceAddr?.street)) ||
    locationHasMapPin(serviceLoc);

  if (hasJobAddress) {
    return {
      variant: site,
      visibleLabel: visFromJob || 'Location',
      address: serviceAddr || {
        street: '',
        area: '',
        city: '',
        state: '',
        pincode: '',
      },
      location:
        serviceLoc ||
        ({
          latitude: 0,
          longitude: 0,
          formattedAddress: trim(serviceAddr?.street),
        } as JobLocationDisplay['location']),
    };
  }

  return {
    variant: 'primary',
    visibleLabel: 'Location',
    address: { street: '', area: '', city: '', state: '', pincode: '' },
    location: { latitude: 0, longitude: 0, formattedAddress: '' },
  };
};

/** Open maps for this job's service location (not a primary/secondary picker). */
export const openJobServiceLocationInMaps = (
  job: unknown,
  customer?: unknown
): boolean => {
  const display = getJobLocationDisplay(job, customer);
  if (openLocationSliceInMaps(display.location, display.address)) return true;
  if (customer) {
    return openCustomerLocationInMaps(customer as Customer, display.variant);
  }
  return false;
};

/** Resolve short Maps links / missing coords, then open (technician tap). */
export const openJobServiceLocationInMapsAsync = async (
  job: unknown,
  customer?: unknown,
  options: { accessToken?: string | null } = {}
): Promise<boolean> => {
  if (openJobServiceLocationInMaps(job, customer)) return true;

  const customerRow = customer || (job as { customer?: unknown })?.customer;
  const row = customerRow ? { ...(job as object), customer: customerRow } : job;
  const resolved = await resolveJobDestinationCoordsAsync(row, {
    accessToken: options.accessToken ?? null,
  });
  if (!resolved) return false;

  window.open(
    `https://www.google.com/maps?q=${resolved.lat},${resolved.lng}`,
    '_blank',
    'noopener,noreferrer'
  );
  return true;
};
