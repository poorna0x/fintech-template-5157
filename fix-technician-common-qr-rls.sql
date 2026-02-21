-- Fix "RLS Disabled in Public" for technician_common_qr
-- Run this in Supabase SQL Editor if the table already exists without RLS

ALTER TABLE public.technician_common_qr ENABLE ROW LEVEL SECURITY;

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
