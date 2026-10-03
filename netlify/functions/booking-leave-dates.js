/** Upcoming company leave days. Missing table = no leave (do not block booking). */

const CACHE_MS = 60 * 1000;
let cache = { at: 0, dates: null };

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function normalizeDay(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

async function loadBookingLeaveDateSet(db) {
  const now = Date.now();
  if (cache.dates && now - cache.at < CACHE_MS) return cache.dates;
  if (!db) return new Set();
  const { data, error } = await db
    .from('booking_leave_dates')
    .select('leave_date')
    .gte('leave_date', todayIso())
    .limit(120);
  if (error) return cache.dates || new Set();
  const dates = new Set(
    (data || []).map((row) => normalizeDay(row && row.leave_date)).filter(Boolean)
  );
  cache = { at: now, dates };
  return dates;
}

async function isBookingLeaveDate(db, date) {
  const day = normalizeDay(date);
  if (!day) return false;
  const dates = await loadBookingLeaveDateSet(db);
  return dates.has(day);
}

module.exports = {
  loadBookingLeaveDateSet,
  isBookingLeaveDate,
  normalizeDay,
};
