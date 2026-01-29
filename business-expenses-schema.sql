-- Business Expenses Schema
-- This table tracks general business expenses (not tied to specific technicians)

CREATE TABLE IF NOT EXISTS business_expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Expense Details
    amount DECIMAL(10,2) NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(50), -- e.g., 'OFFICE', 'MARKETING', 'UTILITIES', 'RENT', 'OTHER'
    
    -- Additional Info
    receipt_url TEXT, -- URL to receipt/image
    notes TEXT,
    added_by UUID, -- Admin user ID who added the expense
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_business_expenses_date ON business_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_business_expenses_updated_at ON business_expenses;
CREATE TRIGGER update_business_expenses_updated_at
    BEFORE UPDATE ON business_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (matching pattern from other tables)
DROP POLICY IF EXISTS "Allow public read access" ON business_expenses;
CREATE POLICY "Allow public read access" ON business_expenses
    FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON business_expenses;
CREATE POLICY "Allow public insert access" ON business_expenses
    FOR INSERT
    TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access" ON business_expenses;
CREATE POLICY "Allow public update access" ON business_expenses
    FOR UPDATE
    TO public
    USING (true);

DROP POLICY IF EXISTS "Allow public delete access" ON business_expenses;
CREATE POLICY "Allow public delete access" ON business_expenses
    FOR DELETE
    TO public
    USING (true);

-- Grant permissions
GRANT ALL ON business_expenses TO authenticated;
GRANT ALL ON business_expenses TO anon;
GRANT ALL ON business_expenses TO service_role;
