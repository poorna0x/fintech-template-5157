-- Brand Website leads for analytics: Website (HydrogenRO) / Website (ElevenRO).
-- Safe to re-run. Updates normalize helper used by dashboard / conversion RPCs.

CREATE OR REPLACE FUNCTION public.analytics_normalize_lead_type(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(btrim(p), '') = '' THEN ''
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_.-]+', '', 'g'), '[^\w]', '', 'g'))
      IN ('websitehydrogenro', 'websitehro', 'websitehydrogenrocom')
      OR lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_.-]+', '', 'g'), '[^\w]', '', 'g'))
         LIKE 'websitehydrogen%'
      THEN 'Website (HydrogenRO)'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_.-]+', '', 'g'), '[^\w]', '', 'g'))
      IN ('websiteelevenro', 'websiteero', 'websiteelevenrocom')
      OR lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_.-]+', '', 'g'), '[^\w]', '', 'g'))
         LIKE 'websiteeleven%'
      THEN 'Website (ElevenRO)'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'website'
      THEN 'Website'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'directcall'
      THEN 'Direct call'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'googleleads'
      THEN 'Google-Leads'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'rocareindia'
      THEN 'RO care india'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'hometriangle'
      THEN 'Home Triangle'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'hometrianglesrujan'
      THEN 'Home Triangle-Srujan'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'hometriangle3'
      THEN 'Home Triangle-3'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'localramu'
      THEN 'Local Ramu'
    WHEN lower(regexp_replace(regexp_replace(coalesce(btrim(p), ''), '[\s_-]+', '', 'g'), '[^\w]', '', 'g')) = 'other'
      THEN 'Other'
    ELSE btrim(p)
  END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_is_direct_or_website_lead(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(btrim(p), '') = '' THEN true
    WHEN lower(btrim(p)) LIKE '%website%' THEN true
    WHEN public.analytics_normalize_lead_type(p) IN (
      'Direct call',
      'Website',
      'Website (HydrogenRO)',
      'Website (ElevenRO)'
    ) THEN true
    ELSE false
  END;
$$;
