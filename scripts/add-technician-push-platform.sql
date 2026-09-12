-- Technician push: mark each token as android (APK) or web (browser / iOS Home Screen PWA).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.technician_push_tokens
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'android';

ALTER TABLE public.technician_push_tokens
  DROP CONSTRAINT IF EXISTS technician_push_tokens_platform_check;

ALTER TABLE public.technician_push_tokens
  ADD CONSTRAINT technician_push_tokens_platform_check
  CHECK (platform IN ('android', 'web'));

COMMENT ON COLUMN public.technician_push_tokens.platform IS
  'Delivery surface: android = Capacitor Technician APK; web = browser or iOS/Android Home Screen PWA (FCM web token).';
