-- Additive AI assistant tables for inbox reply/quotation drafts.
-- Safe to re-run. Does NOT alter or delete existing CRM tables/data.
-- Run in Supabase SQL Editor (or via DATABASE_URL) before relying on quotas/audit.

CREATE TABLE IF NOT EXISTS public.ai_assistant_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  day_key date NOT NULL,
  provider text,
  model text,
  operation text,
  status text NOT NULL DEFAULT 'pending',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  reserved_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  prompt_hash text,
  response_hash text,
  error_category text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT ai_assistant_invocations_status_check
    CHECK (status IN ('pending', 'ok', 'error', 'quota_denied')),
  CONSTRAINT ai_assistant_invocations_tokens_nonneg
    CHECK (
      input_tokens >= 0
      AND output_tokens >= 0
      AND total_tokens >= 0
      AND reserved_tokens >= 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_assistant_invocations_idempotency
  ON public.ai_assistant_invocations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_assistant_invocations_actor_day
  ON public.ai_assistant_invocations (actor_user_id, day_key DESC);

CREATE TABLE IF NOT EXISTS public.ai_assistant_usage_buckets (
  actor_user_id uuid NOT NULL,
  day_key date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reserved_tokens integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, day_key),
  CONSTRAINT ai_assistant_usage_buckets_nonneg
    CHECK (
      request_count >= 0
      AND input_tokens >= 0
      AND output_tokens >= 0
      AND reserved_tokens >= 0
    )
);

ALTER TABLE public.ai_assistant_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_usage_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_assistant_invocations_admin_select ON public.ai_assistant_invocations;
CREATE POLICY ai_assistant_invocations_admin_select
  ON public.ai_assistant_invocations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS ai_assistant_usage_buckets_admin_select ON public.ai_assistant_usage_buckets;
CREATE POLICY ai_assistant_usage_buckets_admin_select
  ON public.ai_assistant_usage_buckets
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- No INSERT/UPDATE/DELETE policies for authenticated/anon.
REVOKE ALL ON TABLE public.ai_assistant_invocations FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_assistant_invocations FROM anon;
REVOKE ALL ON TABLE public.ai_assistant_invocations FROM authenticated;
GRANT SELECT ON TABLE public.ai_assistant_invocations TO authenticated;
GRANT ALL ON TABLE public.ai_assistant_invocations TO service_role;

REVOKE ALL ON TABLE public.ai_assistant_usage_buckets FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_assistant_usage_buckets FROM anon;
REVOKE ALL ON TABLE public.ai_assistant_usage_buckets FROM authenticated;
GRANT SELECT ON TABLE public.ai_assistant_usage_buckets TO authenticated;
GRANT ALL ON TABLE public.ai_assistant_usage_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_assistant_quota(
  p_actor_user_id uuid,
  p_day_key date,
  p_request_limit integer,
  p_token_limit integer,
  p_reserve_tokens integer DEFAULT 800,
  p_idempotency_key text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_operation text DEFAULT NULL
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  invocation_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket public.ai_assistant_usage_buckets%ROWTYPE;
  v_existing_id uuid;
  v_new_id uuid;
  v_reserve integer;
BEGIN
  IF p_actor_user_id IS NULL OR p_day_key IS NULL THEN
    RETURN QUERY SELECT false, 'invalid_actor'::text, NULL::uuid;
    RETURN;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  v_reserve := GREATEST(1, LEAST(COALESCE(p_reserve_tokens, 800), 4000));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.ai_assistant_invocations
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT true, 'idempotent'::text, v_existing_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.ai_assistant_usage_buckets AS b (
    actor_user_id, day_key, request_count, input_tokens, output_tokens, reserved_tokens, updated_at
  ) VALUES (
    p_actor_user_id, p_day_key, 0, 0, 0, 0, now()
  )
  ON CONFLICT (actor_user_id, day_key) DO UPDATE
    SET updated_at = now()
  RETURNING * INTO v_bucket;

  SELECT * INTO v_bucket
  FROM public.ai_assistant_usage_buckets
  WHERE actor_user_id = p_actor_user_id AND day_key = p_day_key
  FOR UPDATE;

  IF v_bucket.request_count >= GREATEST(1, COALESCE(p_request_limit, 80)) THEN
    RETURN QUERY SELECT false, 'daily_request_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  IF (v_bucket.input_tokens + v_bucket.output_tokens + v_bucket.reserved_tokens + v_reserve)
       > GREATEST(1000, COALESCE(p_token_limit, 200000)) THEN
    RETURN QUERY SELECT false, 'daily_token_limit'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.ai_assistant_usage_buckets
  SET
    request_count = request_count + 1,
    reserved_tokens = reserved_tokens + v_reserve,
    updated_at = now()
  WHERE actor_user_id = p_actor_user_id AND day_key = p_day_key;

  INSERT INTO public.ai_assistant_invocations (
    actor_user_id,
    day_key,
    provider,
    model,
    operation,
    status,
    reserved_tokens,
    idempotency_key
  ) VALUES (
    p_actor_user_id,
    p_day_key,
    p_provider,
    p_model,
    p_operation,
    'pending',
    v_reserve,
    NULLIF(trim(p_idempotency_key), '')
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT true, NULL::text, v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_assistant_invocation(
  p_invocation_id uuid,
  p_status text,
  p_input_tokens integer DEFAULT 0,
  p_output_tokens integer DEFAULT 0,
  p_latency_ms integer DEFAULT NULL,
  p_prompt_hash text DEFAULT NULL,
  p_response_hash text DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_reserved_tokens integer DEFAULT 0,
  p_day_key date DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ai_assistant_invocations%ROWTYPE;
  v_in integer;
  v_out integer;
  v_reserve integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  IF p_invocation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.ai_assistant_invocations
  WHERE id = p_invocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.finalized_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_in := GREATEST(0, COALESCE(p_input_tokens, 0));
  v_out := GREATEST(0, COALESCE(p_output_tokens, 0));
  v_reserve := GREATEST(0, COALESCE(NULLIF(p_reserved_tokens, 0), v_row.reserved_tokens, 0));

  UPDATE public.ai_assistant_invocations
  SET
    status = CASE
      WHEN p_status IN ('ok', 'error', 'quota_denied', 'pending') THEN p_status
      ELSE 'error'
    END,
    input_tokens = v_in,
    output_tokens = v_out,
    total_tokens = v_in + v_out,
    latency_ms = p_latency_ms,
    prompt_hash = p_prompt_hash,
    response_hash = p_response_hash,
    error_category = p_error_category,
    finalized_at = now()
  WHERE id = p_invocation_id;

  UPDATE public.ai_assistant_usage_buckets
  SET
    input_tokens = input_tokens + v_in,
    output_tokens = output_tokens + v_out,
    reserved_tokens = GREATEST(0, reserved_tokens - v_reserve),
    updated_at = now()
  WHERE actor_user_id = COALESCE(p_actor_user_id, v_row.actor_user_id)
    AND day_key = COALESCE(p_day_key, v_row.day_key);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_assistant_quota(uuid, date, integer, integer, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_assistant_quota(uuid, date, integer, integer, integer, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_ai_assistant_quota(uuid, date, integer, integer, integer, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_assistant_quota(uuid, date, integer, integer, integer, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(uuid, text, integer, integer, integer, text, text, text, integer, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(uuid, text, integer, integer, integer, text, text, text, integer, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(uuid, text, integer, integer, integer, text, text, text, integer, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_assistant_invocation(uuid, text, integer, integer, integer, text, text, text, integer, date, uuid) TO service_role;

COMMENT ON TABLE public.ai_assistant_invocations IS
  'AI inbox assistant usage metadata only (hashes, not prompts/PII).';
COMMENT ON TABLE public.ai_assistant_usage_buckets IS
  'Per-admin daily AI request/token quotas for the inbox assistant.';
