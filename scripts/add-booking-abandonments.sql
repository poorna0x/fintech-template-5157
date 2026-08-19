-- Booking abandonments: public anon INSERT from website; authenticated SELECT/UPDATE for admin dashboard.
-- Run once on Supabase SQL editor (or psql).

CREATE TABLE IF NOT EXISTS public.booking_abandonments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  step_reached smallint NOT NULL,
  bucket_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  CONSTRAINT booking_abandonments_step_check CHECK (step_reached >= 1 AND step_reached <= 5),
  CONSTRAINT booking_abandonments_name_len CHECK (char_length(trim(full_name)) >= 2 AND char_length(trim(full_name)) <= 200),
  CONSTRAINT booking_abandonments_phone_norm CHECK (char_length(phone_normalized) = 10),
  CONSTRAINT booking_abandonments_phone_bucket_unique UNIQUE (phone_normalized, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_booking_abandonments_active
  ON public.booking_abandonments (created_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.booking_abandonments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert booking abandonments" ON public.booking_abandonments;
CREATE POLICY "Allow anon insert booking abandonments"
  ON public.booking_abandonments
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read booking abandonments" ON public.booking_abandonments;
CREATE POLICY "Allow authenticated read booking abandonments"
  ON public.booking_abandonments
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated update booking abandonments" ON public.booking_abandonments;
CREATE POLICY "Allow authenticated update booking abandonments"
  ON public.booking_abandonments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Broadcast row changes to authenticated subscribers (admin dashboard instant banner; avoids polling egress).
-- If this errors with "already member of publication", the table was already added — safe to ignore.
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_abandonments;
