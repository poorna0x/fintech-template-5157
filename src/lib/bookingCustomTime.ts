/** Website booking custom times — same working window as Morning + Afternoon. */

export const BOOKING_CUSTOM_EARLIEST = '09:00';
export const BOOKING_CUSTOM_LATEST = '18:00';

const MIN_MINUTES = 9 * 60;
const MAX_MINUTES = 18 * 60;

export function hhmmToMinutes(value: string | null | undefined): number | null {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isBookingCustomTimeAllowed(value: string | null | undefined): boolean {
  const mins = hhmmToMinutes(value);
  if (mins == null) return false;
  return mins >= MIN_MINUTES && mins <= MAX_MINUTES;
}

export function clampBookingCustomTime(value: string | null | undefined): string {
  const mins = hhmmToMinutes(value);
  if (mins == null) return '';
  const clamped = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, mins));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function bookingCustomHoursForPeriod(period: 'AM' | 'PM'): number[] {
  return period === 'AM' ? [9, 10, 11] : [12, 1, 2, 3, 4, 5, 6];
}
