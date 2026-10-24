-- WhatsApp Settings toggle: redirect photos/videos/files we did not ask for.
-- Default true keeps the current Eleven RO redirect.
-- When false, the upload stays in the inbox and no redirect is sent.
-- Safe to re-run.

alter table public.whatsapp_crm_settings
  add column if not exists redirect_unsolicited_media boolean not null default true;
