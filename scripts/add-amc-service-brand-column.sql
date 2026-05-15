-- Track which service brand (Hydrogen RO / Eleven RO) issued an AMC contract
ALTER TABLE public.amc_contracts ADD COLUMN IF NOT EXISTS service_brand TEXT;

CREATE INDEX IF NOT EXISTS idx_amc_contracts_service_brand ON public.amc_contracts (service_brand);

COMMENT ON COLUMN public.amc_contracts.service_brand IS 'Document brand: hydrogenro | elevenro';
