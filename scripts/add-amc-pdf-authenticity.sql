-- AMC PDF authenticity fingerprints (SHA-256 of Puppeteer PDF bytes).
-- Admin-only via is_admin_user(). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.amc_pdf_authenticity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amc_contract_id uuid NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
  verify_code text NOT NULL,
  sha256_hex text NOT NULL,
  pdf_filename text,
  pdf_byte_length integer,
  generated_on date NOT NULL,
  agreement_number text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amc_pdf_authenticity_verify_code_format
    CHECK (verify_code ~ '^[A-Z0-9]{8}$'),
  CONSTRAINT amc_pdf_authenticity_sha256_format
    CHECK (sha256_hex ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS amc_pdf_authenticity_amc_contract_id_uidx
  ON public.amc_pdf_authenticity (amc_contract_id);

CREATE UNIQUE INDEX IF NOT EXISTS amc_pdf_authenticity_verify_code_uidx
  ON public.amc_pdf_authenticity (verify_code);

CREATE INDEX IF NOT EXISTS amc_pdf_authenticity_sha256_hex_idx
  ON public.amc_pdf_authenticity (sha256_hex);

CREATE INDEX IF NOT EXISTS amc_pdf_authenticity_agreement_number_idx
  ON public.amc_pdf_authenticity (agreement_number);

-- Exact PDF bytes from Save-to-DB generation (regenerated downloads will not match SHA-256).
ALTER TABLE public.amc_pdf_authenticity
  ADD COLUMN IF NOT EXISTS pdf_base64 text;

COMMENT ON COLUMN public.amc_pdf_authenticity.pdf_base64 IS
  'Exact Puppeteer PDF (base64) fingerprinted at Save to DB; download this for verify to match.';

ALTER TABLE public.amc_pdf_authenticity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amc_pdf_authenticity_admin_all ON public.amc_pdf_authenticity;
CREATE POLICY amc_pdf_authenticity_admin_all
  ON public.amc_pdf_authenticity
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON public.amc_pdf_authenticity FROM PUBLIC;
REVOKE ALL ON public.amc_pdf_authenticity FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amc_pdf_authenticity TO authenticated;
GRANT ALL ON public.amc_pdf_authenticity TO service_role;

COMMENT ON TABLE public.amc_pdf_authenticity IS
  'SHA-256 fingerprints of AMC agreement PDFs generated at Save to DB; admin verify only.';
