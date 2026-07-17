import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getJobCustomTimeLabel, getLeadSourceFromJob } from '@/lib/adminUtils';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import { getJobAgreedCostLabel, getJobDescriptionText } from '@/lib/jobAssignMessageDetails';
import { db } from '@/lib/supabase';
import type { Job } from '@/types';

export type OpenAdminWhatsappForJobCtx = {
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
};

/** Open WhatsApp notify dialog immediately from job row data; refine customer fields in background. */
export function openAdminWhatsappForJobAssign(
  ctx: OpenAdminWhatsappForJobCtx,
  job: Job,
  technician: { fullName: string; phone: string },
  scrollY: number
): void {
  ctx.scrollPositionBeforeWhatsAppRef.current = scrollY;

  const serviceSubType =
    (job as { service_sub_type?: string; serviceSubType?: string }).service_sub_type ||
    job.serviceSubType ||
    'Service';
  const customerFromJob = (job.customer as Record<string, unknown>) || {};
  const customerId =
    (customerFromJob.id as string | undefined) ||
    (job as { customer_id?: string }).customer_id;

  const customerName =
    (customerFromJob.full_name as string) ||
    (customerFromJob.fullName as string) ||
    'Customer';
  const locationText = getJobLocationLabelForWhatsApp(
    job as { service_site?: string; service_address?: unknown },
    customerFromJob
  );
  const leadSource = getLeadSourceFromJob(job as Record<string, unknown>);
  const customTime = getJobCustomTimeLabel(job as Record<string, unknown>) || '';
  const description = getJobDescriptionText(job as Record<string, unknown>);
  const agreedCost = getJobAgreedCostLabel(job as Record<string, unknown>);

  ctx.setWhatsappTechnician({ name: technician.fullName, phone: technician.phone });
  ctx.setWhatsappServiceSubType(serviceSubType);
  ctx.setWhatsappCustomerName(customerName);
  ctx.setWhatsappLocation(locationText || '');
  ctx.setWhatsappLeadSource(leadSource);
  ctx.setWhatsappCustomTime(customTime);
  ctx.setWhatsappDescription(description);
  ctx.setWhatsappAgreedCost(agreedCost);
  ctx.openAdminWhatsappModal();
  ctx.setWhatsappDialogOpen(true);

  if (!customerId) return;

  void db.customers.getById(String(customerId)).then(({ data: freshCustomer }) => {
    if (!freshCustomer) return;
    const refinedName = freshCustomer.full_name || (freshCustomer as { fullName?: string }).fullName;
    const refinedLocation = getJobLocationLabelForWhatsApp(
      job as { service_site?: string; service_address?: unknown },
      freshCustomer as Record<string, unknown>
    );
    if (refinedName) ctx.setWhatsappCustomerName(refinedName);
    if (refinedLocation) ctx.setWhatsappLocation(refinedLocation);
  });
}
