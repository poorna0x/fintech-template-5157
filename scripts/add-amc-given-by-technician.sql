ALTER TABLE public.amc_contracts
ADD COLUMN IF NOT EXISTS given_by_technician_id uuid;

CREATE INDEX IF NOT EXISTS idx_amc_contracts_given_by_technician_id
ON public.amc_contracts USING btree (given_by_technician_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'amc_contracts'
      AND constraint_name = 'amc_contracts_given_by_technician_id_fkey'
  ) THEN
    ALTER TABLE public.amc_contracts
    ADD CONSTRAINT amc_contracts_given_by_technician_id_fkey
    FOREIGN KEY (given_by_technician_id)
    REFERENCES public.technicians(id)
    ON DELETE SET NULL;
  END IF;
END $$;
