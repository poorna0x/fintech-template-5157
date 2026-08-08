/**
 * Meta WhatsApp UTILITY template names for cold outreach (outside 24h window).
 * Submit via Graph API / Meta Manager; status must be APPROVED before sends succeed.
 *
 * Prefer `svc_*` minimal set (scripts/submit-whatsapp-minimal-utility.mjs) — Call button only,
 * no URL / Book CTAs (faster Utility approval). Cold PDFs use DOCUMENT-header `svc_document_pdf`.
 *
 * Cold PDF: one-shot via `svc_document_pdf` (PDF in template header). No reply-YES invite.
 */
export const WA_COLD = {
  pending_payment: {
    name: 'svc_balance_due',
    language: 'en',
    /** {{1}}=name, {{2}}=amount digits */
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  /** Prefer this name — Meta reclassified service_reminder_cta as MARKETING. */
  service_reminder: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, whenLabel?: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your upcoming visit',
    ],
  },
  amc_renewal: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      `AMC expiry notice (${String(endDate || '').trim() || 'soon'})`,
    ],
  },
  /** Prefer this name — Meta reclassified amc_renewal as MARKETING. */
  amc_expiry_notice: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      `AMC expiry notice (${String(endDate || '').trim() || 'soon'})`,
    ],
  },
  /** {{1}}=name, {{2}}=doc label — DOCUMENT header carries the PDF */
  document_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, documentLabel: string) => [
      cleanName(customerName),
      String(documentLabel || 'document').trim() || 'document',
    ],
  },
  quotation_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, ref: string) => [
      cleanName(customerName),
      `quotation ${String(ref || '').trim() || ''}`.trim() || 'quotation',
    ],
  },
  service_bill_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, _amount?: number | string) => [
      cleanName(customerName),
      'service bill',
    ],
  },
  invoice_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, _amount?: number | string) => [
      cleanName(customerName),
      'tax invoice',
    ],
  },
  amc_document_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'AMC agreement'],
  },
  warranty_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'warranty card'],
  },
  receipt_ready: {
    name: 'svc_document_pdf',
    language: 'en',
    bodyParams: (customerName: string, _amount?: number | string) => [
      cleanName(customerName),
      'payment receipt',
    ],
  },
  /** Prefer this name — Meta reclassified customer_followup_cta as MARKETING. */
  customer_followup: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, topic: string) => [
      cleanName(customerName),
      String(topic || 'your request').trim() || 'your request',
    ],
  },
  appointment_reminder: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, whenLabel: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'soon',
    ],
  },
  payment_received: {
    name: 'svc_payment_received',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  tech_assigned: {
    name: 'svc_tech_assigned',
    language: 'en',
    bodyParams: (customerName: string, technicianName: string) => [
      cleanName(customerName),
      String(technicianName || 'our technician').trim() || 'our technician',
    ],
  },
  /** Job completion cold open — {{1}}=name, {{2}}=amount collected */
  job_completion: {
    name: 'svc_completed',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  /** Catch-all cold text: {{1}}=name, {{2}}=short notice */
  general_notice: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, notice: string) => [
      cleanName(customerName),
      String(notice || '').trim().slice(0, 120) || 'update',
    ],
  },
  /**
   * Most flexible Meta-accepted utility: {{1}}=name, {{2}}=details sentence.
   * Not free-form — still fixed shell text around the variables.
   */
  crm_notice: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, details: string) => [
      cleanName(customerName),
      String(details || '').trim().slice(0, 200) || 'Please reply on this chat for details.',
    ],
  },
  /** {{1}}=name, {{2}}=topic+detail collapsed */
  crm_update_details: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, topic: string, details: string) => [
      cleanName(customerName),
      `${String(topic || '').trim().slice(0, 60) || 'update'}: ${
        String(details || '').trim().slice(0, 100) || 'Please reply on this chat.'
      }`.slice(0, 160),
    ],
  },
  // —— Booking flows (use svc_* until dual-brand CTA templates are re-approved) ——
  // Spec: src/lib/whatsappBookingCtaTemplates.ts → resolveBookingCta(kind, brand, ...)
  book_existing_customer: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'your service schedule'],
  },
  book_new_customer: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string) => [
      cleanName(customerName) || 'there',
      'service registration',
    ],
  },
  missed_call_book: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'callback for your missed call'],
  },
  reschedule_visit: {
    name: 'svc_visit_reminder',
    language: 'en',
    bodyParams: (customerName: string, whenLabel: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  },
  booking_confirmed: {
    name: 'svc_visit_confirmed',
    language: 'en',
    bodyParams: (customerName: string, jobRef: string, whenLabel: string) => [
      cleanName(customerName),
      String(jobRef || '').trim() || 'your booking',
      String(whenLabel || '').trim() || 'the scheduled time',
    ],
  },
} as const;

export type WaColdDocKind =
  | 'quotation'
  | 'service_bill'
  | 'invoice'
  | 'tax_invoice'
  | 'amc'
  | 'amc_document'
  | 'warranty'
  | 'receipt'
  | 'generic';

/** Map CRM document / composer template type → Meta cold `*_ready` template. */
export function coldDocTemplateForKind(kind: WaColdDocKind | string): {
  name: string;
  language: string;
} {
  const k = String(kind || 'generic').toLowerCase();
  if (k === 'quotation') return { name: WA_COLD.quotation_ready.name, language: WA_COLD.quotation_ready.language };
  if (k === 'service_bill')
    return { name: WA_COLD.service_bill_ready.name, language: WA_COLD.service_bill_ready.language };
  if (k === 'invoice' || k === 'tax_invoice')
    return { name: WA_COLD.invoice_ready.name, language: WA_COLD.invoice_ready.language };
  if (k === 'amc' || k === 'amc_document')
    return { name: WA_COLD.amc_document_ready.name, language: WA_COLD.amc_document_ready.language };
  if (k === 'warranty' || k === 'warranty_document')
    return { name: WA_COLD.warranty_ready.name, language: WA_COLD.warranty_ready.language };
  if (k === 'receipt') return { name: WA_COLD.receipt_ready.name, language: WA_COLD.receipt_ready.language };
  return { name: WA_COLD.document_ready.name, language: WA_COLD.document_ready.language };
}

export function coldDocBodyParams(
  kind: WaColdDocKind | string,
  opts: { customerName: string; amount?: number | string; ref?: string; documentLabel?: string }
): string[] {
  const k = String(kind || 'generic').toLowerCase();
  if (k === 'quotation') {
    return WA_COLD.quotation_ready.bodyParams(opts.customerName, opts.ref || 'quotation');
  }
  if (k === 'service_bill') {
    return WA_COLD.service_bill_ready.bodyParams(opts.customerName, opts.amount ?? 0);
  }
  if (k === 'invoice' || k === 'tax_invoice') {
    return WA_COLD.invoice_ready.bodyParams(opts.customerName, opts.amount ?? 0);
  }
  if (k === 'amc' || k === 'amc_document') {
    return WA_COLD.amc_document_ready.bodyParams(opts.customerName);
  }
  if (k === 'warranty' || k === 'warranty_document') {
    return WA_COLD.warranty_ready.bodyParams(opts.customerName);
  }
  if (k === 'receipt') {
    return WA_COLD.receipt_ready.bodyParams(opts.customerName, opts.amount ?? 0);
  }
  return WA_COLD.document_ready.bodyParams(
    opts.customerName,
    opts.documentLabel || 'document'
  );
}

function cleanName(customerName: string): string {
  return String(customerName || 'Customer').trim() || 'Customer';
}

function cleanAmount(amount: number | string): string {
  return (
    String(amount ?? '0')
      .replace(/[^\d.]/g, '')
      .replace(/\.0+$/, '') || '0'
  );
}

/** Human labels for inbox / pickers */
export const WA_COLD_LABELS: Record<keyof typeof WA_COLD, string> = {
  pending_payment: 'Balance due (svc_balance_due)',
  service_reminder: 'Visit reminder (svc_visit_reminder)',
  amc_renewal: 'AMC expiry → document PDF',
  amc_expiry_notice: 'AMC expiry → document PDF',
  document_ready: 'Document PDF (svc_document_pdf)',
  quotation_ready: 'Quotation PDF (svc_document_pdf)',
  service_bill_ready: 'Service bill PDF (svc_document_pdf)',
  invoice_ready: 'Tax invoice PDF (svc_document_pdf)',
  amc_document_ready: 'AMC PDF (svc_document_pdf)',
  warranty_ready: 'Warranty PDF (svc_document_pdf)',
  receipt_ready: 'Receipt PDF (svc_document_pdf)',
  customer_followup: 'Follow-up → visit reminder',
  appointment_reminder: 'Appointment reminder (svc_visit_reminder)',
  payment_received: 'Payment received (svc_payment_received)',
  tech_assigned: 'Technician assigned (svc_tech_assigned)',
  job_completion: 'Service completed (svc_completed)',
  general_notice: 'General notice → visit reminder',
  crm_notice: 'CRM notice → visit reminder',
  crm_update_details: 'CRM update → visit reminder',
  book_existing_customer: 'Existing schedule → visit reminder',
  book_new_customer: 'Unregistered → visit reminder',
  missed_call_book: 'Missed call → visit reminder',
  reschedule_visit: 'Reschedule → visit reminder',
  booking_confirmed: 'Booking confirmed (svc_visit_confirmed)',
};
