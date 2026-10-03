import { supabase } from '@/lib/supabase';

const LEAVE_MESSAGE = 'We are closed that day. Please pick another date.';

export function istTodayIso(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function normalizeLeaveDate(value: unknown): string {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function isBookingLeaveDate(date: unknown, leaveDates: Iterable<string>): boolean {
  const day = normalizeLeaveDate(date);
  if (!day) return false;
  for (const leave of leaveDates) {
    if (leave === day) return true;
  }
  return false;
}

/** First bookable day on or after `from`, skipping leave dates. */
export function nextOpenBookingDate(leaveDates: Iterable<string>, from: string): string {
  const closed = new Set(Array.from(leaveDates, (day) => normalizeLeaveDate(day)).filter(Boolean));
  const start = normalizeLeaveDate(from) || istTodayIso();
  const cursor = new Date(`${start}T12:00:00+05:30`);
  for (let i = 0; i < 90; i += 1) {
    const iso = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (!closed.has(iso)) return iso;
    cursor.setDate(cursor.getDate() + 1);
  }
  return start;
}

export function bookingLeaveMessage(): string {
  return LEAVE_MESSAGE;
}

/** Upcoming leave days for the public calendar. Empty if the table is not created yet. */
export async function fetchBookingLeaveDates(): Promise<string[]> {
  const today = istTodayIso();
  const { data, error } = await supabase
    .from('booking_leave_dates')
    .select('leave_date')
    .gte('leave_date', today)
    .order('leave_date', { ascending: true })
    .limit(120);
  if (error || !data) return [];
  return data
    .map((row) => normalizeLeaveDate((row as { leave_date?: unknown }).leave_date))
    .filter(Boolean);
}

export async function addBookingLeaveDate(date: string): Promise<{ ok: boolean; error?: string }> {
  const day = normalizeLeaveDate(date);
  if (!day) return { ok: false, error: 'Pick a date' };
  const { error } = await supabase.from('booking_leave_dates').insert({ leave_date: day });
  if (!error) return { ok: true };
  if (/duplicate|unique|23505/i.test(error.message || '')) {
    return { ok: false, error: 'That day is already marked as leave' };
  }
  if (/booking_leave_dates|schema cache|does not exist|42P01/i.test(error.message || '')) {
    return { ok: false, error: 'Run scripts/add-booking-leave-dates.sql in Supabase first' };
  }
  return { ok: false, error: error.message || 'Could not save leave' };
}

export async function removeBookingLeaveDate(date: string): Promise<{ ok: boolean; error?: string }> {
  const day = normalizeLeaveDate(date);
  if (!day) return { ok: false, error: 'Pick a date' };
  const { error } = await supabase.from('booking_leave_dates').delete().eq('leave_date', day);
  if (error) return { ok: false, error: error.message || 'Could not remove leave' };
  return { ok: true };
}
