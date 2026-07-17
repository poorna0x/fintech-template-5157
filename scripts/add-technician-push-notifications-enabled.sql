-- Per-technician FCM push mute (admin Settings → Edit Technician).
-- Default true so existing techs keep getting pushes until an admin turns them off.
-- Run in Supabase SQL editor (safe to re-run).

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.technicians.push_notifications_enabled IS
  'When false, Netlify FCM helpers skip sending to this technician''s devices. Tokens stay registered so turning back on works immediately.';

-- technicians uses column-level SELECT grants (see secure-technicians-drop-password-and-restrict-salary.sql).
-- New columns are not readable until granted — without this, Settings save 403s on .select() after update.
GRANT SELECT (push_notifications_enabled) ON TABLE public.technicians TO authenticated;
