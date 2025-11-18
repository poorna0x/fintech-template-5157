-- Fix RLS Policy for Technician Payments
-- This updates the trigger function to use SECURITY DEFINER so it can bypass RLS
-- when creating payment records automatically

-- Drop and recreate the function with SECURITY DEFINER
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

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_create_technician_payment ON jobs;
CREATE TRIGGER trigger_create_technician_payment
    AFTER UPDATE OF status ON jobs
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED')
    EXECUTE FUNCTION create_technician_payment_on_job_completion();

