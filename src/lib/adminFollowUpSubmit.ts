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
  addAmcReminder?: boolean;
};

async function syncAmcFollowUpReminder(opts: {
  job: Job;
  followUpDate: string;
  followUpTime: string;
  followUpReason: string;
  enabled: boolean;
}) {
  const customerId =
    opts.job.customerId || opts.job.customer_id || opts.job.customer?.id || null;
  if (!customerId) throw new Error('Customer is missing for the AMC reminder');
  const jobNumber = opts.job.jobNumber || opts.job.job_number || 'AMC job';
  const title = `AMC follow-up · ${jobNumber}`;

  const { data: existing, error: lookupError } = await supabase
    .from('reminders')
    .select('id')
    .eq('entity_type', 'customer')
    .eq('entity_id', customerId)
    .eq('title', title)
    .is('completed_at', null)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (!opts.enabled) {
    if (existing?.id) {
      const { error } = await db.reminders.delete(existing.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const notes = [
    opts.followUpReason,
    opts.followUpTime ? `Follow-up time: ${opts.followUpTime}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const result = existing?.id
    ? await db.reminders.update(existing.id, {
        title,
        notes,
        reminder_at: opts.followUpDate,
      })
    : await db.reminders.create({
        entity_type: 'customer',
        entity_id: customerId,
        title,
        notes,
        reminder_at: opts.followUpDate,
      });
  if (result.error) throw new Error(result.error.message);
}

export type FollowUpJobLike = {
  id: string;
  customerId?: string;
  customer_id?: string;
  customer?: { id?: string };
  jobNumber?: string;
  job_number?: string;
  requirements?: unknown;
};

/** Schedule a root follow-up on a newly created (or existing) job. */
export async function scheduleRootFollowUpOnJob(
  job: FollowUpJobLike,
  followUpData: AdminFollowUpSubmitData
) {
  const jobId = job.id;
  const followUpReason = followUpData.followUpReason?.trim() || 'Not confirmed';
  const { error: followUpError } = await supabase
    .from('follow_ups')
    .insert({
      job_id: jobId,
      parent_follow_up_id: null,
      follow_up_date: followUpData.followUpDate,
      follow_up_time: followUpData.followUpTime,
      reason: followUpReason,
      notes: null,
      scheduled_by: null,
      completed: false,
    } as any)
    .select()
    .single();

  if (followUpError) {
    if (
      followUpError.code === 'PGRST301' ||
      followUpError.message?.includes('401') ||
      followUpError.message?.includes('unauthorized')
    ) {
      throw new Error('Authentication failed. Please check your login status and try again.');
    }
    throw new Error(followUpError.message || 'Failed to create follow-up record');
  }

  const requirements = applyAutoMoveToOngoingOnDateFlag(
    job.requirements,
    Boolean(followUpData.autoMoveToOngoingOnDate)
  );

  const { error: jobError } = await db.jobs.update(jobId, {
    status: 'FOLLOW_UP',
    follow_up_date: followUpData.followUpDate,
    follow_up_time: followUpData.followUpTime,
    follow_up_notes: followUpReason,
    follow_up_scheduled_by: null,
    follow_up_scheduled_at: new Date().toISOString(),
    include_amc_follow_up: Boolean(followUpData.addAmcReminder),
    assigned_technician_id: null,
    assigned_date: null,
    requirements,
  } as any);

  if (jobError) {
    throw new Error(jobError.message);
  }

  try {
    await syncAmcFollowUpReminder({
      job: job as Job,
      followUpDate: followUpData.followUpDate,
      followUpTime: followUpData.followUpTime,
      followUpReason,
      enabled: Boolean(followUpData.addAmcReminder),
    });
  } catch (reminderError) {
    console.warn('[follow-up] AMC reminder sync failed', reminderError);
    toast.warning('Follow-up saved, but the AMC reminder could not be updated');
  }

  return {
    status: 'FOLLOW_UP' as const,
    followUpDate: followUpData.followUpDate,
    followUpTime: followUpData.followUpTime,
    followUpNotes: followUpReason,
    followUpScheduledBy: 'admin',
    followUpScheduledAt: new Date().toISOString(),
    includeAmcFollowUp: Boolean(followUpData.addAmcReminder),
    include_amc_follow_up: Boolean(followUpData.addAmcReminder),
    requirements,
  };
}

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
    const existingJob =
      ctx.jobs.find((j) => j.id === jobId) ||
      Object.values(ctx.customerJobs)
        .flat()
        .find((j) => j.id === jobId);
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
        reason: followUpData.followUpReason?.trim() || 'Not confirmed',
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
      const requirements = applyAutoMoveToOngoingOnDateFlag(
        (existingJob as any)?.requirements,
        Boolean(followUpData.autoMoveToOngoingOnDate)
      );
      const followUpReason = followUpData.followUpReason?.trim() || 'Not confirmed';

      const { error: jobError } = await db.jobs.update(jobId, {
        status: 'FOLLOW_UP',
        follow_up_date: followUpData.followUpDate,
        follow_up_time: followUpData.followUpTime,
        follow_up_notes: followUpReason,
        follow_up_scheduled_by: null,
        follow_up_scheduled_at: new Date().toISOString(),
        include_amc_follow_up: Boolean(followUpData.addAmcReminder),
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
                followUpNotes: followUpReason,
                followUpScheduledBy: 'admin',
                followUpScheduledAt: new Date().toISOString(),
                includeAmcFollowUp: Boolean(followUpData.addAmcReminder),
                include_amc_follow_up: Boolean(followUpData.addAmcReminder),
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
                    followUpReason +
                    ((followUpData as any).followUpNotes
                      ? ` - ${(followUpData as any).followUpNotes}`
                      : ''),
                  followUpScheduledBy: 'admin',
                  followUpScheduledAt: new Date().toISOString(),
                  includeAmcFollowUp: Boolean(followUpData.addAmcReminder),
                  include_amc_follow_up: Boolean(followUpData.addAmcReminder),
                  requirements,
                }
              : job
          );
        });
        return updated;
      });

      if (existingJob) {
        try {
          await syncAmcFollowUpReminder({
            job: existingJob,
            followUpDate: followUpData.followUpDate,
            followUpTime: followUpData.followUpTime,
            followUpReason,
            enabled: Boolean(followUpData.addAmcReminder),
          });
        } catch (reminderError) {
          console.warn('[follow-up] AMC reminder sync failed', reminderError);
          toast.warning('Follow-up saved, but the AMC reminder could not be updated');
        }
      }
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
