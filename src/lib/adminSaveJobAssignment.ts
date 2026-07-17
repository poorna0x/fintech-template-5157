import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { openAdminWhatsappForJobAssign } from '@/lib/openAdminWhatsappForJobAssign';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import { appendJobToTechnicianVisitOrder } from '@/lib/adminVisitOrder';
import { jobAssignPushText, notifyTechnicianJobPush } from '@/lib/adminTechPushNotify';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';

export type AdminSaveJobAssignmentCtx = {
  jobToAssign: Job | null;
  selectedTechnicianId: string;
  followUpAssignFlow: boolean;
  statusFilter: AdminStatusFilter;
  currentPage: number;
  technicians: Technician[];
  setFollowUpAssignFlow: Dispatch<SetStateAction<boolean>>;
  setFollowUpAssignTechnicianId: Dispatch<SetStateAction<string>>;
  setAssignJobDialogOpen: Dispatch<SetStateAction<boolean>>;
  setAssignAfterMoveToOngoing: Dispatch<SetStateAction<boolean>>;
  handleMoveToOngoing: (job: Job) => void;
  scrollPositionBeforeWhatsAppRef: MutableRefObject<number>;
  setWhatsappTechnician: Dispatch<SetStateAction<{ name: string; phone: string } | null>>;
  setWhatsappServiceSubType: Dispatch<SetStateAction<string>>;
  setWhatsappCustomerName: Dispatch<SetStateAction<string>>;
  setWhatsappLocation: Dispatch<SetStateAction<string>>;
  setWhatsappLeadSource: Dispatch<SetStateAction<string>>;
  setWhatsappCustomTime: Dispatch<SetStateAction<string>>;
  setWhatsappDescription: Dispatch<SetStateAction<string>>;
  setWhatsappAgreedCost: Dispatch<SetStateAction<string>>;
  setWhatsappDialogOpen: Dispatch<SetStateAction<boolean>>;
  openAdminWhatsappModal: () => void;
  closeAdminModal: () => void;
  setJobToAssign: Dispatch<SetStateAction<Job | null>>;
  setSelectedTechnicianId: Dispatch<SetStateAction<string>>;
  loadFilteredJobs: LoadFilteredJobsFn;
};

export async function saveAdminJobAssignment(ctx: AdminSaveJobAssignmentCtx) {
  if (!ctx.jobToAssign || !ctx.selectedTechnicianId) return;

  const scrollY = window.scrollY;

  try {
    if (ctx.followUpAssignFlow) {
      ctx.setFollowUpAssignFlow(false);
      ctx.setFollowUpAssignTechnicianId(ctx.selectedTechnicianId);
      ctx.setAssignJobDialogOpen(false);
      ctx.setAssignAfterMoveToOngoing(true);
      ctx.handleMoveToOngoing(ctx.jobToAssign);
      return;
    }

    const { error } = await db.jobs.update(ctx.jobToAssign.id, {
      assigned_technician_id: ctx.selectedTechnicianId,
      status: 'ASSIGNED',
      assigned_date: new Date().toISOString(),
    } as any);

    if (error) throw error;

    const scheduledDate =
      (ctx.jobToAssign as any).scheduled_date || ctx.jobToAssign.scheduledDate || null;
    await appendJobToTechnicianVisitOrder({
      jobId: ctx.jobToAssign.id,
      technicianId: ctx.selectedTechnicianId,
      scheduledDate,
    });

    broadcastTechnicianJobListRefresh([ctx.selectedTechnicianId]);

    notifyTechnicianJobPush({
      technicianId: ctx.selectedTechnicianId,
      ...jobAssignPushText({ job: ctx.jobToAssign as any }),
    });

    const assignedTechnician = ctx.technicians.find((t) => t.id === ctx.selectedTechnicianId);

    if (assignedTechnician && assignedTechnician.phone) {
      openAdminWhatsappForJobAssign(ctx, ctx.jobToAssign, assignedTechnician, scrollY);
    } else {
      ctx.setAssignJobDialogOpen(false);
      ctx.closeAdminModal();
    }

    if (assignedTechnician) {
      const notification = createJobAssignedNotification(
        (ctx.jobToAssign as any).job_number || ctx.jobToAssign.jobNumber || 'Job',
        (ctx.jobToAssign.customer as any)?.full_name ||
          (ctx.jobToAssign.customer as any)?.fullName ||
          'Customer',
        assignedTechnician.fullName,
        ctx.jobToAssign.id,
        assignedTechnician.id
      );
      void sendNotification(notification).catch(() => {});
    } else {
      toast.success(
        `Job assigned to technician for ${
          (ctx.jobToAssign.customer as any)?.full_name ||
          (ctx.jobToAssign.customer as any)?.fullName ||
          'customer'
        }`
      );
    }

    ctx.setJobToAssign(null);
    ctx.setSelectedTechnicianId('');

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
  } catch {
    toast.error('Failed to assign job');
    ctx.setFollowUpAssignFlow(false);
    ctx.setFollowUpAssignTechnicianId('');
  }
}
