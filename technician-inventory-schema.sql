-- Create technician_inventory table
-- This table tracks inventory items assigned to each technician
-- Run this in Supabase SQL Editor

-- Step 1: Create the technician_inventory table
CREATE TABLE IF NOT EXISTS public.technician_inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a technician can only have one entry per inventory item
    UNIQUE(technician_id, inventory_id)
);

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_technician_inventory_technician_id ON public.technician_inventory(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_inventory_inventory_id ON public.technician_inventory(inventory_id);
CREATE INDEX IF NOT EXISTS idx_technician_inventory_created_at ON public.technician_inventory(created_at DESC);

-- Step 3: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_technician_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_technician_inventory_updated_at_trigger ON public.technician_inventory;
CREATE TRIGGER update_technician_inventory_updated_at_trigger
    BEFORE UPDATE ON public.technician_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_technician_inventory_updated_at();

-- Step 5: Enable Row Level Security
ALTER TABLE public.technician_inventory ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all users to read technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_inventory" ON public.technician_inventory;

-- Step 7: Create RLS policies (matching inventory table pattern)
-- SELECT policy: Allow all users to read technician inventory
CREATE POLICY "Allow all users to read technician_inventory"
ON public.technician_inventory FOR SELECT
TO public
USING (true);

-- INSERT policy: Allow all users to insert technician inventory
CREATE POLICY "Allow all users to insert technician_inventory"
ON public.technician_inventory FOR INSERT
TO public
WITH CHECK (true);

-- UPDATE policy: Allow all users to update technician inventory
CREATE POLICY "Allow all users to update technician_inventory"
ON public.technician_inventory FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- DELETE policy: Allow all users to delete technician inventory
CREATE POLICY "Allow all users to delete technician_inventory"
ON public.technician_inventory FOR DELETE
TO public
USING (true);

-- Step 8: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_inventory TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Verify the table and policies:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'technician_inventory';

-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'technician_inventory'
-- ORDER BY policyname;
