import { describe, expect, it } from 'vitest';
import { drivingRouteCacheKey } from './googleMapsDistance';
import {
  buildJobsMapTechs,
  filterJobsMapJobs,
  isJobsMapDueToday,
  jobsMapBestNextTech,
  jobsMapCameraJobs,
  jobsMapCanQuickAssign,
  jobsMapFitPoints,
  jobsMapReachLabel,
  jobsMapSuggestedZoom,
  jobsMapTechPhotoThumb,
  nearestTechsForJob,
  parseJobsMapJobs,
  parseJobsMapLastLocation,
  parseJobsMapLiveRow,
  mergeJobsMapLiveRows,
  jobsMapLiveStamp,
  searchJobsMapJobs,
  techsNearJobs,
  visibleTechsForJobsMap,
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
  follow_up_date: null,
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

  it('allows one-tap assign only for unassigned ongoing jobs', () => {
    expect(jobsMapCanQuickAssign(job({ id: 'a', lat: 12.9, lng: 77.6, status: 'PENDING' }))).toBe(true);
    expect(
      jobsMapCanQuickAssign(job({ id: 'b', lat: 12.9, lng: 77.6, status: 'PENDING', assigned_technician_id: 't1' }))
    ).toBe(false);
    expect(jobsMapCanQuickAssign(job({ id: 'c', lat: 12.9, lng: 77.6, status: 'FOLLOW_UP' }))).toBe(false);
    expect(jobsMapBestNextTech([{ isAssigned: true, id: 'a' }, { isAssigned: false, id: 'near' }])?.id).toBe(
      'near'
    );
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
    expect(filterJobsMapJobs(rows, 'ongoing').map((row) => row.id)).toEqual(['a']);
    expect(filterJobsMapJobs(rows, 'all').map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds due-today follow-ups, including overdue', () => {
    const rows = [
      job({ id: 'later', lat: 12.9, lng: 77.6, status: 'FOLLOW_UP', follow_up_date: '2099-01-01' }),
      job({ id: 'today', lat: 12.91, lng: 77.61, status: 'FOLLOW_UP', follow_up_date: '2026-09-20' }),
      job({ id: 'old', lat: 12.92, lng: 77.62, status: 'FOLLOW_UP', follow_up_date: '2026-09-18' }),
      job({ id: 'open', lat: 12.93, lng: 77.63, status: 'PENDING' }),
    ];
    expect(rows.filter((row) => isJobsMapDueToday(row, '2026-09-20')).map((row) => row.id)).toEqual([
      'today',
      'old',
    ]);
    expect(filterJobsMapJobs(rows, 'due-today').some((row) => row.id === 'open')).toBe(false);
  });

  it('searches job number, name, and area', () => {
    const rows = [
      job({ id: 'a', lat: 12.9, lng: 77.6, job_number: 'RO-9', customer_name: 'Asha', visible_address: 'HSR' }),
      job({ id: 'b', lat: 12.91, lng: 77.61, customer_name: 'Ravi', visible_address: 'Jigani' }),
    ];
    expect(searchJobsMapJobs(rows, 'jigani').map((row) => row.id)).toEqual(['b']);
    expect(searchJobsMapJobs(rows, 'ro-9').map((row) => row.id)).toEqual(['a']);
  });

  it('hides stale technicians unless they are assigned', () => {
    const pin = job({ id: 'j1', lat: 12.91, lng: 77.64, assigned_technician_id: 'stale' });
    const shown = visibleTechsForJobsMap(
      [pin],
      [
        tech({ id: 'live', lat: 12.91, lng: 77.64, updatedAt: new Date().toISOString() }),
        tech({ id: 'stale', lat: 13.05, lng: 77.8, updatedAt: '2026-01-01T00:00:00.000Z' }),
        tech({ id: 'other', lat: 12.5, lng: 77.5, updatedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      true
    );
    expect(shown.map((row) => row.id).sort()).toEqual(['live', 'stale']);
  });
});

describe('drivingRouteCacheKey', () => {
  it('rounds coordinates so nearby GPS ticks reuse the same road path', () => {
    expect(
      drivingRouteCacheKey({ lat: 12.91111, lng: 77.64111 }, { lat: 12.92, lng: 77.65 })
    ).toBe('12.9111,77.6411>12.9200,77.6500');
  });
});

describe('jobsMap camera fit', () => {
  it('zooms All to ongoing jobs, not every follow-up', () => {
    const rows = [
      job({ id: 'open', lat: 12.91, lng: 77.64, status: 'PENDING' }),
      job({ id: 'fu', lat: 13.2, lng: 77.7, status: 'FOLLOW_UP' }),
    ];
    expect(jobsMapCameraJobs(rows, 'all').map((row) => row.id)).toEqual(['open']);
    expect(
      jobsMapCameraJobs(filterJobsMapJobs(rows, 'followup'), 'followup').map((row) => row.id)
    ).toEqual(['fu']);
  });

  it('drops a far technician so zoom stays on the local cluster', () => {
    const fitted = jobsMapFitPoints([
      { lat: 12.91, lng: 77.64 },
      { lat: 12.915, lng: 77.645 },
      { lat: 13.34, lng: 74.79 },
    ]);
    expect(fitted).toHaveLength(2);
    expect(fitted.every((point) => point.lat < 13)).toBe(true);
    expect(jobsMapSuggestedZoom(fitted)).toBeGreaterThanOrEqual(14);
  });

  it('keeps only nearby or assigned technicians for the camera', () => {
    const pin = job({ id: 'j1', lat: 12.91, lng: 77.64, assigned_technician_id: 'near' });
    const kept = techsNearJobs(
      [pin],
      [
        tech({ id: 'near', lat: 12.912, lng: 77.641, updatedAt: new Date().toISOString() }),
        tech({ id: 'mysore', lat: 12.3, lng: 76.65, updatedAt: new Date().toISOString() }),
      ]
    );
    expect(kept.map((row) => row.id)).toEqual(['near']);
  });
});

describe('jobsMapTechPhotoThumb', () => {
  it('asks Cloudinary for a retina circular crop instead of the full photo', () => {
    const full = 'https://res.cloudinary.com/demo/image/upload/v1/techs/pradeep.jpg';
    const thumb = jobsMapTechPhotoThumb(full);
    expect(thumb).toContain('w_192,h_192,c_fill,g_face,r_max');
    expect(thumb).toContain('dpr_2.0');
    expect(jobsMapTechPhotoThumb(full)).toBe(thumb);
  });
});

describe('jobsMap last-known GPS', () => {
  it('reads last-known coordinates when live GPS is missing', () => {
    expect(
      parseJobsMapLastLocation({
        id: 't1',
        current_location: { latitude: 12.91, longitude: 77.64, lastUpdated: '2026-09-20T04:00:00.000Z' },
      })
    ).toEqual({
      id: 't1',
      lat: 12.91,
      lng: 77.64,
      updatedAt: '2026-09-20T04:00:00.000Z',
    });
  });

  it('places a technician from last-known GPS when there is no live row', () => {
    const placed = buildJobsMapTechs(
      [
        {
          id: 't1',
          fullName: 'Pradeep',
          account_status: 'ACTIVE',
          photo: null,
        } as never,
      ],
      [],
      [{ id: 't1', lat: 12.91, lng: 77.64, updatedAt: null }]
    );
    expect(placed).toHaveLength(1);
    expect(placed[0].source).toBe('last');
    expect(placed[0].lat).toBe(12.91);
  });
});

describe('jobsMapReachLabel', () => {
  it('adds the clock time they would reach if they left now', () => {
    const now = Date.parse('2026-09-20T10:13:00+05:30');
    const label = jobsMapReachLabel('32 mins', 32 * 60, now);
    expect(label).toContain('32 mins');
    expect(label.toLowerCase()).toMatch(/10:45/);
  });
});

describe('jobsMap live GPS merge', () => {
  it('keeps previous coordinates when a realtime update omits lat/lng', () => {
    const prev = [
      {
        technician_id: 't1',
        latitude: 12.91,
        longitude: 77.64,
        is_tracking: true,
        updated_at: '2026-09-20T04:00:00.000Z',
        fix_time: '2026-09-20T03:50:00.000Z',
      },
    ];
    const merged = mergeJobsMapLiveRows(prev, {
      technician_id: 't1',
      updated_at: '2026-09-20T04:30:00.000Z',
      is_tracking: true,
    });
    expect(merged[0].latitude).toBe(12.91);
    expect(merged[0].updated_at).toBe('2026-09-20T04:30:00.000Z');
  });

  it('applies a newer GPS fix', () => {
    const merged = mergeJobsMapLiveRows(
      [
        {
          technician_id: 't1',
          latitude: 12.91,
          longitude: 77.64,
          is_tracking: true,
          updated_at: '2026-09-20T04:00:00.000Z',
          fix_time: null,
        },
      ],
      {
        technician_id: 't1',
        latitude: 12.92,
        longitude: 77.65,
        updated_at: '2026-09-20T04:40:00.000Z',
        fix_time: '2026-09-20T04:40:00.000Z',
        is_tracking: true,
      }
    );
    expect(merged[0].latitude).toBe(12.92);
    expect(jobsMapLiveStamp(merged[0])).toBe('2026-09-20T04:40:00.000Z');
  });

  it('parses string coordinates from a live row', () => {
    expect(
      parseJobsMapLiveRow({ technician_id: 't1', latitude: '12.91', longitude: '77.64' })
    ).toMatchObject({
      technician_id: 't1',
      latitude: 12.91,
      longitude: 77.64,
    });
  });
});
