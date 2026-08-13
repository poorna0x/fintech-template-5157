-- Shared WhatsApp inbox read watermarks (team-wide, not per admin).
-- Opening a chat (inside the thread) upserts read_at; list preview does not.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.whatsapp_inbox_read (
  phone_e164 text PRIMARY KEY,
  read_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_inbox_read IS
  'Team-shared last-read watermark per WhatsApp chat. No user id — any admin opening the thread clears unread for everyone.';

ALTER TABLE public.whatsapp_inbox_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_inbox_read_admin ON public.whatsapp_inbox_read;
CREATE POLICY whatsapp_inbox_read_admin
  ON public.whatsapp_inbox_read FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.whatsapp_inbox_read FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_inbox_read TO authenticated;
GRANT ALL ON TABLE public.whatsapp_inbox_read TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_inbox_mark_read(
  p_phone text,
  p_read_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_phone = '' OR p_read_at IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_inbox_read (phone_e164, read_at, updated_at)
  VALUES (v_phone, p_read_at, now())
  ON CONFLICT (phone_e164) DO UPDATE
    SET read_at = EXCLUDED.read_at,
        updated_at = now()
    WHERE public.whatsapp_inbox_read.read_at < EXCLUDED.read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_inbox_mark_read(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_mark_read(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_inbox_mark_read(text, timestamptz) TO service_role;

-- Full row on UPDATE so Realtime clients always get phone_e164 + read_at.
ALTER TABLE public.whatsapp_inbox_read REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_inbox_read'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_inbox_read;
  END IF;
END $$;
