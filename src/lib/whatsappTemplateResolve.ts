/**
 * Map CRM logical template names → Meta-approved UTILITY names on the WABA.
 * Keep in sync with netlify/functions/whatsapp-template-resolve.js
 */
const WA_TEMPLATE_ALIASES: Record<string, string> = {
  // Approved renames
  svc_document_pdf: 'svc_doc_pdf_v2',
  svc_completed: 'svc_job_done',
  // Meta MARKETING → UTILITY replacements (never send old names)
  svc_booking_menu: 'svc_smoke_update',
  booking_menu: 'svc_smoke_update',
  service_reminder_cta: 'svc_visit_reminder',
  service_due_notice_cta: 'svc_visit_reminder',
  customer_followup_cta: 'svc_visit_reminder',
  customer_update_notice_cta: 'svc_visit_reminder',
  amc_renewal: 'svc_amc_expiry_notice',
  quotation_ready: 'svc_doc_pdf_v2',
  service_bill_ready: 'svc_doc_pdf_v2',
  invoice_ready: 'svc_doc_pdf_v2',
  receipt_ready: 'svc_doc_pdf_v2',
  document_ready: 'svc_doc_pdf_v2',
  amc_document_ready: 'svc_doc_pdf_v2',
  warranty_ready: 'svc_doc_pdf_v2',
  general_notice: 'svc_smoke_update',
  crm_notice: 'svc_visit_reminder',
  pending_payment: 'svc_balance_due_letter_hro_v9',
  pending_payment_hro: 'svc_balance_due_letter_hro_v9',
  pending_payment_ero: 'svc_balance_due_letter_ero_v9',
  // Old booking CTA names → UTILITY replacements
  book_existing_customer_cta: 'existing_service_schedule_ero_cta_v3',
  book_existing_customer_ero_cta: 'existing_service_schedule_ero_cta_v3',
  book_existing_customer_hro_cta: 'existing_service_schedule_hro_cta_v3',
  book_new_customer_cta: 'unregistered_number_service_ero_cta_v2',
  book_new_customer_ero_cta: 'unregistered_number_service_ero_cta_v2',
  book_new_customer_hro_cta: 'unregistered_number_service_hro_cta_v2',
  new_customer_service_setup_ero_cta: 'unregistered_number_service_ero_cta_v2',
  new_customer_service_setup_hro_cta: 'unregistered_number_service_hro_cta_v2',
  missed_call_book_cta: 'missed_call_callback_hro_cta_v5',
  missed_call_book_ero_cta: 'missed_call_callback_ero_cta_v5',
  missed_call_book_hro_cta: 'missed_call_callback_hro_cta_v5',
  missed_call_callback_ero_cta_v3: 'missed_call_callback_ero_cta_v5',
  missed_call_callback_hro_cta_v3: 'missed_call_callback_hro_cta_v5',
  svc_wfs_hello: 'svc_wfs_hello_v3',
  svc_wfs_hello_hro: 'svc_wfs_hello_hro_v2',
  svc_wfs_hello_ero: 'svc_wfs_hello_ero_v2',
  svc_wfs_just_hi: 'svc_wfs_just_hi_v3',
  svc_wfs_just_hi_hro: 'svc_wfs_just_hi_hro_v3',
  svc_wfs_just_hi_ero: 'svc_wfs_just_hi_ero_v3',
  svc_wfs_hi: 'svc_wfs_hi_hro_v2',
  svc_wfs_hi_hro: 'svc_wfs_hi_hro_v2',
  svc_wfs_hi_ero: 'svc_wfs_hi_ero_v2',
  booking_confirmed_ero_cta: 'svc_booking_confirmed_letter_ero_v4',
  booking_confirmed_hro_cta: 'svc_booking_confirmed_letter_hro_v4',
  svc_document_ready: 'svc_doc_pdf_v2',
};

/** Resolve a template name before sending to Meta Graph API. */
export function resolveWaTemplateName(name: string): string {
  const n = String(name || '').trim();
  if (!n) return n;
  return WA_TEMPLATE_ALIASES[n] || n;
}

const BLOCKED_MARKETING_TEMPLATE_NAMES = new Set([
  'svc_booking_menu',
  'booking_menu',
  'service_reminder_cta',
  'service_due_notice_cta',
  'customer_followup_cta',
  'customer_update_notice_cta',
  'amc_renewal',
  'quotation_ready',
  'service_bill_ready',
  'invoice_ready',
  'receipt_ready',
  'document_ready',
  'amc_document_ready',
  'warranty_ready',
  'general_notice',
  'book_existing_customer_cta',
  'book_existing_customer_ero_cta',
  'book_existing_customer_hro_cta',
  'book_new_customer_cta',
  'book_new_customer_ero_cta',
  'book_new_customer_hro_cta',
  'missed_call_book_cta',
  'missed_call_book_ero_cta',
  'missed_call_book_hro_cta',
  'new_customer_service_setup_ero_cta',
  'new_customer_service_setup_hro_cta',
  'missed_call_callback_ero_cta_v3',
  'missed_call_callback_hro_cta_v3',
  'svc_wfs_hello_ero',
  'svc_wfs_hello_hro',
  'svc_wfs_hello',
  'svc_wfs_hi_hro',
  'svc_wfs_hi_ero',
  'svc_wfs_hi_from_ero',
  'svc_wfs_hi',
  'svc_wfs_hi_from',
  'svc_wfs_hi_from_hro',
  'svc_wfs_hi_from_ero_v2',
  'svc_wfs_just_hi',
  'svc_wfs_just_hi_ero',
  'svc_wfs_just_hi_hro',
  'svc_wfs_ask_name_v1',
  'svc_wfs_ask_name_simple_ero_v1',
  'svc_wfs_ask_name_hro_v1',
  'svc_wfs_ask_name_ero_v1',
  'svc_wfs_ask_name_simple_hro_v1',
  'svc_wfs_ask_name_simple_v1',
]);

/** True when this name is a known legacy MARKETING-prone template id. */
export function isDeprecatedMarketingTemplateName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return false;
  const resolved = resolveWaTemplateName(n);
  return resolved !== n;
}

/** True when this name must never be sent (Meta MARKETING). */
export function isBlockedMarketingTemplateName(name: string): boolean {
  const resolved = resolveWaTemplateName(name);
  if (!resolved) return false;
  return BLOCKED_MARKETING_TEMPLATE_NAMES.has(resolved);
}

/** All aliases (for inbox / admin pickers). */
export function waTemplateAliases(): Record<string, string> {
  return { ...WA_TEMPLATE_ALIASES };
}
