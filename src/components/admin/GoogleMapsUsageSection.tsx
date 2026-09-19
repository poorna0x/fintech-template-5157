import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchGoogleMapsUsage, GOOGLE_MAPS_SKU_FALLBACK, type GoogleMapsUsagePayload } from '@/lib/googleMapsUsage';

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN');
}

function pctOfCap(used: number, cap: number): number {
  if (!cap) return 0;
  return Math.min(100, Math.max(0, (used / cap) * 100));
}

function barClass(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export default function GoogleMapsUsageSection() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GoogleMapsUsagePayload | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    const result = await fetchGoogleMapsUsage(refresh);
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const skus = data?.skus?.length ? data.skus : GOOGLE_MAPS_SKU_FALLBACK;
  const estimatedUsd = data?.estimatedUsd ?? 0;
  const focus = useMemo(() => {
    return skus.reduce((best, row) => {
      const a = Number(best.usedPercent) || (best.freeCap ? (best.requests / best.freeCap) * 100 : 0);
      const b = Number(row.usedPercent) || (row.freeCap ? (row.requests / row.freeCap) * 100 : 0);
      return b >= a ? row : best;
    }, skus[0]);
  }, [skus]);
  const remaining = Math.max(0, (focus?.freeCap || 0) - (focus?.requests || 0));
  const allInside = data?.insideFree !== false && skus.every((row) => (row.requests || 0) <= (row.freeCap || 0));

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <MapPin className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Google Maps</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {loading
              ? '…'
              : data?.ok
                ? `${formatCount(focus?.requests)} / ${formatCount(focus?.freeCap)}`
                : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loading
              ? 'Loading Maps usage…'
              : data?.ok
                ? (focus?.requests || 0) === 0
                  ? `All daily Maps APIs · IST ${data.monthKey || 'this month'} · 10,000 free each`
                  : allInside
                    ? `${focus?.label || 'Maps'} this month · ${formatCount(remaining)} of 10,000 free left`
                    : `${formatCount(focus?.billable)} over the 10,000 free cap · ~$${estimatedUsd.toFixed(2)}`
                : data?.error || 'Could not load Maps usage'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {data?.consoleUrl ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={data.consoleUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Cloud Console
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load(true)}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {skus.map((sku) => {
          const pct = Number(sku.usedPercent) || pctOfCap(sku.requests, sku.freeCap);
          const left = sku.remaining ?? Math.max(0, sku.freeCap - sku.requests);
          return (
            <div key={sku.id} className="rounded-xl border bg-background/60 px-3 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{sku.label}</p>
                <p className="text-sm tabular-nums">
                  {loading ? '…' : `${formatCount(sku.requests)} / ${formatCount(sku.freeCap)}`}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${barClass(pct)}`}
                  style={{ width: `${Math.max(pct, sku.requests > 0 ? 2 : 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{sku.hint}</p>
              {!loading && sku.billable > 0 ? (
                <p className="mt-1 text-[11px] tabular-nums text-foreground">
                  {formatCount(sku.billable)} over free cap · ~${sku.estimatedUsd.toFixed(2)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {loading ? '…' : `${formatCount(left)} free left · ${pct.toFixed(pct >= 10 ? 0 : 1)}% of 10,000 used`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {data?.other && data.other.length > 0 ? (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Other Maps APIs this month:{' '}
          {data.other.map((row) => `${row.service} (${formatCount(row.requests)})`).join(' · ')}
        </p>
      ) : null}

      {!loading && data?.note ? (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">{data.note}</p>
      ) : null}

      {!loading && data?.ok ? (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Daily APIs: Maps JavaScript, Places Autocomplete, Places Details, Find Place, Geocoding, and Distance
          Matrix. Each has a 10,000 Essentials free cap this IST month. Counts start when you open a map, search an
          address, paste a Maps link, or check travel km.
        </p>
      ) : null}
    </section>
  );
}
