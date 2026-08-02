import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Bell, Plus, Pencil, Trash2, Calendar, Check } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { AddReminderDialog } from './AddReminderDialog';
import type { Reminder } from '@/types';
import {
  addMonthsToReminderAt,
  getLocalCalendarDateYmd,
  getLocalTomorrowYmd,
  isPendingPaymentReminderTitle,
  parsePendingPaymentReminderNotes,
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

const todayStr = getLocalCalendarDateYmd();
const tomorrowStr = getLocalTomorrowYmd();
const RECENT_COMPLETED_DAYS = 7;

type CustomerLabel = { name: string; customerId: string };

export function ReminderRow({
  r,
  customerLabel,
  onEdit,
  onDelete,
  onMarkDone,
}: {
  r: Reminder;
  customerLabel?: CustomerLabel | null;
  onEdit: () => void;
  onDelete: () => void;
  onMarkDone: () => void;
}) {
  const isToday = r.reminder_at === todayStr;
  const isTomorrow = r.reminder_at === tomorrowStr;
  const isPast = r.reminder_at < todayStr && !r.completed_at;

  const bgClass = isToday
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
    : isTomorrow
    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
    : isPast
    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
    : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700';

  const badge = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : isPast ? 'Overdue' : null;
  const isPendingPayment = isPendingPaymentReminderTitle(r.title);
  const pendingParsed = isPendingPayment ? parsePendingPaymentReminderNotes(r.notes) : null;
  const dueDate = parseReminderAtLocalDate(r.reminder_at);

  return (
    <div
      className={`flex items-start gap-2 sm:gap-3 rounded-lg border p-2.5 sm:p-3 ${bgClass}`}
    >
      <Calendar className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <p className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">{r.title}</p>
          {badge && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                isToday
                  ? 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-200'
                  : isTomorrow
                  ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-200'
                  : 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-200'
              }`}
            >
              {badge}
            </span>
          )}
          {r.interval_type && r.interval_value && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Every {r.interval_value} months
            </span>
          )}
          {r.entity_type === 'general' && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
              General
            </span>
          )}
        </div>
        {customerLabel && (
          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-0.5">
            {customerLabel.name} <span className="font-mono text-muted-foreground">({customerLabel.customerId})</span>
          </p>
        )}
        {isPendingPayment && pendingParsed && pendingParsed.amount_pending > 0 && (
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
            ₹{pendingParsed.amount_pending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
        )}
        {isPendingPayment && pendingParsed?.note && (
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">{pendingParsed.note}</p>
        )}
        {!isPendingPayment && r.notes && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{r.notes}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Due: {format(dueDate, 'PPP')}
          {r.entity_type !== 'general' && !customerLabel && (
            <span className="ml-2 text-muted-foreground">({r.entity_type})</span>
          )}
          {r.completed_at && (
            <span className="block text-green-600 dark:text-green-500 mt-0.5">
              Completed {format(new Date(r.completed_at), 'PPP')}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 touch-manipulation" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        {!r.completed_at && !isPendingPayment && (
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-green-600 touch-manipulation" onClick={onMarkDone} title="Mark done">
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-red-600 touch-manipulation" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
    </div>
  );
}

export function RemindersList() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const loadGenRef = useRef(0);

  const PAGE_SIZE = 20;

  const load = useCallback(
    async (opts?: { page?: number; includeCompleted?: boolean }) => {
      const nextPage = opts?.page ?? page;
      const include = opts?.includeCompleted ?? includeCompleted;
      const gen = ++loadGenRef.current;
      setLoading(true);
      try {
        const { data, error, count } = await db.reminders.getSettingsRemindersPaginated({
          page: nextPage,
          pageSize: PAGE_SIZE,
          mode: include ? 'completed_recent' : 'active',
          completedDays: RECENT_COMPLETED_DAYS,
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
        const customerIds = [
          ...new Set(
            list.filter((r) => r.entity_type === 'customer' && r.entity_id).map((r) => r.entity_id as string)
          ),
        ];
        const labels: Record<string, CustomerLabel> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await db.customers.getByIds(customerIds);
          (customers || []).forEach((c: any) => {
            if (c?.id) labels[c.id] = { name: c.full_name || 'Customer', customerId: c.customer_id || c.id.slice(0, 8) };
          });
        }
        setCustomerLabels(labels);
      } catch (err: any) {
        if (gen !== loadGenRef.current) return;
        toast.error(err?.message || 'Failed to load reminders');
      } finally {
        if (gen === loadGenRef.current) setLoading(false);
      }
    },
    [page, includeCompleted]
  );

  useEffect(() => {
    void load({ page, includeCompleted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, includeCompleted]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const handleEdit = (r: Reminder) => {
    setEditReminder(r);
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.reminders.delete(id);
    if (error) toast.error(error.message);
    else {
      toast.success('Reminder deleted');
      setDeleteId(null);
      void load({ page: currentPage });
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
      if (createError) toast.error('Marked done but failed to create next: ' + createError.message);
      else toast.success(`Marked done. Next reminder set for ${format(nextDate, 'PPP')}.`);
    } else {
      toast.success('Marked done');
    }
    void load({ page: currentPage });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Bell className="w-5 h-5" />
              Reminders
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              View and edit all reminders. Today = amber, Tomorrow = blue, Overdue = red.
              {includeCompleted && ` Showing completed from the last ${RECENT_COMPLETED_DAYS} days.`}
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
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
            <Button onClick={() => setAddOpen(true)} size="sm" className="w-full sm:w-auto min-h-9 touch-manipulation">
              <Plus className="w-4 h-4 mr-2" />
              Add reminder
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : reminders.length === 0 ? (
          <p className="text-sm text-gray-500">
            {includeCompleted ? `No completed reminders in the last ${RECENT_COMPLETED_DAYS} days.` : 'No reminders. Add one from here or from a customer/job.'}
          </p>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <ReminderRow
                key={r.id}
                r={r}
                customerLabel={r.entity_type === 'customer' && r.entity_id ? customerLabels[r.entity_id] : null}
                onEdit={() => handleEdit(r)}
                onDelete={() => setDeleteId(r.id)}
                onMarkDone={() => handleMarkDone(r)}
              />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 pt-3 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({totalCount} reminder{totalCount !== 1 ? 's' : ''})
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
          </div>
        )}
      </CardContent>

      <AddReminderDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) void load({ page: currentPage });
        }}
        entity={{ type: 'general', id: null }}
        onSaved={() => void load({ page: currentPage })}
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
          void load({ page: currentPage });
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
    </Card>
  );
}
