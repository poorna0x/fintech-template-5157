import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, Search } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { ReminderRow } from '@/components/reminders/RemindersList';
import type { Reminder } from '@/types';
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
import { AddReminderDialog } from './AddReminderDialog';
import {
  addMonthsToReminderAt,
  isPendingPaymentReminderTitle,
  parseReminderAtLocalDate,
} from '@/lib/pendingPaymentReminder';

const RECENT_COMPLETED_DAYS = 7;
const UPCOMING_DAYS = 7;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type CustomerLabel = { name: string; customerId: string };
type SettingsRemindersMode = 'upcoming' | 'active' | 'completed_recent';

interface SettingsRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialReminderId?: string | null;
}

function modeFromFlags(
  includeCompleted: boolean,
  showAllReminders: boolean,
  showUpcomingOnly: boolean
): SettingsRemindersMode {
  if (includeCompleted) return 'completed_recent';
  if (showAllReminders) return 'active';
  if (showUpcomingOnly) return 'upcoming';
  return 'active';
}

export function SettingsRemindersDialog({
  open,
  onOpenChange,
  initialReminderId = null,
}: SettingsRemindersDialogProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [highlightReminderId, setHighlightReminderId] = useState<string | null>(null);
  const [deepLinkOnly, setDeepLinkOnly] = useState(false);
  const deepLinkHandledRef = useRef<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadGenRef = useRef(0);
  /** Skip the auto-reload effect once after an explicit loadPage that already fetched. */
  const suppressAutoLoadRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const loadLabelsFor = useCallback(async (list: Reminder[]) => {
    const customerIds = [
      ...new Set(
        list.filter((r) => r.entity_type === 'customer' && r.entity_id).map((r) => r.entity_id as string)
      ),
    ];
    if (customerIds.length === 0) {
      setCustomerLabels({});
      return;
    }
    const labels: Record<string, CustomerLabel> = {};
    const { data: customers } = await db.customers.getByIds(customerIds);
    (customers || []).forEach((c: any) => {
      if (c?.id) labels[c.id] = { name: c.full_name || 'Customer', customerId: c.customer_id || c.id.slice(0, 8) };
    });
    setCustomerLabels(labels);
  }, []);

  const loadPage = useCallback(
    async (opts?: {
      page?: number;
      includeCompleted?: boolean;
      showAll?: boolean;
      showUpcoming?: boolean;
      search?: string;
    }) => {
      const nextPage = opts?.page ?? page;
      const include = opts?.includeCompleted ?? includeCompleted;
      const showAll = opts?.showAll ?? showAllReminders;
      const showUpcoming = opts?.showUpcoming ?? showUpcomingOnly;
      const search = opts?.search ?? debouncedSearch;
      const mode = modeFromFlags(include, showAll, showUpcoming);

      const gen = ++loadGenRef.current;
      setLoading(true);
      setDeepLinkOnly(false);
      try {
        let customerIds: string[] | undefined;
        if (search) {
          const { data: custs } = await db.customers.searchSlim(search, 40);
          customerIds = (custs || []).map((c: any) => c?.id).filter(Boolean) as string[];
        }
        const { data, error, count } = await db.reminders.getSettingsRemindersPaginated({
          page: nextPage,
          pageSize: PAGE_SIZE,
          mode,
          upcomingDays: UPCOMING_DAYS,
          completedDays: RECENT_COMPLETED_DAYS,
          search: search || undefined,
          customerIds,
        });
        if (gen !== loadGenRef.current) return;
        if (error) {
          toast.error(error.message);
          return;
        }
        const list = data || [];
        setReminders(list);
        setTotalCount(count || 0);
        setPage(nextPage);
        await loadLabelsFor(list);
        suppressAutoLoadRef.current = true;
        setLoaded(true);
      } catch (err: any) {
        if (gen !== loadGenRef.current) return;
        toast.error(err?.message || 'Failed to load reminders');
      } finally {
        if (gen === loadGenRef.current) setLoading(false);
      }
    },
    [
      page,
      includeCompleted,
      showAllReminders,
      showUpcomingOnly,
      debouncedSearch,
      loadLabelsFor,
    ]
  );

  useEffect(() => {
    if (!open || !initialReminderId) return;
    if (deepLinkHandledRef.current === initialReminderId) return;
    deepLinkHandledRef.current = initialReminderId;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setShowUpcomingOnly(false);
      setShowAllReminders(true);
      setIncludeCompleted(false);
      setHighlightReminderId(initialReminderId);
      try {
        const { data, error } = await db.reminders.getById(initialReminderId);
        if (cancelled) return;
        if (error || !data) {
          toast.error(error?.message || 'Reminder not found');
          setLoaded(true);
          return;
        }
        setReminders([data]);
        setTotalCount(1);
        setPage(1);
        setDeepLinkOnly(true);
        await loadLabelsFor([data]);
        setLoaded(true);
        window.setTimeout(() => {
          rowRefs.current[initialReminderId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialReminderId, loadLabelsFor]);

  // Re-fetch when page / filters / debounced search change (after first Load / Refresh).
  useEffect(() => {
    if (!loaded || deepLinkOnly) return;
    if (suppressAutoLoadRef.current) {
      suppressAutoLoadRef.current = false;
      return;
    }
    void loadPage({ page, search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPage identity changes often; deps are the real triggers
  }, [
    page,
    includeCompleted,
    showAllReminders,
    showUpcomingOnly,
    debouncedSearch,
    loaded,
    deepLinkOnly,
  ]);

  useEffect(() => {
    if (!highlightReminderId || !loaded) return;
    window.setTimeout(() => {
      rowRefs.current[highlightReminderId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [highlightReminderId, loaded, reminders]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const handleDelete = async (id: string) => {
    const { error } = await db.reminders.delete(id);
    if (error) toast.error(error.message);
    else {
      toast.success('Reminder deleted');
      setDeleteId(null);
      void loadPage({ page: currentPage });
    }
  };

  const handleMarkDone = async (r: Reminder) => {
    if (isPendingPaymentReminderTitle(r.title)) {
      toast.info('Mark pending payments as collected inside Pending payments.');
      return;
    }

    const { error } = await db.reminders.update(r.id, {
      completed_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (r.interval_type === 'months' && r.interval_value) {
      const nextAt = addMonthsToReminderAt(r.reminder_at, r.interval_value);
      const nextDate = parseReminderAtLocalDate(nextAt);
      const { error: createError } = await db.reminders.create({
        entity_type: r.entity_type,
        entity_id: r.entity_id ?? null,
        title: r.title,
        notes: r.notes ?? null,
        reminder_at: nextAt,
        interval_type: 'months',
        interval_value: r.interval_value,
      });
      if (createError)
        toast.error('Marked done but failed to create next: ' + createError.message);
      else toast.success(`Marked done. Next reminder set for ${format(nextDate, 'PPP')}.`);
    } else {
      toast.success('Marked done');
    }
    void loadPage({ page: currentPage });
  };

  const handleIncludeChange = (checked: boolean) => {
    setIncludeCompleted(checked);
    if (checked) {
      setShowAllReminders(false);
      setShowUpcomingOnly(false);
    }
    setPage(1);
    setDeepLinkOnly(false);
  };

  const handleShowAllChange = (checked: boolean) => {
    setShowAllReminders(checked);
    if (checked) {
      setIncludeCompleted(false);
      setShowUpcomingOnly(false);
    }
    setPage(1);
    setDeepLinkOnly(false);
  };

  const handleShowUpcomingChange = (checked: boolean) => {
    setShowUpcomingOnly(checked);
    if (checked) {
      setIncludeCompleted(false);
      setShowAllReminders(false);
    }
    setPage(1);
    setDeepLinkOnly(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Bell className="w-5 h-5" />
            Reminders
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            View and search reminders. Today = amber, Tomorrow = blue, Overdue = red.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {!loaded ? (
            <Button
              onClick={() =>
                void loadPage({
                  page: 1,
                  includeCompleted: false,
                  showAll: false,
                  showUpcoming: true,
                })
              }
              disabled={loading}
              className="w-full sm:w-auto min-h-9"
            >
              {loading ? 'Loading...' : 'Load reminders'}
            </Button>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs sm:text-sm min-h-9">
                  <input
                    type="checkbox"
                    checked={includeCompleted}
                    onChange={(e) => handleIncludeChange(e.target.checked)}
                    className="rounded"
                  />
                  Include recent completed (last {RECENT_COMPLETED_DAYS} days)
                </label>
                <label className="flex items-center gap-2 text-xs sm:text-sm min-h-9">
                  <input
                    type="checkbox"
                    checked={showAllReminders}
                    onChange={(e) => handleShowAllChange(e.target.checked)}
                    className="rounded"
                  />
                  Show only active reminders
                </label>
                <label className="flex items-center gap-2 text-xs sm:text-sm min-h-9">
                  <input
                    type="checkbox"
                    checked={showUpcomingOnly}
                    onChange={(e) => handleShowUpcomingChange(e.target.checked)}
                    className="rounded"
                  />
                  Show upcoming (next {UPCOMING_DAYS} days)
                </label>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer, title, notes, or “general”…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                    setDeepLinkOnly(false);
                  }}
                  className="pl-9 min-h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeepLinkOnly(false);
                  void loadPage({ page: currentPage });
                }}
                disabled={loading}
                className="w-full sm:w-auto min-h-9"
              >
                {loading ? 'Refreshing...' : 'Refresh list'}
              </Button>
            </>
          )}

          {loaded && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
              {reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? 'No reminders match your search.'
                    : showUpcomingOnly
                      ? `No upcoming reminders in the next ${UPCOMING_DAYS} days.`
                      : showAllReminders || !includeCompleted
                        ? 'No active reminders.'
                        : `No completed reminders in the last ${RECENT_COMPLETED_DAYS} days.`}
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {reminders.map((r) => (
                      <div
                        key={r.id}
                        ref={(el) => {
                          rowRefs.current[r.id] = el;
                        }}
                        className={
                          highlightReminderId === r.id ? 'rounded-lg ring-2 ring-amber-500' : undefined
                        }
                      >
                        <ReminderRow
                          r={r}
                          customerLabel={
                            r.entity_type === 'customer' && r.entity_id
                              ? customerLabels[r.entity_id]
                              : null
                          }
                          onEdit={() => setEditReminder(r)}
                          onDelete={() => setDeleteId(r.id)}
                          onMarkDone={() => handleMarkDone(r)}
                        />
                      </div>
                    ))}
                  </div>
                  {!deepLinkOnly && totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 pt-3 border-t sticky bottom-0 bg-background">
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages} ({totalCount} reminder
                        {totalCount !== 1 ? 's' : ''})
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1 || loading}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages || loading}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <AddReminderDialog
          open={!!editReminder}
          onOpenChange={(o) => {
            if (!o) setEditReminder(null);
          }}
          entity={
            editReminder
              ? { type: editReminder.entity_type, id: editReminder.entity_id }
              : { type: 'general', id: null }
          }
          editReminder={editReminder || undefined}
          onSaved={() => {
            setEditReminder(null);
            setDeepLinkOnly(false);
            void loadPage({ page: currentPage });
          }}
        />

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete reminder?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteId && handleDelete(deleteId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
