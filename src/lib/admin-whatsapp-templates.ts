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
import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';

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
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  return [
    'For any help, contact us:',
    `📞 ${info.phone}`,
    `📧 ${info.email}`,
    `🌐 ${website}`,
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
    `Service: ${serviceLine}`,
    ...(deviceLine ? [`Device: ${deviceLine}`] : []),
    `Date: ${serviceDate}`,
    `Time: ${timeSlot}`,
    `Address: ${address}`,
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

function buildDocumentWhatsApp(
  type: AdminEmailTemplateType,
  data: AdminDocumentEmailData
): AdminWhatsAppMessageResult {
  const brand = data.documentBrand;
  const brandName = getDocumentBrandLabel(brand);
  const customerName = data.customerName.trim() || 'Customer';
  const meta = ADMIN_EMAIL_TEMPLATE_META[type];
  const message = data.message.trim();

  const detailLines: string[] = [];
  if (meta.showDocumentRef && data.documentRef.trim()) {
    const refLabel =
      type === 'invoice' ? 'Invoice no.' : type === 'quotation' ? 'Quote no.' : 'Reference';
    detailLines.push(`${refLabel}: ${data.documentRef.trim()}`);
  }
  if (meta.showAmount && data.amount.trim()) {
    detailLines.push(`Amount: ${data.amount.trim()}`);
  }
  if (meta.showDueDate && data.dueDate.trim()) {
    const dueLabel = type === 'service_reminder' ? 'Suggested date' : 'Valid / due date';
    detailLines.push(`${dueLabel}: ${formatDisplayDate(data.dueDate.trim())}`);
  }

  const headline =
    type === 'amc_document'
      ? 'AMC agreement'
      : type === 'invoice'
        ? 'Tax invoice'
        : type === 'quotation'
          ? 'Quotation'
          : type === 'service_reminder'
            ? 'Service reminder'
            : 'Message';

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
