import { useCallback, useEffect, useState } from 'react';
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

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <MapPin className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Google Maps</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {loading ? '…' : data?.ok ? `$${estimatedUsd.toFixed(2)}` : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loading
              ? 'Loading Maps usage…'
              : data?.ok
                ? `Estimated bill after Essentials free caps · IST ${data.monthKey || 'this month'}`
                : data?.error || 'Live usage needs Cloud Monitoring on the Maps GCP project'}
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
          const pct = pctOfCap(sku.requests, sku.freeCap);
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
                  className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(pct, sku.requests > 0 ? 2 : 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{sku.hint}</p>
              {!loading && sku.billable > 0 ? (
                <p className="mt-1 text-[11px] tabular-nums text-foreground">
                  {formatCount(sku.billable)} over free cap · ~${sku.estimatedUsd.toFixed(2)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {sku.freeCap.toLocaleString('en-IN')} free / month · ${sku.usdPerThousand.toFixed(2)} / 1,000 after
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

      {!loading && data?.credentialSource === 'firebase_service_account' ? (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Reading Cloud Monitoring with the Firebase service account. If counts look empty, grant that account
          Monitoring Viewer on the Maps GCP project, or store a dedicated JSON in{' '}
          <code className="rounded bg-muted px-1">app_secrets.google_cloud_monitoring</code>.
        </p>
      ) : null}

      {!loading && !data?.ok && !data?.configured ? (
        <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Google does not expose Maps usage from the browser API key. Store a GCP service account JSON in{' '}
          <code className="rounded bg-muted px-1">app_secrets.google_cloud_monitoring</code> with Monitoring Viewer on
          the Maps project. This card still shows the Essentials 10,000/month free caps (Dynamic Maps, Places,
          Geocoding, Distance).
        </p>
      ) : null}
    </section>
  );
}
