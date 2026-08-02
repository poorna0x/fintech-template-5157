import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Bell, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
import { ReminderRow } from '@/components/reminders/RemindersList';
import type { Reminder } from '@/types';
import {
  addMonthsToReminderAt,
  isPendingPaymentReminderTitle,
  parseReminderAtLocalDate,
} from '@/lib/pendingPaymentReminder';
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

const RECENT_COMPLETED_DAYS = 7;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type CustomerLabel = { name: string; customerId: string };

export default function SettingsRemindersPage() {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const loadGenRef = useRef(0);
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
    async (opts?: { page?: number; includeCompleted?: boolean; search?: string }) => {
      const nextPage = opts?.page ?? page;
      const include = opts?.includeCompleted ?? includeCompleted;
      const search = opts?.search ?? debouncedSearch;
      const gen = ++loadGenRef.current;
      setLoading(true);
      try {
        let customerIds: string[] | undefined;
        if (search) {
          const { data: custs } = await db.customers.searchSlim(search, 40);
          customerIds = (custs || []).map((c: any) => c?.id).filter(Boolean) as string[];
        }
        const { data, error, count } = await db.reminders.getSettingsRemindersPaginated({
          page: nextPage,
          pageSize: PAGE_SIZE,
          mode: include ? 'completed_recent' : 'active',
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
    [page, includeCompleted, debouncedSearch, loadLabelsFor]
  );

  useEffect(() => {
    if (!loaded) return;
    if (suppressAutoLoadRef.current) {
      suppressAutoLoadRef.current = false;
      return;
    }
    void loadPage({ page, search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, includeCompleted, debouncedSearch, loaded]);

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

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2"
          onClick={() => navigate('/settings')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Bell className="w-5 h-5" />
                  Reminders
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Load reminders to view and edit. Add general reminders (not linked to a customer) or link one to a customer. Today = amber, Tomorrow = blue, Overdue = red.
                </CardDescription>
              </div>
              {!loaded ? (
                <Button
                  onClick={() => void loadPage({ page: 1, includeCompleted: false })}
                  disabled={loading}
                  className="w-full sm:w-auto min-h-9"
                >
                  {loading ? 'Loading...' : 'Load reminders'}
                </Button>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-xs sm:text-sm min-h-9">
                    <input
                      type="checkbox"
                      checked={includeCompleted}
                      onChange={(e) => {
                        setIncludeCompleted(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded"
                    />
                    Show completed (last {RECENT_COMPLETED_DAYS} days)
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by customer, title, notes, or “general”…"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9 min-h-9"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => setAddOpen(true)}
                      size="sm"
                      className="min-h-9"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add reminder
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadPage({ page: currentPage })}
                      disabled={loading}
                      className="min-h-9"
                    >
                      {loading ? 'Refreshing...' : 'Refresh list'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardHeader>
          {loaded && (
            <CardContent className="p-4 sm:p-6 pt-0">
              {reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? 'No reminders match your search.'
                    : includeCompleted
                      ? `No completed reminders in the last ${RECENT_COMPLETED_DAYS} days.`
                      : 'No reminders. Add one from here or from a customer.'}
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {reminders.map((r) => (
                      <ReminderRow
                        key={r.id}
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
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
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
            </CardContent>
          )}
        </Card>

        <AddReminderDialog
          open={addOpen}
          onOpenChange={(o) => {
            setAddOpen(o);
            if (!o) void loadPage({ page: currentPage });
          }}
          entity={{ type: 'general', id: null }}
          allowChooseCustomer
          onSaved={() => void loadPage({ page: currentPage })}
        />
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
      </div>
    </div>
  );
}
