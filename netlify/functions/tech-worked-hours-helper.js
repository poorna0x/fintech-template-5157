/**
 * Daily technician worked hours = span from first job start today
 * to last job completed today (IST). Shared by the nightly cron.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDayBounds(nowMs = Date.now()) {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const dayStartUtc = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dayStartUtc: dayStartUtc.getTime(), dayEndUtc: dayEndUtc.getTime() };
}

function parseMs(value) {
  if (!value) return null;
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : null;
}

function jobCompletionMs(job) {
  const a = parseMs(job?.completed_at);
  const b = parseMs(job?.end_time);
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * @param {Array<{ start_time?: string, completed_at?: string, end_time?: string }>} jobs
 * @param {number} [nowMs]
 */
function computeTechWorkedHours(jobs, nowMs = Date.now()) {
  const { dayStartUtc, dayEndUtc } = istDayBounds(nowMs);
  const startsToday = [];
  const completesToday = [];
  const startsOfCompletedToday = [];

  for (const job of jobs || []) {
    const start = parseMs(job.start_time);
    if (start != null && start >= dayStartUtc && start < dayEndUtc) {
      startsToday.push(start);
    }
    const complete = jobCompletionMs(job);
    if (complete != null && complete >= dayStartUtc && complete < dayEndUtc) {
      completesToday.push(complete);
      if (start != null) startsOfCompletedToday.push(start);
    }
  }

  let firstStartMs = startsToday.length ? Math.min(...startsToday) : null;
  const lastCompleteMs = completesToday.length ? Math.max(...completesToday) : null;
  if (firstStartMs == null && startsOfCompletedToday.length) {
    firstStartMs = Math.min(...startsOfCompletedToday);
  }

  const live = firstStartMs != null && lastCompleteMs == null;
  const endMs = lastCompleteMs != null ? lastCompleteMs : live ? nowMs : null;
  let durationMs = null;
  if (firstStartMs != null && endMs != null && endMs >= firstStartMs) {
    durationMs = endMs - firstStartMs;
  }

  return {
    firstStartMs,
    lastCompleteMs,
    endMs,
    durationMs,
    live,
    completedCount: completesToday.length,
  };
}

function formatWorkedDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatIstClock(ms) {
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatWorkedHoursPushBody(summary, extra) {
  if (
    !summary ||
    summary.durationMs == null ||
    summary.firstStartMs == null ||
    summary.lastCompleteMs == null
  ) {
    return null;
  }
  const hours = formatWorkedDuration(summary.durationMs);
  const from = formatIstClock(summary.firstStartMs);
  const to = formatIstClock(summary.lastCompleteMs);
  const kmLabel = extra && extra.kmLabel ? String(extra.kmLabel).trim() : '';
  if (kmLabel) {
    return `Today you worked ${hours} (${from} \u2192 ${to}) \u00b7 travelled ~${kmLabel}.`;
  }
  return `Today you worked ${hours} (${from} \u2192 ${to}).`;
}

module.exports = {
  IST_OFFSET_MS,
  istDayBounds,
  parseMs,
  jobCompletionMs,
  computeTechWorkedHours,
  formatWorkedDuration,
  formatIstClock,
  formatWorkedHoursPushBody,
};
