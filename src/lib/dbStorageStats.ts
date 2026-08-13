import { ensureAdminSupabaseSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatBytes } from '@/lib/pdfAuthenticityVerify';

export type DbTableSizeRow = {
  table_name: string;
  row_estimate: number;
  total_bytes: number;
  table_bytes: number;
  index_bytes: number;
};

export type DbStorageOverview = {
  ok: boolean;
  database_bytes?: number;
  schema?: string;
  tables?: DbTableSizeRow[];
  generated_at?: string;
  error?: string;
};

export type DbColumnSizeRow = {
  column_name: string;
  data_type: string;
  bytes: number;
  non_null_rows: number;
  estimated?: boolean;
};

export type DbTableColumnStats = {
  ok: boolean;
  table_name?: string;
  row_estimate?: number;
  estimated?: boolean;
  columns?: DbColumnSizeRow[];
  generated_at?: string;
  error?: string;
};

function parseOverview(data: unknown): DbStorageOverview {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Empty storage stats response' };
  }
  const row = data as Record<string, unknown>;
  const tablesRaw = row.tables;
  const tables = Array.isArray(tablesRaw) ? (tablesRaw as DbTableSizeRow[]) : [];
  return {
    ok: true,
    database_bytes: Number(row.database_bytes) || 0,
    schema: typeof row.schema === 'string' ? row.schema : 'public',
    tables,
    generated_at: typeof row.generated_at === 'string' ? row.generated_at : undefined,
  };
}

function parseColumnStats(data: unknown): DbTableColumnStats {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Empty column stats response' };
  }
  const row = data as Record<string, unknown>;
  const columnsRaw = row.columns;
  const columns = Array.isArray(columnsRaw) ? (columnsRaw as DbColumnSizeRow[]) : [];
  return {
    ok: true,
    table_name: typeof row.table_name === 'string' ? row.table_name : undefined,
    row_estimate: Number(row.row_estimate) || 0,
    estimated: Boolean(row.estimated),
    columns,
    generated_at: typeof row.generated_at === 'string' ? row.generated_at : undefined,
  };
}

export async function fetchDbStorageOverview(): Promise<DbStorageOverview> {
  try {
    await ensureAdminSupabaseSession();
    const { data, error } = await supabase.rpc('admin_db_storage_overview');
    if (error) return { ok: false, error: error.message || 'Could not load storage stats' };
    return parseOverview(data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load storage stats',
    };
  }
}

export async function fetchDbTableColumnStats(tableName: string): Promise<DbTableColumnStats> {
  const table = String(tableName || '').trim();
  if (!table) return { ok: false, error: 'Table name required' };
  try {
    await ensureAdminSupabaseSession();
    const { data, error } = await supabase.rpc('admin_db_table_column_stats', {
      p_table: table,
    });
    if (error) return { ok: false, error: error.message || 'Could not load column stats' };
    return parseColumnStats(data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load column stats',
    };
  }
}

export function formatDbBytes(bytes: number | null | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  return formatBytes(n);
}

export function pctOfTotal(part: number, total: number): string {
  if (!total || !Number.isFinite(part)) return '0%';
  const p = (part / total) * 100;
  if (p < 0.1 && part > 0) return '<0.1%';
  return `${p.toFixed(p >= 10 ? 0 : 1)}%`;
}
