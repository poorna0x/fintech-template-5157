-- Dashboard setting for optional iLovePDF compression of CRM document PDFs.
-- Safe to re-run. Run in Supabase before the next-month Netlify deployment.
-- Applies to quotations, bills, invoices, AMC, warranty, salary slips, etc.
-- via the interactive generate-pdf path when enabled.

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

INSERT INTO public.crm_settings (key, value)
VALUES ('quotation_pdf_ilovepdf_compress', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
