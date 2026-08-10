import { addMonths, format } from 'date-fns';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { waLabeledLink, waLabeledValue } from '@/lib/whatsappMessageFormat';

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

const PENDING_PAYMENT_CONTACT: Record<
  DocumentBrand,
  { phone: string; email: string; website: string; team: string }
> = {
  hydrogenro: {
    phone: '8884944288',
    email: 'mail@hydrogenro.com',
    website: 'https://hydrogenro.com',
    team: 'Hydrogen RO Team',
  },
  elevenro: {
    phone: '9880693311',
    email: 'mail@elevenro.com',
    website: 'https://elevenro.com',
    team: 'Eleven RO Team',
  },
};

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

export function buildPendingPaymentWhatsAppMessage(
  customerName: string,
  amountPending: number,
  dueDateYmd?: string | null,
  brand?: DocumentBrand | string | null,
  upi?: PendingPaymentWhatsAppUpiOptions | null
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = PENDING_PAYMENT_CONTACT[resolved];
  const brandLabel = getDocumentBrandLabel(resolved);
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const dueLabel = formatPendingPaymentDueLabel(dueDateYmd);
  const payLink = (upi?.httpsLink || '').trim();
  const upiId = (upi?.upiId || '').trim();

  const lines: string[] = [
    `Hi ${customerName} 😊`,
    '',
    `Quick reminder from *${brandLabel}* about your pending payment for water filter service.`,
    '',
    '*Payment summary*',
    waLabeledValue('💰', 'Amount due', `₹${formattedAmount}`),
    waLabeledValue('📅', 'Due by', dueLabel || 'At your earliest convenience'),
  ];

  if (payLink || upiId) {
    lines.push('');
    lines.push('*Pay now*');
    if (payLink) {
      lines.push(waLabeledLink('💳', 'Payment link (GPay / PhonePe / UPI)', payLink));
    }
    if (upiId) {
      lines.push(waLabeledValue('📱', 'UPI ID', upiId));
    }
    if (upi?.label) {
      lines.push(waLabeledValue('🏦', 'Pay to', upi.label));
    }
    if (payLink) {
      lines.push(`Amount *₹${formattedAmount}* is pre-filled when you use the payment link.`);
    }
    if (upi?.phone) {
      lines.push(waLabeledValue('📞', 'UPI mobile', upi.phone));
    }
  }

  lines.push('');
  lines.push('Please clear this at your earliest convenience. If you have already paid, kindly ignore this message.');
  lines.push('');
  lines.push('Thanks & regards 🙏');
  lines.push(contact.team);

  return lines.join('\n');
}

export function buildPendingPaymentReceivedWhatsAppMessage(
  customerName: string,
  amountPending: number,
  brand?: DocumentBrand | string | null
): string {
  const resolved = resolvePendingPaymentMessageBrand(brand);
  const contact = PENDING_PAYMENT_CONTACT[resolved];
  const formattedAmount = amountPending.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return `Hi ${customerName} 😊

Thank you! We have received your payment of ₹${formattedAmount}.

We appreciate your trust. For any help or support:
${waLabeledValue('📞', 'Phone', contact.phone)}
${waLabeledValue('📧', 'Email', contact.email)}
${waLabeledLink('🌐', 'Website', contact.website)}

Thanks & regards 🙏
${contact.team}`;
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
