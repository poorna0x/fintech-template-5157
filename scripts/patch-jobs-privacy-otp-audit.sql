-- Patch: keep otp_entered on completed jobs for admin audit (otp_code still stripped).
-- Run in Supabase SQL Editor if you already applied scripts/secure-jobs-privacy.sql
-- with the old version that removed both otp_code and otp_entered.
-- Safe to re-run. Does NOT restore digits already wiped from old completed jobs.

CREATE OR REPLACE FUNCTION public.redact_job_requirements_workflow(p_req jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  arr jsonb;
  elem jsonb;
  out jsonb := '[]'::jsonb;
  i int;
BEGIN
  IF p_req IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_req) = 'array' THEN
    arr := p_req;
  ELSIF jsonb_typeof(p_req) = 'object' THEN
    arr := jsonb_build_array(p_req);
  ELSE
    RETURN p_req;
  END IF;

  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    elem := arr -> i;
    IF jsonb_typeof(elem) = 'object' AND (elem ->> 'require_otp')::boolean IS TRUE THEN
      elem := elem - 'otp_code';
    END IF;
    out := out || jsonb_build_array(elem);
  END LOOP;

  RETURN out;
END;
$$;
