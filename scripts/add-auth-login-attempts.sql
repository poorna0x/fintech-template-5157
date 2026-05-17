-- Account lockout after repeated failed logins (used by secure-auth-login Netlify function).
-- Run in Supabase SQL Editor. Service role only — no anon/authenticated access.

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  email text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.auth_login_attempts IS
  'Failed login counters; updated only via SECURITY DEFINER RPCs (service role).';

-- 5 failures → lock 15 minutes
CREATE OR REPLACE FUNCTION public.check_auth_login_allowed(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_row public.auth_login_attempts%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_email');
  END IF;

  SELECT * INTO v_row FROM public.auth_login_attempts WHERE email = v_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'failed_count', 0);
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'locked',
      'failed_count', v_row.failed_count,
      'locked_until', v_row.locked_until,
      'retry_after_seconds', ceil(extract(epoch FROM (v_row.locked_until - v_now)))::integer
    );
  END IF;

  -- Lock expired — allow attempt (counter reset on next failure path if desired)
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= v_now THEN
    UPDATE public.auth_login_attempts
    SET locked_until = NULL, failed_count = 0
    WHERE email = v_email;
    RETURN jsonb_build_object('allowed', true, 'failed_count', 0);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'failed_count', v_row.failed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_auth_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_count integer;
  v_lock_minutes integer := 15;
  v_max_attempts integer := 5;
  v_locked_until timestamptz;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  INSERT INTO public.auth_login_attempts (email, failed_count, last_attempt_at)
  VALUES (v_email, 1, now())
  ON CONFLICT (email) DO UPDATE
  SET
    failed_count = CASE
      WHEN auth_login_attempts.locked_until IS NOT NULL
           AND auth_login_attempts.locked_until <= now()
      THEN 1
      ELSE auth_login_attempts.failed_count + 1
    END,
    locked_until = NULL,
    last_attempt_at = now()
  RETURNING failed_count INTO v_count;

  IF v_count >= v_max_attempts THEN
    v_locked_until := now() + (v_lock_minutes || ' minutes')::interval;
    UPDATE public.auth_login_attempts
    SET locked_until = v_locked_until
    WHERE email = v_email;

    RETURN jsonb_build_object(
      'ok', true,
      'failed_count', v_count,
      'locked', true,
      'locked_until', v_locked_until,
      'retry_after_seconds', v_lock_minutes * 60
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'failed_count', v_count,
    'locked', false,
    'remaining_attempts', greatest(0, v_max_attempts - v_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_auth_login_success(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;
  DELETE FROM public.auth_login_attempts WHERE email = v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_login_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_auth_login_failure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_auth_login_success(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_auth_login_allowed(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_login_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_login_success(text) TO service_role;
