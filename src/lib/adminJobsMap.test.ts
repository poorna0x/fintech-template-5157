import { describe, expect, it } from 'vitest';
import { drivingRouteCacheKey } from './googleMapsDistance';
import {
  filterJobsMapJobs,
  jobsMapTechPhotoThumb,
  nearestTechsForJob,
  parseJobsMapJobs,
  type JobsMapJob,
  type JobsMapTech,
} from './adminJobsMap';

const job = (partial: Partial<JobsMapJob> & Pick<JobsMapJob, 'id' | 'lat' | 'lng'>): JobsMapJob => ({
  job_number: 'RO-1',
  status: 'PENDING',
  scheduled_date: null,
  assigned_technician_id: null,
  customer_id: 'c1',
  customer_name: 'Asha',
  visible_address: 'HSR',
  ...partial,
});

const tech = (partial: Partial<JobsMapTech> & Pick<JobsMapTech, 'id' | 'lat' | 'lng'>): JobsMapTech => ({
  name: 'Tech',
  source: 'live',
  updatedAt: null,
  isTracking: true,
  photo: null,
  ...partial,
});

describe('adminJobsMap', () => {
  it('keeps only ongoing jobs that have a pin', () => {
    const { jobs, missing } = parseJobsMapJobs([
      {
        id: '1',
        status: 'PENDING',
        service_location: { latitude: 12.91, longitude: 77.64 },
        customer: { full_name: 'Asha' },
      },
      { id: '2', status: 'PENDING', service_location: { latitude: 0, longitude: 0 } },
      { id: '3', status: 'COMPLETED', service_location: { latitude: 12.9, longitude: 77.6 } },
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].customer_name).toBe('Asha');
    expect(missing).toBe(1);
  });

  it('keeps follow-up jobs that have a pin', () => {
    const { jobs } = parseJobsMapJobs([
      {
        id: 'fu',
        status: 'FOLLOW_UP',
        service_location: { latitude: 12.91, longitude: 77.64 },
        customer: { full_name: 'Ravi' },
      },
      {
        id: 'rs',
        status: 'RESCHEDULED',
        service_location: { latitude: 12.92, longitude: 77.65 },
        customer: { full_name: 'Meera' },
      },
    ]);
    expect(jobs.map((row) => row.id)).toEqual(['fu', 'rs']);
  });

  it('lists the assigned technician first, then the closest others', () => {
    const pin = job({ id: 'j1', lat: 12.91, lng: 77.64, assigned_technician_id: 'far' });
    const ranked = nearestTechsForJob(pin, [
      tech({ id: 'near', name: 'Near', lat: 12.912, lng: 77.641 }),
      tech({ id: 'far', name: 'Far', lat: 13.05, lng: 77.8 }),
    ]);
    expect(ranked[0].id).toBe('far');
    expect(ranked[0].isAssigned).toBe(true);
    expect(ranked[1].id).toBe('near');
  });

  it('filters unassigned jobs', () => {
    const rows = [
      job({ id: 'a', lat: 12.9, lng: 77.6, status: 'PENDING' }),
      job({ id: 'b', lat: 12.91, lng: 77.61, status: 'ASSIGNED', assigned_technician_id: 't1' }),
    ];
    expect(filterJobsMapJobs(rows, 'unassigned').map((row) => row.id)).toEqual(['a']);
    expect(filterJobsMapJobs(rows, 'ASSIGNED').map((row) => row.id)).toEqual(['b']);
  });

  it('filters follow-up jobs', () => {
    const rows = [
      job({ id: 'a', lat: 12.9, lng: 77.6, status: 'PENDING' }),
      job({ id: 'b', lat: 12.91, lng: 77.61, status: 'FOLLOW_UP' }),
      job({ id: 'c', lat: 12.92, lng: 77.62, status: 'RESCHEDULED' }),
    ];
    expect(filterJobsMapJobs(rows, 'followup').map((row) => row.id)).toEqual(['b', 'c']);
    expect(filterJobsMapJobs(rows, 'all').map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('drivingRouteCacheKey', () => {
  it('rounds coordinates so nearby GPS ticks reuse the same road path', () => {
    expect(
      drivingRouteCacheKey({ lat: 12.91111, lng: 77.64111 }, { lat: 12.92, lng: 77.65 })
    ).toBe('12.9111,77.6411>12.9200,77.6500');
  });
});

describe('jobsMapTechPhotoThumb', () => {
  it('asks Cloudinary for a tiny circular crop instead of the full photo', () => {
    const full = 'https://res.cloudinary.com/demo/image/upload/v1/techs/pradeep.jpg';
    const thumb = jobsMapTechPhotoThumb(full);
    expect(thumb).toContain('w_72,h_72,c_fill,g_face,r_max');
    expect(jobsMapTechPhotoThumb(full)).toBe(thumb);
  });
});
