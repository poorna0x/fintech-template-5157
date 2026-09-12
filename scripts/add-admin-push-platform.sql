-- Admin push: mark each token as android (APK) or web (browser / iOS Home Screen PWA).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.admin_push_tokens
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'android';

ALTER TABLE public.admin_push_tokens
  DROP CONSTRAINT IF EXISTS admin_push_tokens_platform_check;

ALTER TABLE public.admin_push_tokens
  ADD CONSTRAINT admin_push_tokens_platform_check
  CHECK (platform IN ('android', 'web'));

COMMENT ON COLUMN public.admin_push_tokens.platform IS
  'Delivery surface: android = Capacitor Admin APK; web = browser or iOS/Android Home Screen PWA (FCM web token).';
