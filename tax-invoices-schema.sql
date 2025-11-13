-- Tax Invoices Table Schema
-- This table stores all tax invoices generated in the system

CREATE TABLE IF NOT EXISTS tax_invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE, -- Format: INV-001, INV-002, etc.
    invoice_date DATE NOT NULL,
    invoice_type VARCHAR(3) NOT NULL CHECK (invoice_type IN ('B2B', 'B2C')),
    
    -- Customer Information
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_address JSONB NOT NULL, -- Full address object
    customer_phone VARCHAR(15),
    customer_email VARCHAR(255),
    customer_gstin VARCHAR(15),
    
    -- Company Information (stored as JSONB for flexibility)
    company_info JSONB NOT NULL,
    
    -- Invoice Items (stored as JSONB array)
    items JSONB NOT NULL DEFAULT '[]',
    
    -- GST Information
    place_of_supply VARCHAR(100),
    place_of_supply_code VARCHAR(10),
    is_intra_state BOOLEAN DEFAULT false,
    reverse_charge BOOLEAN DEFAULT false,
    e_way_bill_no VARCHAR(50),
    transport_mode VARCHAR(50),
    vehicle_no VARCHAR(50),
    
    -- Financial Summary
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
    service_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
    cgst DECIMAL(10,2) NOT NULL DEFAULT 0,
    sgst DECIMAL(10,2) NOT NULL DEFAULT 0,
    igst DECIMAL(10,2) NOT NULL DEFAULT 0,
    round_off DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- Additional Details (stored as JSONB)
    gst_breakup JSONB, -- GST breakdown by rate
    invoice_details JSONB, -- PO number, payment due date, delivery address, etc.
    bank_details JSONB, -- Bank information
    
    -- Additional Information
    notes JSONB DEFAULT '[]', -- Array of notes
    terms TEXT,
    validity_note TEXT,
    
    -- Related Job/Service
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    service_type VARCHAR(20),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on invoice_number for fast lookups
CREATE INDEX IF NOT EXISTS idx_tax_invoices_invoice_number ON tax_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_customer_id ON tax_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_invoice_date ON tax_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_invoice_type ON tax_invoices(invoice_type);

-- Create function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    last_number VARCHAR(50);
    next_num INTEGER := 1;
    result VARCHAR(50);
BEGIN
    -- Get the last invoice number
    SELECT invoice_number INTO last_number
    FROM tax_invoices
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Extract number from format INV-001
    IF last_number IS NOT NULL THEN
        next_num := CAST(SUBSTRING(last_number FROM 'INV-(\d+)') AS INTEGER) + 1;
    END IF;
    
    -- Format as INV-XXX
    result := 'INV-' || LPAD(next_num::TEXT, 3, '0');
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read all tax invoices
CREATE POLICY "Allow authenticated users to read tax invoices"
ON tax_invoices FOR SELECT
TO authenticated
USING (true);

-- Create policy to allow authenticated users to insert tax invoices
CREATE POLICY "Allow authenticated users to insert tax invoices"
ON tax_invoices FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy to allow authenticated users to update tax invoices
CREATE POLICY "Allow authenticated users to update tax invoices"
ON tax_invoices FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

