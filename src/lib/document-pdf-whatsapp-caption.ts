import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';

export type DocumentPdfWhatsAppKind = 'service_bill' | 'quotation' | 'invoice';

function formatInr(amount: number | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0) return '';
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDisplayDate(iso: string | null | undefined): string {
  const raw = String(iso || '').trim();
  if (!raw) return '';
  try {
    const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

function brandContactLines(brand: DocumentBrand): string[] {
  const info = getCompanyInfoForBrand(brand);
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  return [
    `📞 Phone: ${info.phone}`,
    `📧 Email: ${info.email}`,
    `🌐 Website: ${website}`,
  ];
}

export interface DocumentPdfWhatsAppCaptionInput {
  kind: DocumentPdfWhatsAppKind;
  brand: DocumentBrand;
  customerName?: string | null;
  documentRef?: string | null;
  amount?: number | null;
  /** Bill date, invoice date, or quotation valid-until */
  dateIso?: string | null;
  paymentStatus?: string | null;
}

/**
 * Professional WhatsApp caption for bill / quotation / invoice PDF sends.
 * Kept under Meta's ~1024-char document caption limit.
 */
export function buildDocumentPdfWhatsAppCaption(input: DocumentPdfWhatsAppCaptionInput): string {
  const brandName = getDocumentBrandLabel(input.brand);
  const customerName = String(input.customerName || '').trim() || 'Customer';
  const ref = String(input.documentRef || '').trim();
  const amount = formatInr(input.amount ?? undefined);
  const dateLabel = formatDisplayDate(input.dateIso);
  const paymentStatus = String(input.paymentStatus || '').trim().toLowerCase();

  const details: string[] = [];

  if (input.kind === 'quotation') {
    if (ref) details.push(`📋 Quote no.: ${ref}`);
    if (amount) details.push(`💰 Amount: ${amount}`);
    if (dateLabel) details.push(`📅 Valid until: ${dateLabel}`);
  } else if (input.kind === 'service_bill') {
    if (ref) details.push(`📋 Bill no.: ${ref}`);
    if (amount) details.push(`💰 Amount: ${amount}`);
    if (dateLabel) details.push(`📅 Bill date: ${dateLabel}`);
    if (paymentStatus === 'paid') details.push('✅ Payment status: Paid');
    else if (
      paymentStatus === 'pending' ||
      paymentStatus === 'partial' ||
      paymentStatus === 'overdue'
    ) {
      details.push(
        `⏳ Payment status: ${
          paymentStatus === 'partial'
            ? 'Partially paid'
            : paymentStatus === 'overdue'
              ? 'Overdue'
              : 'Pending'
        }`
      );
    }
  } else {
    if (ref) details.push(`📋 Invoice no.: ${ref}`);
    if (amount) details.push(`💰 Amount: ${amount}`);
    if (dateLabel) details.push(`📅 Date: ${dateLabel}`);
  }

  const intro =
    input.kind === 'quotation'
      ? [
          `Dear ${customerName},`,
          '',
          `📄 *Quotation from ${brandName}*`,
          '',
          'Please find your quotation PDF attached.',
          'Kindly review the details and reply here to confirm, or call us if you need any changes.',
        ]
      : input.kind === 'service_bill'
        ? [
            `Dear ${customerName},`,
            '',
            `🧾 *Service bill from ${brandName}*`,
            '',
            'Please find your service bill PDF attached for your recent visit.',
            'Thank you for trusting us with your RO service. Reply here or call us for any help.',
          ]
        : [
            `Dear ${customerName},`,
            '',
            `📑 *Tax invoice from ${brandName}*`,
            '',
            'Please find your tax invoice PDF attached.',
            'Payment details are included in the document. Reply here or call us if you need assistance.',
          ];

  const text = [
    ...intro,
    ...(details.length ? ['', ...details] : []),
    '',
    'For any queries or support, please contact us:',
    ...brandContactLines(input.brand),
    '',
    'Warm regards,',
    brandName,
  ].join('\n');

  return text.slice(0, 1024);
}
