-- Realtime assign/unassign for technicians after jobs RLS (technicians lose SELECT on
-- unassigned rows, so postgres_changes on `jobs` alone no longer delivers unassign events).
--
-- Run once in Supabase SQL Editor after secure-jobs-rls.sql.
-- Then: Database → Replication → ensure `technician_job_sync` is in supabase_realtime publication
--       (this script attempts ADD TABLE; ignore error if already added).

CREATE TABLE IF NOT EXISTS public.technician_job_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technician_job_sync_technician_created
  ON public.technician_job_sync (technician_id, created_at DESC);

COMMENT ON TABLE public.technician_job_sync IS
  'Ephemeral pings so technicians receive Realtime on assign/unassign despite jobs RLS.';

-- Collect assigned technician + team_members UUIDs from a job row.
CREATE OR REPLACE FUNCTION public.job_affected_technician_ids(
  p_assigned uuid,
  p_team jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ids uuid[] := ARRAY[]::uuid[];
  elem jsonb;
  parsed uuid;
BEGIN
  IF p_assigned IS NOT NULL THEN
    ids := array_append(ids, p_assigned);
  END IF;
  IF p_team IS NOT NULL AND jsonb_typeof(p_team) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(p_team) AS t(value) LOOP
      BEGIN
        parsed := (elem #>> '{}')::uuid;
        ids := array_append(ids, parsed);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
  RETURN ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_technician_job_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_id uuid;
  notify uuid[];
  old_ids uuid[];
  new_ids uuid[];
BEGIN
  job_id := COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    notify := public.job_affected_technician_ids(NEW.assigned_technician_id, NEW.team_members);
  ELSIF TG_OP = 'DELETE' THEN
    -- Do not INSERT sync rows on DELETE — job row is gone and job_id FK would 409 the delete.
    -- Technicians refresh via admin broadcast or poll.
    RETURN OLD;
  ELSE
    IF OLD.assigned_technician_id IS NOT DISTINCT FROM NEW.assigned_technician_id
       AND OLD.team_members IS NOT DISTINCT FROM NEW.team_members THEN
      RETURN NEW;
    END IF;
    old_ids := public.job_affected_technician_ids(OLD.assigned_technician_id, OLD.team_members);
    new_ids := public.job_affected_technician_ids(NEW.assigned_technician_id, NEW.team_members);
    notify := ARRAY(
      SELECT DISTINCT unnest(old_ids || new_ids)
    );
  END IF;

  INSERT INTO public.technician_job_sync (technician_id, job_id)
  SELECT DISTINCT u, job_id
  FROM unnest(notify) AS u
  WHERE u IS NOT NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_notify_technician_sync ON public.jobs;
CREATE TRIGGER trg_jobs_notify_technician_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_technician_job_sync();

ALTER TABLE public.technician_job_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_job_sync_select ON public.technician_job_sync;
CREATE POLICY technician_job_sync_select
  ON public.technician_job_sync
  FOR SELECT TO authenticated
  USING (technician_id = auth.uid());

REVOKE ALL ON public.technician_job_sync FROM PUBLIC;
GRANT SELECT ON public.technician_job_sync TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_job_sync;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
