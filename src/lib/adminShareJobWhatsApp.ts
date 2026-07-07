import { toast } from 'sonner';
import { findLeadSource } from '@/lib/adminUtils';
import { getLocationLinkFromObject } from '@/lib/jobLocationHelpers';
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
  const serviceLocation = customer?.location || (job as any).service_location || job.serviceLocation || {};
  const formattedAddress = serviceLocation?.formattedAddress || serviceLocation?.formatted_address || '';
  const googleMapLink =
    getLocationLinkFromObject(serviceLocation) ||
    (formattedAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`
      : '');
  const serviceAddress = customer?.address || (job as any).service_address || job.serviceAddress || {};
  const addressParts = [
    serviceAddress?.visible_address || serviceAddress?.visibleAddress,
    serviceAddress?.street,
    serviceAddress?.area,
    serviceAddress?.city,
    serviceAddress?.state,
    serviceAddress?.pincode,
    serviceAddress?.landmark ? `Landmark: ${serviceAddress.landmark}` : null,
  ].filter(Boolean);
  const fullAddressLine = addressParts.length > 0 ? addressParts.join(', ') : formattedAddress || '';
  const lines = [
    `*Job: ${(job as any).job_number || job.jobNumber || job.id}*`,
    `Service: ${serviceType}${serviceSubType ? ` - ${serviceSubType}` : ''}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    ...(altPhone ? [`Alt. phone: ${altPhone}`] : []),
    `Lead source: ${leadSource}`,
    ...(googleMapLink ? [`Location: ${googleMapLink}`] : []),
    ...(fullAddressLine ? ['', '_Full address:_', fullAddressLine] : []),
  ];
  const text = lines.join('\n');
  const url = `https://wa.me/${formatPhoneForWhatsApp(technician.phone)}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  toast.success('Opening WhatsApp to share job details');
}
