-- Cashfree Payment Integration Schema Updates
-- This file contains the SQL schema updates for Cashfree payment integration

-- Add new payment methods to the existing jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(20) DEFAULT 'CASH' CHECK (payment_gateway IN ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CASHFREE')),
ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_signature TEXT,
ADD COLUMN IF NOT EXISTS payment_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PENDING', 'SUCCESS', 'FAILED')),
ADD COLUMN IF NOT EXISTS refund_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS refund_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_webhook_data JSONB;

-- Create payments table for detailed payment tracking
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    order_id VARCHAR(255) NOT NULL UNIQUE,
    payment_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_method VARCHAR(50),
    payment_gateway VARCHAR(20) DEFAULT 'CASHFREE',
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED')),
    payment_time TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    payment_signature TEXT,
    webhook_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create refunds table for refund tracking
CREATE TABLE IF NOT EXISTS refunds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    refund_id VARCHAR(255) NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    refund_time TIMESTAMP WITH TIME ZONE,
    webhook_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment webhooks table for webhook tracking
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    webhook_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(50) NOT NULL,
    order_id VARCHAR(255),
    payment_id VARCHAR(255),
    webhook_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_job_id ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_refund_id ON refunds(refund_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_order_id ON payment_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_processed ON payment_webhooks(processed);

-- Create function to update payment status
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update job payment status when payment status changes
    IF NEW.status = 'SUCCESS' THEN
        UPDATE jobs 
        SET 
            payment_status = 'PAID',
            payment_method = NEW.payment_method,
            payment_amount = NEW.amount,
            payment_id = NEW.payment_id,
            payment_time = NEW.payment_time,
            payment_gateway = NEW.payment_gateway,
            updated_at = NOW()
        WHERE id = NEW.job_id;
    ELSIF NEW.status = 'FAILED' THEN
        UPDATE jobs 
        SET 
            payment_status = 'PENDING',
            updated_at = NOW()
        WHERE id = NEW.job_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment status updates
DROP TRIGGER IF EXISTS trigger_update_payment_status ON payments;
CREATE TRIGGER trigger_update_payment_status
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_status();

-- Create function to update refund status
CREATE OR REPLACE FUNCTION update_refund_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update job refund status when refund status changes
    IF NEW.status = 'SUCCESS' THEN
        UPDATE jobs 
        SET 
            refund_amount = NEW.amount,
            refund_status = 'SUCCESS',
            refund_id = NEW.refund_id,
            refund_time = NEW.refund_time,
            updated_at = NOW()
        WHERE id = (SELECT job_id FROM payments WHERE id = NEW.payment_id);
    ELSIF NEW.status = 'FAILED' THEN
        UPDATE jobs 
        SET 
            refund_status = 'FAILED',
            updated_at = NOW()
        WHERE id = (SELECT job_id FROM payments WHERE id = NEW.payment_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for refund status updates
DROP TRIGGER IF EXISTS trigger_update_refund_status ON refunds;
CREATE TRIGGER trigger_update_refund_status
    AFTER UPDATE OF status ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_refund_status();

-- Create function to generate payment analytics
CREATE OR REPLACE FUNCTION get_payment_analytics(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'totalOrders', COUNT(DISTINCT j.id),
        'successfulPayments', COUNT(DISTINCT CASE WHEN p.status = 'SUCCESS' THEN p.id END),
        'failedPayments', COUNT(DISTINCT CASE WHEN p.status = 'FAILED' THEN p.id END),
        'pendingPayments', COUNT(DISTINCT CASE WHEN p.status = 'PENDING' THEN p.id END),
        'totalAmount', COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount ELSE 0 END), 0),
        'averageOrderValue', COALESCE(AVG(CASE WHEN p.status = 'SUCCESS' THEN p.amount END), 0),
        'paymentMethodBreakdown', (
            SELECT json_object_agg(
                p.payment_method, 
                json_build_object(
                    'count', COUNT(*),
                    'amount', SUM(p.amount)
                )
            )
            FROM payments p
            WHERE p.status = 'SUCCESS' 
            AND p.created_at >= start_date 
            AND p.created_at <= end_date
        ),
        'dailyStats', (
            SELECT json_agg(
                json_build_object(
                    'date', DATE(p.created_at),
                    'orders', COUNT(DISTINCT p.id),
                    'amount', SUM(p.amount)
                )
            )
            FROM payments p
            WHERE p.status = 'SUCCESS'
            AND p.created_at >= start_date 
            AND p.created_at <= end_date
            GROUP BY DATE(p.created_at)
            ORDER BY DATE(p.created_at)
        )
    ) INTO result
    FROM jobs j
    LEFT JOIN payments p ON j.id = p.job_id
    WHERE j.created_at >= start_date 
    AND j.created_at <= end_date;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Insert sample payment data for testing
INSERT INTO payments (job_id, order_id, payment_id, amount, currency, payment_method, payment_gateway, status, payment_time)
SELECT 
    j.id,
    'RO_' || j.job_number || '_' || EXTRACT(EPOCH FROM NOW())::bigint,
    'cf_pay_' || j.id,
    j.estimated_cost,
    'INR',
    'upi',
    'CASHFREE',
    CASE 
        WHEN j.status = 'COMPLETED' THEN 'SUCCESS'
        ELSE 'PENDING'
    END,
    CASE 
        WHEN j.status = 'COMPLETED' THEN NOW() - INTERVAL '1 day'
        ELSE NULL
    END
FROM jobs j
WHERE j.estimated_cost > 0
LIMIT 5;

-- Update jobs table with payment information
UPDATE jobs 
SET 
    payment_gateway = 'CASHFREE',
    payment_id = 'cf_pay_' || id,
    payment_time = CASE 
        WHEN status = 'COMPLETED' THEN NOW() - INTERVAL '1 day'
        ELSE NULL
    END,
    payment_status = CASE 
        WHEN status = 'COMPLETED' THEN 'PAID'
        ELSE 'PENDING'
    END,
    payment_method = 'UPI',
    payment_amount = estimated_cost
WHERE estimated_cost > 0
AND id IN (SELECT job_id FROM payments);

-- Create view for payment analytics
CREATE OR REPLACE VIEW payment_analytics_view AS
SELECT 
    DATE(p.created_at) as date,
    COUNT(DISTINCT p.id) as total_payments,
    COUNT(DISTINCT CASE WHEN p.status = 'SUCCESS' THEN p.id END) as successful_payments,
    COUNT(DISTINCT CASE WHEN p.status = 'FAILED' THEN p.id END) as failed_payments,
    COUNT(DISTINCT CASE WHEN p.status = 'PENDING' THEN p.id END) as pending_payments,
    SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount ELSE 0 END) as total_amount,
    AVG(CASE WHEN p.status = 'SUCCESS' THEN p.amount END) as average_amount,
    p.payment_method,
    p.payment_gateway
FROM payments p
GROUP BY DATE(p.created_at), p.payment_method, p.payment_gateway
ORDER BY date DESC;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON refunds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON payment_webhooks TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_analytics TO authenticated;
GRANT SELECT ON payment_analytics_view TO authenticated;
