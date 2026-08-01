-- Allow technicians (and admins) to create a Settings "Pending payment" reminder
-- when completing a job. `reminders` RLS is admin-only (secure-remaining-rls.sql),
-- so direct inserts from the technician app fail with RLS — this SECURITY DEFINER
-- RPC is the safe path.
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.create_pending_payment_reminder_from_job(
  p_job_id uuid,
  p_customer_id uuid,
  p_amount_pending numeric,
  p_promised_date date,
  p_job_number text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_customer_id uuid;
  v_job_number text;
  v_note text;
  v_notes jsonb;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_job_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job and customer are required';
  END IF;

  IF p_amount_pending IS NULL OR p_amount_pending <= 0 THEN
    RAISE EXCEPTION 'Pending amount must be greater than zero';
  END IF;

  IF p_promised_date IS NULL THEN
    RAISE EXCEPTION 'Promised payment date is required';
  END IF;

  IF NOT (
    public.is_admin_user()
    OR public.technician_can_access_job(p_job_id)
  ) THEN
    RAISE EXCEPTION 'Not allowed to create reminder for this job';
  END IF;

  SELECT j.customer_id, j.job_number
  INTO v_job_customer_id, v_job_number
  FROM public.jobs j
  WHERE j.id = p_job_id;

  IF v_job_customer_id IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_job_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Customer does not match job';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    v_note := 'Balance from job ' || COALESCE(
      NULLIF(trim(COALESCE(p_job_number, v_job_number, '')), ''),
      left(p_job_id::text, 8)
    );
  END IF;

  v_notes := jsonb_build_object(
    'amount_pending', round(p_amount_pending::numeric, 2),
    'job_id', p_job_id::text,
    'note', v_note
  );
  IF NULLIF(trim(COALESCE(p_job_number, v_job_number, '')), '') IS NOT NULL THEN
    v_notes := v_notes || jsonb_build_object(
      'job_number', trim(COALESCE(p_job_number, v_job_number))
    );
  END IF;

  INSERT INTO public.reminders (
    entity_type,
    entity_id,
    title,
    notes,
    reminder_at,
    created_by
  ) VALUES (
    'customer',
    p_customer_id,
    'Pending payment',
    v_notes::text,
    p_promised_date,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_payment_reminder_from_job(
  uuid, uuid, numeric, date, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_payment_reminder_from_job(
  uuid, uuid, numeric, date, text, text
) TO authenticated;

COMMENT ON FUNCTION public.create_pending_payment_reminder_from_job(
  uuid, uuid, numeric, date, text, text
) IS
  'Creates a Pending payment reminder for a job. Admin or assigned technician only.';
