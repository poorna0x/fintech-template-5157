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

-- 4) Quick count: policies per table
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
