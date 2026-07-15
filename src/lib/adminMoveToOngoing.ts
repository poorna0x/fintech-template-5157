import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import {
  getLocalTodayYmd,
  parseRequirements,
  upsertCustomTimeInRequirements,
} from '@/lib/followUpToOngoing';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import { appendJobToTechnicianVisitOrder } from '@/lib/adminVisitOrder';
import { jobAssignPushText, notifyTechnicianJobPush } from '@/lib/adminTechPushNotify';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export type AdminMoveToOngoingTimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';

export function getDefaultAdminMoveToOngoingSchedule(now = new Date()) {
  const today = getLocalTodayYmd(now);
  const currentHour = now.getHours();

  let defaultTimeSlot: AdminMoveToOngoingTimeSlot = 'MORNING';
  let defaultTime = '09:00';

  if (currentHour >= 5 && currentHour < 12) {
    defaultTimeSlot = 'MORNING';
    defaultTime = '09:00';
  } else if (currentHour >= 12 && currentHour < 17) {
    defaultTimeSlot = 'AFTERNOON';
    defaultTime = '14:00';
  } else if (currentHour >= 17 && currentHour < 20) {
    defaultTimeSlot = 'EVENING';
    defaultTime = '17:00';
  } else {
    defaultTimeSlot = 'CUSTOM';
    defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  return {
    date: today,
    timeSlot: defaultTimeSlot,
    customTime: defaultTimeSlot === 'CUSTOM' ? defaultTime : '',
  };
}

function resolveMoveToOngoingSchedule(
  timeSlot: AdminMoveToOngoingTimeSlot,
  customTime: string
): {
  timeSlotToUse: 'MORNING' | 'AFTERNOON' | 'EVENING';
  customTimeInRequirements: string | null;
} {
  if (timeSlot === 'CUSTOM' && customTime) {
    const [hours] = customTime.split(':').map(Number);
    if (hours < 13) {
      return { timeSlotToUse: 'MORNING', customTimeInRequirements: customTime };
    }
    if (hours < 18) {
      return { timeSlotToUse: 'AFTERNOON', customTimeInRequirements: customTime };
    }
    return { timeSlotToUse: 'EVENING', customTimeInRequirements: customTime };
  }

  if (timeSlot === 'AFTERNOON') {
    return { timeSlotToUse: 'AFTERNOON', customTimeInRequirements: null };
  }
  if (timeSlot === 'EVENING') {
    return { timeSlotToUse: 'EVENING', customTimeInRequirements: null };
  }
  return { timeSlotToUse: 'MORNING', customTimeInRequirements: null };
}

function mapJobAfterMoveToOngoing(
  job: Job,
  scheduledDate: string,
  timeSlotToUse: 'MORNING' | 'AFTERNOON' | 'EVENING',
  requirements: Record<string, unknown>[]
): Job {
  return {
    ...job,
    status: 'PENDING',
    assignedDate: null,
    assignedTechnicianId: null,
    assigned_technician_id: null,
    team_members: [] as string[],
    scheduledDate,
    scheduledTimeSlot: timeSlotToUse,
    requirements,
    followUpDate: null,
    follow_up_date: null,
    followUpTime: null,
    follow_up_time: null,
    followUpNotes: null,
    follow_up_notes: null,
    followUpScheduledBy: null,
    follow_up_scheduled_by: null,
    followUpScheduledAt: null,
    follow_up_scheduled_at: null,
  };
}

export type AdminMoveToOngoingCtx = {
  selectedJob: Job | null;
  moveToOngoingDate: string;
  moveToOngoingTimeSlot: AdminMoveToOngoingTimeSlot;
  moveToOngoingCustomTime: string;
  assignAfterMoveToOngoing: boolean;
  followUpAssignTechnicianId: string;
  jobs: Job[];
  statusFilter: AdminStatusFilter;
  currentPage: number;
  technicians: Technician[];
  userId: string | undefined;
  setIsUpdating: Dispatch<SetStateAction<boolean>>;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
  setAllFollowUpJobs: Dispatch<SetStateAction<Job[]>>;
  setAssignAfterMoveToOngoing: Dispatch<SetStateAction<boolean>>;
  setFollowUpAssignTechnicianId: Dispatch<SetStateAction<string>>;
  setMoveToOngoingDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedJobForMoveToOngoing: Dispatch<SetStateAction<Job | null>>;
  setMoveToOngoingDate: Dispatch<SetStateAction<string>>;
  setMoveToOngoingTimeSlot: Dispatch<SetStateAction<AdminMoveToOngoingTimeSlot>>;
  setMoveToOngoingCustomTime: Dispatch<SetStateAction<string>>;
  loadFilteredJobs: LoadFilteredJobsFn;
};

export async function performAdminMoveToOngoing(ctx: AdminMoveToOngoingCtx) {
  if (!ctx.selectedJob) return;

  if (!ctx.moveToOngoingDate) {
    toast.error('Please select a date', TOAST_VALIDATION);
    return;
  }

  if (ctx.moveToOngoingTimeSlot === 'CUSTOM' && !ctx.moveToOngoingCustomTime) {
    toast.error('Please choose a visit time (list or exact time)', TOAST_VALIDATION);
    return;
  }

  try {
    ctx.setIsUpdating(true);

    const { timeSlotToUse, customTimeInRequirements } = resolveMoveToOngoingSchedule(
      ctx.moveToOngoingTimeSlot,
      ctx.moveToOngoingCustomTime
    );

    const currentJob = ctx.jobs.find((j) => j.id === ctx.selectedJob!.id);
    let requirements = parseRequirements(currentJob?.requirements || (currentJob as any)?.requirements);
    if (customTimeInRequirements) {
      requirements = upsertCustomTimeInRequirements(requirements, customTimeInRequirements);
    }

    const shouldAssign = ctx.assignAfterMoveToOngoing && !!ctx.followUpAssignTechnicianId;
    const updateData: Record<string, unknown> = {
      status: shouldAssign ? 'ASSIGNED' : 'PENDING',
      scheduled_date: ctx.moveToOngoingDate,
      scheduled_time_slot: timeSlotToUse,
      follow_up_date: null,
      follow_up_time: null,
      follow_up_notes: null,
      follow_up_scheduled_by: null,
      follow_up_scheduled_at: null,
      assigned_technician_id: shouldAssign ? ctx.followUpAssignTechnicianId : null,
      assigned_date: shouldAssign ? new Date().toISOString() : null,
      assigned_by: shouldAssign ? ctx.userId || null : null,
      team_members: [],
    };

    if (requirements.length > 0) {
      updateData.requirements = requirements;
    }

    console.log('Admin updating job with data:', {
      id: ctx.selectedJob.id,
      scheduled_date: ctx.moveToOngoingDate,
      scheduled_time_slot: timeSlotToUse,
      status: 'PENDING',
    });

    const { error, data: updatedJob } = await db.jobs.update(ctx.selectedJob.id, updateData);

    if (error) {
      console.error('Error updating job:', error);
      throw new Error(error.message);
    }

    console.log('Job updated successfully:', updatedJob);

    if (shouldAssign) {
      broadcastTechnicianJobListRefresh([ctx.followUpAssignTechnicianId]);

      // Same as the regular assign flow: place the job in the technician's
      // visit order and push a notification to their phone.
      await appendJobToTechnicianVisitOrder({
        jobId: ctx.selectedJob.id,
        technicianId: ctx.followUpAssignTechnicianId,
        scheduledDate: ctx.moveToOngoingDate,
      }).catch(() => {});
      notifyTechnicianJobPush({
        technicianId: ctx.followUpAssignTechnicianId,
        ...jobAssignPushText({ job: ctx.selectedJob as any }),
      });
    }

    const jobId = ctx.selectedJob.id;
    ctx.setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? mapJobAfterMoveToOngoing(j, ctx.moveToOngoingDate, timeSlotToUse, requirements)
          : j
      )
    );

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((job) =>
          job.id === jobId
            ? mapJobAfterMoveToOngoing(job, ctx.moveToOngoingDate, timeSlotToUse, requirements)
            : job
        );
      });
      return updated;
    });

    await ctx.loadFilteredJobs(ctx.statusFilter, ctx.currentPage);

    db.jobs
      .getFollowUpForGlow()
      .then(({ data }) => {
        if (data) ctx.setAllFollowUpJobs(data as Job[]);
      })
      .catch(() => {});

    toast.success('Job moved to ongoing with updated schedule');

    if (ctx.assignAfterMoveToOngoing) {
      const assignedTechnician = ctx.technicians.find((t) => t.id === ctx.followUpAssignTechnicianId);
      if (assignedTechnician) {
        const notification = createJobAssignedNotification(
          (ctx.selectedJob as any).job_number || (ctx.selectedJob as any).jobNumber || 'Job',
          ((ctx.selectedJob as any).customer as any)?.full_name ||
            ((ctx.selectedJob as any).customer as any)?.fullName ||
            'Customer',
          assignedTechnician.fullName,
          (ctx.selectedJob as any).id,
          assignedTechnician.id
        );
        await sendNotification(notification);
      }
      ctx.setAssignAfterMoveToOngoing(false);
      ctx.setFollowUpAssignTechnicianId('');
    }

    ctx.setMoveToOngoingDialogOpen(false);
    ctx.setSelectedJobForMoveToOngoing(null);
    ctx.setMoveToOngoingDate('');
    ctx.setMoveToOngoingTimeSlot('MORNING');
    ctx.setMoveToOngoingCustomTime('');
  } catch (error) {
    console.error('Error moving job to ongoing:', error);
    toast.error('Failed to move job to ongoing');
    ctx.setAssignAfterMoveToOngoing(false);
    ctx.setFollowUpAssignTechnicianId('');
  } finally {
    ctx.setIsUpdating(false);
  }
}
