-- AMC Contracts Table Schema
-- This table stores AMC (Annual Maintenance Contract) details for customers

CREATE TABLE IF NOT EXISTS amc_contracts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL, -- The job that created this AMC
    
    -- AMC Details
    start_date DATE NOT NULL, -- When AMC was given
    end_date DATE NOT NULL, -- When AMC expires
    years INTEGER NOT NULL, -- Duration in years
    includes_prefilter BOOLEAN DEFAULT false,
    additional_info TEXT, -- Notes from technician
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED')),
    
    -- Renewal tracking
    renewed_from_amc_id UUID REFERENCES amc_contracts(id), -- If this is a renewal
    
    -- Auto AMC service jobs: NULL = use app default, 0 = no auto, 4/6/custom = months between services
    service_period_months INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_amc_contracts_customer_id ON amc_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_job_id ON amc_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status ON amc_contracts(status);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_end_date ON amc_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_start_date ON amc_contracts(start_date);

-- Create trigger for updated_at (drop first so re-run is safe)
DROP TRIGGER IF EXISTS update_amc_contracts_updated_at ON amc_contracts;
CREATE TRIGGER update_amc_contracts_updated_at 
BEFORE UPDATE ON amc_contracts 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE amc_contracts ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (drop first so re-run is safe)
DROP POLICY IF EXISTS "Allow authenticated users to read amc_contracts" ON amc_contracts;
CREATE POLICY "Allow authenticated users to read amc_contracts" 
ON amc_contracts FOR SELECT 
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to insert amc_contracts" ON amc_contracts;
CREATE POLICY "Allow authenticated users to insert amc_contracts" 
ON amc_contracts FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to update amc_contracts" ON amc_contracts;
CREATE POLICY "Allow authenticated users to update amc_contracts" 
ON amc_contracts FOR UPDATE 
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to delete amc_contracts" ON amc_contracts;
CREATE POLICY "Allow authenticated users to delete amc_contracts" 
ON amc_contracts FOR DELETE 
USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON amc_contracts TO authenticated, anon;

