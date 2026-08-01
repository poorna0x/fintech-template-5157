import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { isJobPendingPaymentOpen, parseJobPendingPayment } from '@/lib/jobPendingPayment';
import { formatPendingPaymentDueLabel } from '@/lib/pendingPaymentReminder';

export interface JobCompletionMessageInput {
  customerName: string;
  serviceType?: string;
  serviceSubType?: string;
  /** Amount collected now (full bill, or paid-today when payment is still pending). */
  amountCollected?: number;
  /** Open pending balance (0 / omit when fully paid or not pending). */
  amountPending?: number;
  /** Promised payment date YYYY-MM-DD when amountPending > 0. */
  pendingDueDate?: string | null;
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

function pendingDueLabel(dueDateYmd?: string | null): string | null {
  return formatPendingPaymentDueLabel(dueDateYmd);
}

/** Plain-text payment lines for email body / message field (no emoji). */
export function buildJobCompletionPaymentPlainLines(input: {
  amountCollected?: number;
  amountPending?: number;
  pendingDueDate?: string | null;
}): string[] {
  const collected = Number(input.amountCollected) || 0;
  const pending = Number(input.amountPending) || 0;
  const due = pendingDueLabel(input.pendingDueDate);
  const lines: string[] = [];

  if (pending > 0) {
    if (collected > 0) {
      lines.push(`Amount of ${formatJobCompletionAmount(collected)} has been collected today.`);
    }
    lines.push(
      due
        ? `Balance of ${formatJobCompletionAmount(pending)} is pending. Payment due date: ${due}.`
        : `Balance of ${formatJobCompletionAmount(pending)} is pending.`
    );
  } else if (collected > 0) {
    lines.push(`Amount of ${formatJobCompletionAmount(collected)} has been collected.`);
  }

  return lines;
}

export function buildJobCompletionMessage(input: JobCompletionMessageInput): string {
  const completionLine = buildJobCompletionLine(
    input.serviceType || '',
    input.serviceSubType || ''
  );
  const brandName = getDocumentBrandLabel(input.documentBrand);
  const paymentLines = buildJobCompletionPaymentPlainLines(input);

  return [
    completionLine,
    ...(paymentLines.length ? ['', ...paymentLines] : []),
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
  const collected = Number(input.amountCollected) || 0;
  const pending = Number(input.amountPending) || 0;
  const due = pendingDueLabel(input.pendingDueDate);

  let amountBlock = '';
  if (pending > 0) {
    const parts: string[] = [];
    if (collected > 0) {
      parts.push(
        `💰 Amount of ${formatJobCompletionAmount(collected)} has been collected today.`
      );
    }
    parts.push(
      due
        ? `⏳ Balance of ${formatJobCompletionAmount(pending)} is pending. Payment due date: ${due}.`
        : `⏳ Balance of ${formatJobCompletionAmount(pending)} is pending.`
    );
    amountBlock = `${parts.join('\n')}\n\n`;
  } else if (collected > 0) {
    amountBlock = `💰 Amount of ${formatJobCompletionAmount(collected)} has been collected.\n\n`;
  }

  const brand = input.documentBrand;
  const info = getCompanyInfoForBrand(brand);
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  const bookingUrl = `${website.replace(/\/$/, '')}/book`;

  return `Dear ${customerName},

✅ ${completionLine}
${amountBlock}For any queries or support, please contact us:
📞 Phone: ${info.phone}
📧 Email: ${info.email}
🌐 Website: ${website}

📱 For future bookings, you can book directly on ${bookingUrl} for ease and convenience.`;
}

function resolveBillAmount(job: Record<string, unknown>): number {
  const actualCost = job.actual_cost ?? job.actualCost;
  const paymentAmount = job.payment_amount ?? job.paymentAmount;
  if (typeof actualCost === 'number') return actualCost;
  if (typeof paymentAmount === 'number') return paymentAmount;
  return parseFloat(String(actualCost || paymentAmount || '0')) || 0;
}

export function buildJobCompletionMessageFromJob(job: Record<string, unknown>): {
  message: string;
  whatsappMessage: string;
  customerName: string;
  jobNumber: string;
  amount: string;
  amountPending: string;
  pendingDueDate: string;
  documentBrand: DocumentBrand;
  serviceType: string;
  serviceSubType: string;
  amountCollected: number;
  amountPendingValue: number;
} {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  const customerName = String(customer.full_name || customer.fullName || 'Customer');
  const serviceType = String(job.service_type || job.serviceType || '');
  const serviceSubType = String(job.service_sub_type || job.serviceSubType || '');
  const bill = resolveBillAmount(job);

  const requirements = job.requirements ?? job.Requirements;
  const pendingPayload = parseJobPendingPayment(requirements);
  const pendingOpen = isJobPendingPaymentOpen(requirements) && pendingPayload;

  const amountCollected = pendingOpen
    ? Math.max(0, Number(pendingPayload.paid_today) || 0)
    : bill;
  const amountPendingValue = pendingOpen
    ? Math.max(0, Number(pendingPayload.amount_pending) || 0)
    : 0;
  const pendingDueDate = pendingOpen ? pendingPayload.promised_date || '' : '';

  const documentBrand =
    normalizeDocumentBrand(job.service_brand) ||
    normalizeDocumentBrand((job as Record<string, unknown>).serviceBrand) ||
    'hydrogenro';

  const input: JobCompletionMessageInput = {
    customerName,
    serviceType,
    serviceSubType,
    amountCollected,
    amountPending: amountPendingValue,
    pendingDueDate: pendingDueDate || null,
    documentBrand,
  };

  return {
    message: buildJobCompletionMessage(input),
    whatsappMessage: buildJobCompletionWhatsAppMessage(input),
    customerName,
    jobNumber: String(job.job_number || job.jobNumber || ''),
    amount: formatJobCompletionAmount(amountCollected),
    amountPending: formatJobCompletionAmount(amountPendingValue),
    pendingDueDate,
    documentBrand,
    serviceType,
    serviceSubType,
    amountCollected,
    amountPendingValue,
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
