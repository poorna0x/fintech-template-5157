-- Family office-status PWA: hashed capability URL per technician.
-- Token plaintext is NEVER stored — only SHA-256 hex.
-- Public traffic goes through Netlify (service_role); this table is not for anon/PostgREST.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.technician_office_status_links (
  technician_id uuid PRIMARY KEY REFERENCES public.technicians(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  CONSTRAINT technician_office_status_links_token_hash_format
    CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS technician_office_status_links_token_hash_uidx
  ON public.technician_office_status_links (token_hash);

COMMENT ON TABLE public.technician_office_status_links IS
  'Hashed family PWA tokens. enabled is a server kill switch; disable keeps the hash so re-enable restores the same bookmark. Access is service_role / Netlify only.';

ALTER TABLE public.technician_office_status_links ENABLE ROW LEVEL SECURITY;

-- No PostgREST policies: even admins go through tech-office-status-mint (service_role).
DROP POLICY IF EXISTS technician_office_status_links_admin_select
  ON public.technician_office_status_links;

REVOKE ALL ON TABLE public.technician_office_status_links FROM PUBLIC;
REVOKE ALL ON TABLE public.technician_office_status_links FROM anon;
REVOKE ALL ON TABLE public.technician_office_status_links FROM authenticated;
GRANT ALL ON TABLE public.technician_office_status_links TO service_role;
