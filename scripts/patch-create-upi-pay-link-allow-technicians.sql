-- Allow technicians (and admins) to mint short UPI pay links for remote customers.
-- Run once in Supabase SQL Editor after add-upi-pay-links.sql.

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

GRANT EXECUTE ON FUNCTION public.create_upi_pay_link(text, text, numeric, text, text, text) TO authenticated;
