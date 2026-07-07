-- Fix analytics lead source breakdown: resolve from requirements JSON when column is empty,
-- align norm keys with the admin UI, and re-backfill jobs.lead_source.
-- Run once in Supabase SQL editor (after add-job-lead-source-column.sql).
--
-- Also fixes legacy requirements stored as jsonb strings (JSON.stringify from the app).

-- 0) Parse string-encoded requirements + extract lead_source (matches client parseJobRequirements)
CREATE OR REPLACE FUNCTION public.normalize_job_requirements_jsonb(p_requirements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  req jsonb;
  raw_text text;
  i int;
BEGIN
  IF p_requirements IS NULL THEN
    RETURN NULL;
  END IF;

  req := p_requirements;
  FOR i IN 1..2 LOOP
    IF jsonb_typeof(req) <> 'string' THEN
      EXIT;
    END IF;
    raw_text := req #>> '{}';
    IF raw_text IS NULL OR btrim(raw_text) = '' THEN
      RETURN NULL;
    END IF;
    BEGIN
      req := raw_text::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END LOOP;

  RETURN req;
END;
$$;

CREATE OR REPLACE FUNCTION public.extract_job_lead_source(p_requirements jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  req jsonb;
  elem jsonb;
  ls text;
  lsc text;
BEGIN
  req := public.normalize_job_requirements_jsonb(p_requirements);
  IF req IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(req) = 'object' AND req ? 'lead_source' THEN
    ls := NULLIF(trim(req->>'lead_source'), '');
    IF ls IS NOT NULL AND lower(ls) = 'other' AND (req ? 'lead_source_custom') THEN
      lsc := NULLIF(trim(req->>'lead_source_custom'), '');
      IF lsc IS NOT NULL THEN
        RETURN lsc;
      END IF;
    END IF;
    RETURN ls;
  END IF;

  IF jsonb_typeof(req) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(req) AS t(value)
    LOOP
      IF jsonb_typeof(elem) = 'object' AND elem ? 'lead_source' THEN
        ls := NULLIF(trim(elem->>'lead_source'), '');
        IF ls IS NOT NULL AND lower(ls) = 'other' AND (elem ? 'lead_source_custom') THEN
          lsc := NULLIF(trim(elem->>'lead_source_custom'), '');
          IF lsc IS NOT NULL THEN
            RETURN lsc;
          END IF;
        END IF;
        IF ls IS NOT NULL THEN
          RETURN ls;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

-- 0b) Repair string-encoded requirements → native jsonb (fires lead_source sync trigger)
UPDATE public.jobs j
SET requirements = public.normalize_job_requirements_jsonb(j.requirements)
WHERE jsonb_typeof(j.requirements) = 'string'
  AND public.normalize_job_requirements_jsonb(j.requirements) IS NOT NULL
  AND jsonb_typeof(public.normalize_job_requirements_jsonb(j.requirements)) IN ('array', 'object');

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

-- 2) Resolve lead source: requirements win over empty/default column (matches admin UI)
CREATE OR REPLACE FUNCTION public.analytics_resolve_lead_source(
  p_lead_source text,
  p_assigned_by uuid,
  p_requirements jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH from_requirements AS (
    SELECT nullif(btrim(public.extract_job_lead_source(p_requirements)), '') AS label
  ),
  from_column AS (
    SELECT nullif(btrim(p_lead_source), '') AS label
  )
  SELECT coalesce(
    CASE
      WHEN (SELECT label FROM from_column) IS NULL THEN (SELECT label FROM from_requirements)
      WHEN lower((SELECT label FROM from_column)) = 'direct call'
        AND (SELECT label FROM from_requirements) IS NOT NULL
        AND lower((SELECT label FROM from_requirements)) <> 'direct call'
        THEN (SELECT label FROM from_requirements)
      WHEN lower((SELECT label FROM from_column)) = 'other'
        AND (SELECT label FROM from_requirements) IS NOT NULL
        AND lower((SELECT label FROM from_requirements)) <> 'other'
        THEN (SELECT label FROM from_requirements)
      ELSE (SELECT label FROM from_column)
    END,
    (SELECT label FROM from_requirements),
    CASE WHEN p_assigned_by IS NOT NULL THEN 'Admin Created' ELSE 'Direct call' END
  );
$$;

-- 3) Backfill denormalized column for reporting (fix empty AND stale values)
UPDATE public.jobs j
SET lead_source = public.extract_job_lead_source(j.requirements)
WHERE nullif(btrim(public.extract_job_lead_source(j.requirements)), '') IS NOT NULL
  AND (
    j.lead_source IS NULL
    OR btrim(j.lead_source) = ''
    OR btrim(j.lead_source) IS DISTINCT FROM btrim(public.extract_job_lead_source(j.requirements))
  );

-- 4) Re-deploy dashboard + trend RPCs in the same session (or right after):
--    scripts/add-analytics-dashboard-rpc.sql
--    scripts/add-analytics-trend-dashboard-rpc.sql
--
-- 5) Verify (expect Website (HydrogenRO), not Admin Created):
--    SELECT job_number,
--           lead_source,
--           public.extract_job_lead_source(requirements) AS from_req,
--           public.analytics_resolve_lead_source(lead_source, assigned_by, requirements) AS resolved
--    FROM public.jobs
--    WHERE job_number = 'RO-2026-791414';

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
