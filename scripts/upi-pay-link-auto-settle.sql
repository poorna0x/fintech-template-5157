-- Pending-payment UPI auto-settle (v1)
-- Run in Supabase SQL Editor (shared HydrogenRO + ElevenRO backend).
-- Extends upi_pay_links + create/get RPCs + try_settle_upi_pay_link_by_credit.

ALTER TABLE public.upi_pay_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_id uuid,
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS upi_account_id text,
  ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'upi_pay_links_status_chk'
  ) THEN
    ALTER TABLE public.upi_pay_links
      ADD CONSTRAINT upi_pay_links_status_chk
      CHECK (status IN ('open', 'paid', 'expired', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_upi_pay_links_open_match
  ON public.upi_pay_links (upi_id, amount, expires_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_upi_pay_links_reminder
  ON public.upi_pay_links (reminder_id)
  WHERE reminder_id IS NOT NULL;

-- Expire open rows past expires_at (lazy cleanup helper).
CREATE OR REPLACE FUNCTION public.expire_stale_upi_pay_links()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.upi_pay_links
  SET status = 'expired'
  WHERE status = 'open'
    AND expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DROP FUNCTION IF EXISTS public.create_upi_pay_link(text, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.create_upi_pay_link(
  p_upi_id text,
  p_payee_name text DEFAULT '',
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT '',
  p_phone text DEFAULT '',
  p_brand text DEFAULT 'hydrogenro',
  p_ttl_minutes integer DEFAULT NULL,
  p_reminder_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_upi_account_id text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_unique_amount boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_brand text;
  v_alphabet text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_try int := 0;
  v_amount numeric;
  v_expires timestamptz;
  v_upi text;
  v_nudge int := 0;
BEGIN
  IF public.is_admin_user() THEN
    NULL;
  ELSIF EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.expire_stale_upi_pay_links();

  v_brand := CASE WHEN lower(trim(coalesce(p_brand, ''))) = 'elevenro' THEN 'elevenro' ELSE 'hydrogenro' END;
  v_upi := lower(trim(p_upi_id));

  IF v_upi IS NULL OR length(v_upi) < 3 OR position('@' in v_upi) = 0 THEN
    RAISE EXCEPTION 'invalid upi id';
  END IF;

  IF p_amount IS NOT NULL AND p_amount > 0 THEN
    v_amount := round(p_amount::numeric, 2);
  ELSE
    v_amount := NULL;
  END IF;

  -- Unique amount among currently open links for this VPA (paisa nudge).
  IF coalesce(p_unique_amount, false) AND v_amount IS NOT NULL THEN
    WHILE EXISTS (
      SELECT 1
      FROM public.upi_pay_links l
      WHERE l.status = 'open'
        AND l.expires_at > now()
        AND l.upi_id = v_upi
        AND l.amount IS NOT DISTINCT FROM v_amount
    ) AND v_nudge < 50 LOOP
      v_nudge := v_nudge + 1;
      v_amount := round(p_amount::numeric + (v_nudge * 0.01), 2);
    END LOOP;
  END IF;

  IF p_ttl_minutes IS NOT NULL AND p_ttl_minutes > 0 THEN
    v_expires := now() + make_interval(mins => p_ttl_minutes);
  ELSE
    v_expires := now() + interval '90 days';
  END IF;

  LOOP
    v_code := '';
    FOR v_i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.upi_pay_links (
        code, upi_id, payee_name, amount, note, phone, brand,
        expires_at, status, reminder_id, job_id, customer_id, upi_account_id, source
      ) VALUES (
        v_code,
        v_upi,
        left(trim(coalesce(p_payee_name, '')), 100),
        v_amount,
        left(trim(coalesce(p_note, '')), 80),
        left(trim(coalesce(p_phone, '')), 20),
        v_brand,
        v_expires,
        'open',
        p_reminder_id,
        p_job_id,
        p_customer_id,
        left(trim(coalesce(p_upi_account_id, '')), 80),
        left(trim(coalesce(p_source, '')), 40)
      );
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 12 THEN
        RAISE EXCEPTION 'could not allocate pay link code';
      END IF;
    END;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.get_upi_pay_link(text);

CREATE OR REPLACE FUNCTION public.get_upi_pay_link(p_code text)
RETURNS TABLE (
  code text,
  upi_id text,
  payee_name text,
  amount numeric,
  note text,
  phone text,
  brand text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := trim(coalesce(p_code, ''));
BEGIN
  PERFORM public.expire_stale_upi_pay_links();

  IF v_code = '' OR char_length(v_code) > 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.code,
    l.upi_id,
    l.payee_name,
    l.amount,
    l.note,
    l.phone,
    l.brand,
    l.status,
    l.expires_at
  FROM public.upi_pay_links l
  WHERE l.code = v_code
    AND l.status = 'open'
    AND l.expires_at > now()
  LIMIT 1;
END;
$$;

-- Admin-only: match PhonePe/GPay credit amount to one open pending-payment link and settle.
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
  v_count int;
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

  SELECT count(*)::int INTO v_count
  FROM public.upi_pay_links l
  WHERE l.status = 'open'
    AND l.expires_at > now()
    AND l.source = 'pending_payment'
    AND l.amount IS NOT DISTINCT FROM v_amount;

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'matched', false,
      'reason', 'no_open_link',
      'amount', v_amount
    );
  END IF;

  IF v_count > 1 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'matched', false,
      'reason', 'ambiguous',
      'amount', v_amount,
      'candidates', v_count
    );
  END IF;

  SELECT * INTO v_link
  FROM public.upi_pay_links l
  WHERE l.status = 'open'
    AND l.expires_at > now()
    AND l.source = 'pending_payment'
    AND l.amount IS NOT DISTINCT FROM v_amount
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'matched', false, 'reason', 'race_miss');
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

GRANT EXECUTE ON FUNCTION public.create_upi_pay_link(
  text, text, numeric, text, text, text, integer, uuid, uuid, uuid, text, text, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upi_pay_link(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_settle_upi_pay_link_by_credit(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_upi_pay_links() TO authenticated;
