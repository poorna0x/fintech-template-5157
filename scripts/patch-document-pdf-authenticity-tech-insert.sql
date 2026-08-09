-- Allow active technicians to INSERT PDF authenticity fingerprints
-- (technician complete-job AMC download / email / WhatsApp).
-- SELECT / UPDATE / DELETE stay admin-only (verify UI).
-- Safe to re-run.

DROP POLICY IF EXISTS document_pdf_authenticity_admin_all ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_admin_select ON public.document_pdf_authenticity;
DROP POLICY IF EXISTS document_pdf_authenticity_admin_write ON public.document_pdf_authenticity;
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
