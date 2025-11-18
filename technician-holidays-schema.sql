-- Technician Holidays Schema
-- This table tracks holidays for technicians (days with no jobs completed)
-- First 4 holidays per month are allowed, additional holidays deduct from basic salary

CREATE TABLE IF NOT EXISTS technician_holidays (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    
    -- Holiday Details
    holiday_date DATE NOT NULL,
    is_manual BOOLEAN DEFAULT FALSE, -- TRUE if manually added, FALSE if auto-detected (no jobs)
    reason TEXT, -- Reason for holiday (optional, for manual holidays)
    
    -- Additional Info
    notes TEXT,
    added_by UUID, -- Admin user ID who added the holiday (if manual)
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one holiday record per technician per date
    UNIQUE(technician_id, holiday_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_technician_holidays_technician_id ON technician_holidays(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_holidays_holiday_date ON technician_holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_technician_holidays_technician_date ON technician_holidays(technician_id, holiday_date);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_technician_holidays_updated_at ON technician_holidays;
CREATE TRIGGER update_technician_holidays_updated_at 
    BEFORE UPDATE ON technician_holidays 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE technician_holidays ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read technician_holidays" ON technician_holidays;
CREATE POLICY "Allow authenticated users to read technician_holidays"
    ON technician_holidays FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_holidays" ON technician_holidays;
CREATE POLICY "Allow authenticated users to insert technician_holidays"
    ON technician_holidays FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_holidays" ON technician_holidays;
CREATE POLICY "Allow authenticated users to update technician_holidays"
    ON technician_holidays FOR UPDATE
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete technician_holidays" ON technician_holidays;
CREATE POLICY "Allow authenticated users to delete technician_holidays"
    ON technician_holidays FOR DELETE
    USING (true);

