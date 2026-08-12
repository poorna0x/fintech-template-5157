import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import {
  ADMIN_EMAIL_TEMPLATE_META,
  type AdminDocumentEmailData,
  type AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import {
  formatBookingTimeSlot,
  formatDeviceLine,
  formatServiceDate,
  resolveBookingEmailDocumentBrand,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';
import {
  buildJobCompletionWhatsAppMessage,
} from '@/lib/job-completion-message';
import {
  waBrandWebsiteUrl,
  waLabeledLink,
  waLabeledValue,
  waPlainLabelValue,
} from '@/lib/whatsappMessageFormat';

export interface AdminWhatsAppMessageResult {
  text: string;
  previewTitle: string;
}

function formatDisplayDate(iso: string): string {
  if (!iso.trim()) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function brandFooter(brand: DocumentBrand): string {
  const info = getCompanyInfoForBrand(brand);
  const website = waBrandWebsiteUrl(info.website);
  return [
    'For any help, contact us:',
    waLabeledValue('📞', 'Phone', info.phone),
    waLabeledValue('📧', 'Email', info.email),
    waLabeledLink('🌐', 'Website', website),
  ].join('\n');
}

function buildBookingWhatsApp(data: BookingConfirmationEmailData): AdminWhatsAppMessageResult {
  const brand = resolveBookingEmailDocumentBrand(data);
  const brandName = getDocumentBrandLabel(brand);
  const customerName = data.customerName.trim() || 'Customer';
  const jobNumber = data.jobNumber.trim() || 'N/A';
  const serviceLine = `${data.serviceType || 'RO'} - ${data.serviceSubType || 'Service'}`;
  const deviceLine = formatDeviceLine(data.brand, data.model);
  const serviceDate = data.scheduledDate ? formatServiceDate(data.scheduledDate) : '—';
  const timeSlot = formatBookingTimeSlot(data.scheduledTimeSlot || '');
  const address = data.serviceAddress.trim() || '—';

  const detailLines = [
    waPlainLabelValue('Service', serviceLine),
    ...(deviceLine ? [waPlainLabelValue('Device', deviceLine)] : []),
    waPlainLabelValue('Date', serviceDate),
    waPlainLabelValue('Time', timeSlot),
    waPlainLabelValue('Address', address),
  ];

  const text = [
    `Hi ${customerName},`,
    '',
    `✅ Your booking with ${brandName} is confirmed.`,
    '',
    `Ref: ${jobNumber}`,
    '',
    ...detailLines,
    '',
    brandFooter(brand),
  ].join('\n');

  return {
    text,
    previewTitle: `Booking confirmed · ${brandName}`,
  };
}

function parseAmountCollected(amount: string): number {
  const n = parseFloat(String(amount || '').replace(/[^\d.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function buildJobCompletionWhatsApp(
  data: AdminDocumentEmailData
): AdminWhatsAppMessageResult {
  const brand = data.documentBrand;
  const brandName = getDocumentBrandLabel(brand);
  const pendingAmount = parseAmountCollected(data.completionPendingAmount || '');
  const text = buildJobCompletionWhatsAppMessage({
    customerName: data.customerName,
    serviceType: data.completionServiceType || '',
    serviceSubType: data.completionServiceSubType || '',
    amountCollected: parseAmountCollected(data.amount),
    amountPending: pendingAmount,
    pendingDueDate: data.completionPendingDueDate || data.dueDate || null,
    documentBrand: brand,
  });
  const ref = data.documentRef.trim();
  return {
    text,
    previewTitle: ref
      ? `Service completed · ${brandName} (${ref})`
      : `Service completed · ${brandName}`,
  };
}

function buildDocumentWhatsApp(
  type: AdminEmailTemplateType,
  data: AdminDocumentEmailData
): AdminWhatsAppMessageResult {
  const brand = data.documentBrand;
  const brandName = getDocumentBrandLabel(brand);
  const customerName = data.customerName.trim() || 'Customer';
  const meta = ADMIN_EMAIL_TEMPLATE_META[type];
  const message = data.message.trim();

  if (type === 'job_completion') {
    return buildJobCompletionWhatsApp(data);
  }

  const detailLines: string[] = [];
  if (meta.showDocumentRef && data.documentRef.trim()) {
    const refLabel =
      type === 'invoice'
        ? 'Invoice no.'
        : type === 'service_bill'
          ? 'Bill no.'
          : type === 'quotation'
            ? 'Quote no.'
            : 'Reference';
    detailLines.push(waPlainLabelValue(refLabel, data.documentRef.trim()));
  }
  if (meta.showAmount && data.amount.trim()) {
    detailLines.push(waPlainLabelValue('Amount', data.amount.trim()));
  }
  if (meta.showDueDate && data.dueDate.trim()) {
    const dueLabel = type === 'service_reminder' ? 'Suggested date' : 'Valid / due date';
    detailLines.push(waPlainLabelValue(dueLabel, formatDisplayDate(data.dueDate.trim())));
  }

  const headline =
    type === 'amc_document'
      ? 'AMC agreement'
      : type === 'invoice'
        ? 'Tax invoice'
        : type === 'service_bill'
          ? 'Service bill'
          : type === 'quotation'
          ? 'Quotation'
          : type === 'service_reminder'
            ? 'Service reminder'
            : type === 'tech_running_late'
              ? 'Technician delayed'
              : 'Message';

  if (type === 'tech_running_late') {
    const delayText =
      message ||
      'Sorry — our technician is facing an issue and will be a bit late. We will inform you shortly about the arrival time.';
    const text = [
      `Hi ${customerName},`,
      '',
      delayText,
      '',
      `Thank you for your patience.`,
      '',
      brandFooter(brand),
    ].join('\n');
    return {
      text,
      previewTitle: `Technician delayed · ${brandName}`,
    };
  }

  const text = [
    `Hi ${customerName},`,
    '',
    message || `Update from ${brandName}.`,
    ...(detailLines.length ? ['', ...detailLines] : []),
    '',
    brandFooter(brand),
  ].join('\n');

  return {
    text,
    previewTitle: `${headline} · ${brandName}`,
  };
}

export function buildAdminWhatsAppMessage(
  templateType: AdminEmailTemplateType,
  bookingData: BookingConfirmationEmailData,
  documentData: AdminDocumentEmailData
): AdminWhatsAppMessageResult {
  if (templateType === 'booking_confirmation') {
    return buildBookingWhatsApp(bookingData);
  }
  return buildDocumentWhatsApp(templateType, documentData);
}
