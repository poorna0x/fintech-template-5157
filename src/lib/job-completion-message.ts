import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';

export interface JobCompletionMessageInput {
  customerName: string;
  serviceType?: string;
  serviceSubType?: string;
  amountCollected?: number;
  documentBrand: DocumentBrand;
}

function capitalizeWord(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';
}

/** Same completion line logic as the completed-jobs WhatsApp dialog. */
export function buildJobCompletionLine(serviceType: string, serviceSubType: string): string {
  const serviceTypeUpper = (serviceType || '').toUpperCase();
  const rawSubtypeText = serviceSubType ? capitalizeWord(serviceSubType) : '';
  const subtypeText =
    (serviceSubType || '').trim() === 'New Purifier Installation' ? 'installation' : rawSubtypeText;

  if (serviceTypeUpper.includes('RO') && subtypeText) {
    return `Your Water Purifier ${subtypeText} is completed.`;
  }
  if (serviceTypeUpper.includes('SOFTENER') && subtypeText) {
    return `Your Softener ${subtypeText} is completed.`;
  }
  if (subtypeText) {
    return `Your ${subtypeText} is completed.`;
  }
  return 'Your service has been completed successfully.';
}

export function formatJobCompletionAmount(amount: unknown): string {
  const n =
    typeof amount === 'number'
      ? amount
      : parseFloat(String(amount ?? '').replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n) || n <= 0) return '';
  return `₹${n.toLocaleString('en-IN')}`;
}

export function buildJobCompletionMessage(input: JobCompletionMessageInput): string {
  const completionLine = buildJobCompletionLine(
    input.serviceType || '',
    input.serviceSubType || ''
  );
  const brandName = getDocumentBrandLabel(input.documentBrand);

  return [
    completionLine,
    '',
    `Thank you for choosing ${brandName}. We appreciate your trust and hope you're satisfied with our work.`,
  ].join('\n');
}

/** WhatsApp variant — keeps emoji formatting used in the completed-jobs send dialog. */
export function buildJobCompletionWhatsAppMessage(input: JobCompletionMessageInput): string {
  const customerName = input.customerName.trim() || 'Customer';
  const completionLine = buildJobCompletionLine(
    input.serviceType || '',
    input.serviceSubType || ''
  );
  const amountLine =
    input.amountCollected && input.amountCollected > 0
      ? `💰 Amount of ${formatJobCompletionAmount(input.amountCollected)} has been collected.\n\n`
      : '';

  const brand = input.documentBrand;
  const info = getCompanyInfoForBrand(brand);
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  const bookingUrl = `${website.replace(/\/$/, '')}/book`;

  return `Dear ${customerName},

✅ ${completionLine}
${amountLine}For any queries or support, please contact us:
📞 Phone: ${info.phone}
📧 Email: ${info.email}
🌐 Website: ${website}

📱 For future bookings, you can book directly on ${bookingUrl} for ease and convenience.`;
}

export function buildJobCompletionMessageFromJob(job: Record<string, unknown>): {
  message: string;
  whatsappMessage: string;
  customerName: string;
  jobNumber: string;
  amount: string;
  documentBrand: DocumentBrand;
  serviceType: string;
  serviceSubType: string;
  amountCollected: number;
} {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  const customerName = String(customer.full_name || customer.fullName || 'Customer');
  const serviceType = String(job.service_type || job.serviceType || '');
  const serviceSubType = String(job.service_sub_type || job.serviceSubType || '');
  const actualCost = job.actual_cost ?? job.actualCost;
  const paymentAmount = job.payment_amount ?? job.paymentAmount;
  const amountCollected =
    typeof actualCost === 'number'
      ? actualCost
      : typeof paymentAmount === 'number'
        ? paymentAmount
        : parseFloat(String(actualCost || paymentAmount || '0')) || 0;

  const documentBrand =
    normalizeDocumentBrand(job.service_brand) ||
    normalizeDocumentBrand((job as Record<string, unknown>).serviceBrand) ||
    'hydrogenro';

  const input: JobCompletionMessageInput = {
    customerName,
    serviceType,
    serviceSubType,
    amountCollected,
    documentBrand,
  };

  return {
    message: buildJobCompletionMessage(input),
    whatsappMessage: buildJobCompletionWhatsAppMessage(input),
    customerName,
    jobNumber: String(job.job_number || job.jobNumber || ''),
    amount: formatJobCompletionAmount(amountCollected),
    documentBrand,
    serviceType,
    serviceSubType,
    amountCollected,
  };
}

export function getJobCompletionEmailSubject(
  brand: DocumentBrand,
  jobNumber: string
): string {
  const brandLabel = getDocumentBrandLabel(brand);
  const ref = jobNumber.trim();
  return ref
    ? `Service Completed — ${brandLabel} (${ref})`
    : `Service Completed — ${brandLabel}`;
}
