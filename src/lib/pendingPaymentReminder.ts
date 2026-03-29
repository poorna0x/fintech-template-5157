/** Must match reminders created from Settings → Pending payments. */
export const PENDING_PAYMENT_REMINDER_TITLE = 'Pending payment';

export function isPendingPaymentReminderTitle(title: string | null | undefined): boolean {
  return (title ?? '').trim() === PENDING_PAYMENT_REMINDER_TITLE;
}

export function parsePendingPaymentReminderNotes(
  notes: string | null | undefined
): { amount_pending: number; note?: string } {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return { amount_pending: 0 };
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { amount_pending?: unknown; note?: unknown };
      const amount_pending =
        typeof parsed.amount_pending === 'number'
          ? parsed.amount_pending
          : Number(String(raw).replace(/[^0-9.-]/g, '')) || 0;
      const note = typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : undefined;
      return { amount_pending, note };
    } catch {
      // fallthrough
    }
  }
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return { amount_pending: Number.isFinite(n) ? n : 0, note: undefined };
}

/**
 * reminder_at is stored as YYYY-MM-DD. Parsing with `new Date('YYYY-MM-DD')` is UTC and can
 * show the wrong calendar day in some timezones; use local midnight instead.
 */
export function parseReminderAtLocalDate(reminderAt: string): Date {
  const s = (reminderAt ?? '').trim().split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }
  return new Date(reminderAt);
}
