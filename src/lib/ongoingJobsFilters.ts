import { normalizeServiceSubType } from '@/lib/adminUtils';

export type OngoingAssignmentFilter = 'all' | 'assigned' | 'unassigned';

export type OngoingJobFilters = {
  assignment: OngoingAssignmentFilter;
  technicianId: string;
  serviceSubType: string;
};

const ONGOING_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

export function assignedTechnicianIdOf(job: {
  assigned_technician_id?: string | null;
  assignedTechnicianId?: string | null;
  assignedTechnician?: { id?: string | null } | null;
}): string {
  return String(
    job?.assigned_technician_id ??
      job?.assignedTechnicianId ??
      job?.assignedTechnician?.id ??
      ''
  ).trim();
}

export function ongoingJobMatchesFilters(
  job: {
    status?: string | null;
    service_sub_type?: string | null;
    serviceSubType?: string | null;
    assigned_technician_id?: string | null;
    assignedTechnicianId?: string | null;
    assignedTechnician?: { id?: string | null } | null;
  },
  filters: OngoingJobFilters
): boolean {
  if (!job?.status || !ONGOING_STATUSES.has(job.status)) return false;

  const assignedTechnicianId = assignedTechnicianIdOf(job);
  const isAssigned = Boolean(assignedTechnicianId);

  if (filters.assignment === 'assigned' && !isAssigned) return false;
  if (filters.assignment === 'unassigned' && isAssigned) return false;

  if (filters.technicianId !== 'all') {
    if (!assignedTechnicianId) return false;
    if (assignedTechnicianId !== String(filters.technicianId)) return false;
  }

  if (filters.serviceSubType !== 'all') {
    const label =
      normalizeServiceSubType(String(job.service_sub_type ?? job.serviceSubType ?? '').trim()) || '';
    if (!label || label !== String(filters.serviceSubType)) return false;
  }

  return true;
}

/**
 * Unassign removes a job from an "assigned" / technician filter.
 * When that leaves the ongoing list empty, drop those filters so the job stays visible.
 * Service subtype is left alone.
 */
export function shouldClearOngoingAssignmentFilters(
  jobs: Parameters<typeof ongoingJobMatchesFilters>[0][],
  filters: OngoingJobFilters
): boolean {
  if (filters.assignment === 'all' && filters.technicianId === 'all') return false;
  return !jobs.some((job) => ongoingJobMatchesFilters(job, filters));
}
