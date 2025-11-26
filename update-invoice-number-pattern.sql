-- Update invoice number generation to include month/year pattern
-- Format: INV-YYYY-MM-001, INV-YYYY-MM-002, etc.

CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    current_year INTEGER;
    current_month INTEGER;
    year_month_prefix VARCHAR(10);
    last_number VARCHAR(50);
    last_prefix VARCHAR(10);
    next_num INTEGER := 1;
    result VARCHAR(50);
BEGIN
    -- Get current year and month
    current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    current_month := EXTRACT(MONTH FROM CURRENT_DATE);
    year_month_prefix := 'INV-' || current_year || '-' || LPAD(current_month::TEXT, 2, '0');
    
    -- Get the last invoice number for this month/year
    SELECT invoice_number INTO last_number
    FROM tax_invoices
    WHERE invoice_number LIKE year_month_prefix || '-%'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If no invoice exists for this month/year, start from 001
    IF last_number IS NOT NULL THEN
        -- Extract the sequence number (last 3 digits after the last dash)
        -- Pattern: INV-YYYY-MM-XXX, extract XXX
        next_num := CAST(SUBSTRING(last_number FROM '([0-9]{3})$') AS INTEGER) + 1;
    END IF;
    
    -- Format as INV-YYYY-MM-XXX
    result := year_month_prefix || '-' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

