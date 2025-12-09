-- Add public read policy for parts_inventory table
-- This allows anonymous users to view spare parts and MRP on the public website

CREATE POLICY "Allow public to read parts inventory" 
ON public.parts_inventory 
FOR SELECT 
TO authenticated, anon 
USING (is_active = true);

-- Note: This policy only shows active parts (is_active = true)
-- Inactive parts will only be visible to authenticated admin users


