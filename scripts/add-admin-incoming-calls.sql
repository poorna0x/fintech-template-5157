-- Shared "incoming call" board so a call received on ONE admin phone is
-- searchable on EVERY admin page/device for 3 minutes. The phone that rings
-- publishes the number (via the admin-incoming-call-publish Netlify function,
-- service role); all admins read the latest row on open + via realtime.
--
-- Egress: one tiny insert per incoming call, one slim SELECT per admin app
-- open, tiny realtime messages. RLS: admins read only; no client writes.
-- Run once in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.admin_incoming_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_incoming_calls_created_at_idx
  ON public.admin_incoming_calls (created_at DESC);

ALTER TABLE public.admin_incoming_calls ENABLE ROW LEVEL SECURITY;

-- Admins read; no INSERT/UPDATE/DELETE for authenticated (service role only).
DROP POLICY IF EXISTS admin_incoming_calls_admin_select ON public.admin_incoming_calls;
CREATE POLICY admin_incoming_calls_admin_select
  ON public.admin_incoming_calls FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON TABLE public.admin_incoming_calls FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_incoming_calls FROM authenticated;
GRANT SELECT ON TABLE public.admin_incoming_calls TO authenticated;

-- Realtime: let admin pages receive INSERTs live (hybrid live-update).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_incoming_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_incoming_calls;
  END IF;
END
$$;
