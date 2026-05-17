-- Run in Supabase SQL Editor after applying secure-* RLS scripts.
-- Review output: no public tables should have relrowsecurity = false (except intentional exceptions).
-- No policies should grant {anon} SELECT/INSERT/UPDATE/DELETE on sensitive tables.

-- 1) Tables in public schema without RLS
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- 2) Policies that include anon role (should be NONE on PII tables; booking uses RPCs)
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text ILIKE '%anon%'
ORDER BY tablename, policyname;

-- 3) Legacy permissive policy names still present
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    policyname LIKE 'allow_all_%'
    OR policyname LIKE 'Allow %'
    OR policyname LIKE 'Allow anon%'
    OR policyname LIKE 'Allow authenticated%'
      OR policyname LIKE 'todos_%_anon'
      OR policyname LIKE '%_policy'
  )
ORDER BY tablename, policyname;

-- 4) jobs must not be open to anon (scanner: /rest/v1/jobs)
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'jobs'
  AND (
    roles::text ILIKE '%anon%'
    OR qual = 'true'
    OR with_check = 'true'
  );

-- 5) technicians: no open policies; anon only ID-card policy
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'technicians'
  AND (
    qual = 'true'
    OR with_check = 'true'
    OR (roles::text ILIKE '%anon%' AND policyname <> 'technicians_public_id_card')
  );

-- 6) anon column grants on technicians (must NOT include current_location, salary, password)
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'technicians'
  AND grantee = 'anon'
ORDER BY column_name;

-- 7) Quick count: policies per table
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
