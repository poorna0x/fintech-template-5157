import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { openAdminWhatsappForJobAssign } from '@/lib/openAdminWhatsappForJobAssign';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import {
  appendJobToTechnicianVisitOrder,
} from '@/lib/adminVisitOrder';
import { jobAssignPushText, notifyTechnicianJobPush } from '@/lib/adminTechPushNotify';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export async function submitAdminJobReassign(
  ctx: {
    jobToReassign: Job | null;
    selectedTechnicianForReassign: string;
    technicians: Technician[];
    statusFilter: AdminStatusFilter;
    currentPage: number;
    scrollPositionBeforeWhatsAppRef: MutableRefObject<number>;
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setReassignDialogOpen: Dispatch<SetStateAction<boolean>>;
    setWhatsappTechnician: Dispatch<SetStateAction<{ name: string; phone: string } | null>>;
    setWhatsappServiceSubType: Dispatch<SetStateAction<string>>;
    setWhatsappCustomerName: Dispatch<SetStateAction<string>>;
    setWhatsappLocation: Dispatch<SetStateAction<string>>;
    setWhatsappLeadSource: Dispatch<SetStateAction<string>>;
    setWhatsappCustomTime: Dispatch<SetStateAction<string>>;
    setWhatsappDialogOpen: Dispatch<SetStateAction<boolean>>;
    openAdminWhatsappModal: () => void;
    closeAdminModal: () => void;
    setJobToReassign: Dispatch<SetStateAction<Job | null>>;
    setSelectedTechnicianForReassign: Dispatch<SetStateAction<string>>;
    loadFilteredJobs: LoadFilteredJobsFn;
  }
) {
  if (!ctx.jobToReassign || !ctx.selectedTechnicianForReassign) return;

  const scrollY = window.scrollY;

  try {
    const { error } = await db.jobs.update(ctx.jobToReassign.id, {
      assigned_technician_id: ctx.selectedTechnicianForReassign,
    });

    if (error) {
      console.error('Reassign job error:', error);
      toast.error(`Failed to reassign job: ${error.message || 'Unknown error'}`);
      return;
    }

    const previousTechnicianId =
      (ctx.jobToReassign as any).assigned_technician_id || ctx.jobToReassign.assignedTechnicianId;

    const scheduledDate =
      (ctx.jobToReassign as any).scheduled_date || ctx.jobToReassign.scheduledDate || null;
    const nextVisitOrder = await appendJobToTechnicianVisitOrder({
      jobId: ctx.jobToReassign.id,
      technicianId: ctx.selectedTechnicianForReassign,
      scheduledDate,
    });

    broadcastTechnicianJobListRefresh([previousTechnicianId, ctx.selectedTechnicianForReassign]);

    {
      const push = jobAssignPushText({
        jobNumber: (ctx.jobToReassign as any).job_number || ctx.jobToReassign.jobNumber,
        customerName:
          (ctx.jobToReassign.customer as any)?.full_name ||
          (ctx.jobToReassign.customer as any)?.fullName,
        reassigned: true,
      });
      notifyTechnicianJobPush({ technicianId: ctx.selectedTechnicianForReassign, ...push });
    }

    ctx.setJobs((prev) =>
      prev.map((job) =>
        job.id === ctx.jobToReassign!.id
          ? {
              ...job,
              assigned_technician_id: ctx.selectedTechnicianForReassign,
              ...(nextVisitOrder != null
                ? { visit_order: nextVisitOrder, visitOrder: nextVisitOrder }
                : {}),
            }
          : job
      )
    );

    toast.success('Job reassigned successfully');

    const reassignedTechnician = ctx.technicians.find(
      (t) => t.id === ctx.selectedTechnicianForReassign
    );
    if (reassignedTechnician && reassignedTechnician.phone) {
      openAdminWhatsappForJobAssign(ctx, ctx.jobToReassign, reassignedTechnician, scrollY);
    } else {
      ctx.setReassignDialogOpen(false);
      ctx.closeAdminModal();
    }

    ctx.setJobToReassign(null);
    ctx.setSelectedTechnicianForReassign('');

    queueMicrotask(() => {
      void ctx
        .loadFilteredJobs(ctx.statusFilter, ctx.currentPage, { silent: true })
        .finally(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollY);
            });
          });
        });
    });
  } catch (error: any) {
    console.error('Reassign job exception:', error);
    toast.error(`Failed to reassign job: ${error?.message || 'Unknown error'}`);
  }
}

export async function unassignAdminJob(
  job: Job,
  ctx: {
    setJobs: Dispatch<SetStateAction<Job[]>>;
    setCustomerJobs: Dispatch<SetStateAction<Record<string, Job[]>>>;
  }
) {
  try {
    const previousTechnicianId =
      (job as any).assigned_technician_id || job.assignedTechnicianId;
    const teamMemberIds = Array.isArray((job as any).team_members)
      ? ((job as any).team_members as string[])
      : [];

    const { error } = await db.jobs.update(job.id, {
      assigned_technician_id: null,
      assigned_date: null,
      status: 'PENDING',
      visit_order: null,
    } as any);

    if (error) {
      toast.error('Failed to unassign job');
      return;
    }

    broadcastTechnicianJobListRefresh([previousTechnicianId, ...teamMemberIds]);

    ctx.setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? {
              ...j,
              assigned_technician_id: null,
              assignedTechnicianId: null,
              assigned_date: null,
              assignedDate: null,
              visit_order: null,
              visitOrder: null,
              status: 'PENDING' as const,
            }
          : j
      )
    );

    ctx.setCustomerJobs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((customerId) => {
        updated[customerId] = updated[customerId].map((j) =>
          j.id === job.id
            ? {
                ...j,
                assigned_technician_id: null,
                assignedTechnicianId: null,
                assigned_date: null,
                assignedDate: null,
                visit_order: null,
                visitOrder: null,
                status: 'PENDING' as any,
              }
            : j
        );
      });
      return updated;
    });

    toast.success('Technician unassigned successfully. Job status set to PENDING.');
  } catch (error) {
    console.error('Error unassigning job:', error);
    toast.error('Failed to unassign job');
  }
}
