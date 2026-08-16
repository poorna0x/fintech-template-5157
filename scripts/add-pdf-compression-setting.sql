-- Dashboard setting for optional iLovePDF compression of all interactive CRM PDFs.
-- Safe to re-run. Applies to quotations, bills, invoices, AMC, warranty,
-- salary slips, and other PDFs generated through generate-pdf.
--
-- Production credentials belong in public.app_secrets under key "ilovepdf".
-- Keep real credentials out of this committed migration and out of client env.

CREATE TABLE IF NOT EXISTS public.crm_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'true'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_settings_admin_select ON public.crm_settings;
DROP POLICY IF EXISTS crm_settings_admin_update ON public.crm_settings;
DROP POLICY IF EXISTS crm_settings_admin_insert ON public.crm_settings;

CREATE POLICY crm_settings_admin_select
  ON public.crm_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY crm_settings_admin_update
  ON public.crm_settings FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY crm_settings_admin_insert
  ON public.crm_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.crm_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_settings TO authenticated;
GRANT ALL ON TABLE public.crm_settings TO service_role;

-- Preserve the old quotation-only key when upgrading, otherwise default ON.
INSERT INTO public.crm_settings (key, value)
VALUES (
  'pdf_ilovepdf_compress',
  COALESCE(
    (SELECT value FROM public.crm_settings WHERE key = 'quotation_pdf_ilovepdf_compress'),
    'true'::jsonb
  )
)
ON CONFLICT (key) DO NOTHING;

DELETE FROM public.crm_settings
WHERE key = 'quotation_pdf_ilovepdf_compress';
