import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import { broadcastTechnicianJobListRefreshForJob } from '@/lib/technicianJobListSync';
import { db, supabase } from '@/lib/supabase';
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
  },
  remark?: string
) {
  if (!jobToDelete) return;

  try {
    const customerId =
      (jobToDelete as any).customer_id || jobToDelete.customerId || null;
    if (customerId) {
      let deletedBy: string | null = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        deletedBy = authData?.user?.id || null;
      } catch {
        deletedBy = null;
      }
      const { error: eventError } = await db.customerJobDeleteEvents.insert({
        customer_id: String(customerId),
        job_id: jobToDelete.id || null,
        job_number:
          (jobToDelete as any).job_number || jobToDelete.jobNumber || null,
        job_status: (jobToDelete as any).status || jobToDelete.status || null,
        service_type:
          (jobToDelete as any).service_type || jobToDelete.serviceType || null,
        remark: remark?.trim() || null,
        deleted_by: deletedBy,
      });
      if (eventError) {
        console.warn('Job delete remark save failed (continuing delete):', eventError);
        toast.warning(
          'Could not save delete remark on customer (run scripts/add-customer-job-delete-events.sql). Job will still be deleted.'
        );
      }
    }

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

    toast.success(`Job ${jobToDelete.job_number || jobToDelete.jobNumber} deleted successfully`);
    ctx.closeAdminModal();
    ctx.setDeleteJobDialogOpen(false);
    ctx.setJobToDelete(null);
  } catch {
    toast.error('Failed to delete job');
  }
}
