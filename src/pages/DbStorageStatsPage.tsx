import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Cloud, Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  fetchDbStorageOverview,
  fetchDbTableColumnStats,
  fetchR2StorageOverview,
  formatDashboardBytes,
  pctOfTotal,
  r2PrefixLabel,
  type DbColumnSizeRow,
  type DbTableSizeRow,
  type R2StorageOverview,
} from '@/lib/dbStorageStats';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
};

export default function DbStorageStatsPage({ hideHeader, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databaseBytes, setDatabaseBytes] = useState(0);
  const [tables, setTables] = useState<DbTableSizeRow[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<DbColumnSizeRow[]>([]);
  const [columnEstimated, setColumnEstimated] = useState(false);
  const [filter, setFilter] = useState('');
  const [r2Loading, setR2Loading] = useState(true);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [r2, setR2] = useState<R2StorageOverview | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchDbStorageOverview();
    if (!result.ok) {
      setError(result.error || 'Could not load storage stats');
      setLoading(false);
      return;
    }
    setDatabaseBytes(Number(result.database_bytes) || 0);
    setTables(Array.isArray(result.tables) ? result.tables : []);
    setLoading(false);
  }, []);

  const loadColumns = useCallback(async (tableName: string) => {
    setColumnsLoading(true);
    setError(null);
    const result = await fetchDbTableColumnStats(tableName);
    if (!result.ok) {
      setError(result.error || 'Could not load column stats');
      setColumns([]);
      setColumnsLoading(false);
      return;
    }
    const rows = Array.isArray(result.columns) ? result.columns : [];
    setColumns(
      [...rows].sort((a, b) => Number(b.bytes || 0) - Number(a.bytes || 0))
    );
    setColumnEstimated(Boolean(result.estimated));
    setColumnsLoading(false);
  }, []);

  const loadR2 = useCallback(async () => {
    setR2Loading(true);
    setR2Error(null);
    const result = await fetchR2StorageOverview();
    if (!result.ok) {
      setR2Error(result.error || 'Could not load Cloudflare R2 stats');
      setR2(null);
      setR2Loading(false);
      return;
    }
    setR2(result);
    setR2Loading(false);
  }, []);

  useEffect(() => {
    void loadOverview();
    void loadR2();
  }, [loadOverview, loadR2]);

  const filteredTables = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.table_name.toLowerCase().includes(q));
  }, [tables, filter]);

  const selectedTableRow = useMemo(
    () => tables.find((t) => t.table_name === selectedTable) || null,
    [tables, selectedTable]
  );

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    void loadColumns(tableName);
  };

  const r2Prefixes = r2?.prefixes ?? [];
  const r2Bytes = Number(r2?.total_bytes) || 0;
  const r2FreePlanBytes = 10 * 1000 * 1000 * 1000;
  const r2OfFreePlan = Math.min(100, (r2Bytes / r2FreePlanBytes) * 100);

  return (
    <div className="space-y-6">
      {!hideHeader ? (
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : null}
          <h2 className="text-lg font-semibold">Storage</h2>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
              <Cloud className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wide">Cloudflare R2</p>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {r2Loading ? '…' : r2Error ? '—' : formatDashboardBytes(r2Bytes)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r2Loading
                ? 'Loading media usage…'
                : r2Error
                  ? r2Error
                  : `${(r2?.object_count || 0).toLocaleString()} files in ${r2?.bucket || 'bucket'}`}
              {r2?.truncated ? ' · partial list' : ''}
            </p>
          </div>
          {!r2Loading && !r2Error ? (
            <div className="w-full sm:max-w-[220px]">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Free plan 10 GB</span>
                <span className="tabular-nums">{r2OfFreePlan < 0.1 && r2Bytes > 0 ? '<0.1%' : `${r2OfFreePlan.toFixed(1)}%`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.max(r2OfFreePlan, r2Bytes > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
        {r2Loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Listing R2 objects…
          </div>
        ) : r2Error ? null : r2Prefixes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No files in this bucket yet.</p>
        ) : (
          <div>
            <p className="border-b px-4 py-2 text-[11px] text-muted-foreground">
              Percent is share of bucket size (MB), not number of files.
            </p>
          <div className="divide-y">
            {r2Prefixes.map((row) => {
              const pct = r2Bytes > 0 ? (Number(row.bytes) / r2Bytes) * 100 : 0;
              return (
                <div key={row.name} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{r2PrefixLabel(row.name)}</p>
                    <p className="shrink-0 text-sm tabular-nums">{formatDashboardBytes(row.bytes)}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sky-500/80"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    {Number(row.objects || 0).toLocaleString()} files · {pctOfTotal(Number(row.bytes) || 0, r2Bytes)} of bucket size
                  </p>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <div className="flex items-center gap-2 text-primary">
            <Database className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Postgres</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {loading ? '…' : formatDashboardBytes(databaseBytes)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tables.length} tables
          </p>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className="border-b lg:border-b-0 lg:border-r">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Tables</h3>
              <Input
                className="mt-3"
                placeholder="Filter tables…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="max-h-[420px] overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tables…
                </div>
              ) : filteredTables.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {tables.length === 0 ? 'No table stats returned.' : 'No tables match.'}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Table</th>
                      <th className="px-3 py-2 text-right">Rows≈</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTables.map((row) => {
                      const active = selectedTable === row.table_name;
                      return (
                        <tr
                          key={row.table_name}
                          className={cn(
                            'cursor-pointer border-t transition-colors hover:bg-muted/50',
                            active && 'bg-primary/5'
                          )}
                          onClick={() => handleSelectTable(row.table_name)}
                        >
                          <td className="px-3 py-2 font-medium">{row.table_name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {row.row_estimate.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatDashboardBytes(row.total_bytes)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {pctOfTotal(row.total_bytes, databaseBytes)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">
                {selectedTable ? `Columns · ${selectedTable}` : 'Column breakdown'}
              </h3>
              {selectedTableRow ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Data {formatDashboardBytes(selectedTableRow.table_bytes)} · indexes{' '}
                  {formatDashboardBytes(selectedTableRow.index_bytes)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a table to see which columns use the most space.
                </p>
              )}
              {columnEstimated ? (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Large table — column bytes are estimated from a sample.
                </p>
              ) : null}
            </div>
            <div className="max-h-[420px] overflow-auto">
              {!selectedTable ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Pick a table from the list.
                </p>
              ) : columnsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing columns…
                </div>
              ) : columns.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No column data.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Column</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Bytes≈</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col) => (
                      <tr key={col.column_name} className="border-t">
                        <td className="px-3 py-2 font-medium">{col.column_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{col.data_type}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatDashboardBytes(col.bytes)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {pctOfTotal(col.bytes, selectedTableRow?.table_bytes || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
