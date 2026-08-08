-- Global Cloud FCM push controls (singleton) + per-technician category prefs.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.push_crm_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  -- Keys match TECH_PUSH_CATEGORIES; missing key = allowed. false = blocked globally.
  tech_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.push_crm_settings IS
  'Singleton: master enable + per-category allow flags for technician FCM pushes.';

INSERT INTO public.push_crm_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.push_crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_crm_settings_admin_select ON public.push_crm_settings;
CREATE POLICY push_crm_settings_admin_select
  ON public.push_crm_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS push_crm_settings_admin_update ON public.push_crm_settings;
CREATE POLICY push_crm_settings_admin_update
  ON public.push_crm_settings FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.push_crm_settings FROM anon;
GRANT SELECT, UPDATE ON TABLE public.push_crm_settings TO authenticated;
GRANT ALL ON TABLE public.push_crm_settings TO service_role;

-- Per-technician category overrides (same keys as device push_prefs)
ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS push_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.technicians.push_prefs IS
  'Per-technician FCM category toggles. Missing key = on; false = off for that category.';

GRANT SELECT (push_prefs) ON TABLE public.technicians TO authenticated;
-- Admins update via is_admin_user RLS / existing update path
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (push_prefs) ON TABLE public.technicians TO authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'push_prefs UPDATE grant skipped: %', SQLERRM;
END $$;
