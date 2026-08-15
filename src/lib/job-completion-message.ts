import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { isJobPendingPaymentOpen, parseJobPendingPayment } from '@/lib/jobPendingPayment';
import { formatPendingPaymentDueLabel } from '@/lib/pendingPaymentReminder';
import { brandContactLines, brandLetterClosingLines, brandLetterFooterLines, letterLabelValue, resolveBrandLetterTemplateName } from '@/lib/whatsappBrandContact';
import { waLabeledLink } from '@/lib/whatsappMessageFormat';
import type { PendingPaymentWhatsAppUpiOptions } from '@/lib/pendingPaymentReminder';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

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
  /** Invoice / job ref for letter cold templates. */
  jobRef?: string | null;
  /** UPI pay link for pending balance (24h free-form). */
  upi?: PendingPaymentWhatsAppUpiOptions | null;
  /** When true, caption mentions QR image attached above. */
  withQrImage?: boolean;
  documentBrand: DocumentBrand;
  /** Public /review/{token} link for this job’s technician. */
  reviewUrl?: string | null;
}

function capitalizeWord(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';
}

/** Same completion line logic as the completed-jobs WhatsApp dialog. */
export function buildJobCompletionLine(serviceType: string, serviceSubType: string): string {
  const serviceTypeUpper = (serviceType || '').toUpperCase();
  const rawSubtypeText = serviceSubType ? capitalizeWord(serviceSubType) : '';
  const subtypeText =
    (serviceSubType || '').trim() === 'New Purifier Installation' ||
    (serviceSubType || '').trim() === 'New Softener Installation'
      ? 'installation'
      : rawSubtypeText;

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

/** Always returns a rupee string (₹0 when missing) — for completion messages. */
export function formatJobCompletionAmountOrZero(amount: unknown): string {
  return formatJobCompletionAmount(amount) || '₹0';
}

function pendingDueLabel(dueDateYmd?: string | null): string | null {
  return formatPendingPaymentDueLabel(dueDateYmd);
}

/** Always include collected amount (₹0 ok) + pending lines when open. */
export function buildJobCompletionPaymentPlainLines(input: {
  amountCollected?: number;
  amountPending?: number;
  pendingDueDate?: string | null;
}): string[] {
  const collected = Math.max(0, Number(input.amountCollected) || 0);
  const pending = Math.max(0, Number(input.amountPending) || 0);
  const due = pendingDueLabel(input.pendingDueDate);
  const lines: string[] = [];

  if (pending > 0) {
    lines.push(
      `Amount of ${formatJobCompletionAmountOrZero(collected)} has been collected today.`
    );
    lines.push(
      due
        ? `Balance of ${formatJobCompletionAmountOrZero(pending)} is pending. Payment due date: ${due}.`
        : `Balance of ${formatJobCompletionAmountOrZero(pending)} is pending.`
    );
  } else {
    lines.push(`Amount of ${formatJobCompletionAmountOrZero(collected)} has been collected.`);
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
    '',
    ...paymentLines,
    '',
    `Thank you for choosing ${brandName}. We appreciate your trust and hope you're satisfied with our work.`,
    '',
    ...brandLetterFooterLines(input.documentBrand, {
      includeReview: !input.reviewUrl,
      skipChatHint: true,
    }),
    ...(input.reviewUrl
      ? ['', letterLabelValue('Review us', input.reviewUrl)]
      : []),
  ].join('\n');
}

/**
 * WhatsApp free-form (24h) — letter layout matching Meta letter templates.
 * Call = voice main line (Hydrogen 8884944288 / Eleven 9880693311), not Cloud API WA.
 */
export function buildJobCompletionWhatsAppMessage(input: JobCompletionMessageInput): string {
  const customerName = whatsappGreetingName(input.customerName, 'there');
  const collected = Math.max(0, Number(input.amountCollected) || 0);
  const pending = Math.max(0, Number(input.amountPending) || 0);
  const due = pendingDueLabel(input.pendingDueDate);
  const contact = brandContactLines(input.documentBrand);
  const jobRef = String(input.jobRef || '').trim();

  const amountLines: string[] = [];
  if (pending > 0) {
    amountLines.push(`Amount collected today: ${formatJobCompletionAmountOrZero(collected)}`);
    amountLines.push(
      due
        ? `Balance pending: ${formatJobCompletionAmountOrZero(pending)} (due ${due})`
        : `Balance pending: ${formatJobCompletionAmountOrZero(pending)}`
    );
  } else {
    amountLines.push(`Amount collected: ${formatJobCompletionAmountOrZero(collected)}`);
  }
  if (jobRef) amountLines.push(`Invoice / Job: ${jobRef}`);

  const payLink = (input.upi?.httpsLink || '').trim();
  if (pending > 0 && input.withQrImage) {
    amountLines.push('');
    amountLines.push('📱 Scan the QR above, or tap Pay now / open the link below.');
  }
  if (pending > 0 && payLink) {
    amountLines.push('');
    amountLines.push(waLabeledLink('💳', 'Pay now', payLink));
  }

  return [
    `Hi ${customerName}, 👋`,
    `This is an update from ${contact.brandLabel} regarding your completed water purifier service. ✅`,
    '',
    ...amountLines.map((line) => {
      if (/^Amount collected today/i.test(line)) return `💰 ${line}`;
      if (/^Amount collected/i.test(line)) return `💰 ${line}`;
      if (/^Balance pending/i.test(line)) return `⏳ ${line}`;
      if (/^Invoice \/ Job/i.test(line)) return `🧾 ${line}`;
      return line;
    }),
    '',
    ...brandLetterClosingLines(input.documentBrand, {
      skipChatHint: true,
      includeTextUs: false,
    }),
    '',
    pending > 0 && (payLink || upiId)
      ? '💬 Reply on this chat if you need any help or if you have already paid.'
      : '💬 Reply on this chat if you need any help.',
    ...(input.reviewUrl
      ? ['', waLabeledLink('⭐', 'Review us', input.reviewUrl)]
      : []),
  ].join('\n');
}

/** Plain payment line for Meta cold template {{3}} (no emoji — UTILITY-safe). Always has amount. */
export function buildJobCompletionColdPaymentLine(input: {
  amountCollected?: number;
  amountPending?: number;
  pendingDueDate?: string | null;
}): string {
  return buildJobCompletionPaymentPlainLines(input)
    .join(' ')
    .replace(/₹/g, 'INR ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Meta cold template body params: [name, completion line, payment line]. */
export function buildJobCompletionColdBodyParams(
  input: JobCompletionMessageInput
): [string, string, string] {
  const name = whatsappGreetingName(input.customerName, 'there');
  const completionLine = buildJobCompletionLine(
    input.serviceType || '',
    input.serviceSubType || ''
  );
  const paymentLine = buildJobCompletionColdPaymentLine(input);
  return [name, completionLine, paymentLine];
}

function cleanAmountDigits(amount: number | string): string {
  return (
    String(amount ?? '0')
      .replace(/[^\d.]/g, '')
      .replace(/\.0+$/, '') || '0'
  );
}

/** Letter cold template params: [name, amount digits, invoice/job]. */
export function buildJobCompletionLetterBodyParams(
  input: JobCompletionMessageInput
): [string, string, string] {
  const name = whatsappGreetingName(input.customerName, 'there');
  const amount = cleanAmountDigits(input.amountCollected ?? 0);
  const jobRef = String(input.jobRef || '').trim() || 'your service visit';
  return [name, amount, jobRef];
}

/** Preview of preferred cold body (letter when used; else v3 shell). */
export function formatJobCompletionColdTemplatePreview(
  input: JobCompletionMessageInput
): string {
  const contact = brandContactLines(input.documentBrand);
  const [name, amount, jobRef] = buildJobCompletionLetterBodyParams(input);
  return [
    `Hi ${name}, 👋`,
    `This is an update from ${contact.brandLabel} regarding your completed water purifier service. ✅`,
    '',
    `💰 Amount collected: INR ${amount}`,
    `🧾 Invoice / Job: ${jobRef}`,
    '',
    ...brandLetterClosingLines(input.documentBrand, { includeTextUs: false }),
    '',
    '💬 Reply on this chat if you need any help.',
  ].join('\n');
}

/** Letter UTILITY (newline footer + Call us / Website). Prefer v4 when APPROVED. */
export function resolveJobCompletionLetterTemplateName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('job_done', brand, 'v4');
}

export function resolveJobCompletionLetterTemplateFallbackName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('job_done', brand, 'v3');
}

export function resolveJobCompletionLetterTemplateLegacyName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('job_done', brand, 'v1');
}

/**
 * Brand-specific rich cold template (v3).
 * Callers try letter v3 → v2 → v1 → short svc_job_done.
 */
export function resolveJobCompletionColdTemplateName(brand: DocumentBrand): string {
  return brand === 'elevenro' ? 'svc_job_done_ero_v3' : 'svc_job_done_hro_v3';
}

export function resolveJobCompletionColdTemplateFallbackName(brand: DocumentBrand): string {
  return brand === 'elevenro' ? 'svc_job_done_ero_v2' : 'svc_job_done_hro_v2';
}

export const JOB_COMPLETION_COLD_FALLBACK = {
  name: 'svc_job_done',
  language: 'en' as const,
};

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
  const customerName = whatsappGreetingName(
    customer.full_name || customer.fullName,
    'there'
  );
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

  const jobNumber = String(job.job_number || job.jobNumber || '');
  const input: JobCompletionMessageInput = {
    customerName,
    serviceType,
    serviceSubType,
    amountCollected,
    amountPending: amountPendingValue,
    pendingDueDate: pendingDueDate || null,
    jobRef: jobNumber || null,
    documentBrand,
    reviewUrl: typeof job.reviewUrl === 'string' ? job.reviewUrl : null,
  };

  return {
    message: buildJobCompletionMessage(input),
    whatsappMessage: buildJobCompletionWhatsAppMessage(input),
    customerName,
    jobNumber,
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
