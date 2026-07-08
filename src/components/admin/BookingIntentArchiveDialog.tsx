import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn, handlePhoneTap, prefersDirectPhoneCall } from '@/lib/utils';
import { forceLightThemeClass } from '@/lib/force-light-theme';

export type BookingIntentArchiveRow = {
  id: string;
  source_id?: string | null;
  full_name: string;
  phone: string;
  phone_normalized?: string;
  site_key: string;
  current_step: number;
  intent_created_at?: string | null;
  intent_updated_at?: string | null;
  archived_at: string;
  booked_at?: string | null;
  booked_job_number?: string | null;
};

const PAGE_SIZE = 20;

const SITE_LABEL: Record<string, string> = {
  hydrogenro: 'HydrogenRO',
  elevenro: 'ElevenRO',
};

const STEP_LABEL: Record<number, string> = {
  1: 'Personal',
  2: 'Service',
  3: 'Location',
  4: 'Schedule',
  5: 'Review',
};

function formatIst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BookingIntentArchiveDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<BookingIntentArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BookingIntentArchiveRow | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, count } = await db.websiteBookingIntentArchive.list({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search,
    });
    setLoading(false);
    if (error) {
      toast.error('Could not load archived bookings');
      return;
    }
    setRows((data || []) as BookingIntentArchiveRow[]);
    setTotal(count ?? 0);
  }, [page, search]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSearchDraft('');
      setPage(0);
      setConfirmDelete(null);
      setConfirmClearAll(false);
    }
  }, [open]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchDraft.trim());
  };

  const onPhoneTap = async (phone: string) => {
    try {
      const action = await handlePhoneTap(phone);
      if (action === 'copy') toast.success('Phone copied');
    } catch {
      toast.error("Couldn't copy phone");
    }
  };

  const onDeleteOne = async (row: BookingIntentArchiveRow) => {
    setDeletingId(row.id);
    const { error } = await db.websiteBookingIntentArchive.deleteForever(row.id);
    setDeletingId(null);
    setConfirmDelete(null);
    if (error) {
      toast.error('Could not delete record');
      return;
    }
    toast.success('Record deleted');
    const nextTotal = Math.max(0, total - 1);
    const nextPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
    if (page >= nextPages) setPage(Math.max(0, nextPages - 1));
    else void load();
  };

  const onClearAll = async () => {
    setClearingAll(true);
    let deleted = 0;
    for (;;) {
      const { data, error } = await db.websiteBookingIntentArchive.list({ limit: 100, offset: 0 });
      if (error) {
        setClearingAll(false);
        setConfirmClearAll(false);
        toast.error('Could not clear archive');
        return;
      }
      const batch = (data || []) as BookingIntentArchiveRow[];
      if (!batch.length) break;
      const { error: delErr } = await db.websiteBookingIntentArchive.deleteForeverMany(
        batch.map((r) => r.id)
      );
      if (delErr) {
        setClearingAll(false);
        setConfirmClearAll(false);
        toast.error('Could not clear archive');
        void load();
        return;
      }
      deleted += batch.length;
      if (batch.length < 100) break;
    }
    setClearingAll(false);
    setConfirmClearAll(false);
    setPage(0);
    toast.success(deleted ? `Deleted ${deleted} record${deleted === 1 ? '' : 's'}` : 'Archive already empty');
    void load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className={cn(
            forceLightThemeClass,
            'max-w-3xl w-[calc(100%-1.5rem)] sm:w-full p-0 gap-0 overflow-hidden max-h-[90dvh] flex flex-col'
          )}
        >
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-base sm:text-lg">Done booking archive</DialogTitle>
                <p className="text-xs sm:text-sm text-muted-foreground font-normal">
                  Copied from live tracking when you click Done. Delete when you no longer need them.
                </p>
              </div>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="px-4 py-3 sm:px-6 border-b border-border space-y-3 shrink-0">
            <form onSubmit={onSearchSubmit} className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search name or phone"
                  className="pl-9 h-11 sm:h-9"
                  inputMode="search"
                />
              </div>
              <Button type="submit" variant="outline" className="h-11 sm:h-9 shrink-0 touch-manipulation">
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 touch-manipulation"
                onClick={() => void load()}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${total} archived`}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-destructive border-destructive/40 hover:bg-destructive/10 touch-manipulation"
                disabled={total === 0 || clearingAll || loading}
                onClick={() => setConfirmClearAll(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear all
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6">
            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No archived booking intents yet.
                <br />
                <span className="text-xs">Mark a live tracking row as Done to save it here.</span>
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-card px-3 py-3 text-sm"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground truncate">{r.full_name}</span>
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide shrink-0">
                            {SITE_LABEL[r.site_key] ?? r.site_key}
                          </Badge>
                          {r.booked_at ? (
                            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 text-[10px] uppercase shrink-0">
                              Booked{r.booked_job_number ? ` · ${r.booked_job_number}` : ''}
                            </Badge>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void onPhoneTap(r.phone)}
                          className="inline-flex items-center gap-1 text-sky-700 font-mono tabular-nums hover:underline touch-manipulation"
                          title={prefersDirectPhoneCall() ? 'Call' : 'Copy phone'}
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {r.phone}
                        </button>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>
                            Step {r.current_step}: {STEP_LABEL[r.current_step] ?? '—'}
                          </span>
                          <span>Started: {formatIst(r.intent_created_at)}</span>
                          <span>Done: {formatIst(r.archived_at)}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 self-end sm:self-start text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 touch-manipulation"
                        disabled={deletingId === r.id}
                        onClick={() => setConfirmDelete(r)}
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {total > PAGE_SIZE ? (
            <div className="px-4 py-3 sm:px-6 border-t border-border flex items-center justify-between gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 touch-manipulation"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 touch-manipulation"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className={forceLightThemeClass}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete forever?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `Remove ${confirmDelete.full_name} (${confirmDelete.phone}) from the archive. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && void onDeleteOne(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent className={forceLightThemeClass}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire archive?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete all {total} archived booking intent{total === 1 ? '' : 's'}. Live
              tracking is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearingAll}
              onClick={(e) => {
                e.preventDefault();
                void onClearAll();
              }}
            >
              {clearingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing…
                </>
              ) : (
                'Clear all'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
