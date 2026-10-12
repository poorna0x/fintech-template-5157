import { describe, expect, it } from 'vitest';
import { shouldClearOngoingAssignmentFilters } from './ongoingJobsFilters';

const filters = {
  assignment: 'assigned' as const,
  technicianId: 'tech-1',
  serviceSubType: 'all',
};

describe('shouldClearOngoingAssignmentFilters', () => {
  it('clears when unassigning the last job for the filtered technician', () => {
    const jobs = [{ id: 'j1', status: 'PENDING', assigned_technician_id: null }];
    expect(shouldClearOngoingAssignmentFilters(jobs, filters)).toBe(true);
  });

  it('keeps the filter when that technician still has other ongoing jobs', () => {
    const jobs = [
      { id: 'j1', status: 'PENDING', assigned_technician_id: null },
      { id: 'j2', status: 'ASSIGNED', assigned_technician_id: 'tech-1' },
    ];
    expect(shouldClearOngoingAssignmentFilters(jobs, filters)).toBe(false);
  });

  it('does nothing when no assignment filter is on', () => {
    const jobs = [{ id: 'j1', status: 'PENDING', assigned_technician_id: null }];
    expect(
      shouldClearOngoingAssignmentFilters(jobs, {
        assignment: 'all',
        technicianId: 'all',
        serviceSubType: 'Service',
      })
    ).toBe(false);
  });
});
