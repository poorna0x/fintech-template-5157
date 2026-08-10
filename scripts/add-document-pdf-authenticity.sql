-- Document PDF authenticity fingerprints (SHA-256 only — no PDF bytes).
-- Covers service bill / quotation / tax invoice / warranty. AMC stays on amc_pdf_authenticity.
-- Admin-only via is_admin_user(). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.document_pdf_authenticity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL
    CHECK (doc_type IN ('service_bill', 'quotation', 'invoice', 'warranty', 'amc')),
  source_key text NOT NULL,
  verify_code text NOT NULL,
  sha256_hex text NOT NULL,
  pdf_filename text,
  pdf_byte_length integer,
  generated_on date NOT NULL DEFAULT (timezone('Asia/Kolkata', now()))::date,
  document_ref text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_pdf_authenticity_verify_code_format
    CHECK (verify_code ~ '^[A-Z0-9]{8}$'),
  CONSTRAINT document_pdf_authenticity_sha256_format
    CHECK (sha256_hex ~ '^[a-f0-9]{64}$'),
  CONSTRAINT document_pdf_authenticity_source_key_nonempty
    CHECK (length(trim(source_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_pdf_authenticity_verify_code_uidx
  ON public.document_pdf_authenticity (verify_code);

CREATE INDEX IF NOT EXISTS document_pdf_authenticity_sha256_hex_idx
  ON public.document_pdf_authenticity (sha256_hex);

CREATE INDEX IF NOT EXISTS document_pdf_authenticity_document_ref_idx
  ON public.document_pdf_authenticity (document_ref);

CREATE INDEX IF NOT EXISTS document_pdf_authenticity_doc_source_idx
  ON public.document_pdf_authenticity (doc_type, source_key);

ALTER TABLE public.document_pdf_authenticity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_pdf_authenticity_admin_all ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_admin_select ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_insert_staff ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_admin_update ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_admin_delete ON public.document_pdf_authenticity;

CREATE POLICY document_pdf_authenticity_admin_select
  ON public.document_pdf_authenticity
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY document_pdf_authenticity_insert_staff
  ON public.document_pdf_authenticity
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user() OR public.is_active_technician());

CREATE POLICY document_pdf_authenticity_admin_update
  ON public.document_pdf_authenticity
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY document_pdf_authenticity_admin_delete
  ON public.document_pdf_authenticity
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.document_pdf_authenticity FROM PUBLIC;
REVOKE ALL ON public.document_pdf_authenticity FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pdf_authenticity TO authenticated;
GRANT ALL ON public.document_pdf_authenticity TO service_role;

COMMENT ON TABLE public.document_pdf_authenticity IS
  'SHA-256 fingerprints of customer-facing PDFs (bill/quotation/invoice/warranty); hash + verify code only.';
