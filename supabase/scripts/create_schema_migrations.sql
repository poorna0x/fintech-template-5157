-- Create the migration tracking schema/table that the Supabase dashboard expects.
-- Run this once in Supabase Dashboard → SQL Editor if you see:
--   relation "supabase_migrations.schema_migrations" does not exist

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name    text,
  statements text[]
);

-- Optional: backfill from your known migrations so the dashboard shows them
-- INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
--   ('20250227000000', 'add_amc_service_period_months'),
--   ('20250303000000', 'rls_initplan_and_duplicate_index'),
--   ('20250303100000', 'lock_writes_to_authenticated_only')
-- ON CONFLICT (version) DO NOTHING;
