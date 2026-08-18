const assert = require('node:assert/strict');
const {
  istDayBounds,
  computeTechWorkedHours,
  formatWorkedDuration,
  formatWorkedHoursPushBody,
} = require('../netlify/functions/tech-worked-hours-helper');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function isoAtIst(y, m, d, hour, minute) {
  const utcMs = Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

const noonIst = Date.parse(isoAtIst(2026, 8, 18, 12, 0));

{
  const { dayStartUtc, dayEndUtc } = istDayBounds(noonIst);
  assert.equal(new Date(dayStartUtc).toISOString(), isoAtIst(2026, 8, 18, 0, 0));
  assert.equal(dayEndUtc - dayStartUtc, 24 * 60 * 60 * 1000);
}

{
  const summary = computeTechWorkedHours(
    [
      {
        start_time: isoAtIst(2026, 8, 18, 9, 12),
        completed_at: isoAtIst(2026, 8, 18, 11, 0),
      },
      {
        start_time: isoAtIst(2026, 8, 18, 14, 0),
        completed_at: isoAtIst(2026, 8, 18, 18, 36),
      },
    ],
    noonIst
  );
  assert.equal(summary.live, false);
  assert.equal(summary.completedCount, 2);
  assert.equal(formatWorkedDuration(summary.durationMs), '9h 24m');
  const body = formatWorkedHoursPushBody(summary);
  assert.match(body, /Today you worked 9h 24m/);
  assert.match(body, /9:12/);
  assert.match(body, /6:36/);
}

{
  const summary = computeTechWorkedHours(
    [{ start_time: isoAtIst(2026, 8, 18, 10, 0) }],
    Date.parse(isoAtIst(2026, 8, 18, 12, 15))
  );
  assert.equal(summary.live, true);
  assert.equal(summary.lastCompleteMs, null);
  assert.equal(formatWorkedDuration(summary.durationMs), '2h 15m');
  assert.equal(formatWorkedHoursPushBody(summary), null);
}

{
  const empty = computeTechWorkedHours([], noonIst);
  assert.equal(empty.firstStartMs, null);
  assert.equal(empty.durationMs, null);
  assert.equal(formatWorkedHoursPushBody(empty), null);
}

{
  assert.equal(formatWorkedDuration(45 * 60 * 1000), '45m');
  assert.equal(formatWorkedDuration(2 * 60 * 60 * 1000), '2h');
}

console.log('tech-worked-hours tests passed');
