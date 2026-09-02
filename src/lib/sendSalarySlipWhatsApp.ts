import type { TechnicianSalaryBreakdown } from '@/components/TechnicianPayments';
import { generateSalarySlipPdfBase64 } from '@/lib/salary-slip-pdf-generator';
import {
  sendAdminWhatsAppDocumentWithColdFallback,
  type AdminWhatsAppSendResult,
} from '@/lib/sendAdminWhatsAppApi';
import { isAbortError, SEND_CANCELLED_MESSAGE } from '@/lib/abortSend';

function daySuffix(day: number): string {
  if (day === 1 || day === 21 || day === 31) return 'st';
  if (day === 2 || day === 22) return 'nd';
  if (day === 3 || day === 23) return 'rd';
  return 'th';
}

export function formatSalarySlipPeriodLabel(period: { start: Date; end: Date }): string {
  const startDay = period.start.getDate();
  const endDay = period.end.getDate();
  const month = period.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return `${startDay}${daySuffix(startDay)} – ${endDay}${daySuffix(endDay)} ${month}`;
}

export function buildSalarySlipWhatsAppCaption(
  breakdown: TechnicianSalaryBreakdown,
  period: { start: Date; end: Date }
): string {
  const periodLabel = formatSalarySlipPeriodLabel(period);
  const net = breakdown.totalSalary.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `Hi ${breakdown.technicianName},

Your salary slip for ${periodLabel} is attached.

Net salary: ₹${net}

Hydrogen RO Team`;
}

export async function sendSalarySlipWhatsApp(opts: {
  to: string;
  breakdown: TechnicianSalaryBreakdown;
  period: { start: Date; end: Date };
  includeDayWiseBreakdown: boolean;
  caption?: string;
  signal?: AbortSignal;
}): Promise<AdminWhatsAppSendResult & { viaColdTemplate?: boolean }> {
  const to = String(opts.to || '').trim();
  if (!to) return { ok: false, error: 'Technician phone required' };

  try {
    const { pdfBase64, filename } = await generateSalarySlipPdfBase64(
      opts.breakdown,
      opts.period,
      opts.includeDayWiseBreakdown,
      opts.signal
    );
    const caption =
      String(opts.caption || '').trim() ||
      buildSalarySlipWhatsAppCaption(opts.breakdown, opts.period);

    return sendAdminWhatsAppDocumentWithColdFallback({
      to,
      pdfBase64,
      filename,
      caption,
      source: 'composer',
      preferColdTemplate: true,
      signal: opts.signal,
      cold: {
        kind: 'salary',
        brand: 'hydrogenro',
        customerName: opts.breakdown.technicianName,
      },
    });
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
    }
    throw err;
  }
}
