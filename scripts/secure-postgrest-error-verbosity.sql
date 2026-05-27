-- MEDIUM: Stop PostgREST from leaking schema via error hint/details (PGRST205, PGRST202, etc.).
-- Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
-- Scanner finding: GET /rest/v1/profiles returns hint "Perhaps you meant public.reminders"
-- and message text naming tables in the public schema. This is PostgREST default verbosity.
--
-- After this script:
--   • hint + details are omitted (client_error_verbosity = minimal).
--   • OpenAPI root discovery is disabled (openapi_mode = ignore-privileges).
--   • message may still say "Could not find the table 'public.X' in the schema cache"
--     (PostgREST has no setting to strip that). RLS + anon revokes limit real data access;
--     the worst enumeration vector ("Perhaps you meant …") is removed.
--
-- Verify:
--   bash scripts/verify-postgrest-error-verbosity.sh
-- Or:
--   curl -s 'https://YOUR_PROJECT.supabase.co/rest/v1/profiles' \
--     -H "apikey: ANON" -H "Authorization: Bearer ANON"
-- Expect JSON with code + message only — NO "hint" key.

-- PostgREST connects as the authenticator role; settings apply to the Data API.
ALTER ROLE authenticator SET pgrst.client_error_verbosity = 'minimal';
ALTER ROLE authenticator SET pgrst.openapi_mode = 'ignore-privileges';

-- Reload PostgREST config without restarting the project.
NOTIFY pgrst, 'reload config';

-- Optional: confirm settings (run separately if you want to audit)
-- SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'authenticator';
