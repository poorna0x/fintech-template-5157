/**
 * Notify assigned technician when admin edits job details (one push, specific copy).
 */
import { formatCustomTimeLabel } from '@/lib/adminUtils';
import {
  TECH_PUSH_COLOR_UPDATED,
  notifyTechnicianJobPush,
} from '@/lib/adminTechPushNotify';

export type JobEditSnapshot = {
  description: string;
  cost_agreed: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  scheduledTimeCustom: string;
  serviceType?: string;
  serviceSubType?: string;
  serviceSubTypeCustom?: string;
};

function normalize(s: string | null | undefined): string {
  return String(s ?? '').trim();
}

function timeOnlyLabel(snap: JobEditSnapshot): string {
  if (snap.scheduledTimeSlot === 'CUSTOM' && snap.scheduledTimeCustom) {
    return formatCustomTimeLabel(snap.scheduledTimeCustom) || snap.scheduledTimeCustom;
  }
  if (snap.scheduledTimeSlot === 'FLEXIBLE') return 'Flexible';
  const slotMap: Record<string, string> = {
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    EVENING: 'Evening',
  };
  return slotMap[snap.scheduledTimeSlot] || snap.scheduledTimeSlot || 'time TBD';
}

function scheduleLabel(snap: JobEditSnapshot): string {
  const date = normalize(snap.scheduledDate) || 'date TBD';
  return `${date}, ${timeOnlyLabel(snap)}`;
}

function serviceLabel(snap: JobEditSnapshot): string {
  const sub =
    snap.serviceSubType === 'Custom'
      ? normalize(snap.serviceSubTypeCustom) || 'Custom'
      : normalize(snap.serviceSubType) || 'Service';
  const type = normalize(snap.serviceType);
  return type ? `${type} · ${sub}` : sub;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type ChangeFlags = {
  dateChanged: boolean;
  timeChanged: boolean;
  descChanged: boolean;
  costChanged: boolean;
  serviceChanged: boolean;
};

function titleForChanges(f: ChangeFlags): string {
  const kinds = [
    f.dateChanged || f.timeChanged ? 'schedule' : null,
    f.descChanged ? 'description' : null,
    f.costChanged ? 'cost' : null,
    f.serviceChanged ? 'service' : null,
  ].filter(Boolean) as string[];

  if (kinds.length === 0) return 'Job updated';
  if (kinds.length > 1) return 'Job updated';

  if (kinds[0] === 'schedule') {
    if (f.dateChanged && f.timeChanged) return 'Job rescheduled';
    if (f.dateChanged) return 'Job date updated';
    return 'Job time updated';
  }
  if (kinds[0] === 'description') return 'Job description updated';
  if (kinds[0] === 'cost') return 'Agreed cost updated';
  if (kinds[0] === 'service') return 'Service type updated';
  return 'Job updated';
}

/**
 * After a successful Edit Job save: one push to the assigned tech with
 * what actually changed (not a generic “details updated”).
 */
export function notifyTechnicianAfterJobEdit(opts: {
  jobId: string;
  technicianId: string | null | undefined;
  customerName: string;
  before: JobEditSnapshot;
  after: JobEditSnapshot;
}): void {
  const techId = opts.technicianId;
  if (!techId) return;

  const before = opts.before;
  const after = opts.after;
  const customerName = opts.customerName.trim() || 'Customer';

  const flags: ChangeFlags = {
    dateChanged: normalize(before.scheduledDate) !== normalize(after.scheduledDate),
    timeChanged:
      normalize(before.scheduledTimeSlot) !== normalize(after.scheduledTimeSlot) ||
      normalize(before.scheduledTimeCustom) !== normalize(after.scheduledTimeCustom),
    descChanged: normalize(before.description) !== normalize(after.description),
    costChanged: normalize(before.cost_agreed) !== normalize(after.cost_agreed),
    serviceChanged:
      normalize(before.serviceType) !== normalize(after.serviceType) ||
      normalize(before.serviceSubType) !== normalize(after.serviceSubType) ||
      normalize(before.serviceSubTypeCustom) !== normalize(after.serviceSubTypeCustom),
  };

  if (
    !flags.dateChanged &&
    !flags.timeChanged &&
    !flags.descChanged &&
    !flags.costChanged &&
    !flags.serviceChanged
  ) {
    return;
  }

  const lines: string[] = [];

  if (flags.dateChanged && flags.timeChanged) {
    lines.push(`Schedule: ${scheduleLabel(before)} → ${scheduleLabel(after)}`);
  } else if (flags.dateChanged) {
    lines.push(
      `Date: ${normalize(before.scheduledDate) || '—'} → ${normalize(after.scheduledDate) || '—'}`
    );
  } else if (flags.timeChanged) {
    lines.push(`Time: ${timeOnlyLabel(before)} → ${timeOnlyLabel(after)}`);
  }

  if (flags.descChanged) {
    const next = normalize(after.description);
    lines.push(
      next
        ? `Description: ${truncate(next, 100)}`
        : 'Description cleared'
    );
  }

  if (flags.costChanged) {
    const prev = normalize(before.cost_agreed) || '—';
    const next = normalize(after.cost_agreed);
    lines.push(next ? `Agreed cost: ${prev} → ${next}` : 'Agreed cost cleared');
  }

  if (flags.serviceChanged) {
    lines.push(`Service: ${serviceLabel(before)} → ${serviceLabel(after)}`);
  }

  let body = `${customerName} — ${lines.join(' · ')}`;
  if (body.length > 300) body = `${body.slice(0, 297)}…`;

  notifyTechnicianJobPush({
    technicianId: techId,
    jobId: opts.jobId,
    title: titleForChanges(flags),
    body,
    color: TECH_PUSH_COLOR_UPDATED,
    event: 'updated',
  });
}
