import { db } from '@/lib/supabase';
import { generateJobNumber } from '@/lib/adminUtils';
import { billPhotosRequirement } from '@/lib/billPhotoCapture';
import {
  extractCoordinatesFromGoogleMapsLink,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
  sanitizeGoogleMapsInput,
} from '@/lib/googleMapsLink';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { formatDateLabel } from '@/lib/parseFlexibleDate';

export const OLD_JOB_TECHNICIAN_OFFICE = 'office';

export type OldJobSavedCustomer = {
  id: string;
  customerCode?: string | null;
  fullName: string;
  phone: string;
  existing: boolean;
};

function cleanPhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

export function formatIndiaMobile(phone: string): string {
  let cleaned = cleanPhone(phone);
  if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
  return cleaned;
}

export function titleCaseName(name: string): string {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function validateIndiaMobile(phone: string): { ok: true; phone: string } | { ok: false; error: string } {
  const formatted = formatIndiaMobile(phone);
  if (formatted.length !== 10) {
    return { ok: false, error: 'Phone number must be 10 digits' };
  }
  if (!/^[6-9]/.test(formatted)) {
    return { ok: false, error: 'Phone number must start with 6, 7, 8, or 9' };
  }
  return { ok: true, phone: formatted };
}

function customerFromRow(row: Record<string, unknown>, existing: boolean): OldJobSavedCustomer {
  return {
    id: String(row.id),
    customerCode: (row.customer_id as string) || null,
    fullName: String(row.full_name || ''),
    phone: String(row.phone || ''),
    existing,
  };
}

export async function lookupOldJobCustomerByPhone(
  phone: string
): Promise<{ ok: true; customer: OldJobSavedCustomer | null } | { ok: false; error: string }> {
  const phoneCheck = validateIndiaMobile(phone);
  if (!phoneCheck.ok) return phoneCheck;
  const existing = await db.customers.getByPhone(phoneCheck.phone);
  if (existing.error && existing.error.code !== 'PGRST116') {
    return { ok: false, error: existing.error.message || 'Could not look up that phone' };
  }
  if (!existing.data?.id) return { ok: true, customer: null };
  return { ok: true, customer: customerFromRow(existing.data as Record<string, unknown>, true) };
}

function mergePhotoUrls(existing: unknown, extra: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const url = value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const key = url.split('?')[0].split('#')[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url);
  };
  if (Array.isArray(existing)) existing.forEach(add);
  extra.forEach(add);
  return out;
}

function laterDate(a: string | null | undefined, b: string): string {
  if (!a) return b;
  return a >= b ? a : b;
}

function completionTimestamp(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

async function resolveMapsLocation(raw: string) {
  const cleaned = sanitizeGoogleMapsInput(raw);
  if (!cleaned) {
    return { ok: false as const, error: 'Paste a Google Maps location link' };
  }
  const embedded = extractCoordinatesFromGoogleMapsLink(cleaned);
  if (embedded) {
    return {
      ok: true as const,
      latitude: embedded.latitude,
      longitude: embedded.longitude,
      googleLocation: `https://www.google.com/maps/place/${embedded.latitude},${embedded.longitude}`,
    };
  }
  if (!isGoogleMapsUrl(cleaned)) {
    const coordMatch = cleaned.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (coordMatch) {
      const latitude = Number(coordMatch[1]);
      const longitude = Number(coordMatch[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
          ok: true as const,
          latitude,
          longitude,
          googleLocation: `https://www.google.com/maps/place/${latitude},${longitude}`,
        };
      }
    }
    return { ok: false as const, error: 'Paste a valid Google Maps link' };
  }
  const token = await resolveSupabaseAccessTokenForApi();
  const resolved = await resolveGoogleMapsInputToCoords(cleaned, { accessToken: token });
  if (!resolved.ok) {
    return { ok: false as const, error: resolved.error || 'Could not read that Maps link' };
  }
  const { latitude, longitude } = resolved.coords;
  return {
    ok: true as const,
    latitude,
    longitude,
    googleLocation: `https://www.google.com/maps/place/${latitude},${longitude}`,
  };
}

export async function saveOldJobCustomer(input: {
  fullName: string;
  phone: string;
  googleLocation: string;
}): Promise<{ ok: true; customer: OldJobSavedCustomer } | { ok: false; error: string }> {
  const fullName = titleCaseName(input.fullName);
  if (fullName.length < 2) return { ok: false, error: 'Enter the customer name' };
  const phoneCheck = validateIndiaMobile(input.phone);
  if (!phoneCheck.ok) return phoneCheck;

  const maps = input.googleLocation?.trim()
    ? await resolveMapsLocation(input.googleLocation)
    : { ok: true as const, latitude: 0, longitude: 0, googleLocation: '' };
  if (!maps.ok) return maps;

  const hasMaps = Boolean(maps.googleLocation);
  const location = {
    latitude: maps.latitude,
    longitude: maps.longitude,
    formattedAddress: '',
    googleLocation: maps.googleLocation || null,
  };
  const address = {
    street: '',
    area: '',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '',
  };

  const existing = await db.customers.getByPhone(phoneCheck.phone);
  if (existing.error && existing.error.code !== 'PGRST116') {
    return { ok: false, error: existing.error.message || 'Could not look up that phone' };
  }
  if (existing.data?.id) {
    const row = existing.data as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (hasMaps) {
      updates.location = location;
      if (!(row.address as typeof address | undefined)) updates.address = address;
    }
    if (Object.keys(updates).length) {
      const { error } = await db.customers.update(String(row.id), updates as any);
      if (error) return { ok: false, error: error.message || 'Could not update the customer' };
    }
    return {
      ok: true,
      customer: customerFromRow({ ...row, full_name: row.full_name || fullName }, true),
    };
  }

  const created = await db.customers.create({
    full_name: fullName,
    phone: phoneCheck.phone,
    alternate_phone: '',
    email: '',
    address,
    location,
    visible_address: '',
    service_type: 'RO',
    brand: '',
    model: '',
    status: 'ACTIVE',
    notes: 'Added from CRM AI old completed job',
    customer_since: new Date().toISOString(),
    preferred_time_slot: 'MORNING',
    preferred_language: 'ENGLISH',
  } as any);

  if (created.error || !created.data?.id) {
    const fallback = await db.customers.getByPhone(phoneCheck.phone);
    if (fallback.data?.id) {
      const row = fallback.data as Record<string, unknown>;
      return {
        ok: true,
        customer: {
          id: String(row.id),
          customerCode: (row.customer_id as string) || null,
          fullName: String(row.full_name || fullName),
          phone: phoneCheck.phone,
          existing: true,
        },
      };
    }
    return { ok: false, error: created.error?.message || 'Could not save the customer' };
  }

  const row = created.data as Record<string, unknown>;
  return {
    ok: true,
    customer: {
      id: String(row.id),
      customerCode: (row.customer_id as string) || null,
      fullName,
      phone: phoneCheck.phone,
      existing: false,
    },
  };
}

export async function saveOldJobModel(input: {
  customerId: string;
  brand?: string;
  model?: string;
  photoUrls: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const brand = titleCaseName(input.brand || '');
  const model = String(input.model || '').trim();
  const extraPhotos = (input.photoUrls || []).filter(Boolean);
  if (!brand && !model && !extraPhotos.length) return { ok: true };

  const { data, error } = await db.customers.getById(input.customerId);
  if (error || !data) return { ok: false, error: 'Customer not found' };
  const photos = mergePhotoUrls((data as any).photos, extraPhotos);
  const updates: Record<string, unknown> = {};
  if (brand) updates.brand = brand;
  if (model) updates.model = model;
  if (extraPhotos.length) updates.photos = photos;
  if (!Object.keys(updates).length) return { ok: true };

  const { error: updateError } = await db.customers.update(input.customerId, updates as any);
  if (updateError) return { ok: false, error: updateError.message || 'Could not save the brand or photo' };
  return { ok: true };
}

export async function createOldCompletedJob(input: {
  customerId: string;
  completedDateIso: string;
  technicianId: string;
  billPhotoUrls: string[];
  paymentPhotoUrl?: string | null;
  billAmount: number;
}): Promise<{ ok: true; jobId: string; jobNumber: string; dateLabel: string } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedDateIso)) {
    return { ok: false, error: 'Pick a completed date' };
  }
  if (!Number.isFinite(input.billAmount) || input.billAmount < 0) {
    return { ok: false, error: 'Enter the bill amount' };
  }
  const isOffice = input.technicianId === OLD_JOB_TECHNICIAN_OFFICE;
  if (!isOffice) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(input.technicianId)) {
      return { ok: false, error: 'Pick who completed this job' };
    }
  }

  const { data: customer, error: customerError } = await db.customers.getById(input.customerId);
  if (customerError || !customer) return { ok: false, error: 'Customer not found' };

  const amount = Math.max(0, Number(input.billAmount));
  const paymentPhoto = String(input.paymentPhotoUrl || '').trim() || null;
  const completedAt = completionTimestamp(input.completedDateIso);
  const afterPhotos = mergePhotoUrls(input.billPhotoUrls, paymentPhoto ? [paymentPhoto] : []);
  const requirements: Record<string, unknown>[] = [
    { lead_source: 'Direct call' },
    { skip_review: true },
    { backfilled_via: 'crm_ai_old_job' },
  ];
  if (input.billPhotoUrls.length) requirements.push(billPhotosRequirement(input.billPhotoUrls, {}));
  if (isOffice) requirements.push({ completed_by_office: true });
  if (paymentPhoto) requirements.push({ payment_photos: [paymentPhoto] });

  const jobNumber = generateJobNumber('RO');
  const jobData = {
    job_number: jobNumber,
    customer_id: input.customerId,
    service_type: 'RO',
    service_sub_type: 'Service',
    brand: (customer as any).brand || '',
    model: (customer as any).model || '',
    scheduled_date: input.completedDateIso,
    scheduled_time_slot: 'MORNING',
    service_address: (customer as any).address || {},
    service_location: (customer as any).location || {},
    status: 'COMPLETED',
    priority: 'MEDIUM',
    description: `Old completed job logged from CRM AI (${formatDateLabel(input.completedDateIso)})`,
    requirements,
    estimated_cost: amount,
    actual_cost: amount,
    lead_cost: 0,
    payment_status: 'PAID',
    payment_amount: amount,
    payment_method: paymentPhoto ? 'UPI' : amount > 0 ? 'CASH' : null,
    assigned_technician_id: isOffice ? null : input.technicianId,
    completed_by: isOffice ? null : input.technicianId,
    end_time: completedAt,
    completed_at: completedAt,
    after_photos: afterPhotos,
    service_brand: 'hydrogenro',
    completion_notes: 'Backfilled from CRM AI',
  };

  const created = await db.jobs.create(jobData as any);
  if (created.error || !created.data?.id) {
    return { ok: false, error: created.error?.message || 'Could not save the completed job' };
  }

  const lastService = laterDate((customer as any).last_service_date, input.completedDateIso);
  await db.customers.update(input.customerId, { last_service_date: lastService }).catch(() => {});

  const row = created.data as Record<string, unknown>;
  return {
    ok: true,
    jobId: String(row.id),
    jobNumber: String(row.job_number || jobNumber),
    dateLabel: formatDateLabel(input.completedDateIso),
  };
}
