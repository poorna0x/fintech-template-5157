/**
 * Notify assigned technician when admin edits job details (push + email).
 */
import { formatCustomTimeLabel, getFormattedTimeSlot, parseJobRequirements } from '@/lib/adminUtils';
import {
  jobDetailsUpdatedPushText,
  jobRescheduledPushText,
  notifyTechnicianJobPush,
} from '@/lib/adminTechPushNotify';
import { emailService } from '@/lib/email';
import { supabase } from '@/lib/supabase';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function emailTechnician(opts: {
  technicianId: string;
  subject: string;
  lines: string[];
  jobId?: string;
}): Promise<void> {
  try {
    const { data: tech } = await supabase
      .from('technicians')
      .select('email,full_name')
      .eq('id', opts.technicianId)
      .maybeSingle();
    const to = String(tech?.email || '').trim();
    if (!to || !to.includes('@')) return;

    const text = opts.lines.join('\n');
    const html = `<p>Hi ${escapeHtml(tech?.full_name || 'there')},</p><p>${opts.lines
      .map((l) => escapeHtml(l))
      .join('<br/>')}</p><p>— Hydrogen RO office</p>`;

    await emailService.sendAdminComposerEmail({
      templateType: 'general',
      documentBrand: 'hydrogenro',
      to,
      subject: opts.subject,
      html,
      text,
      jobId: opts.jobId || null,
    });
  } catch (e) {
    console.warn('[notifyTechJobEdit] email failed', e);
  }
}

/**
 * After a successful Edit Job save: push (and email for desc/cost) the assigned tech.
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
    void emailTechnician({
      technicianId: techId,
      jobId: opts.jobId,
      subject: `Job rescheduled — ${customerName}`,
      lines: [
        `A job was rescheduled.`,
        `Customer: ${customerName}`,
        `New schedule: ${whenLabel}`,
        before.scheduledDate || before.scheduledTimeSlot
          ? `Previous: ${scheduleLabel(before)}`
          : '',
      ].filter(Boolean),
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
    void emailTechnician({
      technicianId: techId,
      jobId: opts.jobId,
      subject: `Job details updated — ${customerName}`,
      lines: [
        `Job details were updated by the office.`,
        `Customer: ${customerName}`,
        ...changes,
      ],
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
