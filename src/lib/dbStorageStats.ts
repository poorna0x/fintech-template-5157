import { ensureAdminSupabaseSession } from '@/lib/auth';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
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
  public_bytes?: number;
  instance_bytes?: number;
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
    public_bytes: Number(row.public_bytes) || 0,
    instance_bytes: Number(row.instance_bytes) || 0,
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

/** Decimal MB (1000) — matches Cloudflare R2 and typical Supabase dashboard units. */
export function formatDashboardBytes(bytes: number | null | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

export function pctOfTotal(part: number, total: number): string {
  if (!total || !Number.isFinite(part)) return '0%';
  const p = (part / total) * 100;
  if (p < 0.1 && part > 0) return '<0.1%';
  return `${p.toFixed(p >= 10 ? 0 : 1)}%`;
}

export type R2PrefixSizeRow = {
  name: string;
  bytes: number;
  objects: number;
};

export type R2StorageOverview = {
  ok: boolean;
  bucket?: string;
  total_bytes?: number;
  object_count?: number;
  prefixes?: R2PrefixSizeRow[];
  oldest_modified?: string | null;
  newest_modified?: string | null;
  truncated?: boolean;
  generated_at?: string;
  error?: string;
};

const R2_PREFIX_LABELS: Record<string, string> = {
  inbound: 'WhatsApp inbound',
  outbound: 'WhatsApp outbound',
  accept: 'Document accept originals',
  other: 'Other',
};

export function r2PrefixLabel(name: string): string {
  return R2_PREFIX_LABELS[name] || name;
}

export async function fetchR2StorageOverview(): Promise<R2StorageOverview> {
  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) return { ok: false, error: 'Not signed in' };
    const res = await fetch('/.netlify/functions/db-storage-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ source: 'r2' }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: String(data.error || `HTTP ${res.status}`),
      };
    }
    if (!('object_count' in data) || !('total_bytes' in data)) {
      return {
        ok: false,
        error: 'R2 stats did not load. Restart the local functions server (runcode) and open Storage again.',
      };
    }
    const prefixesRaw = Array.isArray(data.prefixes) ? data.prefixes : [];
    return {
      ok: true,
      bucket: typeof data.bucket === 'string' ? data.bucket : undefined,
      total_bytes: Number(data.total_bytes) || 0,
      object_count: Number(data.object_count) || 0,
      prefixes: prefixesRaw as R2PrefixSizeRow[],
      oldest_modified:
        typeof data.oldest_modified === 'string' ? data.oldest_modified : null,
      newest_modified:
        typeof data.newest_modified === 'string' ? data.newest_modified : null,
      truncated: Boolean(data.truncated),
      generated_at: typeof data.generated_at === 'string' ? data.generated_at : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not load R2 storage stats',
    };
  }
}
