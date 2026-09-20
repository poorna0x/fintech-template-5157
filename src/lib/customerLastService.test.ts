import { describe, expect, it } from 'vitest';
import {
  jobChangeAffectsLastService,
  lastServiceDateForDb,
  pickLastCompletedServiceAt,
} from './customerLastService';

describe('pickLastCompletedServiceAt', () => {
  it('picks the latest completed_at', () => {
    expect(
      pickLastCompletedServiceAt([
        { completed_at: '2026-06-30T10:00:00.000Z' },
        { completed_at: '2026-09-02T16:00:00.000Z' },
        { completed_at: '2026-08-01T08:00:00.000Z' },
      ])
    ).toBe('2026-09-02T16:00:00.000Z');
  });

  it('uses end_time when completed_at is missing', () => {
    expect(
      pickLastCompletedServiceAt([
        { completed_at: null, end_time: '2026-07-15T12:00:00.000Z' },
        { completed_at: '2026-07-01T12:00:00.000Z' },
      ])
    ).toBe('2026-07-15T12:00:00.000Z');
  });

  it('returns null when there are no completion times', () => {
    expect(pickLastCompletedServiceAt([])).toBeNull();
    expect(pickLastCompletedServiceAt([{ completed_at: null, end_time: '' }])).toBeNull();
  });
});

describe('lastServiceDateForDb', () => {
  it('stores the Asia/Kolkata calendar day', () => {
    expect(lastServiceDateForDb('2026-09-02T16:10:15.816Z')).toBe('2026-09-02');
    expect(lastServiceDateForDb('2026-09-02')).toBe('2026-09-02');
  });

  it('returns null when empty', () => {
    expect(lastServiceDateForDb(null)).toBeNull();
    expect(lastServiceDateForDb('')).toBeNull();
  });
});

describe('jobChangeAffectsLastService', () => {
  it('is true when status or completion times change', () => {
    expect(jobChangeAffectsLastService({ status: 'COMPLETED' })).toBe(true);
    expect(jobChangeAffectsLastService({ completed_at: '2026-09-02T00:00:00.000Z' })).toBe(true);
    expect(jobChangeAffectsLastService({ assigned_technician_id: 'x' })).toBe(false);
  });
});
