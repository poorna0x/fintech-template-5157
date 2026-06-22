import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker, formatTimePickerLabel } from '@/components/ui/time-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Lock, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { getPublicSiteLabel, type PublicSiteKey } from '@/lib/websiteSiteKey';
import { subDays, parseISO, format } from 'date-fns';
import { useAdminRole } from '@/lib/useAdminRole';
import { cn } from '@/lib/utils';

const IST = 'Asia/Kolkata';

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page view',
  engagement: 'Click',
  phone_click: 'Call',
  whatsapp_click: 'WhatsApp',
  booking_click: 'Book click',
  booking_submit: 'Booking',
};

type PreviewEvent = {
  id: string;
  site_key: PublicSiteKey;
  event_type: string;
  page_path: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function formatPreviewEventTime(ev: PreviewEvent): string {
  const raw =
    typeof ev.metadata?.client_at === 'string' && ev.metadata.client_at
      ? ev.metadata.client_at
      : ev.created_at;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatPreviewPagePath(path: string | null | undefined): string {
  const p = (path || '/').trim();
  if (p === '/' || p === '') return 'Home';
  return p;
}

type DeleteMode = 'time_window' | 'single_day' | 'date_range' | 'older_than';
type SiteFilter = 'all' | PublicSiteKey;

const DELETE_TYPES: { value: DeleteMode; label: string }[] = [
  { value: 'time_window', label: 'Time range on one day' },
  { value: 'single_day', label: 'Full day' },
  { value: 'date_range', label: 'Date range' },
  { value: 'older_than', label: 'Older than (cleanup)' },
];

const RETENTION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
] as const;

function getTodayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatIstDateLabel(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function subtractIstDays(isoDate: string, days: number): string {
  return format(subDays(parseISO(`${isoDate}T12:00:00`), days), 'yyyy-MM-dd');
}

function describeDeleteTarget(opts: {
  mode: DeleteMode;
  olderThanDays: number;
  singleDay: string;
  rangeFrom: string;
  rangeTo: string;
  timeWindowDay: string;
  startTime: string;
  endTime: string;
  siteFilter: SiteFilter;
}): string {
  const site =
    opts.siteFilter === 'all'
      ? 'all sites'
      : opts.siteFilter === 'hydrogenro'
        ? 'hydrogenro.com'
        : 'elevenro.com';

  if (opts.mode === 'time_window') {
    return `${formatIstDateLabel(opts.timeWindowDay)}, ${formatTimePickerLabel(opts.startTime)} – ${formatTimePickerLabel(opts.endTime)} IST (${site})`;
  }
  if (opts.mode === 'older_than') {
    return `on or before ${formatIstDateLabel(subtractIstDays(getTodayIst(), opts.olderThanDays))} (older than ${opts.olderThanDays} days, ${site})`;
  }
  if (opts.mode === 'single_day') {
    return `${formatIstDateLabel(opts.singleDay)} IST (${site})`;
  }
  return `${formatIstDateLabel(opts.rangeFrom)} – ${formatIstDateLabel(opts.rangeTo)} IST (${site})`;
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

type WebsiteAnalyticsDataDeleteProps = {
  onDeleted?: () => void;
  className?: string;
};

export function WebsiteAnalyticsDataDelete({ onDeleted, className }: WebsiteAnalyticsDataDeleteProps) {
  const { isManager } = useAdminRole();
  const disabled = isManager;
  const disabledTitle = 'Restricted for Manager role';

  const todayIst = useMemo(() => getTodayIst(), []);
  const [mode, setMode] = useState<DeleteMode>('time_window');
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all');
  const [timeWindowDay, setTimeWindowDay] = useState(todayIst);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [olderThanDays, setOlderThanDays] = useState(90);
  const [singleDay, setSingleDay] = useState(todayIst);
  const [rangeFrom, setRangeFrom] = useState(todayIst);
  const [rangeTo, setRangeTo] = useState(todayIst);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewEvent[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const timeInvalid = mode === 'time_window' && startTime > endTime;

  const rpcParams = useMemo(() => {
    const siteKey = siteFilter === 'all' ? null : siteFilter;
    if (mode === 'time_window') {
      return {
        mode,
        olderThanDays: null as number | null,
        fromDate: timeWindowDay,
        toDate: timeWindowDay,
        startTime,
        endTime,
        siteKey,
      };
    }
    if (mode === 'older_than') {
      return {
        mode,
        olderThanDays,
        fromDate: null as string | null,
        toDate: null as string | null,
        startTime: null as string | null,
        endTime: null as string | null,
        siteKey,
      };
    }
    if (mode === 'single_day') {
      return {
        mode,
        olderThanDays: null as number | null,
        fromDate: singleDay,
        toDate: singleDay,
        startTime: null as string | null,
        endTime: null as string | null,
        siteKey,
      };
    }
    return {
      mode,
      olderThanDays: null as number | null,
      fromDate: rangeFrom <= rangeTo ? rangeFrom : rangeTo,
      toDate: rangeFrom <= rangeTo ? rangeTo : rangeFrom,
      startTime: null as string | null,
      endTime: null as string | null,
      siteKey,
    };
  }, [mode, siteFilter, olderThanDays, singleDay, rangeFrom, rangeTo, timeWindowDay, startTime, endTime]);

  const targetDescription = useMemo(
    () =>
      describeDeleteTarget({
        mode,
        olderThanDays,
        singleDay,
        rangeFrom: rpcParams.fromDate ?? rangeFrom,
        rangeTo: rpcParams.toDate ?? rangeTo,
        timeWindowDay,
        startTime,
        endTime,
        siteFilter,
      }),
    [mode, olderThanDays, singleDay, rangeFrom, rangeTo, timeWindowDay, startTime, endTime, siteFilter, rpcParams.fromDate, rpcParams.toDate]
  );

  useEffect(() => {
    setPreviewCount(null);
    setPreviewRows([]);
  }, [mode, siteFilter, olderThanDays, singleDay, rangeFrom, rangeTo, timeWindowDay, startTime, endTime]);

  const applyPreviewResult = (data: unknown) => {
    const payload = data as { match_count?: number; rows?: PreviewEvent[] } | null;
    const count = Number(payload?.match_count ?? 0);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    setPreviewCount(count);
    setPreviewRows(rows);
    return count;
  };

  const runPreview = useCallback(async () => {
    if (disabled || timeInvalid) return;
    setPreviewLoading(true);
    try {
      const { data, error } = await db.websiteAnalytics.previewDelete(rpcParams);
      if (error) throw error;
      const count = applyPreviewResult(data);
      if (count === 0) toast.info('No events match.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load preview';
      toast.error(
        msg.includes('preview_website_analytics_delete')
          ? 'Run scripts/add-website-analytics-delete-rpc.sql in Supabase first.'
          : msg
      );
      setPreviewCount(null);
      setPreviewRows([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [disabled, rpcParams, timeInvalid]);

  const runDelete = useCallback(async () => {
    if (disabled) return;
    setDeleting(true);
    try {
      const { data, error } = await db.websiteAnalytics.deleteEvents(rpcParams);
      if (error) throw error;
      const deleted = Number((data as { deleted_count?: number })?.deleted_count ?? 0);
      toast.success(`Deleted ${deleted.toLocaleString('en-IN')} event${deleted === 1 ? '' : 's'}.`);
      setPreviewCount(0);
      setPreviewRows([]);
      setDeleteOpen(false);
      onDeleted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      toast.error(
        msg.includes('delete_website_analytics_events')
          ? 'Run scripts/add-website-analytics-delete-rpc.sql in Supabase first.'
          : msg
      );
    } finally {
      setDeleting(false);
    }
  }, [disabled, rpcParams, onDeleted]);

  const handleDeleteClick = async () => {
    if (disabled || timeInvalid) return;
    setPreviewLoading(true);
    try {
      const { data, error } = await db.websiteAnalytics.previewDelete(rpcParams);
      if (error) throw error;
      const count = applyPreviewResult(data);
      if (count === 0) {
        toast.info('No events match.');
        return;
      }
      setDeleteOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load preview';
      toast.error(
        msg.includes('preview_website_analytics_delete')
          ? 'Run scripts/add-website-analytics-delete-rpc.sql in Supabase first.'
          : msg
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <div className={cn('space-y-4', className)}>
        {disabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{disabledTitle}</span>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FilterField label="Website">
              <Select
                value={siteFilter}
                onValueChange={(v) => setSiteFilter(v as SiteFilter)}
                disabled={disabled}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                  <SelectItem value="elevenro">Eleven RO</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="What to delete">
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as DeleteMode)}
                disabled={disabled}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELETE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </div>

          {mode === 'time_window' ? (
            <div className="space-y-4 pt-1 border-t border-border/60">
              <FilterField label="Date (IST)">
                <DatePicker
                  value={timeWindowDay}
                  onChange={(d) => d && setTimeWindowDay(d)}
                  placeholder="Pick date"
                  disabled={disabled}
                />
              </FilterField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FilterField label="From">
                  <TimePicker value={startTime} onChange={setStartTime} disabled={disabled} />
                </FilterField>
                <FilterField label="To">
                  <TimePicker value={endTime} onChange={setEndTime} disabled={disabled} />
                </FilterField>
              </div>
              {timeInvalid ? (
                <p className="text-xs text-destructive">End time must be after start time.</p>
              ) : null}
            </div>
          ) : null}

          {mode === 'single_day' ? (
            <div className="pt-1 border-t border-border/60">
              <FilterField label="Date (IST)">
                <DatePicker
                  value={singleDay}
                  onChange={(d) => d && setSingleDay(d)}
                  placeholder="Pick date"
                  disabled={disabled}
                />
              </FilterField>
            </div>
          ) : null}

          {mode === 'date_range' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-border/60">
              <FilterField label="From date">
                <DatePicker
                  value={rangeFrom}
                  onChange={(d) => d && setRangeFrom(d)}
                  placeholder="Start date"
                  disabled={disabled}
                />
              </FilterField>
              <FilterField label="To date">
                <DatePicker
                  value={rangeTo}
                  onChange={(d) => d && setRangeTo(d)}
                  placeholder="End date"
                  disabled={disabled}
                />
              </FilterField>
            </div>
          ) : null}

          {mode === 'older_than' ? (
            <div className="pt-1 border-t border-border/60">
              <FilterField label="Delete data older than">
                <Select
                  value={String(olderThanDays)}
                  onValueChange={(v) => setOlderThanDays(Number(v))}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
          ) : null}

          {previewCount !== null ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Will delete </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {previewCount.toLocaleString('en-IN')}
                </span>
                <span className="text-muted-foreground"> event{previewCount === 1 ? '' : 's'}</span>
                {previewCount > previewRows.length ? (
                  <span className="text-muted-foreground">
                    {' '}
                    (showing {previewRows.length} most recent)
                  </span>
                ) : null}
              </div>

              {previewRows.length > 0 ? (
                <>
                  <div className="space-y-2 md:hidden">
                    {previewRows.map((ev) => (
                      <div key={ev.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                          </Badge>
                          {siteFilter === 'all' ? (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {getPublicSiteLabel(ev.site_key)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[11px] font-medium tabular-nums">{formatPreviewEventTime(ev)}</p>
                        <p className="text-xs text-muted-foreground break-words">
                          {formatPreviewPagePath(ev.page_path)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block rounded-lg border border-border overflow-hidden bg-card">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="whitespace-nowrap">Time (IST)</TableHead>
                            <TableHead>Event</TableHead>
                            {siteFilter === 'all' ? <TableHead>Site</TableHead> : null}
                            <TableHead>Page</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((ev) => (
                            <TableRow key={ev.id}>
                              <TableCell className="whitespace-nowrap text-xs tabular-nums font-medium">
                                {formatPreviewEventTime(ev)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px] font-normal">
                                  {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                </Badge>
                              </TableCell>
                              {siteFilter === 'all' ? (
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {getPublicSiteLabel(ev.site_key)}
                                  </Badge>
                                </TableCell>
                              ) : null}
                              <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                                {formatPreviewPagePath(ev.page_path)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">No events match.</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto h-11 sm:h-10"
              disabled={disabled || previewLoading || timeInvalid}
              onClick={() => void runPreview()}
            >
              {previewLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview data
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto h-11 sm:h-10"
              disabled={disabled || deleting || previewLoading || timeInvalid}
              onClick={() => void handleDeleteClick()}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="w-[calc(100%-1.5rem)] max-w-md rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete analytics data?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2 text-sm">
              <span className="block">
                Permanently delete{' '}
                <strong>{(previewCount ?? 0).toLocaleString('en-IN')}</strong> events:
              </span>
              <span className="block rounded-md bg-muted/50 px-3 py-2 text-foreground/90 text-xs sm:text-sm">
                {targetDescription}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto mt-0" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void runDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
