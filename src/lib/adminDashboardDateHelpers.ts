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
