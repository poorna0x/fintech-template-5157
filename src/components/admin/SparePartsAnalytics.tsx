import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Package } from 'lucide-react';
import { db } from '@/lib/supabase';
import { AnalyticsListPagination } from '@/components/admin/AnalyticsListPagination';

interface SparePartsAnalyticsProps {
  /** ISO start of period, or null for all-time. */
  startISO: string | null;
  /** ISO end of period, or null for all-time. */
  endISO: string | null;
}

type PartRow = {
  partKey: string;
  productName: string;
  totalQty: number;
  totalValue: number;
  jobCount: number;
};

type PartsSummary = {
  distinctParts: number;
  unitsUsed: number;
  partsValue: number;
};

const formatCurrency = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function mapPartRow(r: Record<string, unknown>): PartRow {
  return {
    partKey: String(r.part_key),
    productName: String(r.product_name),
    totalQty: Number(r.total_qty ?? 0),
    totalValue: Number(r.total_value ?? 0),
    jobCount: Number(r.job_count ?? 0),
  };
}

function SummaryStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' }) {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3 min-w-0">
      <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </p>
      <p
        className={
          tone === 'green'
            ? 'mt-1 text-lg sm:text-xl font-semibold tabular-nums text-green-700'
            : 'mt-1 text-lg sm:text-xl font-semibold tabular-nums text-foreground'
        }
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Spare-parts usage analytics — server-aggregated pages (lower egress than loading all rows).
 */
const SparePartsAnalytics: React.FC<SparePartsAnalyticsProps> = ({ startISO, endISO }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PartRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PartsSummary | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const skipSearchDebounce = useRef(true);

  const fetchPage = useCallback(
    async (nextPage: number, nextPerPage: number, nextSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await db.analyticsPaginated.getSparePartsUsage({
          startISO,
          endISO,
          limit: nextPerPage,
          offset: (nextPage - 1) * nextPerPage,
          search: nextSearch,
        });
        if (err) throw err;
        setRows((data?.rows ?? []).map((r) => mapPartRow(r as Record<string, unknown>)));
        setTotal(data?.total ?? 0);
        setSummary(
          data?.summary
            ? {
                distinctParts: Number(data.summary.distinct_parts ?? 0),
                unitsUsed: Number(data.summary.units_used ?? 0),
                partsValue: Number(data.summary.parts_value ?? 0),
              }
            : null
        );
        setPage(nextPage);
        setPerPage(nextPerPage);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load spare parts');
        setRows([]);
        setTotal(0);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    [startISO, endISO]
  );

  useEffect(() => {
    skipSearchDebounce.current = true;
    setPage(1);
    setSearch('');
    void fetchPage(1, perPage, '');
  }, [startISO, endISO, fetchPage, perPage]);

  useEffect(() => {
    if (skipSearchDebounce.current) {
      skipSearchDebounce.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void fetchPage(1, perPage, search);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handlePageChange = (nextPage: number) => {
    void fetchPage(nextPage, perPage, search);
  };

  const handlePerPageChange = (nextPerPage: number) => {
    void fetchPage(1, nextPerPage, search);
  };

  if (loading && rows.length === 0 && !error) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading spare parts usage…
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-sm text-red-600">Failed to load spare parts: {error}</p>;
  }

  if (total === 0 && !search.trim()) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/60" />
        <p>No spare parts were logged for this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <SummaryStat label="Distinct parts" value={String(summary.distinctParts)} />
          <SummaryStat label="Units used" value={String(summary.unitsUsed)} />
          <SummaryStat
            label="Parts value"
            value={`₹ ${formatCurrency(summary.partsValue)}`}
            tone="green"
          />
        </div>
      ) : null}

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search part by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 w-full"
        />
      </div>

      <div id="spare-parts-list-top" className="scroll-mt-4" aria-hidden />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 rounded-lg border border-dashed border-border">
          No parts match your search.
        </p>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <div
                key={r.partKey}
                className="rounded-xl border border-border bg-card p-3 space-y-2"
              >
                <p className="text-sm font-medium leading-snug break-words">{r.productName}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                    <p className="text-[10px] text-muted-foreground">Qty</p>
                    <p className="text-sm font-semibold tabular-nums">{r.totalQty}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                    <p className="text-[10px] text-muted-foreground">Jobs</p>
                    <p className="text-sm font-semibold tabular-nums">{r.jobCount}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-1 py-1.5">
                    <p className="text-[10px] text-muted-foreground">Value</p>
                    <p className="text-sm font-semibold tabular-nums text-green-700">
                      ₹ {formatCurrency(r.totalValue)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right">Qty used</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Parts value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.partKey}>
                      <TableCell className="font-medium max-w-[320px]">{r.productName}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{r.totalQty}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.jobCount}</TableCell>
                      <TableCell className="text-right font-medium text-green-600 tabular-nums">
                        ₹ {formatCurrency(r.totalValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {total > 10 ? (
            <AnalyticsListPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={perPage}
              itemLabel="parts"
              scrollAnchorId="spare-parts-list-top"
              onPageChange={handlePageChange}
              onItemsPerPageChange={handlePerPageChange}
            />
          ) : null}
        </>
      )}
    </div>
  );
};

export default SparePartsAnalytics;
