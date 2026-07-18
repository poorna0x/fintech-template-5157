import type { Job } from '@/types';
import { VISIBLE_ADDRESS_MAX_LEN } from '@/lib/adminUtils';

const ACTIVE_JOB_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

export function normalizeJobStatusForTechnician(status: string | null | undefined): string {
  return String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/** Technicians may edit customer email and alternate phone only while an active job is assigned to them. */
export function canTechnicianEditCustomerForJob(job: Job | null | undefined): boolean {
  if (!job?.id) return false;
  const status = normalizeJobStatusForTechnician((job as { status?: string }).status);
  return ACTIVE_JOB_STATUSES.has(status);
}

export type TechnicianCustomerFieldPatch = {
  full_name?: string;
  email?: string;
  alternate_phone?: string;
  visible_address?: string;
  address?: Record<string, unknown>;
  location?: Record<string, unknown>;
  brand?: string;
  model?: string;
};

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 20;
const STREET_MAX = 500;
const BRAND_MAX = 120;
const MODEL_MAX = 200;

/** Title-case each word: "raj kumar" → "Raj Kumar". */
export function capitalizeCustomerName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function sanitizeTechnicianCustomerPatch(
  patch: TechnicianCustomerFieldPatch
): TechnicianCustomerFieldPatch | { error: string } {
  const out: TechnicianCustomerFieldPatch = {};

  if (patch.full_name !== undefined) {
    const name = capitalizeCustomerName(patch.full_name);
    if (!name) return { error: 'Customer name is required' };
    if (name.length > NAME_MAX) return { error: 'Name is too long' };
    out.full_name = name;
  }

  if (patch.email !== undefined) {
    const email = patch.email.trim();
    if (email.length > EMAIL_MAX) return { error: 'Email is too long' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'Enter a valid email address' };
    }
    out.email = email;
  }

  if (patch.alternate_phone !== undefined) {
    const digits = patch.alternate_phone.replace(/\D/g, '');
    if (digits.length > PHONE_MAX) return { error: 'Alternate phone is too long' };
    out.alternate_phone = digits;
  }

  if (patch.visible_address !== undefined) {
    const vis = patch.visible_address.trim();
    if (vis.length > VISIBLE_ADDRESS_MAX_LEN) return { error: 'Area label is too long' };
    out.visible_address = vis;
  }

  if (patch.address !== undefined) {
    const street = String((patch.address as { street?: string }).street ?? '').trim();
    if (street.length > STREET_MAX) return { error: 'Address is too long' };
    out.address = {
      street,
      area: '',
      city: '',
      state: '',
      pincode: '',
    };
  }

  if (patch.location !== undefined) {
    const loc = patch.location as {
      latitude?: number;
      longitude?: number;
      formattedAddress?: string;
      googleLocation?: string;
    };
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: 'Invalid map coordinates' };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      return { error: 'Invalid map coordinates' };
    }
    out.location = {
      latitude: lat,
      longitude: lng,
      formattedAddress: String(loc.formattedAddress ?? '').slice(0, STREET_MAX),
      ...(loc.googleLocation ? { googleLocation: String(loc.googleLocation).slice(0, 500) } : {}),
    };
  }

  if (patch.brand !== undefined) {
    const brand = patch.brand.trim();
    if (brand.length > BRAND_MAX) return { error: 'Brand is too long' };
    out.brand = brand;
  }

  if (patch.model !== undefined) {
    const model = patch.model.trim();
    if (model.length > MODEL_MAX) return { error: 'Model is too long' };
    out.model = model;
  }

  return out;
}

export function isMissingRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('function public.technician_patch_customer')
  );
}
