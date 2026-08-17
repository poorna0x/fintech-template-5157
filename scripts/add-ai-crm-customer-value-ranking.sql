-- Optimized, service-role-only aggregate for the bounded CRM AI assistant.
-- Safe to re-run. This does not expose arbitrary SQL to the model or browser.

CREATE INDEX IF NOT EXISTS idx_jobs_completed_customer_value
  ON public.jobs (customer_id)
  INCLUDE (payment_status, payment_amount, actual_cost)
  WHERE status = 'COMPLETED' AND customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ai_crm_top_customers(
  p_limit integer DEFAULT 10,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  customer_code text,
  customer_name text,
  phone text,
  confirmed_paid_total numeric,
  billed_total numeric,
  fully_paid_jobs bigint,
  completed_jobs bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH grouped AS (
    SELECT
      j.customer_id,
      COALESCE(
        SUM(
          CASE
            WHEN j.payment_status = 'PAID'
              THEN CASE
                WHEN COALESCE(j.payment_amount, 0) > 0 THEN j.payment_amount
                WHEN COALESCE(j.actual_cost, 0) > 0 THEN j.actual_cost
                ELSE 0
              END
            ELSE 0
          END
        ),
        0
      )::numeric AS confirmed_paid_total,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(j.payment_amount, 0) > 0 THEN j.payment_amount
            WHEN COALESCE(j.actual_cost, 0) > 0 THEN j.actual_cost
            ELSE 0
          END
        ),
        0
      )::numeric AS billed_total,
      COUNT(*) FILTER (WHERE j.payment_status = 'PAID')::bigint AS fully_paid_jobs,
      COUNT(*)::bigint AS completed_jobs
    FROM public.jobs j
    WHERE j.status = 'COMPLETED'
      AND j.customer_id IS NOT NULL
      AND (p_from IS NULL OR COALESCE(j.completed_at, j.end_time, j.created_at) >= p_from)
      AND (p_to IS NULL OR COALESCE(j.completed_at, j.end_time, j.created_at) < p_to)
    GROUP BY j.customer_id
  )
  SELECT
    c.id AS customer_id,
    c.customer_id::text AS customer_code,
    COALESCE(NULLIF(BTRIM(c.full_name), ''), 'Customer')::text AS customer_name,
    c.phone::text,
    g.confirmed_paid_total,
    g.billed_total,
    g.fully_paid_jobs,
    g.completed_jobs
  FROM grouped g
  JOIN public.customers c ON c.id = g.customer_id
  ORDER BY g.confirmed_paid_total DESC, g.billed_total DESC, c.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.ai_crm_top_customers(integer, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_crm_top_customers(integer, timestamptz, timestamptz)
  TO service_role;

