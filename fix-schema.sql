-- Fix for missing columns in customers table
-- Run this if you already have tables but missing columns

-- First, let's check what columns exist
-- You can run this to see current structure:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers';

-- Add missing columns to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS customer_since TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add missing columns to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS before_photos JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS after_photos JSONB DEFAULT '[]';

-- If you need to create the entire schema from scratch, use the main supabase-schema.sql file
