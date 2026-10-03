import { describe, expect, it } from 'vitest';
import { isBookingLeaveDate, nextOpenBookingDate, normalizeLeaveDate } from './bookingLeaveDates';

describe('booking leave dates', () => {
  it('keeps a calendar day and drops junk', () => {
    expect(normalizeLeaveDate('2026-10-05')).toBe('2026-10-05');
    expect(normalizeLeaveDate('2026-10-05T00:00:00')).toBe('2026-10-05');
    expect(normalizeLeaveDate('tomorrow')).toBe('');
  });

  it('matches only the exact leave day', () => {
    const leave = ['2026-10-05', '2026-10-06'];
    expect(isBookingLeaveDate('2026-10-05', leave)).toBe(true);
    expect(isBookingLeaveDate('2026-10-07', leave)).toBe(false);
  });

  it('skips leave days when picking the next open date', () => {
    expect(nextOpenBookingDate(['2026-10-05', '2026-10-06'], '2026-10-05')).toBe('2026-10-07');
    expect(nextOpenBookingDate(['2026-10-06'], '2026-10-05')).toBe('2026-10-05');
  });
});
