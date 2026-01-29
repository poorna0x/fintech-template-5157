-- Fix RLS policies for inventory table
-- This ensures authenticated users can access the inventory table

-- First, ensure the table exists (run inventory-schema.sql first if needed)
-- If the table doesn't exist, create it:
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_inventory_code ON public.inventory(code);
CREATE INDEX IF NOT EXISTS idx_inventory_product_name ON public.inventory(product_name);

-- Enable RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies (catch any variations)
DROP POLICY IF EXISTS "Allow authenticated users to read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to delete inventory" ON public.inventory;

-- Create policies that allow authenticated users
-- Using explicit auth.role() check pattern (more reliable)
-- Allow authenticated users to read all inventory
CREATE POLICY "Allow authenticated users to read inventory"
ON public.inventory FOR SELECT
TO authenticated
USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert inventory
-- This is the critical one - using explicit auth check
CREATE POLICY "Allow authenticated users to insert inventory"
ON public.inventory FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update inventory
CREATE POLICY "Allow authenticated users to update inventory"
ON public.inventory FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to delete inventory
CREATE POLICY "Allow authenticated users to delete inventory"
ON public.inventory FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;

-- Create function to update updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_inventory_updated_at_trigger ON public.inventory;
CREATE TRIGGER update_inventory_updated_at_trigger
    BEFORE UPDATE ON public.inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_updated_at();
