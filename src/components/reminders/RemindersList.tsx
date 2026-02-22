import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, addMonths, subDays, startOfDay } from 'date-fns';
import { Bell, Plus, Pencil, Trash2, Calendar, Check } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { AddReminderDialog } from './AddReminderDialog';
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

const todayStr = new Date().toISOString().split('T')[0];
const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
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
        </div>
        {customerLabel && (
          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-0.5">
            {customerLabel.name} <span className="font-mono text-muted-foreground">({customerLabel.customerId})</span>
          </p>
        )}
        {r.notes && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{r.notes}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {format(new Date(r.reminder_at), 'PPP')}
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
        {!r.completed_at && (
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
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const load = () => {
    setLoading(true);
    db.reminders.getAll(includeCompleted).then(({ data, error }) => {
      if (error) {
        setLoading(false);
        toast.error(error.message);
        return;
      }
      let list = (data as Reminder[]) || [];
      if (includeCompleted) {
        const cutoff = startOfDay(subDays(new Date(), RECENT_COMPLETED_DAYS)).getTime();
        list = list.filter((r) => r.completed_at && new Date(r.completed_at).getTime() >= cutoff);
        list.sort((a, b) => (b.completed_at && a.completed_at ? new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime() : 0));
      }
      setReminders(list);
      const customerIds = [...new Set(list.filter((r) => r.entity_type === 'customer' && r.entity_id).map((r) => r.entity_id as string))];
      const labels: Record<string, CustomerLabel> = {};
      Promise.all(
        customerIds.map((id) =>
          db.customers.getById(id).then(({ data: c }) => {
            if (c) labels[id] = { name: (c as any).full_name || 'Customer', customerId: (c as any).customer_id || id.slice(0, 8) };
          })
        )
      ).then(() => setCustomerLabels(labels));
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, [includeCompleted]);

  const handleEdit = (r: Reminder) => {
    setEditReminder(r);
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.reminders.delete(id);
    if (error) toast.error(error.message);
    else {
      toast.success('Reminder deleted');
      setDeleteId(null);
      load();
    }
  };

  const handleMarkDone = async (r: Reminder) => {
    const { error } = await db.reminders.update(r.id, {
      completed_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (r.interval_type === 'months' && r.interval_value) {
      const base = new Date(r.reminder_at);
      const nextDate = addMonths(base, r.interval_value);
      const nextAt = format(nextDate, 'yyyy-MM-dd');
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
    load();
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
                onChange={(e) => setIncludeCompleted(e.target.checked)}
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
          </div>
        )}
      </CardContent>

      <AddReminderDialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) load();
        }}
        entity={{ type: 'general', id: null }}
        onSaved={load}
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
          load();
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
