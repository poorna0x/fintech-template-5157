import { addMonths, format } from 'date-fns';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import { brandContactLines, brandLetterClosingLines, resolveBrandLetterTemplateName } from '@/lib/whatsappBrandContact';
import { waLabeledLink } from '@/lib/whatsappMessageFormat';
import { extractUpiPayShortCode } from '@/lib/upiPaymentAccounts';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

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

/** Letter cold template name — v9 = Pay now, no contact footer; fallback v8 → v7. */
export function resolvePendingPaymentLetterTemplateName(
  brand: DocumentBrand,
  opts?: { withPayButton?: boolean; withReview?: boolean }
): string {
  if (opts?.withPayButton && opts?.withReview) {
    return resolveBrandLetterTemplateName('balance_due', brand, 'v10');
  }
  if (opts?.withPayButton) {
    return resolveBrandLetterTemplateName('balance_due', brand, 'v9');
  }
  return resolveBrandLetterTemplateName('balance_due', brand, 'v3');
}

/** IMAGE header lean QR — no Call/Email/Website in body. */
export function resolvePendingPaymentLetterImageTemplateName(brand: DocumentBrand): string {
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  return `svc_balance_due_letter_${suffix}_img_v5`;
}

export function resolvePendingPaymentLetterImageTemplateFallbackName(brand: DocumentBrand): string {
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  return `svc_balance_due_letter_${suffix}_img_v4`;
}

export function resolvePendingPaymentLetterTemplateFallbackName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('balance_due', brand, 'v8');
}

export function resolvePendingPaymentLetterTemplateLegacyName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('balance_due', brand, 'v1');
}

/** Approved-name candidates for inbox quick-reply filter (image → letter → short). */
export function pendingPaymentTemplateFallbackNames(brand?: DocumentBrand | string | null): string[] {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const suffix = resolved === 'elevenro' ? 'ero' : 'hro';
  return [
    `svc_payment_overdue_notice_${suffix}_v3`,
    `svc_payment_overdue_notice_${suffix}_v2`,
    `svc_payment_overdue_notice_${suffix}_v1`,
    `svc_balance_due_letter_${suffix}_img_v5`,
    `svc_balance_due_letter_${suffix}_img_v4`,
    `svc_balance_due_letter_${suffix}_img_v3`,
    `svc_balance_due_letter_${suffix}_img_v2`,
    `svc_balance_due_letter_${suffix}_img_v1`,
    `svc_balance_due_letter_${suffix}_v10`,
    `svc_balance_due_letter_${suffix}_v9`,
    `svc_balance_due_letter_${suffix}_v8`,
    `svc_balance_due_letter_${suffix}_v7`,
    `svc_balance_due_letter_${suffix}_v6`,
    `svc_balance_due_letter_${suffix}_v5`,
    `svc_balance_due_letter_${suffix}_v4`,
    `svc_balance_due_letter_${suffix}_v3`,
    `svc_balance_due_letter_${suffix}_v2`,
    `svc_balance_due_letter_${suffix}`,
    'svc_balance_due',
  ];
}

/** Letter cold params: name, amount, due date, invoice/job. */
export function buildPendingPaymentLetterBodyParams(
  customerName: string,
  amountPending: number | string,
  dueDateYmd?: string | null,
  invoiceRef?: string | null
): [string, string, string, string] {
  return [
    whatsappGreetingName(customerName, 'there'),
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
  invoiceRef?: string | null,
  opts?: { withQrImage?: boolean; /** Body for interactive Pay now CTA (no inline link). */ ctaButton?: boolean }
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = brandContactLines(resolved);
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const dueLabel = formatPendingPaymentDueLabel(dueDateYmd);
  const payLink = (upi?.httpsLink || '').trim();
  const ref = String(invoiceRef || '').trim();
  const withQr = Boolean(opts?.withQrImage);
  const ctaButton = Boolean(opts?.ctaButton);

  const lines: string[] = [
    `Hi ${whatsappGreetingName(customerName, 'there')}, 👋`,
    withQr
      ? `Pending payment for your water purifier service — ${contact.brandLabel}. 💧`
      : `This is an update from ${contact.brandLabel} regarding your pending payment for water purifier service. 💧`,
    '',
    `💰 Amount pending: ₹${formattedAmount}`,
    `📅 Due date: ${dueLabel || 'At your earliest convenience'}`,
  ];
  if (ref) lines.push(`🧾 Invoice / Job: ${ref}`);

  if (withQr) {
    lines.push('');
    lines.push(
      ctaButton
        ? '📱 Scan the QR above, or tap Pay now below.'
        : '📱 Scan the QR above, or tap Pay now / open the link below.'
    );
  }

  // Pay page already has UPI ID / payee / phone — don't repeat in chat.
  // When ctaButton: Pay now is a real WhatsApp button — skip inline URL.
  if (payLink && !ctaButton) {
    lines.push('');
    lines.push(waLabeledLink('💳', 'Pay now', payLink));
  }

  lines.push('');
  if (ctaButton && (withQr || payLink)) {
    lines.push('💳 Tap *Pay now* below or reply on this chat if you have already paid.');
  } else if (withQr || payLink) {
    lines.push('💳 Tap *Pay now* below or reply on this chat if you have already paid.');
  } else {
    lines.push('💬 Reply on this chat if you need any help or if you have already paid.');
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
    `Hi ${whatsappGreetingName(customerName, 'there')},`,
    `This is an update from ${contact.brandLabel} regarding your payment.`,
    '',
    `We have received your payment of ₹${formattedAmount}. Thank you.`,
    '',
    ...brandLetterClosingLines(resolved, { includeTextUs: true }),
  ].join('\n');
}

/**
 * True when the promised due date is strictly before today (local calendar) —
 * i.e. at least one full day past due. Used for overdue notice copy / cold template.
 */
export function isPendingPaymentPastDueForOverdueNotice(
  dueDateYmd: string | null | undefined,
  todayYmd: string = getLocalCalendarDateYmd()
): boolean {
  const due = String(dueDateYmd || '')
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < todayYmd;
}

/** Cold overdue notice — Call us + Pay now. Fallback: balance-due letter via cold-fallback. */
export function resolvePendingPaymentOverdueTemplateName(brand: DocumentBrand): string {
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  return `svc_payment_overdue_notice_${suffix}_v3`;
}

/** Overdue free-form (24h) — unpaid after due; prior promise void; advance not returned. */
export function buildPendingPaymentOverdueWhatsAppMessage(
  customerName: string,
  amountPending: number,
  dueDateYmd?: string | null,
  brand?: DocumentBrand | string | null,
  upi?: PendingPaymentWhatsAppUpiOptions | null,
  invoiceRef?: string | null,
  opts?: { ctaButton?: boolean }
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = brandContactLines(resolved);
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const dueLabel = formatPendingPaymentDueLabel(dueDateYmd);
  const payLink = (upi?.httpsLink || '').trim();
  const ref = String(invoiceRef || '').trim();
  const ctaButton = Boolean(opts?.ctaButton);

  const lines: string[] = [
    `Hi ${whatsappGreetingName(customerName, 'there')}, 👋`,
    `This is a payment notice from ${contact.brandLabel} — the balance for your water purifier service is still unpaid. 💧`,
    '',
    `💰 Amount still unpaid: ₹${formattedAmount}`,
    `📅 Due date (passed): ${dueLabel || 'As agreed'}`,
  ];
  if (ref) lines.push(`🧾 Invoice / Job: ${ref}`);

  lines.push('');
  lines.push(
    'The promised payment date has passed and this amount remains unpaid. Any earlier promise, warranty, AMC or service agreement, or extension linked to this visit is no longer valid because payment was not completed. Any advance already paid will *not* be returned.'
  );

  if (payLink && !ctaButton) {
    lines.push('');
    lines.push(waLabeledLink('💳', 'Pay now', payLink));
  }

  lines.push('');
  if (ctaButton || payLink) {
    lines.push('Tap *Pay now* below to clear dues. If you need any help, reply on this chat.');
  } else {
    lines.push('If you need any help, reply on this chat.');
  }

  return lines.join('\n');
}

/** Pay-now URL button param for balance-due v4 cold template. */
export function buildPendingPaymentLetterButtonUrlParams(
  httpsLink?: string | null,
  opts?: { reviewToken?: string | null }
): Array<{ index: number; text: string }> {
  const code = extractUpiPayShortCode(httpsLink);
  if (!code) return [];
  const out: Array<{ index: number; text: string }> = [{ index: 1, text: code }];
  const review = String(opts?.reviewToken || '').trim();
  if (review.length >= 12 && review.length <= 48) {
    out.push({ index: 2, text: review });
  }
  return out;
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
