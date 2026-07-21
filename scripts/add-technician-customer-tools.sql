-- Technician customer tools: search any customer, view report, create job.
-- All access via SECURITY DEFINER RPCs guarded by "caller is an ACTIVE
-- technician" — no table RLS is loosened. Lead cost is computed server-side
-- so technicians can never see or set it.
-- Run in Supabase SQL Editor. Safe to re-run.

-- True when the JWT belongs to an ACTIVE technician row.
CREATE OR REPLACE FUNCTION public.is_active_technician()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() = 'technician'
    AND EXISTS (
      SELECT 1
      FROM public.technicians t
      WHERE t.id = auth.uid()
        AND t.account_status = 'ACTIVE'
    );
$$;

-- ---------------------------------------------------------------------------
-- 1) Customer search (slim columns only — no notes/GST/financials)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.technician_search_customers(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_digits text;
  v_result jsonb;
BEGIN
  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  IF length(v_query) < 3 THEN
    RAISE EXCEPTION 'Search query too short';
  END IF;

  -- Phone-style query: digits only, tolerate +91 / leading 0.
  v_digits := regexp_replace(v_query, '\D', '', 'g');
  IF length(v_digits) >= 12 AND v_digits LIKE '91%' THEN
    v_digits := substring(v_digits FROM 3);
  END IF;
  v_digits := regexp_replace(v_digits, '^0+', '');

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'customer_id', c.customer_id,
        'full_name', c.full_name,
        'phone', c.phone,
        'alternate_phone', c.alternate_phone,
        'address', c.address,
        'location', c.location,
        'visible_address', c.visible_address,
        'service_type', c.service_type,
        'brand', c.brand,
        'model', c.model,
        'alternate_address', c.alternate_address,
        'alternate_location', c.alternate_location,
        'alternate_visible_address', c.alternate_visible_address,
        'alternate_brand', c.alternate_brand,
        'alternate_model', c.alternate_model,
        'alternate_service_type', c.alternate_service_type
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT *
    FROM public.customers c
    WHERE
      (
        length(v_digits) >= 5
        AND (
          regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') LIKE '%' || v_digits
          OR regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g') LIKE '%' || v_digits
        )
      )
      OR c.full_name ILIKE '%' || v_query || '%'
      OR c.customer_id ILIKE v_query
    ORDER BY c.updated_at DESC
    LIMIT 15
  ) c;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.technician_search_customers(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.technician_search_customers(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.technician_search_customers(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Server-side default lead cost (mirror of getDefaultLeadCost in the app;
--    technicians never see or send this value)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_lead_cost(
  p_lead_source text,
  p_service_sub_type text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_lead_source, ''))) LIKE 'home triangle%'
      AND lower(trim(coalesce(p_service_sub_type, ''))) IN ('installation', 'reinstallation')
      THEN 116
    WHEN lower(trim(coalesce(p_lead_source, ''))) LIKE 'home triangle%' THEN 231
    WHEN lower(trim(coalesce(p_lead_source, ''))) = 'ro care india' THEN 400
    WHEN lower(trim(coalesce(p_lead_source, ''))) = 'local ramu' THEN 500
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Job creation by technician (whitelisted columns; lead_cost forced to the
--    server-side default; status derived from assignment, not trusted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.technician_create_job(p_job jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_assigned uuid;
  v_lead_source text;
  v_sub_type text;
  v_new public.jobs%ROWTYPE;
BEGIN
  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  v_customer_id := (p_job->>'customer_id')::uuid;
  IF v_customer_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  v_assigned := NULLIF(p_job->>'assigned_technician_id', '')::uuid;
  IF v_assigned IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = v_assigned) THEN
    RAISE EXCEPTION 'Assigned technician not found';
  END IF;

  -- Lead source lives inside requirements (same shape as the admin flow).
  SELECT r->>'lead_source'
  INTO v_lead_source
  FROM jsonb_array_elements(coalesce(p_job->'requirements', '[]'::jsonb)) r
  WHERE r ? 'lead_source'
  LIMIT 1;

  v_sub_type := p_job->>'service_sub_type';

  INSERT INTO public.jobs (
    job_number,
    customer_id,
    service_type,
    service_sub_type,
    brand,
    model,
    scheduled_date,
    scheduled_time_slot,
    service_address,
    service_location,
    service_site,
    status,
    priority,
    description,
    requirements,
    estimated_cost,
    lead_cost,
    payment_status,
    assigned_technician_id,
    assigned_date,
    assigned_by,
    before_photos
  )
  VALUES (
    p_job->>'job_number',
    v_customer_id,
    coalesce(p_job->>'service_type', 'RO'),
    coalesce(v_sub_type, 'Service'),
    coalesce(p_job->>'brand', ''),
    coalesce(p_job->>'model', ''),
    (p_job->>'scheduled_date')::date,
    coalesce(p_job->>'scheduled_time_slot', 'MORNING'),
    coalesce(p_job->'service_address', '{}'::jsonb),
    coalesce(p_job->'service_location', '{}'::jsonb),
    CASE WHEN p_job->>'service_site' = 'secondary' THEN 'secondary' ELSE 'primary' END,
    CASE WHEN v_assigned IS NOT NULL THEN 'ASSIGNED' ELSE 'PENDING' END,
    coalesce(p_job->>'priority', 'MEDIUM'),
    coalesce(p_job->>'description', ''),
    coalesce(p_job->'requirements', '[]'::jsonb),
    coalesce(nullif(p_job->>'estimated_cost', '')::numeric, 0),
    public.default_lead_cost(v_lead_source, v_sub_type),
    'PENDING',
    v_assigned,
    CASE WHEN v_assigned IS NOT NULL THEN now() ELSE NULL END,
    auth.uid(),
    coalesce(p_job->'before_photos', '[]'::jsonb)
  )
  RETURNING * INTO v_new;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'job_number', v_new.job_number,
    'customer_id', v_new.customer_id,
    'status', v_new.status,
    'scheduled_date', v_new.scheduled_date,
    'assigned_technician_id', v_new.assigned_technician_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.technician_create_job(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.technician_create_job(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.technician_create_job(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Customer report + photo gallery now open to any ACTIVE technician (was:
--    only technicians already assigned to that customer) so searched
--    customers' history is viewable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_technician_customer_jobs_report(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin_user() THEN
    RAISE EXCEPTION 'Use admin job queries';
  END IF;

  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'job_number', j.job_number,
        'customer_id', j.customer_id,
        'status', j.status,
        'priority', j.priority,
        'service_type', j.service_type,
        'service_sub_type', j.service_sub_type,
        'service_brand', j.service_brand,
        'scheduled_date', j.scheduled_date,
        'scheduled_time_slot', j.scheduled_time_slot,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'completed_at', j.completed_at,
        'end_time', j.end_time,
        'denied_at', j.denied_at,
        'denial_reason', j.denial_reason,
        'assigned_technician_id', j.assigned_technician_id,
        'completed_by', j.completed_by,
        'payment_amount', j.payment_amount,
        'actual_cost', j.actual_cost,
        'estimated_cost', j.estimated_cost,
        'payment_method', j.payment_method,
        -- lead_cost deliberately omitted: internal lead-acquisition cost must
        -- never reach a technician device (visible in network payload even if
        -- not rendered). parts_cost_total kept — technicians handle parts.
        'parts_cost_total', j.parts_cost_total,
        'requirements', j.requirements,
        'brand', j.brand,
        'model', j.model,
        'completion_notes', j.completion_notes,
        'description', j.description,
        'after_photos', j.after_photos
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.status = 'COMPLETED';

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_technician_customer_jobs_photos(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin_user() THEN
    RAISE EXCEPTION 'Use admin job queries';
  END IF;

  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'completed_at', j.completed_at,
        'end_time', j.end_time,
        'before_photos', j.before_photos,
        'after_photos', j.after_photos,
        'images', j.images,
        'requirements', j.requirements
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_technician_customer_jobs_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_technician_customer_jobs_photos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_technician_customer_jobs_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_technician_customer_jobs_photos(uuid) TO authenticated;
