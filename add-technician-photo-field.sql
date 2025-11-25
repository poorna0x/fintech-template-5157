-- Add photo field to technicians table for ID cards
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'technicians' AND column_name = 'photo'
    ) THEN
        ALTER TABLE technicians ADD COLUMN photo TEXT;
    END IF;
END $$;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_technicians_photo ON technicians(photo) WHERE photo IS NOT NULL;

