-- Preflight check: run the optimization migration in a transaction, then ROLLBACK.
-- If this finishes with no errors, the real migration should apply cleanly.
-- No changes are committed (everything is rolled back).
--
-- Run from project root:
--   psql "$DATABASE_URL" -f supabase/scripts/preflight_rls_migration.sql

\set ON_ERROR_STOP on

BEGIN;

-- Same as 20250303000000_rls_initplan_and_duplicate_index.sql (run then roll back)
\ir ../migrations/20250303000000_rls_initplan_and_duplicate_index.sql

ROLLBACK;

-- If we get here, the migration ran without errors
\echo 'Preflight OK: migration would apply cleanly. No changes were made (rolled back).'
