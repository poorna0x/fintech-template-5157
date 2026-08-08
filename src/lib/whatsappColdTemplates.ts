/**
 * Meta WhatsApp UTILITY template names for cold outreach (outside 24h window).
 * Submit via Graph API / Meta Manager; status must be APPROVED before sends succeed.
 *
 * Cold PDF strategy: send `*_ready` / `document_ready` first (customer replies) → then
 * send PDF inside the 24h window. True DOCUMENT-header templates need Meta media + app secret.
 */
export const WA_COLD = {
  pending_payment: {
    name: 'pending_payment_cta',
    language: 'en',
    /** {{1}}=name, {{2}}=amount digits — Call + Book online CTAs */
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  /** Prefer this name — Meta reclassified service_reminder_cta as MARKETING. */
  service_reminder: {
    name: 'service_due_notice_cta',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  amc_renewal: {
    name: 'amc_expiry_notice',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      String(endDate || '').trim() || 'soon',
    ],
  },
  /** Prefer this name — Meta reclassified amc_renewal as MARKETING. */
  amc_expiry_notice: {
    name: 'amc_expiry_notice',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      String(endDate || '').trim() || 'soon',
    ],
  },
  /** {{1}}=name, {{2}}=doc label e.g. "AMC agreement" / "tax invoice" / "service bill" */
  document_ready: {
    name: 'document_ready_cta',
    language: 'en',
    bodyParams: (customerName: string, documentLabel: string) => [
      cleanName(customerName),
      String(documentLabel || 'document').trim() || 'document',
    ],
  },
  quotation_ready: {
    name: 'quotation_ready',
    language: 'en',
    /** {{1}}=name, {{2}}=ref */
    bodyParams: (customerName: string, ref: string) => [
      cleanName(customerName),
      String(ref || '').trim() || 'quotation',
    ],
  },
  service_bill_ready: {
    name: 'service_bill_ready',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  invoice_ready: {
    name: 'invoice_ready',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  amc_document_ready: {
    name: 'amc_document_ready',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  warranty_ready: {
    name: 'warranty_ready',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  receipt_ready: {
    name: 'receipt_ready',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  /** Prefer this name — Meta reclassified customer_followup_cta as MARKETING. */
  customer_followup: {
    name: 'customer_update_notice_cta',
    language: 'en',
    bodyParams: (customerName: string, topic: string) => [
      cleanName(customerName),
      String(topic || 'your request').trim() || 'your request',
    ],
  },
  appointment_reminder: {
    name: 'appointment_reminder_cta',
    language: 'en',
    bodyParams: (customerName: string, whenLabel: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'soon',
    ],
  },
  payment_received: {
    name: 'payment_received',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  tech_assigned: {
    name: 'tech_assigned_cta',
    language: 'en',
    bodyParams: (customerName: string, technicianName: string) => [
      cleanName(customerName),
      String(technicianName || 'our technician').trim() || 'our technician',
    ],
  },
  /** Catch-all cold text: {{1}}=name, {{2}}=short notice — Call + Book CTAs */
  general_notice: {
    name: 'general_notice_cta',
    language: 'en',
    bodyParams: (customerName: string, notice: string) => [
      cleanName(customerName),
      String(notice || '').trim().slice(0, 120) || 'please reply on this chat',
    ],
  },
  /**
   * Most flexible Meta-accepted utility: {{1}}=name, {{2}}=details sentence.
   * Not free-form — still fixed shell text around the variables.
   */
  crm_notice: {
    name: 'crm_notice',
    language: 'en',
    bodyParams: (customerName: string, details: string) => [
      cleanName(customerName),
      String(details || '').trim().slice(0, 200) || 'Please reply on this chat for details.',
    ],
  },
  /** {{1}}=name, {{2}}=topic, {{3}}=detail */
  crm_update_details: {
    name: 'crm_update_details',
    language: 'en',
    bodyParams: (customerName: string, topic: string, details: string) => [
      cleanName(customerName),
      String(topic || '').trim().slice(0, 60) || 'your account',
      String(details || '').trim().slice(0, 160) || 'Please reply on this chat.',
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
  pending_payment: 'Pending payment (Call + Book)',
  service_reminder: 'Service due (Call + Book)',
  amc_renewal: 'AMC expiry notice',
  amc_expiry_notice: 'AMC expiry notice',
  document_ready: 'Document ready (Call + Book)',
  quotation_ready: 'Quotation ready',
  service_bill_ready: 'Service bill ready',
  invoice_ready: 'Tax invoice ready',
  amc_document_ready: 'AMC PDF ready',
  warranty_ready: 'Warranty card ready',
  receipt_ready: 'Receipt ready',
  customer_followup: 'Follow-up (Call + Book)',
  appointment_reminder: 'Appointment reminder (Call + Book)',
  payment_received: 'Payment received',
  tech_assigned: 'Technician assigned (Call + Book)',
  general_notice: 'General notice (Call + Book)',
  crm_notice: 'CRM notice (flexible)',
  crm_update_details: 'CRM update (topic + detail)',
};
