-- Add Customer form draft, synced to the signed-in admin so it follows them
-- across phones (same login). One row per admin — last write wins if two
-- devices edit at once. Safe to re-run in the Supabase SQL Editor.
--
-- Do not apply schema.sql as live truth. Run this script once.

CREATE TABLE IF NOT EXISTS public.add_customer_drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT add_customer_drafts_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE public.add_customer_drafts IS
  'Unfinished Add Customer dialog snapshot per admin user. Client upserts on debounce; cleared after successful create.';

ALTER TABLE public.add_customer_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS add_customer_drafts_admin_select ON public.add_customer_drafts;
DROP POLICY IF EXISTS add_customer_drafts_admin_insert ON public.add_customer_drafts;
DROP POLICY IF EXISTS add_customer_drafts_admin_update ON public.add_customer_drafts;
DROP POLICY IF EXISTS add_customer_drafts_admin_delete ON public.add_customer_drafts;

CREATE POLICY add_customer_drafts_admin_select
  ON public.add_customer_drafts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user() AND user_id = auth.uid());

CREATE POLICY add_customer_drafts_admin_insert
  ON public.add_customer_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user() AND user_id = auth.uid());

CREATE POLICY add_customer_drafts_admin_update
  ON public.add_customer_drafts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user() AND user_id = auth.uid())
  WITH CHECK (public.is_admin_user() AND user_id = auth.uid());

CREATE POLICY add_customer_drafts_admin_delete
  ON public.add_customer_drafts
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user() AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_add_customer_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_customer_drafts_updated_at ON public.add_customer_drafts;
CREATE TRIGGER trg_add_customer_drafts_updated_at
  BEFORE UPDATE ON public.add_customer_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_add_customer_drafts_updated_at();

REVOKE ALL ON TABLE public.add_customer_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.add_customer_drafts TO authenticated;
GRANT ALL ON TABLE public.add_customer_drafts TO service_role;
