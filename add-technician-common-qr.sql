-- Common QR (non-payment): QR shown to technician below payment QR. Separate from Common Payment QR Codes.
CREATE TABLE IF NOT EXISTS technician_common_qr (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  name character varying(255) NOT NULL,
  qr_code_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Support multiple Common QRs per technician (array of technician_common_qr.id)
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS common_qr_code_ids jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN technicians.common_qr_code_ids IS 'Array of Common QR ids (technician_common_qr) shown to this technician below payment QR';

-- Migrate from single common_qr_code_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'technicians' AND column_name = 'common_qr_code_id'
  ) THEN
    UPDATE technicians
    SET common_qr_code_ids = jsonb_build_array(common_qr_code_id)
    WHERE common_qr_code_id IS NOT NULL;
    ALTER TABLE technicians DROP CONSTRAINT IF EXISTS technicians_common_qr_code_id_fkey;
    ALTER TABLE technicians DROP COLUMN IF EXISTS common_qr_code_id;
  END IF;
END $$;

-- Enable RLS (fixes "RLS Disabled in Public" linter error)
ALTER TABLE public.technician_common_qr ENABLE ROW LEVEL SECURITY;

-- RLS policies: same pattern as common_qr_codes (admin + technician app need read/write)
DROP POLICY IF EXISTS "Allow all users to read technician_common_qr" ON public.technician_common_qr;
DROP POLICY IF EXISTS "Allow all users to insert technician_common_qr" ON public.technician_common_qr;
DROP POLICY IF EXISTS "Allow all users to update technician_common_qr" ON public.technician_common_qr;
DROP POLICY IF EXISTS "Allow all users to delete technician_common_qr" ON public.technician_common_qr;

CREATE POLICY "Allow all users to read technician_common_qr"
  ON public.technician_common_qr FOR SELECT TO public USING (true);

CREATE POLICY "Allow all users to insert technician_common_qr"
  ON public.technician_common_qr FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow all users to update technician_common_qr"
  ON public.technician_common_qr FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all users to delete technician_common_qr"
  ON public.technician_common_qr FOR DELETE TO public USING (true);
