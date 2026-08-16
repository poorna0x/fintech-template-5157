import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchILovePdfUsage, type ILovePdfUsagePayload } from '@/lib/ilovepdfUsage';

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export default function ILovePdfUsageSection() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ILovePdfUsagePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchILovePdfUsage();
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const credits = data?.remainingCredits ?? null;
  const jobs = data?.estimatedCompressJobs ?? null;
  const perFile = data?.compressCreditsPerFile ?? 10;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <FileText className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">iLovePDF</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {loading ? '…' : data?.ok ? formatCount(credits) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {loading
              ? 'Loading credit balance…'
              : !data?.configured
                ? 'API keys not configured on this server'
                : data.error
                  ? data.error
                  : `Credits remaining · ~${formatCount(jobs)} PDF compresses (${perFile} credits each)`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-background/60 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Dashboard toggle
          </p>
          <p className="mt-1 text-lg font-semibold">
            {loading ? '…' : data?.dashboardEnabled ? 'On' : 'Off'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Settings → Dashboard → Compress PDFs
          </p>
        </div>
        <div className="rounded-xl border bg-background/60 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Quality level
          </p>
          <p className="mt-1 text-lg font-semibold capitalize">{loading ? '…' : data?.level || '—'}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Region {loading ? '…' : data?.region || '—'}
          </p>
        </div>
        <div className="rounded-xl border bg-background/60 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Remaining files
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {loading ? '…' : formatCount(data?.remainingFiles)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Shown when iLovePDF returns it
          </p>
        </div>
      </div>
    </section>
  );
}
