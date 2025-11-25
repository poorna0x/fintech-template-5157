-- Allow public access to technician ID card page
-- This allows anyone to view technician ID cards by scanning QR codes

-- Create policy to allow public (unauthenticated) users to read technician data for ID cards
CREATE POLICY "Allow public to read technician ID card data"
ON technicians FOR SELECT
TO anon, authenticated
USING (true);

-- Note: This policy allows reading basic technician info (id, full_name, employee_id, phone, email, photo, status)
-- which is needed for the ID card display. More sensitive data like salary, performance metrics, etc.
-- should not be exposed in the ID card page query.

