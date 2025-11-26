-- Call History Table Schema
-- This table tracks customer calls and messages to avoid duplicate contacts

CREATE TABLE IF NOT EXISTS call_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Contact information
    contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('CALL', 'WHATSAPP', 'SMS', 'EMAIL')),
    contact_method VARCHAR(50), -- e.g., 'phone', 'whatsapp', 'sms', 'email'
    
    -- Contact details
    phone_number VARCHAR(15),
    message_sent TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY')),
    notes TEXT,
    
    -- Timestamps
    contacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_call_history_customer_id ON call_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_history_contacted_at ON call_history(contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_customer_contacted ON call_history(customer_id, contacted_at DESC);

-- Enable RLS
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users to read/write)
CREATE POLICY "Allow authenticated users to read call history"
    ON call_history FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert call history"
    ON call_history FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update call history"
    ON call_history FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_call_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_call_history_updated_at
    BEFORE UPDATE ON call_history
    FOR EACH ROW
    EXECUTE FUNCTION update_call_history_updated_at();

