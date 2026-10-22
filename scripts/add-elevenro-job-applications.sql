-- Eleven RO careers applications + hiring on/off switch.
-- Run in Supabase SQL Editor. Safe to re-run.
-- Default is closed: the public page says we are not hiring until Settings turns it on.
-- No anon/authenticated access. The Netlify function uses the service role.

CREATE TABLE IF NOT EXISTS public.elevenro_hiring_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_open boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.elevenro_hiring_settings (id, is_open)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.elevenro_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  area text NOT NULL,
  experience text NOT NULL,
  experience_detail text,
  education text NOT NULL,
  has_two_wheeler boolean NOT NULL,
  has_licence boolean NOT NULL,
  field_work_ok boolean NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  brand text NOT NULL DEFAULT 'elevenro',
  CONSTRAINT elevenro_job_applications_experience_chk
    CHECK (experience IN ('fresher', 'experienced')),
  CONSTRAINT elevenro_job_applications_education_chk
    CHECK (education IN ('iti', 'diploma', 'electrical', 'electronics', 'mechanical', 'plumbing', 'other', 'none')),
  CONSTRAINT elevenro_job_applications_status_chk
    CHECK (status IN ('new', 'contacted', 'hired', 'not_selected')),
  CONSTRAINT elevenro_job_applications_brand_chk
    CHECK (brand IN ('elevenro', 'hydrogenro'))
);

ALTER TABLE public.elevenro_job_applications
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'elevenro';

ALTER TABLE public.elevenro_job_applications
  DROP CONSTRAINT IF EXISTS elevenro_job_applications_brand_chk;

ALTER TABLE public.elevenro_job_applications
  ADD CONSTRAINT elevenro_job_applications_brand_chk
  CHECK (brand IN ('elevenro', 'hydrogenro'));

CREATE INDEX IF NOT EXISTS elevenro_job_applications_created_at_idx
  ON public.elevenro_job_applications (created_at DESC);

CREATE INDEX IF NOT EXISTS elevenro_job_applications_phone_idx
  ON public.elevenro_job_applications (phone);

ALTER TABLE public.elevenro_hiring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elevenro_job_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.elevenro_hiring_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elevenro_job_applications FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.elevenro_job_applications IS
  'Technician job applications from elevenro.com/careers and hydrogenro.com/careers. Service role only.';
COMMENT ON TABLE public.elevenro_hiring_settings IS
  'Singleton. is_open false shows the not-hiring page on both careers pages.';
