-- HOTFIX: Run in Supabase SQL Editor when anon still reads technician passwords
-- or admin_todos via todos_*_anon policies. Safe to re-run.
--
-- Root cause:
--   1. technicians: Supabase grants SELECT on whole table to anon; column REVOKE alone is not enough.
--   2. admin_todos: legacy todos_select_anon / todos_insert_anon / todos_delete_anon (USING true).

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    );
$$;

-- ---------------------------------------------------------------------------
-- technicians: anon may only read ID-card columns (RLS: ACTIVE rows only)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.technicians FROM anon;
GRANT SELECT (
  id,
  full_name,
  employee_id,
  phone,
  email,
  photo,
  status
) ON TABLE public.technicians TO anon;

REVOKE SELECT (password) ON TABLE public.technicians FROM authenticated;
REVOKE INSERT (password) ON TABLE public.technicians FROM authenticated;
REVOKE UPDATE (password) ON TABLE public.technicians FROM authenticated;

-- ---------------------------------------------------------------------------
-- admin_todos: remove wide-open legacy policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS todos_select_anon ON public.admin_todos;
DROP POLICY IF EXISTS todos_insert_anon ON public.admin_todos;
DROP POLICY IF EXISTS todos_update_anon ON public.admin_todos;
DROP POLICY IF EXISTS todos_delete_anon ON public.admin_todos;

ALTER TABLE public.admin_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_todos_admin_select ON public.admin_todos;
DROP POLICY IF EXISTS admin_todos_admin_insert ON public.admin_todos;
DROP POLICY IF EXISTS admin_todos_admin_update ON public.admin_todos;
DROP POLICY IF EXISTS admin_todos_admin_delete ON public.admin_todos;

CREATE POLICY admin_todos_admin_select
  ON public.admin_todos FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY admin_todos_admin_insert
  ON public.admin_todos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY admin_todos_admin_update
  ON public.admin_todos FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY admin_todos_admin_delete
  ON public.admin_todos FOR DELETE TO authenticated
  USING (public.is_admin_user());
