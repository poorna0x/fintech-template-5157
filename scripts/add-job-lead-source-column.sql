-- Add jobs.lead_source column for analytics egress (drop requirements JSON from analytics selects).
-- Run once in Supabase SQL editor. Safe to re-run (idempotent where noted).

-- 1) Column
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lead_source text;

COMMENT ON COLUMN public.jobs.lead_source IS
  'Denormalized lead source for reporting. Synced from requirements JSON on insert/update.';

-- 2) Unwrap requirements stored as a jsonb string (legacy JSON.stringify from the app)
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

-- 3) Extract lead_source from requirements jsonb (array, object, or string-encoded JSON)
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

-- 4) Keep lead_source in sync when requirements change
CREATE OR REPLACE FUNCTION public.sync_job_lead_source_from_requirements()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.requirements IS DISTINCT FROM OLD.requirements THEN
    NEW.lead_source := public.extract_job_lead_source(NEW.requirements);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_sync_lead_source ON public.jobs;
CREATE TRIGGER trg_jobs_sync_lead_source
  BEFORE INSERT OR UPDATE OF requirements ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_lead_source_from_requirements();

-- 5) Backfill existing rows (batched-friendly single update)
UPDATE public.jobs
SET lead_source = public.extract_job_lead_source(requirements)
WHERE lead_source IS NULL
   OR trim(lead_source) = '';

-- 6) Optional index for filtered analytics (low cost)
CREATE INDEX IF NOT EXISTS idx_jobs_lead_source ON public.jobs (lead_source)
  WHERE lead_source IS NOT NULL;
