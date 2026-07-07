import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  createJobCancelledNotification,
  createJobCompletedNotification,
  sendNotification,
} from '@/lib/notifications';
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
    const { error } = await db.jobs.update(jobId, {
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

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((job) =>
          job.id === jobId ? { ...job, status: newStatus } : job
        );
      });
      return updated;
    });

    ctx.setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, status: newStatus } : job))
    );

    toast.success(`Job status updated to ${newStatus}`);

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
