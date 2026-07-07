/** Move FOLLOW_UP / RESCHEDULED jobs to ongoing (PENDING) when follow_up_date is due. */

export function getLocalTodayYmd(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeDateYmd(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return getLocalTodayYmd(d);
  }
  const part = raw.split('T')[0].trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
}

function parseFollowUpTimeHm(raw: unknown): string | null {
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function deriveScheduleFromFollowUpTime(followUpTime: unknown): {
  scheduled_time_slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
  custom_time?: string;
} {
  const hm = parseFollowUpTimeHm(followUpTime);
  if (!hm) return { scheduled_time_slot: 'MORNING' };
  const hours = Number(hm.split(':')[0]);
  if (hours >= 5 && hours < 12) return { scheduled_time_slot: 'MORNING' };
  if (hours >= 12 && hours < 17) return { scheduled_time_slot: 'AFTERNOON' };
  if (hours >= 17 && hours < 20) return { scheduled_time_slot: 'EVENING' };
  return { scheduled_time_slot: 'CUSTOM', custom_time: hm };
}

export function parseRequirements(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
      }
      if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') return [raw as Record<string, unknown>];
  return [];
}

export function upsertCustomTimeInRequirements(
  requirements: Record<string, unknown>[],
  customTime: string
): Record<string, unknown>[] {
  const next = requirements.length ? [...requirements] : [{}];
  const first = next[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    next[0] = { ...first, custom_time: customTime };
  } else {
    next.push({ custom_time: customTime });
  }
  return next;
}

export const AUTO_MOVE_TO_ONGOING_ON_DATE_KEY = 'auto_move_to_ongoing_on_date';

export function hasAutoMoveToOngoingOnDate(requirements: unknown): boolean {
  return parseRequirements(requirements).some(
    (r) => r[AUTO_MOVE_TO_ONGOING_ON_DATE_KEY] === true
  );
}

export function applyAutoMoveToOngoingOnDateFlag(
  requirements: unknown,
  enabled: boolean
): Record<string, unknown>[] {
  const reqs = parseRequirements(requirements);
  const next = reqs.length ? [...reqs] : [{}];
  const first = { ...(next[0] as Record<string, unknown>) };
  if (enabled) {
    first[AUTO_MOVE_TO_ONGOING_ON_DATE_KEY] = true;
  } else {
    delete first[AUTO_MOVE_TO_ONGOING_ON_DATE_KEY];
  }
  next[0] = first;
  return next;
}

function stripAutoMoveFlagFromRequirements(
  requirements: Record<string, unknown>[]
): Record<string, unknown>[] {
  return requirements
    .map((r, index) => {
      if (index !== 0 || !r || typeof r !== 'object') return r;
      const { [AUTO_MOVE_TO_ONGOING_ON_DATE_KEY]: _removed, ...rest } = r;
      return rest;
    })
    .filter((r) => r && typeof r === 'object' && Object.keys(r).length > 0);
}

export function isFollowUpDueForPromotion(followUpDate: unknown, asOfDate?: string): boolean {
  const ymd = normalizeDateYmd(followUpDate);
  if (!ymd) return false;
  const today = asOfDate || getLocalTodayYmd();
  return ymd <= today;
}

/** DB patch: follow-up job → unassigned PENDING on its follow-up date (only if opted in). */
export function buildPromoteFollowUpJobPatch(jobRow: {
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  requirements?: unknown;
}): Record<string, unknown> | null {
  if (!hasAutoMoveToOngoingOnDate(jobRow.requirements)) return null;

  const scheduledDate = normalizeDateYmd(jobRow.follow_up_date);
  if (!scheduledDate) return null;

  const { scheduled_time_slot, custom_time } = deriveScheduleFromFollowUpTime(jobRow.follow_up_time);
  let requirements = stripAutoMoveFlagFromRequirements(parseRequirements(jobRow.requirements));
  if (scheduled_time_slot === 'CUSTOM' && custom_time) {
    requirements = upsertCustomTimeInRequirements(requirements, custom_time);
  }

  const patch: Record<string, unknown> = {
    status: 'PENDING',
    scheduled_date: scheduledDate,
    scheduled_time_slot,
    follow_up_date: null,
    follow_up_time: null,
    follow_up_notes: null,
    follow_up_scheduled_by: null,
    follow_up_scheduled_at: null,
    assigned_technician_id: null,
    assigned_date: null,
    assigned_by: null,
    team_members: [],
  };

  if (requirements.length > 0) {
    patch.requirements = requirements;
  }

  return patch;
}
