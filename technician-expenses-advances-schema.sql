-- Technician Expenses and Advances Schema
-- This file creates tables to track company expenses and advances for technicians

-- Create technician_expenses table
CREATE TABLE IF NOT EXISTS technician_expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    
    -- Expense Details
    amount DECIMAL(10,2) NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(50), -- e.g., 'FUEL', 'TOOLS', 'PARTS', 'OTHER'
    
    -- Additional Info
    receipt_url TEXT, -- URL to receipt/image
    notes TEXT,
    added_by UUID, -- Admin user ID who added the expense
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create technician_advances table
CREATE TABLE IF NOT EXISTS technician_advances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    
    -- Advance Details
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')),
    payment_reference TEXT,
    
    -- Additional Info
    notes TEXT,
    paid_by UUID, -- Admin user ID who processed the advance
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_technician_expenses_technician_id ON technician_expenses(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_expenses_date ON technician_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_technician_advances_technician_id ON technician_advances(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_advances_date ON technician_advances(advance_date);

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_technician_expenses_updated_at ON technician_expenses;
CREATE TRIGGER update_technician_expenses_updated_at 
    BEFORE UPDATE ON technician_expenses 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_technician_advances_updated_at ON technician_advances;
CREATE TRIGGER update_technician_advances_updated_at 
    BEFORE UPDATE ON technician_advances 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE technician_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_advances ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users (allow all operations)
DROP POLICY IF EXISTS "Allow authenticated users to read technician_expenses" ON technician_expenses;
CREATE POLICY "Allow authenticated users to read technician_expenses" 
    ON technician_expenses FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_expenses" ON technician_expenses;
CREATE POLICY "Allow authenticated users to insert technician_expenses" 
    ON technician_expenses FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_expenses" ON technician_expenses;
CREATE POLICY "Allow authenticated users to update technician_expenses" 
    ON technician_expenses FOR UPDATE 
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete technician_expenses" ON technician_expenses;
CREATE POLICY "Allow authenticated users to delete technician_expenses" 
    ON technician_expenses FOR DELETE 
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read technician_advances" ON technician_advances;
CREATE POLICY "Allow authenticated users to read technician_advances" 
    ON technician_advances FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_advances" ON technician_advances;
CREATE POLICY "Allow authenticated users to insert technician_advances" 
    ON technician_advances FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update technician_advances" ON technician_advances;
CREATE POLICY "Allow authenticated users to update technician_advances" 
    ON technician_advances FOR UPDATE 
    USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete technician_advances" ON technician_advances;
CREATE POLICY "Allow authenticated users to delete technician_advances" 
    ON technician_advances FOR DELETE 
    USING (true);

