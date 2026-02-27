-- Add service period for AMC auto job creation
-- service_period_months: NULL = use app default, 0 = no auto, 4/6/custom = months between services
ALTER TABLE amc_contracts
ADD COLUMN IF NOT EXISTS service_period_months INTEGER;

COMMENT ON COLUMN amc_contracts.service_period_months IS 'Months between auto-created AMC service jobs. NULL = use app default, 0 = no auto, 4/6/custom = months.';
