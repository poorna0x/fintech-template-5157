/**
 * Admin jobs map — ongoing jobs + technician pins.
 * Haversine only (no Distance Matrix). Slim job columns; live GPS when present.
 */
import { supabase } from '@/lib/supabase';
import { haversineDistanceMeters } from '@/lib/adminGoogleMapsDistance';
import { formatNearbyDistanceLabel } from '@/lib/adminNearbyJobs';
import { resolveJobDestinationCoordsSync } from '@/lib/jobLocationHelpers';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import { haversineKm, readLocationLatLng } from '@/lib/maps';
import { isActiveTechnicianAccount } from '@/lib/technicianAccountStatus';
import type { Technician } from '@/types';

export const JOBS_MAP_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'] as const;
export type JobsMapStatus = (typeof JOBS_MAP_STATUSES)[number];
export type JobsMapFilter = 'all' | 'unassigned' | JobsMapStatus;

export const JOBS_MAP_FRESH_MS = 15 * 60 * 1000;

export type JobsMapJob = {
  id: string;
  job_number: string | null;
  status: string;
  scheduled_date: string | null;
  assigned_technician_id: string | null;
  customer_id: string | null;
  customer_name: string;
  visible_address: string;
  lat: number;
  lng: number;
};

export type JobsMapTech = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  source: 'live' | 'last';
  updatedAt: string | null;
  isTracking: boolean;
};

export type JobsMapLiveRow = {
  technician_id: string;
  latitude: number | null;
  longitude: number | null;
  is_tracking: boolean | null;
  updated_at: string | null;
  fix_time: string | null;
};

const JOB_SELECT = [
  'id',
  'job_number',
  'status',
  'scheduled_date',
  'assigned_technician_id',
  'customer_id',
  'service_location',
  'service_address',
  'service_site',
  'customer:customers(id,full_name,visible_address,location,alternate_location,alternate_visible_address,alternate_address)',
].join(',');

export function isJobsMapStatus(value: string): value is JobsMapStatus {
  return (JOBS_MAP_STATUSES as readonly string[]).includes(value);
}

export function jobsMapStatusLabel(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return 'In progress';
  if (value === 'EN_ROUTE') return 'En route';
  if (value === 'ASSIGNED') return 'Assigned';
  if (value === 'PENDING') return 'Unassigned';
  return value || 'Job';
}

export function jobsMapStatusColor(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return '#059669';
  if (value === 'EN_ROUTE') return '#d97706';
  if (value === 'ASSIGNED') return '#2563eb';
  return '#64748b';
}

export function jobsMapStatusShort(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return 'IP';
  if (value === 'EN_ROUTE') return 'ER';
  if (value === 'ASSIGNED') return 'A';
  return 'P';
}

export function isJobsMapFixFresh(iso: string | null, now = Date.now()): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= JOBS_MAP_FRESH_MS;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function parseJobsMapJob(row: unknown): JobsMapJob | null {
  const job = asRecord(row);
  const id = String(job.id || '').trim();
  if (!id) return null;
  const coords = resolveJobDestinationCoordsSync(job);
  if (!coords) return null;
  const customer = asRecord(job.customer);
  const name =
    String(customer.full_name || customer.fullName || 'Customer').trim() || 'Customer';
  const address = getJobLocationLabelForWhatsApp(
    job as { service_site?: string; service_address?: unknown },
    customer
  )
    .replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim();
  const assigned = job.assigned_technician_id ?? job.assignedTechnicianId;
  return {
    id,
    job_number: job.job_number != null || job.jobNumber != null
      ? String(job.job_number ?? job.jobNumber)
      : null,
    status: String(job.status || '').toUpperCase(),
    scheduled_date:
      job.scheduled_date != null || job.scheduledDate != null
        ? String(job.scheduled_date ?? job.scheduledDate)
        : null,
    assigned_technician_id: assigned != null && String(assigned) ? String(assigned) : null,
    customer_id: job.customer_id != null || job.customerId != null || customer.id
      ? String(job.customer_id ?? job.customerId ?? customer.id)
      : null,
    customer_name: name,
    visible_address: address,
    lat: coords.lat,
    lng: coords.lng,
  };
}

export function parseJobsMapJobs(rows: unknown[]): { jobs: JobsMapJob[]; missing: number } {
  const jobs: JobsMapJob[] = [];
  let missing = 0;
  for (const row of rows) {
    const status = String(asRecord(row).status || '').toUpperCase();
    if (status && !isJobsMapStatus(status)) continue;
    const parsed = parseJobsMapJob(row);
    if (parsed) jobs.push(parsed);
    else missing += 1;
  }
  return { jobs, missing };
}

function liveCoords(row: JobsMapLiveRow | null | undefined): {
  lat: number;
  lng: number;
  updatedAt: string | null;
} | null {
  if (!row) return null;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng, updatedAt: row.fix_time || row.updated_at || null };
}

export function techDisplayName(tech: Technician): string {
  return String(tech.fullName || (tech as { full_name?: string }).full_name || 'Technician').trim() ||
    'Technician';
}

export function buildJobsMapTechs(
  technicians: Technician[],
  liveRows: JobsMapLiveRow[]
): JobsMapTech[] {
  const liveById = new Map(liveRows.map((row) => [String(row.technician_id), row]));
  const out: JobsMapTech[] = [];
  for (const tech of technicians) {
    if ((tech as { isActive?: boolean }).isActive === false) continue;
    if (!isActiveTechnicianAccount(tech)) continue;
    const live = liveById.get(tech.id);
    const fromLive = liveCoords(live);
    if (fromLive) {
      out.push({
        id: tech.id,
        name: techDisplayName(tech),
        lat: fromLive.lat,
        lng: fromLive.lng,
        source: 'live',
        updatedAt: fromLive.updatedAt,
        isTracking: Boolean(live?.is_tracking),
      });
      continue;
    }
    const last = readLocationLatLng(tech.currentLocation ?? (tech as { current_location?: unknown }).current_location);
    if (!last) continue;
    const loc = (tech.currentLocation || (tech as { current_location?: Record<string, unknown> }).current_location) as
      | Record<string, unknown>
      | null
      | undefined;
    const updatedAt =
      loc && typeof loc === 'object'
        ? String(loc.lastUpdated || loc.last_updated || loc.updated_at || '') || null
        : null;
    out.push({
      id: tech.id,
      name: techDisplayName(tech),
      lat: last.lat,
      lng: last.lng,
      source: 'last',
      updatedAt,
      isTracking: false,
    });
  }
  return out;
}

export function filterJobsMapJobs(jobs: JobsMapJob[], filter: JobsMapFilter): JobsMapJob[] {
  if (filter === 'all') return jobs;
  if (filter === 'unassigned') {
    return jobs.filter((job) => job.status === 'PENDING' || !job.assigned_technician_id);
  }
  return jobs.filter((job) => job.status === filter);
}

export type NearbyMapTech = JobsMapTech & { distance_m: number; isAssigned: boolean };

export function nearestTechsForJob(
  job: JobsMapJob,
  techs: JobsMapTech[],
  limit = 3
): NearbyMapTech[] {
  const ranked = techs
    .map((tech) => ({
      ...tech,
      distance_m: haversineDistanceMeters(
        { lat: job.lat, lng: job.lng },
        { lat: tech.lat, lng: tech.lng }
      ),
      isAssigned: Boolean(job.assigned_technician_id && tech.id === job.assigned_technician_id),
    }))
    .sort((a, b) => {
      if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
      return a.distance_m - b.distance_m;
    });
  const assigned = ranked.find((row) => row.isAssigned);
  const others = ranked.filter((row) => !row.isAssigned).slice(0, limit);
  return assigned ? [assigned, ...others] : others;
}

export function jobsForTechnician(jobs: JobsMapJob[], technicianId: string): JobsMapJob[] {
  return jobs.filter((job) => job.assigned_technician_id === technicianId);
}

/** Keep initial zoom on Bengaluru jobs, not a stale GPS pin hours away. */
export function techsNearJobs(jobs: JobsMapJob[], techs: JobsMapTech[], maxKm = 40): JobsMapTech[] {
  if (!jobs.length) return techs.filter((tech) => isJobsMapFixFresh(tech.updatedAt));
  return techs.filter((tech) =>
    isJobsMapFixFresh(tech.updatedAt) ||
    jobs.some((job) => haversineKm(job.lat, job.lng, tech.lat, tech.lng) <= maxKm)
  );
}

export function formatJobsMapDistance(meters: number): string {
  return formatNearbyDistanceLabel(meters);
}

export async function fetchJobsMapLiveRows(): Promise<JobsMapLiveRow[]> {
  const { data, error } = await supabase
    .from('technician_live_locations')
    .select('technician_id,latitude,longitude,is_tracking,updated_at,fix_time');
  if (error) return [];
  return (data || []) as JobsMapLiveRow[];
}

export async function fetchOngoingJobsForMap(): Promise<{ jobs: JobsMapJob[]; missing: number; error: string | null }> {
  const { data, error } = await supabase
    .from('jobs')
    .select(JOB_SELECT)
    .in('status', [...JOBS_MAP_STATUSES])
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return { jobs: [], missing: 0, error: error.message || 'Could not load jobs' };
  }
  const parsed = parseJobsMapJobs(data || []);
  return { ...parsed, error: null };
}
