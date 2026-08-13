-- Revert pending-payment UPI auto-settle schema/RPCs.
-- Restores create_upi_pay_link / get_upi_pay_link to the technician-allowed 6-arg versions
-- (same as scripts/patch-create-upi-pay-link-allow-technicians.sql + add-upi-pay-links.sql).

DROP FUNCTION IF EXISTS public.try_settle_upi_pay_link_by_credit(numeric, text, text);
DROP FUNCTION IF EXISTS public.expire_stale_upi_pay_links();

-- Extended signature from auto-settle (must drop before recreating the short one).
DROP FUNCTION IF EXISTS public.create_upi_pay_link(
  text, text, numeric, text, text, text,
  integer, uuid, uuid, uuid, text, text, boolean
);
DROP FUNCTION IF EXISTS public.create_upi_pay_link(text, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.create_upi_pay_link(
  p_upi_id text,
  p_payee_name text DEFAULT '',
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT '',
  p_phone text DEFAULT '',
  p_brand text DEFAULT 'hydrogenro'
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
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF public.is_admin_user() THEN
    v_allowed := true;
  ELSIF EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = v_uid) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_brand := CASE WHEN lower(trim(coalesce(p_brand, ''))) = 'elevenro' THEN 'elevenro' ELSE 'hydrogenro' END;

  IF p_upi_id IS NULL OR length(trim(p_upi_id)) < 3 OR position('@' in trim(p_upi_id)) = 0 THEN
    RAISE EXCEPTION 'invalid upi id';
  END IF;

  LOOP
    v_code := '';
    FOR v_i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.upi_pay_links (
        code, upi_id, payee_name, amount, note, phone, brand
      ) VALUES (
        v_code,
        lower(trim(p_upi_id)),
        left(trim(coalesce(p_payee_name, '')), 100),
        CASE WHEN p_amount IS NOT NULL AND p_amount > 0 THEN round(p_amount::numeric, 2) ELSE NULL END,
        left(trim(coalesce(p_note, '')), 80),
        left(trim(coalesce(p_phone, '')), 20),
        v_brand
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
  brand text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := trim(coalesce(p_code, ''));
BEGIN
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
    l.brand
  FROM public.upi_pay_links l
  WHERE l.code = v_code
    AND l.expires_at > now()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_upi_pay_link(text, text, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upi_pay_link(text) TO anon, authenticated;

DROP INDEX IF EXISTS public.idx_upi_pay_links_open_match;
DROP INDEX IF EXISTS public.idx_upi_pay_links_reminder;

ALTER TABLE public.upi_pay_links
  DROP CONSTRAINT IF EXISTS upi_pay_links_status_chk;

ALTER TABLE public.upi_pay_links
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS paid_at,
  DROP COLUMN IF EXISTS reminder_id,
  DROP COLUMN IF EXISTS job_id,
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS upi_account_id,
  DROP COLUMN IF EXISTS source;
