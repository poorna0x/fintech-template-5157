-- Escalating lockout: 1st lock 15 min → 2nd 30 min → 3rd+ 60 min (per email).
-- Run in Supabase SQL Editor if you already applied add-auth-login-attempts.sql.

ALTER TABLE public.auth_login_attempts
  ADD COLUMN IF NOT EXISTS lockout_count integer NOT NULL DEFAULT 0 CHECK (lockout_count >= 0);

COMMENT ON COLUMN public.auth_login_attempts.lockout_count IS
  'Number of lockouts applied; drives 15 / 30 / 60 minute durations. Reset on successful login.';

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
    RETURN jsonb_build_object('allowed', true, 'failed_count', 0, 'lockout_count', 0);
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'locked',
      'failed_count', v_row.failed_count,
      'lockout_count', v_row.lockout_count,
      'locked_until', v_row.locked_until,
      'retry_after_seconds', ceil(extract(epoch FROM (v_row.locked_until - v_now)))::integer
    );
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until <= v_now THEN
    UPDATE public.auth_login_attempts
    SET locked_until = NULL, failed_count = 0
    WHERE email = v_email;
    RETURN jsonb_build_object(
      'allowed', true,
      'failed_count', 0,
      'lockout_count', v_row.lockout_count
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'failed_count', v_row.failed_count,
    'lockout_count', v_row.lockout_count
  );
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
  v_lockout_count integer;
  v_lock_minutes integer;
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
  RETURNING failed_count, lockout_count INTO v_count, v_lockout_count;

  IF v_count >= v_max_attempts THEN
    v_lock_minutes := CASE
      WHEN COALESCE(v_lockout_count, 0) = 0 THEN 15
      WHEN COALESCE(v_lockout_count, 0) = 1 THEN 30
      ELSE 60
    END;

    v_locked_until := now() + (v_lock_minutes || ' minutes')::interval;

    UPDATE public.auth_login_attempts
    SET
      locked_until = v_locked_until,
      lockout_count = COALESCE(lockout_count, 0) + 1
    WHERE email = v_email
    RETURNING lockout_count INTO v_lockout_count;

    RETURN jsonb_build_object(
      'ok', true,
      'failed_count', v_count,
      'locked', true,
      'locked_until', v_locked_until,
      'lockout_count', v_lockout_count,
      'lock_minutes', v_lock_minutes,
      'retry_after_seconds', v_lock_minutes * 60
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'failed_count', v_count,
    'locked', false,
    'lockout_count', COALESCE(v_lockout_count, 0),
    'remaining_attempts', greatest(0, v_max_attempts - v_count)
  );
END;
$$;
