-- Short customer track links: https://hydrogenro.com/track/xK9m2q
-- Admin shares via WhatsApp; customer sees map when job is EN_ROUTE.
-- Run once in Supabase SQL Editor (shared HydrogenRO + ElevenRO).

CREATE TABLE IF NOT EXISTS public.job_track_links (
  code text PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  brand text NOT NULL DEFAULT 'hydrogenro',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_ping_at timestamptz,
  CONSTRAINT job_track_links_code_len CHECK (char_length(code) BETWEEN 6 AND 16),
  CONSTRAINT job_track_links_brand_chk CHECK (brand IN ('hydrogenro', 'elevenro'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_track_links_job_id
  ON public.job_track_links (job_id);

CREATE INDEX IF NOT EXISTS idx_job_track_links_expires
  ON public.job_track_links (expires_at);

ALTER TABLE public.job_track_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_track_links FROM PUBLIC;
REVOKE ALL ON public.job_track_links FROM anon;
REVOKE ALL ON public.job_track_links FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.job_track_links TO service_role;

CREATE OR REPLACE FUNCTION public.create_job_track_link(
  p_job_id uuid,
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
  v_existing text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'job id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id) THEN
    RAISE EXCEPTION 'job not found';
  END IF;

  v_brand := CASE WHEN lower(trim(coalesce(p_brand, ''))) = 'elevenro' THEN 'elevenro' ELSE 'hydrogenro' END;

  SELECT l.code
  INTO v_existing
  FROM public.job_track_links l
  WHERE l.job_id = p_job_id
    AND l.expires_at > now()
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_code := '';
    FOR v_i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.job_track_links (code, job_id, brand)
      VALUES (v_code, p_job_id, v_brand)
      ON CONFLICT (job_id) DO UPDATE
        SET expires_at = now() + interval '30 days'
      RETURNING code INTO v_code;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 12 THEN
        RAISE EXCEPTION 'could not allocate track link code';
      END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_job_track_link(uuid, text) TO authenticated;
