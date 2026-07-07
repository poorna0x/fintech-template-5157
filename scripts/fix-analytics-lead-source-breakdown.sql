-- Fix analytics lead source breakdown: resolve from requirements JSON when column is empty,
-- align norm keys with the admin UI, and re-backfill jobs.lead_source.
-- Run once in Supabase SQL editor (after add-job-lead-source-column.sql).

-- 1) Norm key — match client/admin (alphanumeric only, no spaces/hyphens/dots)
CREATE OR REPLACE FUNCTION public.analytics_norm_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(t), '') IS NULL THEN '__unknown__'
    ELSE lower(regexp_replace(btrim(t), '[^a-zA-Z0-9]', '', 'g'))
  END;
$$;

-- 2) Resolve lead source: column → requirements JSON → assigned_by / direct call
CREATE OR REPLACE FUNCTION public.analytics_resolve_lead_source(
  p_lead_source text,
  p_assigned_by uuid,
  p_requirements jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    nullif(btrim(p_lead_source), ''),
    nullif(btrim(public.extract_job_lead_source(p_requirements)), ''),
    CASE WHEN p_assigned_by IS NOT NULL THEN 'Admin Created' ELSE 'Direct call' END
  );
$$;

-- 3) Backfill denormalized column for reporting (fix empty AND stale "Direct call")
UPDATE public.jobs
SET lead_source = public.extract_job_lead_source(requirements)
WHERE nullif(btrim(public.extract_job_lead_source(requirements)), '') IS NOT NULL
  AND (
    lead_source IS NULL
    OR btrim(lead_source) = ''
    OR (
      btrim(lead_source) = 'Direct call'
      AND btrim(public.extract_job_lead_source(requirements)) <> 'Direct call'
    )
    OR (
      lower(btrim(lead_source)) = 'other'
      AND btrim(public.extract_job_lead_source(requirements)) <> btrim(lead_source)
    )
  );

-- 4) Re-deploy dashboard RPC so lead breakdown reads requirements:
--    Run scripts/add-analytics-dashboard-rpc.sql in the same SQL session (or right after).

REVOKE ALL ON FUNCTION public.analytics_resolve_lead_source(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_resolve_lead_source(text, uuid, jsonb) TO authenticated;

-- Backward-compatible 2-arg wrapper (older RPCs still calling 2 params)
CREATE OR REPLACE FUNCTION public.analytics_resolve_lead_source(
  p_lead_source text,
  p_assigned_by uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.analytics_resolve_lead_source(p_lead_source, p_assigned_by, NULL::jsonb);
$$;

REVOKE ALL ON FUNCTION public.analytics_resolve_lead_source(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_resolve_lead_source(text, uuid) TO authenticated;
