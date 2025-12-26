-- SQL Queries to Check All Tables in Database
-- Run these queries in Supabase SQL Editor to inspect your database

-- 1. List all tables in the public schema
SELECT 
    table_schema,
    table_name,
    table_type
FROM 
    information_schema.tables
WHERE 
    table_schema = 'public'
    AND table_type = 'BASE TABLE'
ORDER BY 
    table_name;

-- 2. List all tables with row counts (may be slow on large tables)
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) AS column_count
FROM 
    pg_tables
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename;

-- 3. Get detailed information about all tables with row counts
-- Note: This query may take time on large tables
SELECT 
    t.table_schema,
    t.table_name,
    (SELECT COUNT(*) 
     FROM information_schema.columns 
     WHERE table_schema = t.table_schema 
     AND table_name = t.table_name) AS column_count,
    pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))) AS total_size,
    pg_size_pretty(pg_relation_size(quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))) AS table_size
FROM 
    information_schema.tables t
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY 
    t.table_name;

-- 4. Get row counts for all tables (more accurate but slower)
-- This will show actual row counts for each table
DO $$
DECLARE
    r RECORD;
    row_count BIGINT;
BEGIN
    RAISE NOTICE 'Table Name | Row Count';
    RAISE NOTICE '-----------|----------';
    
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', r.tablename) INTO row_count;
        RAISE NOTICE '% | %', r.tablename, row_count;
    END LOOP;
END $$;

-- 5. List all columns for all tables (detailed schema information)
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM 
    information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY 
    t.table_name,
    c.ordinal_position;

-- 6. Quick check: List tables and their approximate row counts (faster)
SELECT 
    schemaname,
    tablename,
    n_live_tup AS approximate_row_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size
FROM 
    pg_stat_user_tables
ORDER BY 
    tablename;

-- 7. Check for tables with RLS (Row Level Security) enabled
SELECT 
    tablename,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = t.tablename
        ) THEN 'Yes (has policies)'
        WHEN (
            SELECT relrowsecurity 
            FROM pg_class 
            WHERE relname = t.tablename
        ) THEN 'Yes (no policies)'
        ELSE 'No'
    END AS rls_enabled
FROM 
    pg_tables t
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename;






























