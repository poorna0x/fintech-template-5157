-- Short branded UPI pay links: https://elevenro.com/p/xK9m2q
-- Run once in the Supabase SQL Editor (shared by HydrogenRO + ElevenRO).

CREATE TABLE IF NOT EXISTS public.upi_pay_links (
  code text PRIMARY KEY,
  upi_id text NOT NULL DEFAULT '',
  payee_name text NOT NULL DEFAULT '',
  amount numeric,
  note text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT 'hydrogenro',
  qr_code_url text NOT NULL DEFAULT '',
  dynamic_upi_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  CONSTRAINT upi_pay_links_code_len CHECK (char_length(code) BETWEEN 6 AND 16),
  CONSTRAINT upi_pay_links_upi_len CHECK (char_length(upi_id) <= 120),
  CONSTRAINT upi_pay_links_brand_chk CHECK (brand IN ('hydrogenro', 'elevenro'))
);

-- Upgrade existing table if columns don't exist yet
ALTER TABLE public.upi_pay_links
  ADD COLUMN IF NOT EXISTS qr_code_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dynamic_upi_enabled boolean NOT NULL DEFAULT true,
  ALTER COLUMN upi_id SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_upi_pay_links_expires
  ON public.upi_pay_links (expires_at);

ALTER TABLE public.upi_pay_links ENABLE ROW LEVEL SECURITY;

-- No direct table access for clients; use RPCs below.
REVOKE ALL ON public.upi_pay_links FROM PUBLIC;
REVOKE ALL ON public.upi_pay_links FROM anon;
REVOKE ALL ON public.upi_pay_links FROM authenticated;

GRANT SELECT, INSERT ON public.upi_pay_links TO service_role;

-- Admins may SELECT for Settings database export (anon stays locked out).
GRANT SELECT ON public.upi_pay_links TO authenticated;
DROP POLICY IF EXISTS upi_pay_links_admin_select ON public.upi_pay_links;
CREATE POLICY upi_pay_links_admin_select
  ON public.upi_pay_links
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP FUNCTION IF EXISTS public.create_upi_pay_link(text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.create_upi_pay_link(text, text, numeric, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.create_upi_pay_link(
  p_upi_id text,
  p_payee_name text DEFAULT '',
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT '',
  p_phone text DEFAULT '',
  p_brand text DEFAULT 'hydrogenro',
  p_qr_code_url text DEFAULT '',
  p_dynamic_upi_enabled boolean DEFAULT true
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
  v_upi text := lower(trim(coalesce(p_upi_id, '')));
  v_qr text := trim(coalesce(p_qr_code_url, ''));
  v_dynamic boolean := coalesce(p_dynamic_upi_enabled, true);
BEGIN
  IF public.is_admin_user() THEN
    NULL; -- allowed
  ELSIF EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()) THEN
    NULL; -- technicians may mint short pay links for remote customers
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_brand := CASE WHEN lower(trim(coalesce(p_brand, ''))) = 'elevenro' THEN 'elevenro' ELSE 'hydrogenro' END;

  -- Require either a valid UPI ID or an uploaded QR code image
  IF (v_upi = '' OR length(v_upi) < 3 OR position('@' in v_upi) = 0) AND v_qr = '' THEN
    RAISE EXCEPTION 'invalid upi id or qr code';
  END IF;

  LOOP
    v_code := '';
    FOR v_i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.upi_pay_links (
        code, upi_id, payee_name, amount, note, phone, brand, qr_code_url, dynamic_upi_enabled
      ) VALUES (
        v_code,
        v_upi,
        left(trim(coalesce(p_payee_name, '')), 100),
        CASE WHEN p_amount IS NOT NULL AND p_amount > 0 THEN round(p_amount::numeric, 2) ELSE NULL END,
        left(trim(coalesce(p_note, '')), 80),
        left(trim(coalesce(p_phone, '')), 20),
        v_brand,
        v_qr,
        v_dynamic
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

-- 6-arg backward compatibility overload:
CREATE OR REPLACE FUNCTION public.create_upi_pay_link(
  p_upi_id text,
  p_payee_name text,
  p_amount numeric,
  p_note text,
  p_phone text,
  p_brand text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_upi_pay_link(
    p_upi_id,
    p_payee_name,
    p_amount,
    p_note,
    p_phone,
    p_brand,
    '',
    true
  );
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
  qr_code_url text,
  dynamic_upi_enabled boolean
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
    l.brand,
    l.qr_code_url,
    l.dynamic_upi_enabled
  FROM public.upi_pay_links l
  WHERE l.code = v_code
    AND l.expires_at > now()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_upi_pay_link(text, text, numeric, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_upi_pay_link(text, text, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upi_pay_link(text) TO anon, authenticated;
