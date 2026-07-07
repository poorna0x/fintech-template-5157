import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import type { Job } from '@/types';

export async function prepareAdminDenyJob(job: Job): Promise<Job> {
  if (!job.customer || (!(job.customer as any)?.full_name && !job.customer?.fullName)) {
    try {
      const { data: fullJob, error } = await db.jobs.getByIdFull(job.id);
      if (!error && fullJob) {
        return fullJob as Job;
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
    }
  }
  return job;
}

export async function submitAdminJobDeny(
  ctx: {
    selectedJobForDeny: Job | null;
    denyReason: string;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setDenyDialogOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedJobForDeny: Dispatch<SetStateAction<Job | null>>;
    setDenyReason: Dispatch<SetStateAction<string>>;
  }
) {
  if (!ctx.selectedJobForDeny || !ctx.denyReason.trim()) {
    toast.error('Please provide a reason for denial');
    return;
  }

  try {
    const deniedByValue = 'Admin';
    const trimmedReason = ctx.denyReason.trim();
    const deniedAt = new Date().toISOString();

    const { error } = await db.jobs.update(ctx.selectedJobForDeny.id, {
      status: 'DENIED',
      denial_reason: trimmedReason,
      denied_by: deniedByValue,
      denied_at: deniedAt,
    } as any);

    if (error) {
      throw new Error(error.message);
    }

    const jobId = ctx.selectedJobForDeny.id;
    ctx.setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'DENIED',
              denialReason: trimmedReason,
              deniedBy: 'Admin',
              deniedAt,
            }
          : job
      )
    );

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: 'DENIED',
                denialReason: trimmedReason,
                deniedBy: 'Admin',
                deniedAt,
              }
            : job
        );
      });
      return updated;
    });

    toast.success('Job denied successfully');
    ctx.setDenyDialogOpen(false);
    ctx.setSelectedJobForDeny(null);
    ctx.setDenyReason('');
  } catch (error: any) {
    console.error('Error denying job:', error);
    const errorMessage = error?.message || 'Failed to deny job';

    if (
      errorMessage.includes('denial_reason') ||
      errorMessage.includes('denied_by') ||
      errorMessage.includes('denied_at') ||
      errorMessage.includes('400')
    ) {
      toast.error('Database columns missing. Please run the migration: add-denial-fields-to-jobs.sql', {
        duration: 8000,
      });
    } else {
      toast.error(errorMessage);
    }
  }
}
