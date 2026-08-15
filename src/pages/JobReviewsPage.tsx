import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  AnalyticsListPagination,
  ANALYTICS_LIST_SCROLL_ANCHOR_CLASS,
  AnalyticsListLoadingOverlay,
} from '@/components/admin/AnalyticsListPagination';
import {
  deleteJobReview,
  fetchJobReviewTechnicianStats,
  fetchSubmittedJobReviewsPage,
  type JobReviewListRow,
  type JobReviewTechStat,
} from '@/lib/jobReviews';
import { getDocumentBrandLabel, type DocumentBrand } from '@/lib/service-brands';
import { cn } from '@/lib/utils';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
};

const PAGE_SIZE = 20;

const Stars = memo(function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
        />
      ))}
    </span>
  );
});

function formatReviewWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const ReviewRow = memo(function ReviewRow({
  row,
  onDelete,
  deleting,
}: {
  row: JobReviewListRow;
  onDelete: (row: JobReviewListRow) => void;
  deleting: boolean;
}) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{row.technicianName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {row.customerName} · {getDocumentBrandLabel(row.brand)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Stars rating={row.rating} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
            aria-label="Delete review"
            title="Delete review"
            disabled={deleting}
            onClick={() => onDelete(row)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {row.comment ? (
        <p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap break-words">{row.comment}</p>
      ) : null}
      {row.submittedAt ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{formatReviewWhen(row.submittedAt)}</p>
      ) : null}
    </li>
  );
});

export default function JobReviewsPage({ hideHeader, onBack }: Props) {
  const [stats, setStats] = useState<JobReviewTechStat[]>([]);
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [rows, setRows] = useState<JobReviewListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [listLoading, setListLoading] = useState(true);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [brand, setBrand] = useState<DocumentBrand | 'all'>('all');
  const [pendingDelete, setPendingDelete] = useState<JobReviewListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reloadStats = useCallback(() => {
    setStatsLoading(true);
    void fetchJobReviewTechnicianStats({ force: true }).then((result) => {
      setStats(result.technicians);
      setStatsTotal(result.total);
      setStatsLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    void fetchJobReviewTechnicianStats().then((result) => {
      if (cancelled) return;
      setStats(result.technicians);
      setStatsTotal(result.total);
      setStatsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    void fetchSubmittedJobReviewsPage({
      page,
      pageSize,
      technicianId,
      brand,
    }).then((result) => {
      if (cancelled) return;
      setRows(result.rows);
      setTotal(result.total);
      setListLoading(false);
      const pages = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > pages) setPage(pages);
    });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, technicianId, brand, listReloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const overallAvg = useMemo(() => {
    const n = stats.reduce((sum, t) => sum + t.avg * t.count, 0);
    const d = stats.reduce((sum, t) => sum + t.count, 0);
    return d > 0 ? n / d : 0;
  }, [stats]);

  const onSelectTech = useCallback((id: string | null) => {
    setTechnicianId((prev) => (prev === id ? null : id));
    setPage(1);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteJobReview(pendingDelete.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error || 'Could not delete review');
      return;
    }
    toast.success('Review deleted');
    setPendingDelete(null);
    setListReloadKey((n) => n + 1);
    reloadStats();
  }, [pendingDelete, reloadStats]);

  return (
    <div className={hideHeader ? '' : 'space-y-4'}>
      {!hideHeader && onBack && (
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Reviews after Complete Job, tied to the technician on that visit.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reviews</p>
          <p className="text-lg font-semibold tabular-nums">{statsLoading ? '…' : statsTotal}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Average</p>
          <p className="text-lg font-semibold tabular-nums">
            {statsLoading || statsTotal === 0 ? '—' : overallAvg.toFixed(1)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              setBrand('all');
              setPage(1);
            }}
            className={cn(
              'h-8 rounded-md px-2 text-xs font-medium',
              brand === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setBrand('hydrogenro');
              setPage(1);
            }}
            className={cn(
              'h-8 rounded-md px-2 text-xs font-medium',
              brand === 'hydrogenro' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}
          >
            Hydrogen
          </button>
          <button
            type="button"
            onClick={() => {
              setBrand('elevenro');
              setPage(1);
            }}
            className={cn(
              'h-8 rounded-md px-2 text-xs font-medium',
              brand === 'elevenro' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}
          >
            Eleven
          </button>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {stats.map((t) => {
            const id = t.technicianId;
            const selected = id != null && technicianId === id;
            return (
              <button
                key={id || t.technicianName}
                type="button"
                onClick={() => onSelectTech(id)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-foreground bg-muted/60' : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <p className="font-medium text-sm truncate">{t.technicianName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.avg.toFixed(1)} avg · {t.count} review{t.count === 1 ? '' : 's'}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {technicianId && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => onSelectTech(null)}
        >
          Clear technician filter
        </button>
      )}

      <div id="job-reviews-list" className={cn('relative min-h-[8rem]', ANALYTICS_LIST_SCROLL_ANCHOR_CLASS)}>
        <AnalyticsListLoadingOverlay loading={listLoading && rows.length > 0} />
        {listLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading reviews…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviews yet. Complete a job with “Ask customer to review” on.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <ReviewRow
                key={row.id}
                row={row}
                deleting={deleting && pendingDelete?.id === row.id}
                onDelete={setPendingDelete}
              />
            ))}
          </ul>
        )}
      </div>

      {total > 0 && (
        <AnalyticsListPagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={pageSize}
          itemLabel="reviews"
          scrollAnchorId="job-reviews-list"
          loading={listLoading}
          onPageChange={setPage}
          onItemsPerPageChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the customer rating
              {pendingDelete?.technicianName ? ` for ${pendingDelete.technicianName}` : ''}
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 cursor-pointer"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
