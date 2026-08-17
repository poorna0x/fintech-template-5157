-- Additive: persist served provider/model after AI fallback for accurate usage stats.
-- Safe to re-run. Does NOT drop CRM data. Run in Supabase SQL Editor after add-ai-assistant.sql.

ALTER TABLE public.ai_assistant_invocations
  ADD COLUMN IF NOT EXISTS fell_back boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_assistant_invocations_day
  ON public.ai_assistant_invocations (day_key DESC);

-- Replace finalize with optional served provider/model/fell_back params.
DROP FUNCTION IF EXISTS public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid
);
DROP FUNCTION IF EXISTS public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid, text, text, boolean
);

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
  p_actor_user_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_fell_back boolean DEFAULT NULL
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
    provider = COALESCE(NULLIF(BTRIM(p_provider), ''), provider),
    model = COALESCE(NULLIF(BTRIM(p_model), ''), model),
    fell_back = COALESCE(p_fell_back, fell_back),
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

REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid, text, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid, text, text, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid, text, text, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ai_assistant_invocation(
  uuid, text, integer, integer, integer, text, text, text, integer, date, uuid, text, text, boolean
) TO service_role;
