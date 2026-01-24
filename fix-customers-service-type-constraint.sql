-- Fix customers_service_type_check to allow RO+SOFTENER and other combos
-- The app uses mapServiceTypesToDbValue() which returns RO_SOFTENER, RO_AC, SOFTENER_AC, ALL_SERVICES.
-- Run this in Supabase SQL Editor.

-- Drop existing constraint
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_service_type_check;

-- Add updated constraint: single types + MULTIPLE + composite types (RO_SOFTENER, etc.)
ALTER TABLE customers ADD CONSTRAINT customers_service_type_check CHECK (
  service_type::text = ANY (ARRAY[
    'RO'::text, 'SOFTENER'::text, 'AC'::text, 'APPLIANCE'::text, 'MULTIPLE'::text,
    'RO_SOFTENER'::text, 'RO_AC'::text, 'SOFTENER_AC'::text, 'ALL_SERVICES'::text
  ])
);
