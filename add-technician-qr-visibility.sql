-- Add visible_qr_codes field to technicians table
-- This field stores an array of QR code IDs that should be visible to the technician
-- Empty array = show none
-- ["all"] = show all QR codes
-- ["common_123", "technician_456"] = show only specific QR codes

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS visible_qr_codes JSONB DEFAULT '[]'::jsonb;

-- Add comment to explain the field
COMMENT ON COLUMN technicians.visible_qr_codes IS 'Array of QR code IDs visible to this technician. Empty array = none, ["all"] = all, or specific IDs like ["common_123", "technician_456"]';

