-- Admin DB storage overview + per-table column byte estimates.
-- Admin JWT (is_admin_user) or service_role (Netlify).
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.admin_db_storage_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_bytes bigint;
  v_tables jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'table_name', t.table_name,
        'row_estimate', t.row_estimate,
        'total_bytes', t.total_bytes,
        'table_bytes', t.table_bytes,
        'index_bytes', t.index_bytes
      )
      ORDER BY t.total_bytes DESC
    ),
    '[]'::jsonb
  )
  INTO v_tables
  FROM (
    SELECT
      c.relname AS table_name,
      coalesce(c.reltuples::bigint, 0) AS row_estimate,
      pg_total_relation_size(c.oid) AS total_bytes,
      pg_relation_size(c.oid) AS table_bytes,
      pg_total_relation_size(c.oid) - pg_relation_size(c.oid) AS index_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
  ) t;

  RETURN jsonb_build_object(
    'database_bytes', v_db_bytes,
    'schema', 'public',
    'tables', v_tables,
    'generated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_db_table_column_stats(p_table text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_relid oid;
  v_row_est bigint;
  v_sample int := 1000;
  v_use_sample boolean := false;
  v_cols jsonb := '[]'::jsonb;
  rec record;
  v_bytes bigint;
  v_nonnull bigint;
  v_sample_rows bigint;
  v_sql text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_table IS NULL OR length(trim(p_table)) = 0 THEN
    RAISE EXCEPTION 'table required';
  END IF;

  IF p_table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid table name';
  END IF;

  SELECT c.oid, coalesce(c.reltuples::bigint, 0)
  INTO v_relid, v_row_est
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = p_table
    AND c.relkind = 'r';

  IF v_relid IS NULL THEN
    RAISE EXCEPTION 'table not found: %', p_table;
  END IF;

  v_use_sample := v_row_est > 50000;

  FOR rec IN
    SELECT
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute a
    WHERE a.attrelid = v_relid
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  LOOP
    IF v_use_sample THEN
      v_sql := format(
        'SELECT coalesce(sum(pg_column_size(s.%I)), 0)::bigint, count(*) FILTER (WHERE s.%I IS NOT NULL)::bigint, count(*)::bigint FROM (SELECT %I FROM %I LIMIT %s) s',
        rec.column_name,
        rec.column_name,
        rec.column_name,
        p_table,
        v_sample
      );
    ELSE
      v_sql := format(
        'SELECT coalesce(sum(pg_column_size(%I)), 0)::bigint, count(*) FILTER (WHERE %I IS NOT NULL)::bigint, count(*)::bigint FROM %I',
        rec.column_name,
        rec.column_name,
        p_table
      );
    END IF;

    EXECUTE v_sql INTO v_bytes, v_nonnull, v_sample_rows;

    IF v_use_sample AND v_sample_rows > 0 AND v_row_est > v_sample_rows THEN
      v_bytes := (v_bytes * v_row_est) / v_sample_rows;
      v_nonnull := (v_nonnull * v_row_est) / v_sample_rows;
    END IF;

    v_cols :=
      v_cols
      || jsonb_build_object(
        'column_name', rec.column_name,
        'data_type', rec.data_type,
        'bytes', v_bytes,
        'non_null_rows', v_nonnull,
        'estimated', v_use_sample
      );
  END LOOP;

  RETURN jsonb_build_object(
    'table_name', p_table,
    'row_estimate', v_row_est,
    'estimated', v_use_sample,
    'columns', v_cols,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_db_storage_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_db_table_column_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_db_storage_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_db_table_column_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_db_storage_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_db_table_column_stats(text) TO service_role;
