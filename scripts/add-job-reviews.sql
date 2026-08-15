-- Customer “review us” after Complete Job.
-- Shared by HydrogenRO + ElevenRO. One row per job, attached to the technician
-- who completed / was assigned. Public submit is via RPCs only (no table access).
-- Run in the Supabase SQL Editor. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.job_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  brand text NOT NULL DEFAULT 'hydrogenro'
    CHECK (brand IN ('hydrogenro', 'elevenro')),
  rating smallint
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  notified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  CONSTRAINT job_reviews_token_len CHECK (char_length(token) BETWEEN 12 AND 48),
  CONSTRAINT job_reviews_comment_len CHECK (char_length(comment) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS job_reviews_token_uidx
  ON public.job_reviews (token);

CREATE UNIQUE INDEX IF NOT EXISTS job_reviews_job_id_uidx
  ON public.job_reviews (job_id);

CREATE INDEX IF NOT EXISTS job_reviews_technician_submitted_idx
  ON public.job_reviews (technician_id, submitted_at DESC)
  WHERE status = 'submitted' AND technician_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_reviews_brand_submitted_idx
  ON public.job_reviews (brand, submitted_at DESC)
  WHERE status = 'submitted';

COMMENT ON TABLE public.job_reviews IS
  'Customer visit reviews after Complete Job; linked to the technician sent on that job.';

ALTER TABLE public.job_reviews ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.job_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.job_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.job_reviews FROM anon;
REVOKE ALL ON TABLE public.job_reviews FROM authenticated;

-- Authenticated may read review rows, never the invite token (admins/techs use RPCs to mint links).
GRANT SELECT (
  id, job_id, customer_id, technician_id, brand, rating, comment, status,
  created_at, submitted_at, notified_at, expires_at
) ON public.job_reviews TO authenticated;
GRANT ALL ON TABLE public.job_reviews TO service_role;

DROP POLICY IF EXISTS job_reviews_admin_select ON public.job_reviews;
CREATE POLICY job_reviews_admin_select
  ON public.job_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS job_reviews_technician_select ON public.job_reviews;
CREATE POLICY job_reviews_technician_select
  ON public.job_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_technician()
    AND technician_id = auth.uid()
    AND status = 'submitted'
  );

-- ---------------------------------------------------------------------------
-- Create / reuse invite (admin or the technician on that job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_job_review_invite(
  p_job_id uuid,
  p_technician_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_tech uuid;
  v_brand text;
  v_token text;
  v_existing record;
  v_new_id uuid;
  v_try int := 0;
  v_allowed boolean := false;
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'job required';
  END IF;

  SELECT
    j.id,
    j.customer_id,
    j.assigned_technician_id,
    j.completed_by,
    j.service_brand,
    j.status
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job not found';
  END IF;

  v_tech := COALESCE(v_job.completed_by, v_job.assigned_technician_id);

  IF public.is_admin_user() THEN
    v_allowed := true;
    IF p_technician_id IS NOT NULL THEN
      v_tech := p_technician_id;
    END IF;
  ELSIF public.is_active_technician()
    AND (
      v_job.assigned_technician_id = auth.uid()
      OR v_job.completed_by = auth.uid()
    ) THEN
    v_allowed := true;
    v_tech := auth.uid();
  ELSIF auth.role() = 'service_role' THEN
    v_allowed := true;
    IF p_technician_id IS NOT NULL THEN
      v_tech := p_technician_id;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_brand := CASE
    WHEN lower(trim(coalesce(v_job.service_brand, ''))) = 'elevenro' THEN 'elevenro'
    ELSE 'hydrogenro'
  END;

  SELECT r.id, r.token, r.status, r.expires_at
  INTO v_existing
  FROM public.job_reviews r
  WHERE r.job_id = p_job_id;

  IF FOUND THEN
    IF v_existing.status = 'submitted' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_submitted', true,
        'id', v_existing.id,
        'token', v_existing.token,
        'brand', v_brand
      );
    END IF;
    IF v_existing.expires_at > now()
      AND char_length(coalesce(v_existing.token, '')) BETWEEN 12 AND 16 THEN
      UPDATE public.job_reviews
      SET technician_id = v_tech,
          customer_id = v_job.customer_id,
          brand = v_brand
      WHERE id = v_existing.id;
      RETURN jsonb_build_object(
        'ok', true,
        'id', v_existing.id,
        'token', v_existing.token,
        'brand', v_brand,
        'reused', true
      );
    END IF;
  END IF;

  LOOP
    -- Short tidy token (12 hex). Unique index + retry on collision.
    v_token := left(replace(gen_random_uuid()::text, '-', ''), 12);

    BEGIN
      IF v_existing.id IS NOT NULL THEN
        UPDATE public.job_reviews
        SET token = v_token,
            technician_id = v_tech,
            customer_id = v_job.customer_id,
            brand = v_brand,
            status = 'pending',
            rating = NULL,
            comment = '',
            submitted_at = NULL,
            notified_at = NULL,
            expires_at = now() + interval '14 days'
        WHERE id = v_existing.id;
        RETURN jsonb_build_object(
          'ok', true,
          'id', v_existing.id,
          'token', v_token,
          'brand', v_brand
        );
      END IF;

      INSERT INTO public.job_reviews (
        token, job_id, customer_id, technician_id, brand
      ) VALUES (
        v_token, p_job_id, v_job.customer_id, v_tech, v_brand
      )
      RETURNING id INTO v_new_id;

      RETURN jsonb_build_object(
        'ok', true,
        'id', v_new_id,
        'token', v_token,
        'brand', v_brand
      );
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 12 THEN
        RAISE EXCEPTION 'could not allocate review token';
      END IF;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Public: load invite (no customer PII)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_review_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
  v_row record;
  v_tech_name text;
BEGIN
  IF char_length(v_token) < 12 OR char_length(v_token) > 48 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT
    r.id,
    r.brand,
    r.status,
    r.rating,
    r.expires_at,
    r.technician_id,
    t.full_name AS technician_name
  INTO v_row
  FROM public.job_reviews r
  LEFT JOIN public.technicians t ON t.id = r.technician_id
  WHERE r.token = v_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status = 'pending' AND v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  v_tech_name := nullif(trim(split_part(coalesce(v_row.technician_name, ''), ' ', 1)), '');

  RETURN jsonb_build_object(
    'ok', true,
    'brand', v_row.brand,
    'status', v_row.status,
    'rating', v_row.rating,
    'technician_first_name', v_tech_name
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Public: submit stars + optional comment (single use)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_job_review(
  p_token text,
  p_rating integer,
  p_comment text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := trim(coalesce(p_token, ''));
  v_comment text := left(trim(coalesce(p_comment, '')), 1000);
  v_row record;
BEGIN
  IF char_length(v_token) < 12 OR char_length(v_token) > 48 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rating');
  END IF;

  SELECT r.id, r.status, r.expires_at
  INTO v_row
  FROM public.job_reviews r
  WHERE r.token = v_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status = 'submitted' THEN
    RETURN jsonb_build_object('ok', true, 'already_submitted', true);
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.job_reviews
  SET
    rating = p_rating,
    comment = v_comment,
    status = 'submitted',
    submitted_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'rating', p_rating);
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_review_invite(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_job_review_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_job_review(text, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_job_review_invite(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_review_invite(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_job_review_invite(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_job_review(text, integer, text) TO anon, authenticated, service_role;

-- Slim technician averages for Settings → Customer reviews (no comments).
CREATE OR REPLACE FUNCTION public.job_review_technician_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total integer := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.avg_rating DESC, x.review_count DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      r.technician_id AS technician_id,
      COALESCE(nullif(trim(t.full_name), ''), 'Technician') AS technician_name,
      count(*)::integer AS review_count,
      round(avg(r.rating)::numeric, 2) AS avg_rating
    FROM public.job_reviews r
    LEFT JOIN public.technicians t ON t.id = r.technician_id
    WHERE r.status = 'submitted'
      AND r.rating IS NOT NULL
    GROUP BY r.technician_id, t.full_name
  ) x;

  SELECT count(*)::integer
  INTO v_total
  FROM public.job_reviews r
  WHERE r.status = 'submitted'
    AND r.rating IS NOT NULL;

  RETURN jsonb_build_object('total', v_total, 'technicians', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.job_review_technician_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_review_technician_stats() TO authenticated;
