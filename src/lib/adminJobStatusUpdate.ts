import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  createJobCancelledNotification,
  createJobCompletedNotification,
  sendNotification,
} from '@/lib/notifications';
import {
  applyOtherEnRouteResetLocal,
  revertOtherEnRouteJobsToAssigned,
} from '@/lib/revertOtherEnRouteJobs';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export async function updateAdminJobStatus(
  jobId: string,
  newStatus: string,
  ctx: {
    jobs: Job[];
    technicians: Technician[];
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setJobs: Dispatch<SetStateAction<Job[]>>;
  }
) {
  try {
    const { data: updatedRow, error } = await db.jobs.update(jobId, {
      status: newStatus as
        | 'PENDING'
        | 'ASSIGNED'
        | 'EN_ROUTE'
        | 'IN_PROGRESS'
        | 'COMPLETED'
        | 'CANCELLED'
        | 'RESCHEDULED',
    });

    if (error) {
      throw new Error(error.message);
    }

    const started = ctx.jobs.find((j) => j.id === jobId);
    const technicianId = String(
      (updatedRow as { assigned_technician_id?: string } | null)?.assigned_technician_id ||
        started?.assigned_technician_id ||
        started?.assignedTechnicianId ||
        ''
    ).trim();
    const startingNow =
      newStatus === 'IN_PROGRESS' || newStatus === 'EN_ROUTE';
    let reverted = 0;
    if (startingNow && technicianId) {
      reverted = await revertOtherEnRouteJobsToAssigned({
        technicianId,
        exceptJobId: jobId,
      });
    }

    const patchJobList = (list: Job[]) =>
      startingNow && technicianId
        ? applyOtherEnRouteResetLocal(list, technicianId, jobId, newStatus)
        : list.map((job) => (job.id === jobId ? { ...job, status: newStatus } : job));

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = patchJobList(updated[customerId]);
      });
      return updated;
    });

    ctx.setJobs((prev) => patchJobList(prev));

    toast.success(
      reverted > 0
        ? `Job status updated to ${newStatus}. Other en-route job${reverted === 1 ? '' : 's'} put back to Assigned.`
        : `Job status updated to ${newStatus}`
    );

    const job = ctx.jobs.find((j) => j.id === jobId);
    if (job) {
      const customer = job.customer;
      const technician = ctx.technicians.find(
        (t) => t.id === (job.assigned_technician_id || job.assignedTechnicianId)
      );

      if (newStatus === 'COMPLETED' && technician) {
        const notification = createJobCompletedNotification(
          job.job_number || job.jobNumber,
          customer?.full_name || customer?.fullName || 'Customer',
          technician.fullName,
          jobId
        );
        await sendNotification(notification);
      } else if (newStatus === 'CANCELLED') {
        const notification = createJobCancelledNotification(
          job.job_number || job.jobNumber,
          customer?.full_name || customer?.fullName || 'Customer',
          jobId
        );
        await sendNotification(notification);
      }
    }
  } catch {
    toast.error('Failed to update job status');
  }
}
