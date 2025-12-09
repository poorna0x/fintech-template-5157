-- Allow zero amounts in technician payments
-- This updates the trigger function to create payment records even when bill_amount is ₹0

-- Drop and recreate the trigger function to allow zero amounts
CREATE OR REPLACE FUNCTION public.create_technician_payment_on_job_completion() 
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only create payment if job status changed to COMPLETED
    -- and has assigned technician (removed the > 0 check to allow zero amounts)
    IF NEW.status = 'COMPLETED' 
       AND OLD.status != 'COMPLETED'
       AND NEW.assigned_technician_id IS NOT NULL THEN
        
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
$$;

-- Update the backfill function to also allow zero amounts
CREATE OR REPLACE FUNCTION public.backfill_technician_payments() 
RETURNS TABLE(created_count integer, skipped_count integer, error_count integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    job_record RECORD;
    created_count INTEGER := 0;
    skipped_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    -- Loop through all completed jobs that have assigned technicians (removed > 0 check)
    FOR job_record IN 
        SELECT 
            j.id as job_id,
            j.assigned_technician_id,
            j.payment_amount,
            j.actual_cost,
            j.status
        FROM jobs j
        WHERE j.status = 'COMPLETED'
          AND j.assigned_technician_id IS NOT NULL
    LOOP
        BEGIN
            -- Check if payment record already exists
            IF NOT EXISTS (
                SELECT 1 FROM technician_payments 
                WHERE job_id = job_record.job_id
            ) THEN
                -- Create payment record (even if amount is 0)
                INSERT INTO technician_payments (
                    technician_id,
                    job_id,
                    bill_amount,
                    commission_percentage,
                    commission_amount,
                    payment_status
                ) VALUES (
                    job_record.assigned_technician_id,
                    job_record.job_id,
                    COALESCE(job_record.payment_amount, job_record.actual_cost, 0),
                    10.00,
                    COALESCE(job_record.payment_amount, job_record.actual_cost, 0) * 0.10,
                    'PENDING'
                );
                created_count := created_count + 1;
            ELSE
                skipped_count := skipped_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            -- Log error but continue processing
            RAISE WARNING 'Error creating payment for job %: %', job_record.job_id, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT created_count, skipped_count, error_count;
END;
$$;

