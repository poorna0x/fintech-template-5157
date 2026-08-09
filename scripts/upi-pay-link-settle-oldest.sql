-- Pending UPI settle: when multiple open links share an amount, settle the oldest.
-- Also keeps p_unique_amount default false (no paisa nudge from clients).

CREATE OR REPLACE FUNCTION public.try_settle_upi_pay_link_by_credit(
  p_amount numeric,
  p_payer_name text DEFAULT '',
  p_raw_text text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_link public.upi_pay_links%ROWTYPE;
  v_settled_at timestamptz := now();
  v_reqs jsonb;
  v_job_id uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.expire_stale_upi_pay_links();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  v_amount := round(p_amount::numeric, 2);

  SELECT * INTO v_link
  FROM public.upi_pay_links l
  WHERE l.status = 'open'
    AND l.expires_at > now()
    AND l.source = 'pending_payment'
    AND l.amount IS NOT DISTINCT FROM v_amount
  ORDER BY l.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'matched', false,
      'reason', 'no_open_link',
      'amount', v_amount
    );
  END IF;

  UPDATE public.upi_pay_links
  SET status = 'paid', paid_at = v_settled_at
  WHERE code = v_link.code
    AND status = 'open';

  IF v_link.reminder_id IS NOT NULL THEN
    UPDATE public.reminders
    SET completed_at = v_settled_at
    WHERE id = v_link.reminder_id
      AND completed_at IS NULL;
  END IF;

  v_job_id := v_link.job_id;

  IF v_job_id IS NOT NULL THEN
    SELECT requirements INTO v_reqs FROM public.jobs WHERE id = v_job_id;
    IF jsonb_typeof(v_reqs) = 'array' THEN
      SELECT coalesce(jsonb_agg(
        CASE
          WHEN elem ? 'pending_payment' THEN
            jsonb_set(
              jsonb_set(
                elem,
                '{pending_payment,settled_at}',
                to_jsonb(to_char(v_settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                true
              ),
              '{pending_payment,amount_pending}',
              '0'::jsonb,
              true
            )
          ELSE elem
        END
      ), '[]'::jsonb)
      INTO v_reqs
      FROM jsonb_array_elements(v_reqs) AS elem;
    END IF;

    UPDATE public.jobs
    SET
      payment_status = 'PAID',
      requirements = CASE
        WHEN v_reqs IS NULL THEN requirements
        ELSE v_reqs
      END
    WHERE id = v_job_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matched', true,
    'settled', true,
    'code', v_link.code,
    'amount', v_amount,
    'reminder_id', v_link.reminder_id,
    'job_id', v_job_id,
    'customer_id', v_link.customer_id,
    'upi_id', v_link.upi_id,
    'payer_name', left(trim(coalesce(p_payer_name, '')), 120)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_settle_upi_pay_link_by_credit(numeric, text, text) TO authenticated;
