-- Other Expenses Schema
-- Tracks other/miscellaneous expenses (separate from business expenses)

CREATE TABLE IF NOT EXISTS other_expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    amount DECIMAL(10,2) NOT NULL,
    description TEXT NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(50),

    receipt_url TEXT,
    notes TEXT,
    added_by UUID,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_other_expenses_date ON other_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_other_expenses_category ON other_expenses(category);

DROP TRIGGER IF EXISTS update_other_expenses_updated_at ON other_expenses;
CREATE TRIGGER update_other_expenses_updated_at
    BEFORE UPDATE ON other_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE other_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON other_expenses;
CREATE POLICY "Allow public read access" ON other_expenses FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Allow public insert access" ON other_expenses;
CREATE POLICY "Allow public insert access" ON other_expenses FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update access" ON other_expenses;
CREATE POLICY "Allow public update access" ON other_expenses FOR UPDATE TO public USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete access" ON other_expenses;
CREATE POLICY "Allow public delete access" ON other_expenses FOR DELETE TO public USING (true);

GRANT ALL ON other_expenses TO authenticated;
GRANT ALL ON other_expenses TO anon;
GRANT ALL ON other_expenses TO service_role;
