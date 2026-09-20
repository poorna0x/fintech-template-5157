import { describe, expect, it } from 'vitest';
import {
  formatVisitOrderDrive,
  suggestVisitOrderByNearest,
  visitOrderReachPlan,
} from './adminVisitOrder';

describe('visitOrderReachPlan', () => {
  it('adds drive time so each stop has a reaching clock', () => {
    const now = Date.parse('2026-09-20T10:00:00+05:30');
    const plan = visitOrderReachPlan(
      [
        { jobId: 'a', durationSeconds: 15 * 60, durationText: '15 mins', distanceMeters: 4000 },
        { jobId: 'b', durationSeconds: 20 * 60, durationText: '20 mins', distanceMeters: 7000 },
      ],
      now
    );
    expect(plan[0].reachAt.toLowerCase()).toMatch(/10:15/);
    expect(plan[1].reachAt.toLowerCase()).toMatch(/10:35/);
    expect(plan[1].cumulativeSeconds).toBe(35 * 60);
  });
});

describe('suggestVisitOrderByNearest', () => {
  it('orders stops from the technician outward and keeps jobs with no pin last', () => {
    const start = { lat: 12.91, lng: 77.64 };
    const ordered = suggestVisitOrderByNearest(
      start,
      [
        { id: 'far', lat: 13.05, lng: 77.8 },
        { id: 'near', lat: 12.912, lng: 77.641 },
        { id: 'none' },
      ],
      (item) => ('lat' in item && 'lng' in item ? { lat: item.lat, lng: item.lng } : null)
    );
    expect(ordered.map((row) => row.id)).toEqual(['near', 'far', 'none']);
  });
});

describe('formatVisitOrderDrive', () => {
  it('formats minutes and hours', () => {
    expect(formatVisitOrderDrive(9 * 60)).toBe('9 min');
    expect(formatVisitOrderDrive(75 * 60)).toBe('1 hr 15 min');
  });
});
