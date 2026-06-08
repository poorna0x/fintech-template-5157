-- Named running-total trackers (e.g. "Cash flow"): set a starting amount, then add/subtract.
-- Admin-only, follows the customer across devices. Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.amount_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Untitled',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amount_trackers_name_len CHECK (char_length(name) <= 100)
);

-- Newest-first list (the only query path the app uses).
CREATE INDEX IF NOT EXISTS idx_amount_trackers_created
  ON public.amount_trackers (created_at DESC);

ALTER TABLE public.amount_trackers ENABLE ROW LEVEL SECURITY;

-- Admin-only CRUD (no anon, no technician) — same pattern as document_drafts / admin_todos.
DROP POLICY IF EXISTS amount_trackers_admin_select ON public.amount_trackers;
DROP POLICY IF EXISTS amount_trackers_admin_insert ON public.amount_trackers;
DROP POLICY IF EXISTS amount_trackers_admin_update ON public.amount_trackers;
DROP POLICY IF EXISTS amount_trackers_admin_delete ON public.amount_trackers;

CREATE POLICY amount_trackers_admin_select
  ON public.amount_trackers
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY amount_trackers_admin_insert
  ON public.amount_trackers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY amount_trackers_admin_update
  ON public.amount_trackers
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY amount_trackers_admin_delete
  ON public.amount_trackers
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

-- Keep updated_at fresh on every change.
CREATE OR REPLACE FUNCTION public.touch_amount_trackers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_amount_trackers_updated_at ON public.amount_trackers;
CREATE TRIGGER trg_amount_trackers_updated_at
  BEFORE UPDATE ON public.amount_trackers
  FOR EACH ROW EXECUTE FUNCTION public.touch_amount_trackers_updated_at();

-- Atomic add/subtract so concurrent edits never lose an update (amount = amount + delta
-- in a single statement). Runs as the caller, so the admin RLS policy above still applies.
CREATE OR REPLACE FUNCTION public.adjust_amount_tracker(p_id uuid, p_delta numeric)
RETURNS public.amount_trackers
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result public.amount_trackers;
BEGIN
  UPDATE public.amount_trackers
  SET amount = amount + p_delta
  WHERE id = p_id
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Amount tracker % not found', p_id;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_amount_tracker(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_amount_tracker(uuid, numeric) TO authenticated;
