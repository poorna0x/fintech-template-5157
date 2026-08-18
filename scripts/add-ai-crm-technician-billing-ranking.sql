-- Optimized technician billing aggregate for the bounded CRM AI assistant.
-- Mirrors ai_crm_top_customers and analytics dashboard billing rules.
-- Safe to re-run. Service-role only — not exposed to anon/authenticated clients.

CREATE INDEX IF NOT EXISTS idx_jobs_completed_technician_billing
  ON public.jobs (assigned_technician_id)
  INCLUDE (payment_amount, actual_cost, completed_at, end_time)
  WHERE status = 'COMPLETED' AND assigned_technician_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ai_crm_top_technicians(
  p_limit integer DEFAULT 10,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  technician_id uuid,
  employee_id text,
  technician_name text,
  billed_total numeric,
  completed_jobs bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH grouped AS (
    SELECT
      j.assigned_technician_id AS technician_id,
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
      COUNT(*)::bigint AS completed_jobs
    FROM public.jobs j
    WHERE j.status = 'COMPLETED'
      AND j.assigned_technician_id IS NOT NULL
      AND (p_from IS NULL OR COALESCE(j.completed_at, j.end_time, j.created_at) >= p_from)
      AND (p_to IS NULL OR COALESCE(j.completed_at, j.end_time, j.created_at) < p_to)
    GROUP BY j.assigned_technician_id
  )
  SELECT
    g.technician_id,
    t.employee_id::text,
    COALESCE(NULLIF(BTRIM(t.full_name), ''), 'Technician')::text AS technician_name,
    g.billed_total,
    g.completed_jobs
  FROM grouped g
  JOIN public.technicians t ON t.id = g.technician_id
  ORDER BY g.billed_total DESC, g.completed_jobs DESC, g.technician_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.ai_crm_top_technicians(integer, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_crm_top_technicians(integer, timestamptz, timestamptz)
  TO service_role;
