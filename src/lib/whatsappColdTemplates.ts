/**
 * Meta WhatsApp UTILITY template names for cold outreach (outside 24h window).
 * Approved on WABA: svc_doc_pdf_v2 (+ per-doc svc_doc_*_{ero|hro}_v2 when submitted).
 *
 * Cold PDF: DOCUMENT-header templates — prefer svc_doc_{bill|invoice|…}_{ero|hro}_v2;
 * fallback svc_doc_pdf_v2 (generic).
 *
 * After the customer replies (24h opens), the booking bot continues with the same
 * interactive UI as in-session. Do not use svc_booking_menu (Meta → MARKETING).
 * Use existing_service_schedule_*_cta or svc_visit_reminder / svc_smoke_update.
 */
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import { formatDocumentPdfColdPreview } from '@/lib/document-pdf-whatsapp-caption';
export const WA_COLD = {
  /** @deprecated Meta marked svc_booking_menu MARKETING — use resolveBookingCta() instead. */
  booking_menu: {
    name: 'svc_smoke_update',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
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
  /** Service due CTA — Call + Website + Book (brand-specific). */
  service_due_cta: {
    name: 'svc_service_due_hro_cta',
    language: 'en',
    bodyParams: (customerName: string, whenLabel?: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your upcoming service visit',
    ],
  },
  amc_renewal: {
    name: 'svc_amc_expiry_notice',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      String(endDate || '').trim() || 'soon',
    ],
  },
  /** Prefer this name — Meta reclassified amc_renewal as MARKETING. Falls back server-side to svc_visit_reminder / svc_smoke_update until approved. */
  amc_expiry_notice: {
    name: 'svc_amc_expiry_notice',
    language: 'en',
    bodyParams: (customerName: string, endDate: string) => [
      cleanName(customerName),
      String(endDate || '').trim() || 'soon',
    ],
  },
  /** {{1}}=name, {{2}}=doc label — DOCUMENT header carries the PDF (Meta name: svc_doc_pdf_v2) */
  document_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string, documentLabel: string) => [
      cleanName(customerName),
      String(documentLabel || 'document').trim() || 'document',
    ],
  },
  quotation_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string, ref: string) => [
      cleanName(customerName),
      `quotation ${String(ref || '').trim() || ''}`.trim() || 'quotation',
    ],
  },
  service_bill_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string, _amount?: number | string) => [
      cleanName(customerName),
      'service bill',
    ],
  },
  invoice_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string, _amount?: number | string) => [
      cleanName(customerName),
      'tax invoice',
    ],
  },
  amc_document_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'AMC agreement'],
  },
  warranty_ready: {
    name: 'svc_doc_pdf_v2',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName), 'warranty card'],
  },
  receipt_ready: {
    name: 'svc_doc_pdf_v2',
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
  /** Job completion cold open — {{1}}=name, {{2}}=amount collected (Meta: svc_job_done) */
  job_completion: {
    name: 'svc_job_done',
    language: 'en',
    bodyParams: (customerName: string, amount: number | string) => [
      cleanName(customerName),
      cleanAmount(amount),
    ],
  },
  /** Missed customer call — phone-only UTILITY (no CTA buttons). */
  missed_call: {
    name: 'svc_missed_call',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  /** Catch-all cold text — uses svc_smoke_update (1 param) when notice is long-form unavailable */
  general_notice: {
    name: 'svc_smoke_update',
    language: 'en',
    bodyParams: (customerName: string, _notice?: string) => [cleanName(customerName)],
  },
  /** Simple hello / reopen chat (1 param). Falls back to svc_smoke_update until approved. */
  hello: {
    name: 'svc_hello',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  wfs_hello: {
    name: 'svc_wfs_hello_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  wfs_just_hi: {
    name: 'svc_wfs_just_hi_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  wfs_hi_from: {
    name: 'svc_wfs_hi_from_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  wfs_collect: {
    name: 'svc_wfs_collect_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  ask_location: {
    name: 'svc_wfs_ask_loc_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  ask_location_simple: {
    name: 'svc_wfs_ask_loc_simple_hro',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  ask_photo: {
    name: 'svc_ask_photo',
    language: 'en',
    bodyParams: (customerName: string, fromLabel: string) => [
      cleanName(customerName),
      String(fromLabel || '').trim() || 'Water Filter Service',
    ],
  },
  ask_flat: {
    name: 'svc_ask_flat',
    language: 'en',
    bodyParams: (customerName: string, fromLabel: string) => [
      cleanName(customerName),
      String(fromLabel || '').trim() || 'Water Filter Service',
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
  // —— Booking flows: use resolveBookingCta(kind, brand) at send time (UTILITY *_cta templates) ——
  book_existing_customer: {
    name: 'existing_service_schedule_ero_cta',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  book_new_customer: {
    /** Use resolveBookingCta('book_new_customer', brand, name) at send time. */
    name: 'unregistered_number_service_ero_cta',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName) || 'there'],
  },
  /** Prefer WA_COLD.missed_call (svc_missed_call). CTA variant when *_callback_*_cta is APPROVED. */
  missed_call_book: {
    name: 'svc_missed_call',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  reschedule_visit: {
    /** Use resolveBookingCta('reschedule_visit', brand, name, when) at send time. */
    name: 'reschedule_visit_ero_cta',
    language: 'en',
    bodyParams: (customerName: string, whenLabel: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  },
  visit_cancelled: {
    /** Brand-specific: svc_visit_cancelled_{ero|hro} — use resolveColdVisitCancelled(). */
    name: 'svc_visit_cancelled_ero',
    language: 'en',
    bodyParams: (customerName: string, whenLabel: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  },
  parts_ready: {
    name: 'svc_parts_ready',
    language: 'en',
    bodyParams: (customerName: string) => [cleanName(customerName)],
  },
  tech_delayed: {
    name: 'svc_tech_delayed',
    language: 'en',
    bodyParams: (customerName: string, whenLabel?: string) => [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  },
  booking_confirmed: {
    /** Use resolveBookingCta('booking_confirmed', brand, name, ref, when) at send time. */
    name: 'svc_booking_confirmed_ero',
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
  | 'warranty_document'
  | 'receipt'
  | 'generic';

export type WaColdDocSlug =
  | 'bill'
  | 'invoice'
  | 'amc'
  | 'quotation'
  | 'warranty'
  | 'receipt'
  | 'generic';

/** CRM doc kind → Meta template slug (svc_doc_{slug}_{ero|hro}_v2). */
export function coldDocTemplateSlug(kind: WaColdDocKind | string): WaColdDocSlug {
  const k = String(kind || 'generic').toLowerCase();
  if (k === 'service_bill') return 'bill';
  if (k === 'invoice' || k === 'tax_invoice') return 'invoice';
  if (k === 'amc' || k === 'amc_document') return 'amc';
  if (k === 'quotation') return 'quotation';
  if (k === 'warranty' || k === 'warranty_document') return 'warranty';
  if (k === 'receipt') return 'receipt';
  return 'generic';
}

export function resolveColdDocTemplateName(
  kind: WaColdDocKind | string,
  brand?: DocumentBrand | string | null
): string {
  const suffix = normalizeDocumentBrand(brand) === 'elevenro' ? 'ero' : 'hro';
  const slug = coldDocTemplateSlug(kind);
  return `svc_doc_${slug}_${suffix}_v2`;
}

/** Map CRM document kind → Meta cold PDF template (brand-aware v2). */
export function coldDocTemplateForKind(
  kind: WaColdDocKind | string,
  brand?: DocumentBrand | string | null
): {
  name: string;
  language: string;
} {
  return {
    name: resolveColdDocTemplateName(kind, brand),
    language: 'en',
  };
}

export function coldDocBodyParams(
  kind: WaColdDocKind | string,
  opts: { customerName: string; amount?: number | string; ref?: string; documentLabel?: string }
): string[] {
  return [cleanName(opts.customerName)];
}

/** Preview cold PDF template body (matches Meta svc_doc_*_{ero|hro}_v2). */
export function formatColdDocTemplatePreview(
  kind: WaColdDocKind | string,
  opts: {
    customerName: string;
    brand?: DocumentBrand | string | null;
    amount?: number | string;
    ref?: string;
    documentLabel?: string;
  }
): string {
  const brand = normalizeDocumentBrand(opts.brand) || 'hydrogenro';
  return formatDocumentPdfColdPreview(kind, brand, opts.customerName);
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
  booking_menu: 'Service request (svc_smoke_update — booking menu deprecated)',
  pending_payment: 'Balance due (svc_balance_due_letter_*_v4 Pay now → v3 → v2 → svc_balance_due)',
  service_reminder: 'Visit reminder (svc_visit_reminder)',
  service_due_cta: 'Service due letter / CTA (svc_service_due_letter_*_v2 → v1 → *_cta)',
  amc_renewal: 'AMC expiry (svc_amc_expiry_notice)',
  amc_expiry_notice: 'AMC expiry → document PDF',
  document_ready: 'Document PDF (svc_doc_generic_*_v2 → svc_doc_pdf_v2)',
  quotation_ready: 'Quotation PDF (svc_doc_quotation_*_v2)',
  service_bill_ready: 'Service bill PDF (svc_doc_bill_*_v2)',
  invoice_ready: 'Tax invoice PDF (svc_doc_invoice_*_v2)',
  amc_document_ready: 'AMC PDF (svc_doc_amc_*_v2)',
  warranty_ready: 'Warranty PDF (svc_doc_warranty_*_v2)',
  receipt_ready: 'Receipt PDF (svc_doc_receipt_*_v2)',
  customer_followup: 'Follow-up → visit reminder',
  appointment_reminder: 'Appointment reminder (svc_visit_reminder)',
  payment_received: 'Payment received (svc_payment_received)',
  tech_assigned: 'Technician assigned (svc_tech_assigned)',
  job_completion: 'Service completed (svc_job_done_letter_*_v2 → v1 → v3/v2 / svc_job_done)',
  general_notice: 'General notice (svc_smoke_update)',
  hello: 'Hello (svc_wfs_hello_* → svc_hello)',
  wfs_hello: 'WFS Hi (svc_wfs_hello_{hro|ero|generic})',
  wfs_just_hi: 'Just Hi (svc_wfs_just_hi_{hro|ero|generic})',
  wfs_hi_from: 'Hi from WFS (svc_wfs_hi_from_{hro|ero|generic})',
  wfs_simple_hi: 'Simple WFS Hi (svc_wfs_hi_{hro|ero|generic})',
  wfs_collect: 'WFS collect info (svc_wfs_collect_* → location + photo flow)',
  ask_location: 'Ask location (svc_wfs_ask_loc_* → Call us + Text us)',
  ask_location_simple: 'Ask location short (svc_wfs_ask_loc_simple_* → Call us + Text us)',
  ask_photo: 'Ask photo (svc_ask_photo)',
  ask_flat: 'Ask flat (svc_ask_flat)',
  crm_notice: 'CRM notice → visit reminder',
  crm_update_details: 'CRM update → visit reminder',
  book_existing_customer: 'Schedule visit (existing_service_schedule_*_cta_v2 → v1)',
  book_new_customer: 'Unregistered number (unregistered_number_service_*_cta)',
  missed_call: 'Missed call (svc_missed_call)',
  missed_call_book: 'Missed call (svc_missed_call / missed_call_callback_*_cta)',
  reschedule_visit: 'Reschedule (reschedule_visit_*_cta)',
  visit_cancelled: 'Visit cancelled (svc_booking_cancelled_letter_*_v2 → v1 → v2 → svc_visit_cancelled_*)',
  parts_ready: 'Parts ready (svc_parts_ready)',
  tech_delayed: 'Tech delayed (svc_tech_delayed)',
  booking_confirmed: 'Booking confirmed (svc_booking_confirmed_letter_*_v2 → v1 → v2 / svc_visit_confirmed)',
};
