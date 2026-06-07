-- Harden document_drafts: admin-only CRUD (same pattern as tax_invoices, admin_todos).
-- Safe to re-run. Run in Supabase SQL Editor if you already applied add-document-drafts.sql
-- with the older permissive authenticated USING (true) policies.

ALTER TABLE public.document_drafts ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive policies (both naming styles).
DROP POLICY IF EXISTS "document_drafts select admin" ON public.document_drafts;
DROP POLICY IF EXISTS "document_drafts insert admin" ON public.document_drafts;
DROP POLICY IF EXISTS "document_drafts update admin" ON public.document_drafts;
DROP POLICY IF EXISTS "document_drafts delete admin" ON public.document_drafts;

DROP POLICY IF EXISTS document_drafts_admin_select ON public.document_drafts;
DROP POLICY IF EXISTS document_drafts_admin_insert ON public.document_drafts;
DROP POLICY IF EXISTS document_drafts_admin_update ON public.document_drafts;
DROP POLICY IF EXISTS document_drafts_admin_delete ON public.document_drafts;

CREATE POLICY document_drafts_admin_select
  ON public.document_drafts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY document_drafts_admin_insert
  ON public.document_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY document_drafts_admin_update
  ON public.document_drafts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY document_drafts_admin_delete
  ON public.document_drafts
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());
