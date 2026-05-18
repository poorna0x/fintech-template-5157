-- MEDIUM: Stop PostgREST from leaking schema via error "hint" / "details" (PGRST205, etc.).
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Supabase uses the `authenticator` role for Data API (PostgREST). After this:
--   - Errors return only `code` + `message` (no table/function name suggestions in `hint`).
--   - OpenAPI root discovery is disabled (404 on /rest/v1/ without a resource path).
--
-- Verify (anon key):
--   curl -s 'https://YOUR_PROJECT.supabase.co/rest/v1/fake_table_xyz' \
--     -H "apikey: ANON" -H "Authorization: Bearer ANON"
-- Expect JSON without "hint": "Perhaps you meant ..."

ALTER ROLE authenticator SET pgrst.client_error_verbosity = 'minimal';
ALTER ROLE authenticator SET pgrst.openapi_mode = 'ignore-privileges';

NOTIFY pgrst, 'reload config';
