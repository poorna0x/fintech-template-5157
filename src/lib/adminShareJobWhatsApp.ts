import { toast } from 'sonner';
import { findLeadSource } from '@/lib/adminUtils';
import {
  getJobLocationDisplay,
  getJobLocationLabelForWhatsApp,
} from '@/lib/customer-locations';
import {
  formatAddressForMapsSearch,
  getLocationLinkFromObject,
  getMapsSearchLinkFromAddress,
} from '@/lib/jobLocationHelpers';
import { db } from '@/lib/supabase';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import type { Job, Technician } from '@/types';

export async function shareAdminJobViaWhatsApp(job: Job, technicians: Technician[]) {
  const assignedTechnicianId = (job as any).assigned_technician_id || job.assignedTechnicianId;
  if (!assignedTechnicianId) {
    toast.error('No technician assigned to this job');
    return;
  }
  const technician = technicians.find((t) => t.id === assignedTechnicianId);
  if (!technician?.phone) {
    toast.error('Technician phone number not found');
    return;
  }

  const embeddedCustomer = ((job as any).customer || job.customer) as any;
  const customerId = embeddedCustomer?.id || (job as any).customer_id;
  let freshCustomer: any = null;
  if (customerId) {
    const { data, error } = await db.customers.getById(String(customerId));
    if (!error && data) {
      freshCustomer = data;
    }
  }

  const customer = freshCustomer || embeddedCustomer;
  const name = customer?.full_name || customer?.fullName || 'N/A';
  const phone = customer?.phone || 'N/A';
  const altPhone = customer?.alternate_phone || customer?.alternatePhone;
  const serviceType = (job as any).service_type || job.serviceType || 'N/A';
  const serviceSubType = (job as any).service_sub_type || job.serviceSubType || '';
  let requirements: any[] = (job as any).requirements;
  if (typeof requirements === 'string') {
    try {
      requirements = JSON.parse(requirements);
    } catch {
      requirements = [];
    }
  }
  if (requirements && !Array.isArray(requirements)) {
    requirements = requirements && typeof requirements === 'object' ? [requirements] : [];
  }
  const leadSource = findLeadSource(requirements || []) || 'N/A';

  // Use the job snapshot (service_site / service_address / service_location), not customer primary only.
  const jobRow = job as Record<string, unknown>;
  const locDisplay = getJobLocationDisplay(jobRow, customer);
  const siteLabel = getJobLocationLabelForWhatsApp(
    {
      service_site: (jobRow.service_site ?? jobRow.serviceSite) as string | undefined,
      service_address: locDisplay.address,
    },
    customer
  );
  const googleMapLink =
    getLocationLinkFromObject(locDisplay.location) ||
    getMapsSearchLinkFromAddress(locDisplay.address) ||
    getMapsSearchLinkFromAddress(customer?.address);
  const fullAddressLine =
    formatAddressForMapsSearch(locDisplay.address) ||
    formatAddressForMapsSearch(customer?.address) ||
    locDisplay.visibleLabel ||
    siteLabel ||
    '';
  const lines = [
    `*Job: ${(job as any).job_number || job.jobNumber || job.id}*`,
    `Service: ${serviceType}${serviceSubType ? ` - ${serviceSubType}` : ''}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    ...(altPhone ? [`Alt. phone: ${altPhone}`] : []),
    `Lead source: ${leadSource}`,
    ...(siteLabel ? [`Service at: ${siteLabel}`] : []),
    ...(googleMapLink ? [`Location: ${googleMapLink}`] : []),
    ...(fullAddressLine ? ['', '_Full address:_', fullAddressLine] : []),
  ];
  const text = lines.join('\n');
  const url = `https://wa.me/${formatPhoneForWhatsApp(technician.phone)}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  toast.success('Opening WhatsApp to share job details');
}
