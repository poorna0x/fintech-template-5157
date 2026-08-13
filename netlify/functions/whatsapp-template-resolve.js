/** @typedef {Record<string, string>} WaTemplateAliasMap */

/** @type {WaTemplateAliasMap} */
const WA_TEMPLATE_ALIASES = {
  svc_document_pdf: 'svc_doc_pdf_v2',
  svc_completed: 'svc_job_done',
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
  pending_payment: 'svc_balance_due_letter_hro_v6',
  pending_payment_hro: 'svc_balance_due_letter_hro_v6',
  pending_payment_ero: 'svc_balance_due_letter_ero_v6',
  book_existing_customer_cta: 'existing_service_schedule_ero_cta_v2',
  book_existing_customer_ero_cta: 'existing_service_schedule_ero_cta_v2',
  book_existing_customer_hro_cta: 'existing_service_schedule_hro_cta_v2',
  book_new_customer_cta: 'unregistered_number_service_ero_cta',
  book_new_customer_ero_cta: 'unregistered_number_service_ero_cta',
  book_new_customer_hro_cta: 'unregistered_number_service_hro_cta',
  new_customer_service_setup_ero_cta: 'unregistered_number_service_ero_cta',
  new_customer_service_setup_hro_cta: 'unregistered_number_service_hro_cta',
  missed_call_book_cta: 'svc_missed_call',
  missed_call_book_ero_cta: 'svc_missed_call',
  missed_call_book_hro_cta: 'svc_missed_call',
  booking_confirmed_ero_cta: 'svc_booking_confirmed_letter_ero_v4',
  booking_confirmed_hro_cta: 'svc_booking_confirmed_letter_hro_v4',
  svc_document_ready: 'svc_doc_pdf_v2',
};

/**
 * @param {string} name
 * @returns {string}
 */
function resolveWaTemplateName(name) {
  const n = String(name || '').trim();
  if (!n) return n;
  return WA_TEMPLATE_ALIASES[n] || n;
}

module.exports = { WA_TEMPLATE_ALIASES, resolveWaTemplateName };
