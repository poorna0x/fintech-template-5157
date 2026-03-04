-- Inventory Bundles: predefined sets of parts for quick add to jobs
-- Run in Supabase SQL Editor

-- Bundles (name only; items in separate table)
CREATE TABLE IF NOT EXISTS public.inventory_bundles (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_bundles_name ON public.inventory_bundles(name);

-- Bundle items (inventory_id + quantity per bundle)
CREATE TABLE IF NOT EXISTS public.inventory_bundle_items (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    bundle_id UUID NOT NULL REFERENCES public.inventory_bundles(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(bundle_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_bundle_id ON public.inventory_bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_inventory_bundle_items_inventory_id ON public.inventory_bundle_items(inventory_id);

-- RLS
ALTER TABLE public.inventory_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_bundle_items ENABLE ROW LEVEL SECURITY;

-- Use TO public so both authenticated and anon can access (matches inventory fix)
DROP POLICY IF EXISTS "Allow authenticated read inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow authenticated insert inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow authenticated update inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow authenticated delete inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow all users to read inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow all users to insert inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow all users to update inventory_bundles" ON public.inventory_bundles;
DROP POLICY IF EXISTS "Allow all users to delete inventory_bundles" ON public.inventory_bundles;

CREATE POLICY "Allow all users to read inventory_bundles" ON public.inventory_bundles FOR SELECT TO public USING (true);
CREATE POLICY "Allow all users to insert inventory_bundles" ON public.inventory_bundles FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all users to update inventory_bundles" ON public.inventory_bundles FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all users to delete inventory_bundles" ON public.inventory_bundles FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Allow authenticated read inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow authenticated insert inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow authenticated update inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow authenticated delete inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow all users to read inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow all users to insert inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow all users to update inventory_bundle_items" ON public.inventory_bundle_items;
DROP POLICY IF EXISTS "Allow all users to delete inventory_bundle_items" ON public.inventory_bundle_items;

CREATE POLICY "Allow all users to read inventory_bundle_items" ON public.inventory_bundle_items FOR SELECT TO public USING (true);
CREATE POLICY "Allow all users to insert inventory_bundle_items" ON public.inventory_bundle_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all users to update inventory_bundle_items" ON public.inventory_bundle_items FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all users to delete inventory_bundle_items" ON public.inventory_bundle_items FOR DELETE TO public USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_bundles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_bundles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_bundle_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_bundle_items TO anon;

-- updated_at trigger for inventory_bundles
CREATE OR REPLACE FUNCTION update_inventory_bundles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_bundles_updated_at_trigger ON public.inventory_bundles;
CREATE TRIGGER update_inventory_bundles_updated_at_trigger
    BEFORE UPDATE ON public.inventory_bundles
    FOR EACH ROW EXECUTE FUNCTION update_inventory_bundles_updated_at();
