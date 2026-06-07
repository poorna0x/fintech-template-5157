-- Server-side drafts for the document generators (Quotation, Tax Invoice, Bill, AMC, Letterhead).
-- Replaces the previous localStorage-only drafts so saved drafts follow the admin across devices.
-- Run once in the Supabase SQL Editor for a new project.

CREATE TABLE IF NOT EXISTS public.document_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  label text NOT NULL DEFAULT 'Untitled',
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_drafts_kind_check
    CHECK (kind IN ('quotation', 'tax_invoice', 'bill', 'amc', 'letterhead')),
  CONSTRAINT document_drafts_label_len
    CHECK (char_length(label) <= 200)
);

-- List drafts of a kind newest-first (the only query path the app uses).
CREATE INDEX IF NOT EXISTS idx_document_drafts_kind_updated
  ON public.document_drafts (kind, updated_at DESC);

ALTER TABLE public.document_drafts ENABLE ROW LEVEL SECURITY;

-- Admins operate through the authenticated role (same model as other admin tables).
DROP POLICY IF EXISTS "document_drafts select admin" ON public.document_drafts;
CREATE POLICY "document_drafts select admin"
  ON public.document_drafts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "document_drafts insert admin" ON public.document_drafts;
CREATE POLICY "document_drafts insert admin"
  ON public.document_drafts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "document_drafts update admin" ON public.document_drafts;
CREATE POLICY "document_drafts update admin"
  ON public.document_drafts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "document_drafts delete admin" ON public.document_drafts;
CREATE POLICY "document_drafts delete admin"
  ON public.document_drafts FOR DELETE TO authenticated USING (true);

-- Keep updated_at fresh on every save.
CREATE OR REPLACE FUNCTION public.touch_document_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_drafts_updated_at ON public.document_drafts;
CREATE TRIGGER trg_document_drafts_updated_at
  BEFORE UPDATE ON public.document_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_drafts_updated_at();
