import React, { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Package } from 'lucide-react';
import { db } from '@/lib/supabase';

interface SparePartsAnalyticsProps {
  /** ISO start of period, or null for all-time. */
  startISO: string | null;
  /** ISO end of period, or null for all-time. */
  endISO: string | null;
}

interface PartRow {
  inventoryId: string;
  productName: string;
  code: string | null;
  totalQty: number;
  totalValue: number;
  jobIds: Set<string>;
}

const formatCurrency = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Spare-parts usage analytics, sourced from job_parts_used (technician-logged
 * parts). Self-contained and lazy-loaded: it fetches only when mounted, and
 * re-fetches when the date range changes.
 */
const SparePartsAnalytics: React.FC<SparePartsAnalyticsProps> = ({ startISO, endISO }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PartRow[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    db.jobPartsUsed
      .getUsedInRange(startISO, endISO)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message || 'Failed to load spare parts');
          setRows([]);
          return;
        }

        const map = new Map<string, PartRow>();
        (data || []).forEach((r: any) => {
          const inv = r.inventory;
          // Custom one-off parts have no inventory row; group them by their typed name
          // so they still appear (and their cost is counted) in the usage report.
          const isCustom = !(r.inventory_id || inv?.id);
          const customName = (r.custom_name as string | null) || 'Custom item';
          const groupKey = isCustom ? `custom:${customName.toLowerCase()}` : (r.inventory_id || inv?.id);
          const qty = Number(r.quantity_used) || 0;
          const price =
            r.price_at_time_of_use != null
              ? Number(r.price_at_time_of_use)
              : inv?.price != null
              ? Number(inv.price)
              : 0;

          let row = map.get(groupKey);
          if (!row) {
            row = {
              inventoryId: groupKey,
              productName: isCustom ? customName : (inv?.product_name || 'Unknown part'),
              code: isCustom ? 'Custom' : (inv?.code ?? null),
              totalQty: 0,
              totalValue: 0,
              jobIds: new Set<string>(),
            };
            map.set(groupKey, row);
          }
          row.totalQty += qty;
          row.totalValue += qty * price;
          if (r.job_id) row.jobIds.add(r.job_id);
        });

        setRows(Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load spare parts');
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [startISO, endISO]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.productName.toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.units += r.totalQty;
          acc.value += r.totalValue;
          return acc;
        },
        { units: 0, value: 0 }
      ),
    [filtered]
  );

  if (loading) {
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

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/60" />
        <p>No spare parts were logged for this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-md bg-muted px-3 py-1.5 font-medium">
          {filtered.length} distinct part{filtered.length === 1 ? '' : 's'}
        </span>
        <span className="rounded-md bg-muted px-3 py-1.5 font-medium">
          {totals.units} unit{totals.units === 1 ? '' : 's'} used
        </span>
        <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-green-700">
          ₹ {formatCurrency(totals.value)} parts value
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search part by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Qty used</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Parts value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                  No parts match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.inventoryId}>
                  <TableCell className="font-medium">{r.productName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.code || '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{r.totalQty}</TableCell>
                  <TableCell className="text-right">{r.jobIds.size}</TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    ₹ {formatCurrency(r.totalValue)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SparePartsAnalytics;
