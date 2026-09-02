-- Customer gallery PDFs (admin upload). Bytes live on private Cloudflare R2;
-- this table stores metadata + r2: refs only (never PDF bytes).
-- Run once in the Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  filename text NOT NULL,
  media_url text NOT NULL,
  media_mime text NOT NULL DEFAULT 'application/pdf',
  byte_size integer,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_documents_filename_len
    CHECK (char_length(filename) BETWEEN 1 AND 200),
  CONSTRAINT customer_documents_mime_pdf
    CHECK (media_mime = 'application/pdf'),
  CONSTRAINT customer_documents_media_url_r2
    CHECK (media_url LIKE 'r2:customer/docs/%')
);

CREATE INDEX IF NOT EXISTS customer_documents_customer_created_idx
  ON public.customer_documents (customer_id, created_at DESC);

COMMENT ON TABLE public.customer_documents IS
  'Admin-uploaded customer PDFs. File bytes on private R2 (r2:customer/docs/…); gallery Documents tab.';

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_documents_admin_select ON public.customer_documents;
CREATE POLICY customer_documents_admin_select
  ON public.customer_documents FOR SELECT TO authenticated
  USING (public.is_admin_user());

-- INSERT/UPDATE/DELETE via service_role only (Netlify) so R2 stays in sync.
DROP POLICY IF EXISTS customer_documents_admin_insert ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_admin_update ON public.customer_documents;
DROP POLICY IF EXISTS customer_documents_admin_delete ON public.customer_documents;

REVOKE ALL ON TABLE public.customer_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.customer_documents FROM authenticated;
GRANT SELECT ON TABLE public.customer_documents TO authenticated;
GRANT ALL ON TABLE public.customer_documents TO service_role;
