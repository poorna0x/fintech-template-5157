-- Allow letterhead PDFs in document_pdf_authenticity.doc_type.
-- Safe to re-run.

ALTER TABLE public.document_pdf_authenticity
  DROP CONSTRAINT IF EXISTS document_pdf_authenticity_doc_type_check;

ALTER TABLE public.document_pdf_authenticity
  ADD CONSTRAINT document_pdf_authenticity_doc_type_check
  CHECK (doc_type IN (
    'service_bill',
    'quotation',
    'invoice',
    'warranty',
    'amc',
    'salary_slip',
    'letterhead'
  ));
