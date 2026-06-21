-- Force email open tracking ON (legacy toggle removed from UI; Netlify always injects pixel).
-- Safe to re-run.

INSERT INTO public.crm_settings (key, value, updated_at)
VALUES ('email_open_tracking_enabled', 'true'::jsonb, now())
ON CONFLICT (key) DO UPDATE
SET value = 'true'::jsonb,
    updated_at = now();
