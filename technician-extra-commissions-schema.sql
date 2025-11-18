-- Technician Extra Commissions Schema
-- This table tracks extra/bonus commissions given to technicians outside of regular job commissions

CREATE TABLE IF NOT EXISTS technician_extra_commissions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    
    -- Commission Details
    amount DECIMAL(10,2) NOT NULL,
    description TEXT NOT NULL,
    commission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Payment Info
    payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')),
    payment_reference TEXT,
    
    -- Additional Info
    notes TEXT,
    added_by UUID, -- Admin user ID who added the commission
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_technician_extra_commissions_technician_id ON technician_extra_commissions(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_extra_commissions_commission_date ON technician_extra_commissions(commission_date);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_technician_extra_commissions_updated_at ON technician_extra_commissions;
CREATE TRIGGER update_technician_extra_commissions_updated_at 
    BEFORE UPDATE ON technician_extra_commissions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE technician_extra_commissions ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read technician_extra_commissions" ON technician_extra_commissions;
CREATE POLICY "Allow authenticated users to read technician_extra_commissions"
    ON technician_extra_commissions FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_extra_commissions" ON technician_extra_commissions;
CREATE POLICY "Allow authenticated users to insert technician_extra_commissions"
    ON technician_extra_commissions FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_extra_commissions" ON technician_extra_commissions;
CREATE POLICY "Allow authenticated users to update technician_extra_commissions"
    ON technician_extra_commissions FOR UPDATE
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete technician_extra_commissions" ON technician_extra_commissions;
CREATE POLICY "Allow authenticated users to delete technician_extra_commissions"
    ON technician_extra_commissions FOR DELETE
    USING (true);

