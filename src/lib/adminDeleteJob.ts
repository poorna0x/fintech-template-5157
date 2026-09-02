import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { broadcastTechnicianJobListRefreshForJob } from '@/lib/technicianJobListSync';
import { db, supabase } from '@/lib/supabase';
import type { Job } from '@/types';

function removeJobFromLocalState(
  deletedId: string,
  ctx: {
    statusFilter: AdminStatusFilter;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setLoadedCompletedJobDetails: Dispatch<SetStateAction<Record<string, Job>>>;
    setLoadingCompletedJobDetails: Dispatch<SetStateAction<Record<string, boolean>>>;
    setTotalCount: Dispatch<SetStateAction<number>>;
  }
) {
  ctx.setJobs((prev) => prev.filter((job) => job.id !== deletedId));
  ctx.setCustomerJobs((prev) => {
    const updated = { ...prev };
    Object.keys(updated).forEach((customerIdKey) => {
      updated[customerIdKey] = updated[customerIdKey].filter((job) => job.id !== deletedId);
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
}

function restoreJobToLocalState(
  job: Job,
  ctx: {
    statusFilter: AdminStatusFilter;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setTotalCount: Dispatch<SetStateAction<number>>;
  }
) {
  const deletedId = job.id;
  ctx.setJobs((prev) => (prev.some((j) => j.id === deletedId) ? prev : [job, ...prev]));
  const customerId = String((job as any).customer_id || job.customerId || '');
  if (customerId) {
    ctx.setCustomerJobs((prev) => {
      const list = prev[customerId] || [];
      if (list.some((j) => j.id === deletedId)) return prev;
      return { ...prev, [customerId]: [job, ...list] };
    });
  }
  if (ctx.statusFilter === 'COMPLETED' || ctx.statusFilter === 'CANCELLED') {
    ctx.setTotalCount((prev) => prev + 1);
  }
}

async function saveDeleteRemarkIfNeeded(job: Job, remark: string) {
  const customerId = (job as any).customer_id || job.customerId || null;
  if (!customerId || !remark) return;

  let deletedBy: string | null = null;
  try {
    // Local session is faster than getUser() network round-trip.
    const { data: sessionData } = await supabase.auth.getSession();
    deletedBy = sessionData?.session?.user?.id || null;
  } catch {
    deletedBy = null;
  }

  const { error: eventError } = await db.customerJobDeleteEvents.insert({
    customer_id: String(customerId),
    job_id: job.id || null,
    job_number: (job as any).job_number || job.jobNumber || null,
    job_status: (job as any).status || job.status || null,
    service_type: (job as any).service_type || job.serviceType || null,
    remark,
    deleted_by: deletedBy,
  });
  if (eventError) {
    console.warn('Job delete remark save failed (job already deleted):', eventError);
    toast.warning(
      'Job deleted, but remark could not be saved (run scripts/add-customer-job-delete-events.sql).'
    );
  }
}

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
  },
  remark?: string
) {
  if (!jobToDelete) return;

  const deletedId = jobToDelete.id;
  const trimmedRemark = remark?.trim() || '';
  const jobNumber = jobToDelete.job_number || jobToDelete.jobNumber;

  // Optimistic: close dialog + remove from UI immediately, then finish on the server.
  removeJobFromLocalState(deletedId, ctx);
  ctx.closeAdminModal();
  ctx.setDeleteJobDialogOpen(false);
  ctx.setJobToDelete(null);
  toast.success(`Job ${jobNumber} deleted successfully`);

  try {
    broadcastTechnicianJobListRefreshForJob(jobToDelete);

    const remarkPromise = trimmedRemark
      ? saveDeleteRemarkIfNeeded(jobToDelete, trimmedRemark)
      : Promise.resolve();

    const [{ error }] = await Promise.all([
      db.jobs.delete(deletedId),
      remarkPromise,
    ]);

    if (error) {
      const msg = error.message || 'Failed to delete job';
      if (error.code === '409' || /409|conflict|foreign key|23503/i.test(msg)) {
        throw new Error(
          'Could not delete this job. Re-run scripts/delete-job-admin-rpc.sql and scripts/technician-job-sync-realtime.sql in Supabase SQL Editor.'
        );
      }
      throw new Error(msg);
    }
  } catch (err) {
    restoreJobToLocalState(jobToDelete, ctx);
    const message = err instanceof Error ? err.message : 'Failed to delete job';
    toast.error(message);
  }
}
