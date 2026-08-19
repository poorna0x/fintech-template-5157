-- Document Accept invites (preview PDF → /c/{token} → original PDF on WhatsApp).
-- Token plaintext is NEVER stored — only SHA-256 hex of the opaque token.
-- Original PDF bytes live briefly on private R2 (r2_object_key); deleted after accept or expiry.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.document_accept_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'failed')),
  brand text NOT NULL DEFAULT 'hydrogenro'
    CHECK (brand IN ('hydrogenro', 'elevenro')),
  doc_type text NOT NULL
    CHECK (doc_type IN ('service_bill', 'quotation', 'invoice', 'warranty', 'amc', 'generic')),
  document_label text NOT NULL DEFAULT 'document',
  document_ref text,
  source_key text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  phone_e164 text NOT NULL,
  amount_display text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_filename text,
  original_sha256_hex text,
  original_verify_code text,
  original_byte_length integer,
  r2_object_key text,
  preview_wa_message_id text,
  original_wa_message_id text,
  confirmation_id text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_ua text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_accept_invites_token_hash_format
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT document_accept_invites_sha256_format
    CHECK (original_sha256_hex IS NULL OR original_sha256_hex ~ '^[a-f0-9]{64}$'),
  CONSTRAINT document_accept_invites_verify_code_format
    CHECK (original_verify_code IS NULL OR original_verify_code ~ '^[A-Z0-9]{8}$'),
  CONSTRAINT document_accept_invites_phone_nonempty
    CHECK (length(trim(phone_e164)) >= 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_accept_invites_token_hash_uidx
  ON public.document_accept_invites (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS document_accept_invites_confirmation_id_uidx
  ON public.document_accept_invites (confirmation_id)
  WHERE confirmation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_accept_invites_phone_created_idx
  ON public.document_accept_invites (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS document_accept_invites_status_expires_idx
  ON public.document_accept_invites (status, expires_at);

CREATE INDEX IF NOT EXISTS document_accept_invites_customer_idx
  ON public.document_accept_invites (customer_id)
  WHERE customer_id IS NOT NULL;

COMMENT ON TABLE public.document_accept_invites IS
  'WhatsApp document Accept flow: opaque token hash, audit, short-lived R2 original PDF key.';

ALTER TABLE public.document_accept_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_accept_invites_admin_select ON public.document_accept_invites;
CREATE POLICY document_accept_invites_admin_select
  ON public.document_accept_invites
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- No INSERT/UPDATE/DELETE for authenticated — service_role (Netlify) only.
REVOKE ALL ON TABLE public.document_accept_invites FROM PUBLIC;
REVOKE ALL ON TABLE public.document_accept_invites FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_accept_invites FROM authenticated;
GRANT SELECT ON TABLE public.document_accept_invites TO authenticated;
GRANT ALL ON TABLE public.document_accept_invites TO service_role;
