-- Fix remaining auth_rls_initplan warnings on amc_contracts (copy-paste into Supabase SQL Editor).
-- Only changes insert + delete policies to use (select auth.role()) so they evaluate once per query.
-- If your current policies use (true), this will restrict to authenticated only; if they already use auth.role(), behavior stays the same.

BEGIN;

DROP POLICY IF EXISTS "Allow authenticated users to insert amc_contracts" ON public.amc_contracts;
CREATE POLICY "Allow authenticated users to insert amc_contracts" ON public.amc_contracts FOR INSERT WITH CHECK (((select auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Allow authenticated users to delete amc_contracts" ON public.amc_contracts;
CREATE POLICY "Allow authenticated users to delete amc_contracts" ON public.amc_contracts FOR DELETE USING (((select auth.role()) = 'authenticated'::text));

COMMIT;
