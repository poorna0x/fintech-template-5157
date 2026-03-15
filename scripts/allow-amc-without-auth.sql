-- Run once in Supabase SQL Editor. Removes all session/role checks on amc_contracts
-- so insert and delete work from admin page without any auth.

-- Replace authenticated-only INSERT with allow-all (no role check)
DROP POLICY IF EXISTS "Allow authenticated users to insert amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow anon to insert amc_contracts" ON public.amc_contracts;
CREATE POLICY "Allow all to insert amc_contracts"
  ON public.amc_contracts FOR INSERT
  WITH CHECK (true);

-- Replace authenticated-only DELETE with allow-all (no role check)
DROP POLICY IF EXISTS "Allow authenticated users to delete amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow anon to delete amc_contracts" ON public.amc_contracts;
CREATE POLICY "Allow all to delete amc_contracts"
  ON public.amc_contracts FOR DELETE
  USING (true);
