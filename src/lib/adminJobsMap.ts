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

export const JOBS_MAP_ONGOING_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'] as const;
export const JOBS_MAP_FOLLOWUP_STATUSES = ['FOLLOW_UP', 'RESCHEDULED'] as const;
export const JOBS_MAP_STATUSES = [...JOBS_MAP_ONGOING_STATUSES, ...JOBS_MAP_FOLLOWUP_STATUSES] as const;
export type JobsMapStatus = (typeof JOBS_MAP_STATUSES)[number];
export type JobsMapFilter = 'all' | 'ongoing' | 'unassigned' | 'followup' | 'due-today' | JobsMapStatus;

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
  follow_up_date: string | null;
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
  photo: string | null;
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
  'follow_up_date',
  'service_location',
  'service_address',
  'service_site',
  'customer:customers(id,full_name,visible_address,location,alternate_location,alternate_visible_address,alternate_address)',
].join(',');

export function isJobsMapStatus(value: string): value is JobsMapStatus {
  return (JOBS_MAP_STATUSES as readonly string[]).includes(value);
}

export function isJobsMapFollowUpStatus(value: string): boolean {
  return (JOBS_MAP_FOLLOWUP_STATUSES as readonly string[]).includes(String(value || '').toUpperCase());
}

export function jobsMapStatusLabel(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return 'In progress';
  if (value === 'EN_ROUTE') return 'En route';
  if (value === 'ASSIGNED') return 'Assigned';
  if (value === 'PENDING') return 'Unassigned';
  if (value === 'FOLLOW_UP') return 'Follow-up';
  if (value === 'RESCHEDULED') return 'Rescheduled';
  return value || 'Job';
}

export function jobsMapStatusColor(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return '#059669';
  if (value === 'EN_ROUTE') return '#d97706';
  if (value === 'ASSIGNED') return '#2563eb';
  if (value === 'FOLLOW_UP') return '#7c3aed';
  if (value === 'RESCHEDULED') return '#a855f7';
  return '#64748b';
}

export function jobsMapStatusShort(status: string): string {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_PROGRESS') return 'IP';
  if (value === 'EN_ROUTE') return 'ER';
  if (value === 'ASSIGNED') return 'A';
  if (value === 'FOLLOW_UP') return 'F';
  if (value === 'RESCHEDULED') return 'R';
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
    follow_up_date:
      job.follow_up_date != null || job.followUpDate != null
        ? String(job.follow_up_date ?? job.followUpDate).slice(0, 10) || null
        : null,
    lat: coords.lat,
    lng: coords.lng,
  };
}

export function parseJobsMapJobs(rows: unknown[]): { jobs: JobsMapJob[]; missing: number } {
  const jobs: JobsMapJob[] = [];
  const seen = new Set<string>();
  let missing = 0;
  for (const row of rows) {
    const status = String(asRecord(row).status || '').toUpperCase();
    if (status && !isJobsMapStatus(status)) continue;
    const parsed = parseJobsMapJob(row);
    if (!parsed) {
      missing += 1;
      continue;
    }
    if (seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    jobs.push(parsed);
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

const photoThumbCache = new Map<string, string>();

/** Retina circular face crop. Cached so the map and list reuse one URL instead of the full photo. */
export function jobsMapTechPhotoThumb(url: string): string {
  const key = url.trim();
  if (!key) return '';
  const hit = photoThumbCache.get(key);
  if (hit) return hit;
  let out = key;
  if (key.includes('cloudinary.com') && key.includes('/upload/')) {
    const [prefix, rest] = key.split('/upload/');
    if (prefix && rest) {
      out = `${prefix}/upload/w_192,h_192,c_fill,g_face,r_max,dpr_2.0,bo_4px_solid_rgb:ffffff,q_auto:good,f_png/${rest}`;
    }
  }
  photoThumbCache.set(key, out);
  return out;
}

function techPhoto(tech: Technician): string | null {
  const photo = typeof tech.photo === 'string' ? tech.photo.trim() : '';
  return photo || null;
}

export type JobsMapLastLoc = {
  id: string;
  lat: number;
  lng: number;
  updatedAt: string | null;
};

export function parseJobsMapLastLocation(row: unknown): JobsMapLastLoc | null {
  const rec = asRecord(row);
  const id = String(rec.id || '').trim();
  if (!id) return null;
  const last = readLocationLatLng(rec.current_location ?? rec.currentLocation);
  if (!last) return null;
  const loc = asRecord(rec.current_location ?? rec.currentLocation);
  const updatedAt =
    String(loc.lastUpdated || loc.last_updated || loc.updated_at || loc.fix_time || '') || null;
  return { id, lat: last.lat, lng: last.lng, updatedAt };
}

export function buildJobsMapTechs(
  technicians: Technician[],
  liveRows: JobsMapLiveRow[],
  lastKnown: JobsMapLastLoc[] = []
): JobsMapTech[] {
  const liveById = new Map(liveRows.map((row) => [String(row.technician_id), row]));
  const lastById = new Map(lastKnown.map((row) => [row.id, row]));
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
        photo: techPhoto(tech),
      });
      continue;
    }
    const fallback = lastById.get(tech.id);
    const last =
      fallback ||
      (() => {
        const coords = readLocationLatLng(
          tech.currentLocation ?? (tech as { current_location?: unknown }).current_location
        );
        if (!coords) return null;
        const loc = (tech.currentLocation ||
          (tech as { current_location?: Record<string, unknown> }).current_location) as
          | Record<string, unknown>
          | null
          | undefined;
        const updatedAt =
          loc && typeof loc === 'object'
            ? String(loc.lastUpdated || loc.last_updated || loc.updated_at || '') || null
            : null;
        return { id: tech.id, lat: coords.lat, lng: coords.lng, updatedAt };
      })();
    if (!last) continue;
    out.push({
      id: tech.id,
      name: techDisplayName(tech),
      lat: last.lat,
      lng: last.lng,
      source: 'last',
      updatedAt: last.updatedAt,
      isTracking: false,
      photo: techPhoto(tech),
    });
  }
  return out;
}

export function jobsMapLocalTodayYmd(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function jobsMapFollowUpYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function isJobsMapDueToday(job: JobsMapJob, today = jobsMapLocalTodayYmd()): boolean {
  if (!isJobsMapFollowUpStatus(job.status)) return false;
  const day = jobsMapFollowUpYmd(job.follow_up_date);
  return Boolean(day && day <= today);
}

export function searchJobsMapJobs(jobs: JobsMapJob[], query: string): JobsMapJob[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return jobs;
  return jobs.filter((job) => {
    const hay = `${job.job_number || ''} ${job.customer_name} ${job.visible_address}`.toLowerCase();
    return hay.includes(needle);
  });
}

export function visibleTechsForJobsMap(
  jobs: JobsMapJob[],
  techs: JobsMapTech[],
  liveOnly: boolean
): JobsMapTech[] {
  if (!liveOnly) return techs;
  const assigned = new Set(
    jobs.map((job) => job.assigned_technician_id).filter((id): id is string => Boolean(id))
  );
  return techs.filter((tech) => isJobsMapFixFresh(tech.updatedAt) || assigned.has(tech.id));
}

export function jobsMapDueLabel(job: JobsMapJob, today = jobsMapLocalTodayYmd()): string {
  const day = jobsMapFollowUpYmd(job.follow_up_date);
  if (!day || !isJobsMapFollowUpStatus(job.status)) return '';
  if (day < today) return `Overdue ${formatJobsMapDay(day)}`;
  if (day === today) return 'Due today';
  return `Due ${formatJobsMapDay(day)}`;
}

function formatJobsMapDay(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function filterJobsMapJobs(jobs: JobsMapJob[], filter: JobsMapFilter): JobsMapJob[] {
  if (filter === 'all') return jobs;
  if (filter === 'ongoing') {
    return jobs.filter((job) =>
      (JOBS_MAP_ONGOING_STATUSES as readonly string[]).includes(String(job.status || '').toUpperCase())
    );
  }
  if (filter === 'followup') return jobs.filter((job) => isJobsMapFollowUpStatus(job.status));
  if (filter === 'due-today') return jobs.filter((job) => isJobsMapDueToday(job));
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

export type JobsMapLatLng = { lat: number; lng: number };

/** Camera stays on the day’s work, not every follow-up across the city. */
export const JOBS_MAP_FIT_MAX_KM = 18;
export const JOBS_MAP_MIN_ZOOM = 12;
export const JOBS_MAP_MAX_ZOOM = 16;

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (!sorted.length) return 0;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Prefer ongoing pins for the default camera; follow-up filters keep their own set. */
export function jobsMapCameraJobs(jobs: JobsMapJob[], filter: JobsMapFilter): JobsMapJob[] {
  if (filter !== 'all') return jobs;
  const ongoing = jobs.filter((job) => !isJobsMapFollowUpStatus(job.status));
  return ongoing.length ? ongoing : jobs;
}

/**
 * Drop far outliers so zoom matches the main cluster (HSR jobs, not one pin in Mysore).
 * Jobs should be listed before technicians so a lone far tech is dropped first.
 */
export function jobsMapFitPoints(
  points: JobsMapLatLng[],
  maxSpreadKm = JOBS_MAP_FIT_MAX_KM
): JobsMapLatLng[] {
  const unique: JobsMapLatLng[] = [];
  const seen = new Set<string>();
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  if (unique.length <= 1) return unique;
  if (unique.length === 2) {
    const span = haversineKm(unique[0].lat, unique[0].lng, unique[1].lat, unique[1].lng);
    return span > maxSpreadKm ? unique.slice(0, 1) : unique;
  }
  const medLat = medianNumber(unique.map((point) => point.lat));
  const medLng = medianNumber(unique.map((point) => point.lng));
  const ranked = unique
    .map((point) => ({
      ...point,
      d: haversineKm(medLat, medLng, point.lat, point.lng),
    }))
    .sort((a, b) => a.d - b.d);
  const p75 = ranked[Math.floor((ranked.length - 1) * 0.75)]?.d ?? 0;
  const cutoff = Math.min(maxSpreadKm, Math.max(5, p75 * 1.6));
  const kept = ranked.filter((point) => point.d <= cutoff);
  return (kept.length ? kept : ranked.slice(0, Math.max(2, Math.ceil(ranked.length * 0.7)))).map(
    ({ lat, lng }) => ({ lat, lng })
  );
}

/** Street / neighborhood zoom from the fitted cluster — never city-of-India. */
export function jobsMapSuggestedZoom(points: JobsMapLatLng[]): number {
  if (points.length <= 1) return 15;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  const spanKm = haversineKm(minLat, minLng, maxLat, maxLng);
  if (spanKm < 0.8) return 16;
  if (spanKm < 2) return 15;
  if (spanKm < 4.5) return 14;
  if (spanKm < 9) return 13;
  return JOBS_MAP_MIN_ZOOM;
}

/** Keep camera on techs next to the fitted jobs, not a live pin hours away. */
export function techsNearJobs(jobs: JobsMapJob[], techs: JobsMapTech[], maxKm = 20): JobsMapTech[] {
  if (!jobs.length) return techs.filter((tech) => isJobsMapFixFresh(tech.updatedAt));
  const assigned = new Set(
    jobs.map((job) => job.assigned_technician_id).filter((id): id is string => Boolean(id))
  );
  return techs.filter(
    (tech) =>
      assigned.has(tech.id) ||
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

/** Dashboard roster strips GPS — jobs map loads last-known pins separately. */
export async function fetchJobsMapLastLocations(ids: string[]): Promise<JobsMapLastLoc[]> {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 100);
  if (!unique.length) return [];
  const { data, error } = await supabase.from('technicians').select('id,current_location').in('id', unique);
  if (error) return [];
  const out: JobsMapLastLoc[] = [];
  for (const row of data || []) {
    const parsed = parseJobsMapLastLocation(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

function mergeJobsMapRows(rows: unknown[]): { jobs: JobsMapJob[]; missing: number } {
  const seen = new Set<string>();
  const jobs: JobsMapJob[] = [];
  const parsed = parseJobsMapJobs(rows);
  for (const job of parsed.jobs) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    jobs.push(job);
  }
  return { jobs, missing: parsed.missing };
}

export async function fetchOngoingJobsForMap(): Promise<{ jobs: JobsMapJob[]; missing: number; error: string | null }> {
  const [ongoing, followup] = await Promise.all([
    supabase
      .from('jobs')
      .select(JOB_SELECT)
      .in('status', [...JOBS_MAP_ONGOING_STATUSES])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('jobs')
      .select(JOB_SELECT)
      .in('status', [...JOBS_MAP_FOLLOWUP_STATUSES])
      .order('follow_up_date', { ascending: true })
      .limit(200),
  ]);
  if (ongoing.error && followup.error) {
    return {
      jobs: [],
      missing: 0,
      error: ongoing.error.message || followup.error.message || 'Could not load jobs',
    };
  }
  const parsed = mergeJobsMapRows([...(ongoing.data || []), ...(followup.data || [])]);
  return { ...parsed, error: ongoing.error?.message || followup.error?.message || null };
}
