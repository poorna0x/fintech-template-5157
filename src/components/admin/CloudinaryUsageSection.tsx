import { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDashboardBytes } from '@/lib/dbStorageStats';
import {
  fetchCloudinaryUsage,
  fetchCloudinaryUsageDetails,
  fetchCloudinaryUsageHistory,
  type CloudinaryAccountDetails,
  type CloudinaryAccountOverview,
  type CloudinaryAssetRow,
  type CloudinaryHistoryPoint,
  type CloudinaryMeter,
  type CloudinaryUsagePayload,
} from '@/lib/cloudinaryUsage';

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function pctLabel(pct: number): string {
  if (pct < 0.01 && pct > 0) return '<0.01%';
  return `${pct.toFixed(pct >= 10 ? 1 : 2)}%`;
}

function MeterBar({
  label,
  meter,
  formatUsage,
}: {
  label: string;
  meter: CloudinaryMeter | undefined;
  formatUsage: (n: number) => string;
}) {
  if (!meter?.available || meter.usage == null) return null;
  const hasQuota = meter.limit != null && meter.limit > 0;
  const pct = hasQuota
    ? Math.min(100, Math.max(0, meter.usedPercent != null ? meter.usedPercent : (meter.usage / meter.limit) * 100))
    : null;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {hasQuota
            ? `${formatUsage(meter.usage)} / ${formatUsage(meter.limit!)}${pct != null ? ` · ${pctLabel(pct)}` : ''}`
            : formatUsage(meter.usage)}
        </span>
      </div>
      {hasQuota && pct != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(pct, meter.usage ? 1 : 0)}%` }} />
        </div>
      ) : null}
      {hasQuota && meter.remaining != null ? (
        <p className="text-[11px] text-muted-foreground">Remaining: {formatUsage(meter.remaining)}</p>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-background/60 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AssetTable({
  title,
  rows,
  onDelete,
  deletingId,
}: {
  title: string;
  rows: CloudinaryAssetRow[];
  onDelete?: (row: CloudinaryAssetRow) => void;
  deletingId?: string | null;
}) {
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border">
      <p className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2">Folder</th>
              <th className="px-3 py-2">Created</th>
              {onDelete ? <th className="px-3 py-2 text-right"> </th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = row.filename || row.publicId;
              const busy = deletingId === row.publicId;
              return (
                <tr key={row.publicId} className="border-t">
                  <td className="max-w-[180px] truncate px-3 py-2 font-medium" title={row.publicId}>
                    {row.previewUrl ? (
                      <a
                        href={row.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                      >
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.resourceType || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.format || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.bytes == null ? '—' : formatDashboardBytes(row.bytes)}
                  </td>
                  <td className="max-w-[120px] truncate px-3 py-2 text-muted-foreground">{row.folder || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {row.createdAt ? formatWhen(row.createdAt) : '—'}
                  </td>
                  {onDelete ? (
                    <td className="px-2 py-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:text-destructive"
                        disabled={busy || Boolean(deletingId)}
                        onClick={() => onDelete(row)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        <span className="sr-only">Delete</span>
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryMini({ points }: { points: CloudinaryHistoryPoint[] }) {
  if (!points.some((p) => p.storage != null || p.bandwidth != null)) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 7 days</p>
      <div className="max-h-48 overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Storage</th>
              <th className="px-3 py-2 text-right">Bandwidth</th>
              <th className="px-3 py-2 text-right">Transforms</th>
              <th className="px-3 py-2 text-right">Assets</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-t">
                <td className="px-3 py-1.5 tabular-nums">{p.date}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.storage == null ? '—' : formatDashboardBytes(p.storage)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.bandwidth == null ? '—' : formatDashboardBytes(p.bandwidth)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.transformations == null ? '—' : formatCount(p.transformations)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.resources == null ? '—' : formatCount(p.resources)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountBlock({
  overview,
  details,
  historyPoints,
  overviewError,
}: {
  overview?: CloudinaryAccountOverview;
  details?: CloudinaryAccountDetails;
  historyPoints?: CloudinaryHistoryPoint[];
  overviewError?: string;
}) {
  const meters = overview?.usage?.meters;
  const counts = overview?.resourceCounts;
  const [recentRows, setRecentRows] = useState<CloudinaryAssetRow[]>(details?.recentAssets?.items || []);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setRecentRows(details?.recentAssets?.items || []);
  }, [details?.recentAssets?.items]);

  const handleDeleteRecent = async (row: CloudinaryAssetRow) => {
    const label = row.filename || row.publicId;
    if (!window.confirm(`Delete “${label}” from Cloudinary? This cannot be undone.`)) return;
    setDeletingId(row.publicId);
    try {
      const { cloudinaryService } = await import('@/lib/cloudinary');
      const result = await cloudinaryService.deleteImage(
        row.publicId,
        overview?.id === 'secondary',
        null,
        row.resourceType || 'image'
      );
      if (!result.success) {
        toast.error(result.error || 'Could not delete');
        return;
      }
      setRecentRows((rows) => rows.filter((r) => r.publicId !== row.publicId));
      toast.success('Deleted from Cloudinary');
    } finally {
      setDeletingId(null);
    }
  };

  if (overviewError && !overview?.usage) {
    return <p className="px-4 py-6 text-sm text-red-700 dark:text-red-300">{overviewError}</p>;
  }

  const storage =
    meters?.storage?.available && meters.storage.usage != null
      ? formatDashboardBytes(meters.storage.usage)
      : null;
  const bandwidth =
    meters?.bandwidth?.available && meters.bandwidth.usage != null
      ? formatDashboardBytes(meters.bandwidth.usage)
      : null;
  const transforms =
    meters?.transformations?.available && meters.transformations.usage != null
      ? formatCount(meters.transformations.usage)
      : null;
  const objects =
    meters?.objects?.available && meters.objects.usage != null
      ? formatCount(meters.objects.usage)
      : null;
  const requests =
    meters?.requests?.available && meters.requests.usage != null
      ? formatCount(meters.requests.usage)
      : null;

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          title="Total assets"
          value={formatCount(overview?.usage?.resources ?? overview?.resourceCountTotal)}
          hint={
            overview?.usage?.derivedResources != null
              ? `${formatCount(overview.usage.derivedResources)} derived`
              : undefined
          }
        />
        {storage ? <SummaryCard title="Storage" value={storage} /> : null}
        {bandwidth ? <SummaryCard title="Bandwidth" value={bandwidth} /> : null}
        {transforms ? <SummaryCard title="Transformations" value={transforms} /> : null}
      </div>

      {overview?.usage?.plan ? (
        <p className="text-xs text-muted-foreground">
          {overview.usage.plan} plan
          {String(overview.usage.plan).toLowerCase() === 'free'
            ? ' · 25 credits/mo (1 credit = 1 GB storage or 1 GB bandwidth or 1,000 transformations)'
            : ''}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <MeterBar label="Storage" meter={meters?.storage} formatUsage={formatDashboardBytes} />
        <MeterBar label="Bandwidth" meter={meters?.bandwidth} formatUsage={formatDashboardBytes} />
        <MeterBar label="Transformations" meter={meters?.transformations} formatUsage={formatCount} />
        <MeterBar label="Credits" meter={meters?.credits} formatUsage={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
      </div>
      {String(overview?.usage?.plan || '').toLowerCase() === 'free' && meters?.credits?.usage != null ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Credits do not reset every day or on the 1st of the month. Free plan is a rolling 30-day
          window: usage stays counted for about 30 days, then drops off. The{' '}
          {meters.credits.usage.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {meters.credits.limit != null ? ` / ${meters.credits.limit}` : ''} figure is this
          account&apos;s current window, not a calendar-month reset. Primary and secondary each have
          their own 25-credit pool.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard title="Images" value={formatCount(counts?.image)} />
        <SummaryCard title="Videos" value={formatCount(counts?.video)} />
        <SummaryCard title="Raw files" value={formatCount(counts?.raw)} />
        {objects ? <SummaryCard title="Objects" value={objects} hint="Originals + derived" /> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {requests ? <SummaryCard title="API requests" value={requests} /> : null}
        {details?.folders?.available ? (
          <SummaryCard
            title="Folders"
            value={formatCount(details.folders.count)}
            hint={details.folders.names.slice(0, 8).join(', ') || undefined}
          />
        ) : null}
      </div>

      {details?.recentAssets?.available ? (
        <AssetTable
          title="Recent uploads"
          rows={recentRows}
          deletingId={deletingId}
          onDelete={handleDeleteRecent}
        />
      ) : null}
      {details?.largestAssets?.available ? (
        <AssetTable title="Largest assets" rows={details.largestAssets.items || []} />
      ) : null}

      {historyPoints ? <HistoryMini points={historyPoints} /> : null}
    </div>
  );
}

export default function CloudinaryUsageSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CloudinaryUsagePayload | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, CloudinaryAccountDetails>>({});
  const [historyById, setHistoryById] = useState<Record<string, CloudinaryHistoryPoint[]>>({});

  const mergeExtras = useCallback((next: CloudinaryUsagePayload) => {
    setDetailsById((prev) => {
      const copy = { ...prev };
      for (const acc of next.accounts) {
        if (acc.details) copy[acc.id] = acc.details;
      }
      return copy;
    });
    setHistoryById((prev) => {
      const copy = { ...prev };
      for (const acc of next.accounts) {
        const pts = acc.history?.history?.points;
        if (pts) copy[acc.id] = pts;
      }
      return copy;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const overview = await fetchCloudinaryUsage(false);
    if (!overview.ok && !overview.accounts.length) {
      setError(overview.error || 'Could not load Cloudinary usage');
      setPayload(overview);
      setLoading(false);
      return;
    }
    setPayload(overview);
    setLoading(false);
    const [details, history] = await Promise.all([
      fetchCloudinaryUsageDetails(false),
      fetchCloudinaryUsageHistory(false),
    ]);
    mergeExtras(details);
    mergeExtras(history);
  }, [mergeExtras]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-4">
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
          <ImageIcon className="h-4 w-4" />
          <p className="text-xs font-semibold uppercase tracking-wide">Cloudinary</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Primary and secondary accounts</p>
      </div>

      {error ? (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Cloudinary usage…
        </div>
      ) : !payload?.accounts.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {payload?.error || 'Cloudinary is not configured on the server.'}
        </p>
      ) : (
        payload.accounts.map((acc, idx) => (
          <div key={acc.id} className={idx > 0 ? 'border-t' : ''}>
            <div className="border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              {acc.label}
              {acc.cloudName ? ` · ${acc.cloudName}` : ''}
              {acc.rateLimited ? ' · rate limited' : ''}
            </div>
            <AccountBlock
              overview={acc.overview}
              details={detailsById[acc.id] || acc.details}
              historyPoints={historyById[acc.id] || acc.history?.history?.points}
              overviewError={acc.overviewError}
            />
          </div>
        ))
      )}
    </section>
  );
}
