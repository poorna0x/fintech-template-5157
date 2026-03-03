-- Safe apply: run the optimization migration inside a single transaction.
-- - If every statement succeeds -> COMMIT (changes are kept).
-- - If any statement fails -> psql exits, transaction is rolled back (nothing changes).
--
-- Run from project root:
--   psql "$DATABASE_URL" -f supabase/scripts/apply_rls_migration_safe.sql

\set ON_ERROR_STOP on

BEGIN;

\ir ../migrations/20250303000000_rls_initplan_and_duplicate_index.sql

COMMIT;

\echo 'Migration applied successfully. DB is updated.'
