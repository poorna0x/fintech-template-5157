import { describe, expect, it } from 'vitest';
import {
  bookingCustomHoursForPeriod,
  clampBookingCustomTime,
  isBookingCustomTimeAllowed,
} from './bookingCustomTime';

describe('isBookingCustomTimeAllowed', () => {
  it('allows 9 AM through 5 PM', () => {
    expect(isBookingCustomTimeAllowed('09:00')).toBe(true);
    expect(isBookingCustomTimeAllowed('10:30')).toBe(true);
    expect(isBookingCustomTimeAllowed('12:00')).toBe(true);
    expect(isBookingCustomTimeAllowed('16:59')).toBe(true);
    expect(isBookingCustomTimeAllowed('17:00')).toBe(true);
  });

  it('rejects times outside the window', () => {
    expect(isBookingCustomTimeAllowed('08:59')).toBe(false);
    expect(isBookingCustomTimeAllowed('17:01')).toBe(false);
    expect(isBookingCustomTimeAllowed('21:00')).toBe(false);
    expect(isBookingCustomTimeAllowed('')).toBe(false);
  });
});

describe('clampBookingCustomTime', () => {
  it('snaps outside times onto the 9 AM – 5 PM edges', () => {
    expect(clampBookingCustomTime('07:15')).toBe('09:00');
    expect(clampBookingCustomTime('18:45')).toBe('17:00');
    expect(clampBookingCustomTime('11:20')).toBe('11:20');
  });
});

describe('bookingCustomHoursForPeriod', () => {
  it('only offers hours that stay inside the window', () => {
    expect(bookingCustomHoursForPeriod('AM')).toEqual([9, 10, 11]);
    expect(bookingCustomHoursForPeriod('PM')).toEqual([12, 1, 2, 3, 4, 5]);
  });
});
