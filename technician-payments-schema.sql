-- Technician Payments Schema
-- This table tracks payments made to technicians based on their completed jobs
-- Technicians earn 10% commission on each completed job's bill amount

CREATE TABLE IF NOT EXISTS technician_payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    
    -- Payment Details
    bill_amount DECIMAL(10,2) NOT NULL, -- Total bill amount for the job
    commission_percentage DECIMAL(5,2) DEFAULT 10.00, -- Commission percentage (default 10%)
    commission_amount DECIMAL(10,2) NOT NULL, -- Calculated commission (bill_amount * commission_percentage / 100)
    
    -- Payment Status
    payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'CANCELLED')),
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(20) CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE')),
    payment_reference TEXT, -- Transaction reference number
    
    -- Additional Info
    notes TEXT,
    paid_by UUID, -- Admin user ID who processed the payment
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_technician_payments_technician_id ON technician_payments(technician_id);
CREATE INDEX IF NOT EXISTS idx_technician_payments_job_id ON technician_payments(job_id);
CREATE INDEX IF NOT EXISTS idx_technician_payments_status ON technician_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_technician_payments_payment_date ON technician_payments(payment_date);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_technician_payments_updated_at ON technician_payments;
CREATE TRIGGER update_technician_payments_updated_at 
    BEFORE UPDATE ON technician_payments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create payment record when job is completed
-- SECURITY DEFINER allows the function to bypass RLS policies
CREATE OR REPLACE FUNCTION create_technician_payment_on_job_completion()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only create payment if job status changed to COMPLETED
    -- and has assigned technician and payment amount
    IF NEW.status = 'COMPLETED' 
       AND OLD.status != 'COMPLETED'
       AND NEW.assigned_technician_id IS NOT NULL
       AND (NEW.payment_amount > 0 OR NEW.actual_cost > 0) THEN
        
        -- Check if payment record already exists
        IF NOT EXISTS (
            SELECT 1 FROM technician_payments 
            WHERE job_id = NEW.id
        ) THEN
            INSERT INTO technician_payments (
                technician_id,
                job_id,
                bill_amount,
                commission_percentage,
                commission_amount,
                payment_status
            ) VALUES (
                NEW.assigned_technician_id,
                NEW.id,
                COALESCE(NEW.payment_amount, NEW.actual_cost, 0),
                10.00,
                COALESCE(NEW.payment_amount, NEW.actual_cost, 0) * 0.10,
                'PENDING'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic payment creation
DROP TRIGGER IF EXISTS trigger_create_technician_payment ON jobs;
CREATE TRIGGER trigger_create_technician_payment
    AFTER UPDATE OF status ON jobs
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED')
    EXECUTE FUNCTION create_technician_payment_on_job_completion();

-- Enable RLS
ALTER TABLE technician_payments ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to read technician_payments" 
    ON technician_payments FOR SELECT 
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to insert technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to insert technician_payments" 
    ON technician_payments FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to update technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to update technician_payments" 
    ON technician_payments FOR UPDATE 
    USING (auth.role() = 'authenticated');

