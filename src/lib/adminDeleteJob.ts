import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { broadcastTechnicianJobListRefreshForJob } from '@/lib/technicianJobListSync';
import { db } from '@/lib/supabase';
import type { Job } from '@/types';

export async function deleteAdminJob(
  jobToDelete: Job | null,
  ctx: {
    statusFilter: AdminStatusFilter;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setLoadedCompletedJobDetails: Dispatch<SetStateAction<Record<string, Job>>>;
    setLoadingCompletedJobDetails: Dispatch<SetStateAction<Record<string, boolean>>>;
    setTotalCount: Dispatch<SetStateAction<number>>;
    closeAdminModal: () => void;
    setDeleteJobDialogOpen: Dispatch<SetStateAction<boolean>>;
    setJobToDelete: Dispatch<SetStateAction<Job | null>>;
  }
) {
  if (!jobToDelete) return;

  try {
    broadcastTechnicianJobListRefreshForJob(jobToDelete);
    const { error } = await db.jobs.delete(jobToDelete.id);

    if (error) {
      const msg = error.message || 'Failed to delete job';
      if (error.code === '409' || /409|conflict|foreign key|23503/i.test(msg)) {
        throw new Error(
          'Could not delete this job. Re-run scripts/delete-job-admin-rpc.sql and scripts/technician-job-sync-realtime.sql in Supabase SQL Editor.'
        );
      }
      throw new Error(msg);
    }

    const deletedId = jobToDelete.id;
    ctx.setJobs((prev) => prev.filter((job) => job.id !== deletedId));
    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].filter((job) => job.id !== deletedId);
      });
      return updated;
    });
    ctx.setLoadedCompletedJobDetails((prev) => {
      if (!prev[deletedId]) return prev;
      const next = { ...prev };
      delete next[deletedId];
      return next;
    });
    ctx.setLoadingCompletedJobDetails((prev) => {
      if (!prev[deletedId]) return prev;
      const next = { ...prev };
      delete next[deletedId];
      return next;
    });
    if (ctx.statusFilter === 'COMPLETED' || ctx.statusFilter === 'CANCELLED') {
      ctx.setTotalCount((prev) => Math.max(0, prev - 1));
    }

    toast.success(`Job ${jobToDelete.job_number || jobToDelete.jobNumber} deleted successfully`);
    ctx.closeAdminModal();
    ctx.setDeleteJobDialogOpen(false);
    ctx.setJobToDelete(null);
  } catch {
    toast.error('Failed to delete job');
  }
}
