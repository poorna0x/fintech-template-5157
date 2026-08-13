import type { Job } from '@/types';

export function getTodayLocalDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTomorrowLocalDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
}

/** Calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function getIstCalendarDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Admin new-job default: today until 7:00 PM IST, then tomorrow.
 * After hours, new jobs are almost always for the next working day.
 */
export function getDefaultNewJobScheduledDate(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)
  );
  const today = getIstCalendarDate(now);
  if (!Number.isFinite(hour) || hour < 19) return today;
  const [year, month, day] = today.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function followUpDateToStr(
  followUpDate: string | null | undefined
): string | null {
  if (!followUpDate) return null;
  if (followUpDate.includes('T')) {
    const d = new Date(followUpDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return followUpDate.split('T')[0].trim();
}

export function getJobCompletionDate(job: Job): number {
  const completedAt = (job as any).completed_at || job.completedAt;
  const endTime = (job as any).end_time || job.endTime;
  const completionDate = completedAt || endTime;
  if (completionDate) {
    return new Date(completionDate).getTime();
  }
  const scheduledDate = (job as any).scheduled_date || job.scheduledDate;
  if (scheduledDate) {
    return new Date(scheduledDate).getTime();
  }
  return new Date(job.createdAt).getTime();
}

export function completedDateToStr(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isDateWithinCompletedRange(
  dateStr: string | null,
  params: {
    completedDatePreset: string;
    completedDateFilter: string;
    completedRangeStartDate: string;
    completedRangeEndDate: string;
  }
): boolean {
  if (!dateStr) return false;
  if (params.completedDatePreset === 'day') {
    return dateStr === params.completedDateFilter;
  }
  const start =
    params.completedRangeStartDate <= params.completedRangeEndDate
      ? params.completedRangeStartDate
      : params.completedRangeEndDate;
  const end =
    params.completedRangeStartDate <= params.completedRangeEndDate
      ? params.completedRangeEndDate
      : params.completedRangeStartDate;
  return dateStr >= start && dateStr <= end;
}
