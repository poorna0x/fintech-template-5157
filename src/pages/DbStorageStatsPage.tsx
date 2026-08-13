import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  fetchDbStorageOverview,
  fetchDbTableColumnStats,
  formatDbBytes,
  pctOfTotal,
  type DbColumnSizeRow,
  type DbTableSizeRow,
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

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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

  return (
    <div className="space-y-5">
      {!hideHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            ) : null}
            <h2 className="text-lg font-semibold">Database storage</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              void loadOverview();
              if (selectedTable) void loadColumns(selectedTable);
            }}
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Public schema (Postgres)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {loading ? '…' : formatDbBytes(databaseBytes)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Table + index sizes. Media files on R2 are not included here.
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {tables.length} tables
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Tables</h3>
            </div>
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
                {tables.length === 0 && !loading
                  ? 'No table stats returned. Refresh or sign in again as admin.'
                  : 'No tables match.'}
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
                          {formatDbBytes(row.total_bytes)}
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

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">
              {selectedTable ? `Columns · ${selectedTable}` : 'Column breakdown'}
            </h3>
            {selectedTableRow ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Data {formatDbBytes(selectedTableRow.table_bytes)} · indexes{' '}
                {formatDbBytes(selectedTableRow.index_bytes)}
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
                        {formatDbBytes(col.bytes)}
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
    </div>
  );
}
