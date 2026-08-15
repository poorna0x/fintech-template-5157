import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { applyAutoMoveToOngoingOnDateFlag } from '@/lib/followUpToOngoing';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { db, supabase } from '@/lib/supabase';
import type { Job } from '@/types';

export type AdminFollowUpSubmitData = {
  followUpDate: string;
  followUpTime: string;
  followUpReason: string;
  parentFollowUpId?: string;
  rescheduleFollowUpId?: string;
  autoMoveToOngoingOnDate?: boolean;
};

export async function submitAdminFollowUp(
  jobId: string,
  followUpData: AdminFollowUpSubmitData,
  ctx: {
    jobs: Job[];
    customerJobs: Record<string, Job[]>;
    statusFilter: AdminStatusFilter;
    currentPage: number;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
    setAllFollowUpJobs: Dispatch<SetStateAction<Job[]>>;
    loadFilteredJobs: LoadFilteredJobsFn;
  }
) {
  try {
    let wasRootFollowUp = false;
    if (followUpData.rescheduleFollowUpId) {
      const { data: oldFollowUp } = await supabase
        .from('follow_ups')
        .select('parent_follow_up_id')
        .eq('id', followUpData.rescheduleFollowUpId)
        .single();

      wasRootFollowUp = !oldFollowUp?.parent_follow_up_id;

      const { error: deleteError } = await supabase
        .from('follow_ups')
        .delete()
        .eq('id', followUpData.rescheduleFollowUpId);

      if (deleteError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Delete follow-up error details:', deleteError);
        }
        if (
          deleteError.code === 'PGRST301' ||
          deleteError.message?.includes('401') ||
          deleteError.message?.includes('unauthorized')
        ) {
          throw new Error('Authentication failed. Please check your login status and try again.');
        }
        throw new Error(deleteError.message || 'Failed to delete follow-up record');
      }
    }

    const { error: followUpError } = await supabase
      .from('follow_ups')
      .insert({
        job_id: jobId,
        parent_follow_up_id: followUpData.parentFollowUpId || null,
        follow_up_date: followUpData.followUpDate,
        follow_up_time: followUpData.followUpTime,
        reason: followUpData.followUpReason,
        notes: null,
        scheduled_by: null,
        completed: false,
      } as any)
      .select()
      .single();

    if (followUpError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Follow-up error details:', followUpError);
      }
      if (
        followUpError.code === 'PGRST301' ||
        followUpError.message?.includes('401') ||
        followUpError.message?.includes('unauthorized')
      ) {
        throw new Error('Authentication failed. Please check your login status and try again.');
      }
      throw new Error(followUpError.message || 'Failed to create follow-up record');
    }

    if (!followUpData.parentFollowUpId || wasRootFollowUp) {
      const existingJob =
        ctx.jobs.find((j) => j.id === jobId) ||
        Object.values(ctx.customerJobs)
          .flat()
          .find((j) => j.id === jobId);
      const requirements = applyAutoMoveToOngoingOnDateFlag(
        (existingJob as any)?.requirements,
        Boolean(followUpData.autoMoveToOngoingOnDate)
      );

      const { error: jobError } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_time: followUpData.followUpTime,
        follow_up_notes: followUpData.followUpReason,
        follow_up_scheduled_by: null,
        follow_up_scheduled_at: new Date().toISOString(),
        requirements,
      } as any);

      if (jobError) {
        throw new Error(jobError.message);
      }

      ctx.setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: 'FOLLOW_UP',
                followUpDate: followUpData.followUpDate,
                followUpTime: followUpData.followUpTime,
                followUpNotes: followUpData.followUpReason,
                followUpScheduledBy: 'admin',
                followUpScheduledAt: new Date().toISOString(),
                requirements,
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
                  status: 'FOLLOW_UP',
                  followUpDate: followUpData.followUpDate,
                  followUpTime: followUpData.followUpTime,
                  followUpNotes:
                    followUpData.followUpReason +
                    ((followUpData as any).followUpNotes
                      ? ` - ${(followUpData as any).followUpNotes}`
                      : ''),
                  followUpScheduledBy: 'admin',
                  followUpScheduledAt: new Date().toISOString(),
                  requirements,
                }
              : job
          );
        });
        return updated;
      });
    }

    toast.success(
      followUpData.rescheduleFollowUpId
        ? 'Follow-up rescheduled successfully'
        : followUpData.parentFollowUpId
          ? 'Nested follow-up added successfully'
          : 'Follow-up scheduled successfully'
    );

    db.jobs
      .getFollowUpForGlow()
      .then(({ data }) => {
        if (data) ctx.setAllFollowUpJobs(data as Job[]);
      })
      .catch(() => {});

    if (ctx.statusFilter === 'RESCHEDULED') {
      ctx.loadFilteredJobs('RESCHEDULED', ctx.currentPage);
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to schedule follow-up';
    if (process.env.NODE_ENV === 'development') {
      console.error('Follow-up submission error:', error);
    }
    toast.error(errorMessage);
  }
}
