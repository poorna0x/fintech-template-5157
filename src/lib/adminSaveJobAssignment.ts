import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import type { AdminStatusFilter } from '@/lib/adminDashboardCache';
import type { LoadFilteredJobsFn } from '@/lib/adminLoadDashboardData';
import { getJobCustomTimeLabel, getLeadSourceFromJob } from '@/lib/adminUtils';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
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

    broadcastTechnicianJobListRefresh([ctx.selectedTechnicianId]);

    const assignedTechnician = ctx.technicians.find((t) => t.id === ctx.selectedTechnicianId);
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
      await sendNotification(notification);
    } else {
      toast.success(
        `Job assigned to ${assignedTechnician?.fullName || 'technician'} for ${
          (ctx.jobToAssign.customer as any)?.full_name ||
          (ctx.jobToAssign.customer as any)?.fullName ||
          'customer'
        }`
      );
    }

    ctx.setAssignJobDialogOpen(false);

    if (assignedTechnician && assignedTechnician.phone) {
      ctx.scrollPositionBeforeWhatsAppRef.current = scrollY;
      const serviceSubType =
        (ctx.jobToAssign as any).service_sub_type || ctx.jobToAssign.serviceSubType || 'Service';
      let customerForWhatsApp = (ctx.jobToAssign.customer as any) || {};
      const customerId = customerForWhatsApp?.id || (ctx.jobToAssign as any).customer_id;
      if (customerId) {
        const { data: freshCustomer } = await db.customers.getById(String(customerId));
        if (freshCustomer) customerForWhatsApp = freshCustomer;
      }
      const customerName =
        customerForWhatsApp?.full_name || customerForWhatsApp?.fullName || 'Customer';
      const addr = customerForWhatsApp?.address || (ctx.jobToAssign as any).service_address;
      const vis = customerForWhatsApp?.visible_address;
      const locationText =
        vis && String(vis).trim() ? String(vis).trim() : addr?.area || addr?.city || '';
      const leadSource = getLeadSourceFromJob(ctx.jobToAssign as Record<string, unknown>);
      const customTime = getJobCustomTimeLabel(ctx.jobToAssign as Record<string, unknown>) || '';
      ctx.setWhatsappTechnician({
        name: assignedTechnician.fullName,
        phone: assignedTechnician.phone,
      });
      ctx.setWhatsappServiceSubType(serviceSubType);
      ctx.setWhatsappCustomerName(customerName);
      ctx.setWhatsappLocation(locationText || '');
      ctx.setWhatsappLeadSource(leadSource);
      ctx.setWhatsappCustomTime(customTime);
      ctx.setWhatsappDialogOpen(true);
      ctx.openAdminWhatsappModal();
    } else {
      ctx.closeAdminModal();
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
