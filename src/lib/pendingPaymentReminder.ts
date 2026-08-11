import { addMonths, format } from 'date-fns';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import { brandContactLines, brandLetterClosingLines, brandLetterFooterLines, resolveBrandLetterTemplateName } from '@/lib/whatsappBrandContact';
import { waLabeledLink, waLabeledValue } from '@/lib/whatsappMessageFormat';
import { extractUpiPayShortCode } from '@/lib/upiPaymentAccounts';

/** Must match reminders created from Settings → Pending payments. */
export const PENDING_PAYMENT_REMINDER_TITLE = 'Pending payment';

/** YYYY-MM-DD in local calendar (not UTC) — matches reminder_at storage and India timezone. */
export function getLocalCalendarDateYmd(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

export function getLocalTomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalCalendarDateYmd(d);
}

/** Next recurring reminder date after marking done (avoids UTC shift from `new Date('YYYY-MM-DD')`). */
export function addMonthsToReminderAt(reminderAt: string, months: number): string {
  return format(addMonths(parseReminderAtLocalDate(reminderAt), months), 'yyyy-MM-dd');
}

export function isPendingPaymentReminderTitle(title: string | null | undefined): boolean {
  return (title ?? '').trim() === PENDING_PAYMENT_REMINDER_TITLE;
}

export function parsePendingPaymentReminderNotes(
  notes: string | null | undefined
): { amount_pending: number; note?: string; job_id?: string; job_number?: string } {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return { amount_pending: 0 };
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as {
        amount_pending?: unknown;
        note?: unknown;
        job_id?: unknown;
        job_number?: unknown;
      };
      const amount_pending =
        typeof parsed.amount_pending === 'number'
          ? parsed.amount_pending
          : Number(String(raw).replace(/[^0-9.-]/g, '')) || 0;
      const note = typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : undefined;
      const job_id = typeof parsed.job_id === 'string' ? parsed.job_id : undefined;
      const job_number = typeof parsed.job_number === 'string' ? parsed.job_number : undefined;
      return { amount_pending, note, job_id, job_number };
    } catch {
      // fallthrough
    }
  }
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return { amount_pending: Number.isFinite(n) ? n : 0 };
}

/**
 * reminder_at is stored as YYYY-MM-DD. Parsing with `new Date('YYYY-MM-DD')` is UTC and can
 * show the wrong calendar day in some timezones; use local midnight instead.
 */
/** Pre-filled WhatsApp reminder — shared by Settings and admin push deep-links. */
export function formatPendingPaymentDueLabel(dueDateYmd: string | null | undefined): string | null {
  const raw = (dueDateYmd ?? '').toString().trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  try {
    return format(parseReminderAtLocalDate(raw), 'd MMM yyyy');
  } catch {
    return raw;
  }
}

/** Resolve brand for pending-payment WhatsApp (defaults to Hydrogen RO when unknown). */
export function resolvePendingPaymentMessageBrand(value: unknown): DocumentBrand {
  return normalizeDocumentBrand(value) || 'hydrogenro';
}

export type PendingPaymentWhatsAppUpiOptions = {
  /** Display label for the account (e.g. Hydrogen RO HDFC). */
  label: string;
  /** VPA shown to the customer (copy into GPay/PhonePe). */
  upiId: string;
  /** Optional payment mobile number (UPI to phone / call). */
  phone?: string;
  /** Raw upi://pay?... (used by /pay-upi page; not put in WhatsApp). */
  deepLink?: string | null;
  /** HTTPS /pay-upi link for WhatsApp (clickable). */
  httpsLink?: string | null;
};

function cleanAmountDigits(amount: number | string): string {
  return (
    String(amount ?? '0')
      .replace(/[^\d.]/g, '')
      .replace(/\.0+$/, '') || '0'
  );
}

/** Letter cold template name — v4 = Pay now button when UPI short link available. */
export function resolvePendingPaymentLetterTemplateName(
  brand: DocumentBrand,
  opts?: { withPayButton?: boolean }
): string {
  if (opts?.withPayButton) {
    return resolveBrandLetterTemplateName('balance_due', brand, 'v4');
  }
  return resolveBrandLetterTemplateName('balance_due', brand, 'v3');
}

export function resolvePendingPaymentLetterTemplateFallbackName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('balance_due', brand, 'v3');
}

export function resolvePendingPaymentLetterTemplateLegacyName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('balance_due', brand, 'v1');
}

/** Letter cold params: name, amount, due date, invoice/job. */
export function buildPendingPaymentLetterBodyParams(
  customerName: string,
  amountPending: number | string,
  dueDateYmd?: string | null,
  invoiceRef?: string | null
): [string, string, string, string] {
  return [
    String(customerName || 'Customer').trim() || 'Customer',
    cleanAmountDigits(amountPending),
    formatPendingPaymentDueLabel(dueDateYmd) || 'at your earliest convenience',
    String(invoiceRef || '').trim() || 'your service visit',
  ];
}

export function buildPendingPaymentWhatsAppMessage(
  customerName: string,
  amountPending: number,
  dueDateYmd?: string | null,
  brand?: DocumentBrand | string | null,
  upi?: PendingPaymentWhatsAppUpiOptions | null,
  invoiceRef?: string | null
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = brandContactLines(resolved);
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const dueLabel = formatPendingPaymentDueLabel(dueDateYmd);
  const payLink = (upi?.httpsLink || '').trim();
  const upiId = (upi?.upiId || '').trim();
  const ref = String(invoiceRef || '').trim();

  const lines: string[] = [
    `Hi ${customerName},`,
    `This is an update from ${contact.brandLabel} regarding your pending payment for water purifier service.`,
    '',
    `Amount pending: ₹${formattedAmount}`,
    `Due date: ${dueLabel || 'At your earliest convenience'}`,
  ];
  if (ref) lines.push(`Invoice / Job: ${ref}`);

  if (payLink || upiId) {
    lines.push('');
    lines.push('*Pay now*');
    if (payLink) {
      lines.push(waLabeledLink('💳', 'UPI pay link (GPay / PhonePe / UPI)', payLink));
    }
    if (upiId) {
      lines.push(waLabeledValue('📱', 'UPI ID', upiId));
    }
    if (upi?.label) {
      lines.push(waLabeledValue('🏦', 'Pay to', upi.label));
    }
    if (payLink) {
      lines.push(`Amount ₹${formattedAmount} is pre-filled when you use the UPI pay link.`);
    }
    if (upi?.phone) {
      lines.push(waLabeledValue('📞', 'UPI mobile', upi.phone));
    }
  }

  lines.push('');
  lines.push(...brandLetterClosingLines(resolved, { skipChatHint: true }));
  lines.push('');
  lines.push('Reply on this chat if you need any help.');
  if (payLink || upiId) {
    lines.push('If you have already paid, reply on this chat.');
  }

  return lines.join('\n');
}

export function buildPendingPaymentReceivedWhatsAppMessage(
  customerName: string,
  amountPending: number,
  brand?: DocumentBrand | string | null
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = brandContactLines(resolved);
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return [
    `Hi ${customerName},`,
    `This is an update from ${contact.brandLabel} regarding your payment.`,
    '',
    `We have received your payment of ₹${formattedAmount}. Thank you.`,
    '',
    ...brandLetterClosingLines(resolved, { includeTextUs: true }),
  ].join('\n');
}

/** Pay-now URL button param for balance-due v4 cold template. */
export function buildPendingPaymentLetterButtonUrlParams(
  httpsLink?: string | null
): Array<{ index: number; text: string }> {
  const code = extractUpiPayShortCode(httpsLink);
  if (!code) return [];
  return [{ index: 1, text: code }];
}

export function parseReminderAtLocalDate(reminderAt: string | Date): Date {
  if (reminderAt instanceof Date) return reminderAt;
  const s = (reminderAt ?? '').trim().split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  return new Date(reminderAt);
}
