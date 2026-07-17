/**
 * Notify assigned technician when admin edits job details (push only).
 */
import { formatCustomTimeLabel, getFormattedTimeSlot, parseJobRequirements } from '@/lib/adminUtils';
import {
  jobDetailsUpdatedPushText,
  jobRescheduledPushText,
  notifyTechnicianJobPush,
} from '@/lib/adminTechPushNotify';

export type JobEditSnapshot = {
  description: string;
  cost_agreed: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  scheduledTimeCustom: string;
};

function normalize(s: string | null | undefined): string {
  return String(s ?? '').trim();
}

function scheduleLabel(snap: JobEditSnapshot): string {
  const date = normalize(snap.scheduledDate) || 'date TBD';
  if (snap.scheduledTimeSlot === 'CUSTOM' && snap.scheduledTimeCustom) {
    const t = formatCustomTimeLabel(snap.scheduledTimeCustom) || snap.scheduledTimeCustom;
    return `${date}, ${t}`;
  }
  if (snap.scheduledTimeSlot === 'FLEXIBLE') return `${date}, Flexible`;
  const slotMap: Record<string, string> = {
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    EVENING: 'Evening',
  };
  const slot = slotMap[snap.scheduledTimeSlot] || snap.scheduledTimeSlot || 'time TBD';
  return `${date}, ${slot}`;
}

/**
 * After a successful Edit Job save: push the assigned tech (no email).
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

  const descChanged = normalize(before.description) !== normalize(after.description);
  const costChanged = normalize(before.cost_agreed) !== normalize(after.cost_agreed);
  const dateChanged = normalize(before.scheduledDate) !== normalize(after.scheduledDate);
  const timeChanged =
    normalize(before.scheduledTimeSlot) !== normalize(after.scheduledTimeSlot) ||
    normalize(before.scheduledTimeCustom) !== normalize(after.scheduledTimeCustom);

  if (!descChanged && !costChanged && !dateChanged && !timeChanged) return;

  if (dateChanged || timeChanged) {
    const whenLabel = scheduleLabel(after);
    notifyTechnicianJobPush({
      technicianId: techId,
      ...jobRescheduledPushText({ customerName, whenLabel }),
    });
  }

  if (descChanged || costChanged) {
    const changes: string[] = [];
    if (costChanged) {
      changes.push(
        after.cost_agreed.trim()
          ? `Agreed cost: ${after.cost_agreed.trim()}`
          : 'Agreed cost cleared'
      );
    }
    if (descChanged) {
      const d = after.description.trim();
      changes.push(d ? `Description: ${d.slice(0, 120)}` : 'Description cleared');
    }
    notifyTechnicianJobPush({
      technicianId: techId,
      ...jobDetailsUpdatedPushText({ customerName, changes }),
    });
  }
}

/** Build EditJobSnapshot-compatible schedule label from a saved job row (optional). */
export function scheduleLabelFromJob(job: Record<string, unknown>): string {
  const date = String(
    (job as { scheduled_date?: string }).scheduled_date ||
      (job as { scheduledDate?: string }).scheduledDate ||
      ''
  ).trim();
  const reqs = parseJobRequirements((job as { requirements?: unknown }).requirements);
  const slot = String(
    (job as { scheduled_time_slot?: string }).scheduled_time_slot ||
      (job as { scheduledTimeSlot?: string }).scheduledTimeSlot ||
      ''
  );
  try {
    return getFormattedTimeSlot(job, reqs) ? `${date || 'date TBD'}, ${getFormattedTimeSlot(job, reqs)}` : date;
  } catch {
    return date || slot || 'schedule TBD';
  }
}
