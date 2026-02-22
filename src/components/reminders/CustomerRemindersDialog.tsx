import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format, addMonths } from 'date-fns';
import { Bell, Plus, Pencil, Trash2, Calendar, Check } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { AddReminderDialog } from './AddReminderDialog';
import type { Reminder } from '@/types';
import type { Customer } from '@/types';
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

function ReminderRow({
  r,
  onEdit,
  onDelete,
  onMarkDone,
}: {
  r: Reminder;
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
    <div className={`flex items-start gap-2 sm:gap-3 rounded-lg border p-2.5 sm:p-3 ${bgClass}`}>
      <Calendar className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <p className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">{r.title}</p>
          {badge && (
            <span
              className={`text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded ${
                isToday ? 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-200' :
                isTomorrow ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-200' :
                'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-200'
              }`}
            >
              {badge}
            </span>
          )}
          {r.interval_type && r.interval_value && (
            <span className="text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Every {r.interval_value} months
            </span>
          )}
        </div>
        {r.notes && <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">{r.notes}</p>}
        <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">
          {format(new Date(r.reminder_at), 'PPP')}
          {r.completed_at && (
            <span className="block text-green-600 dark:text-green-500 mt-0.5">Completed {format(new Date(r.completed_at), 'PPP')}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
        {!r.completed_at && (
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-green-600" onClick={onMarkDone} title="Mark done">
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-red-600" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
    </div>
  );
}

interface CustomerRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export function CustomerRemindersDialog({ open, onOpenChange, customer }: CustomerRemindersDialogProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    if (!customer?.id) return;
    setLoading(true);
    db.reminders.getByEntity('customer', customer.id, false).then(({ data, error }) => {
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setReminders((data as Reminder[]) || []);
    });
  };

  useEffect(() => {
    if (open && customer?.id) load();
  }, [open, customer?.id]);

  const handleMarkDone = async (r: Reminder) => {
    const { error } = await db.reminders.update(r.id, { completed_at: new Date().toISOString() });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (r.interval_type === 'months' && r.interval_value) {
      const nextDate = addMonths(new Date(r.reminder_at), r.interval_value);
      const nextAt = format(nextDate, 'yyyy-MM-dd');
      await db.reminders.create({
        entity_type: r.entity_type,
        entity_id: r.entity_id ?? null,
        title: r.title,
        notes: r.notes ?? null,
        reminder_at: nextAt,
        interval_type: 'months',
        interval_value: r.interval_value,
      });
      toast.success(`Next reminder set for ${format(nextDate, 'PPP')}.`);
    } else {
      toast.success('Marked done');
    }
    load();
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

  const customerName = (customer as any)?.full_name || customer?.fullName || 'Customer';
  const customerId = (customer as any)?.customer_id || customer?.customerId || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-3 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            Reminders – {customerName}
          </DialogTitle>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono">{customerId}</p>
        </DialogHeader>
        <div className="flex flex-col min-h-0 flex-1 gap-3">
          <div className="flex flex-shrink-0">
            <Button onClick={() => setAddOpen(true)} size="sm" className="w-full sm:w-auto min-h-9">
              <Plus className="h-4 w-4 mr-2" />
              Add reminder
            </Button>
          </div>
          <div className="space-y-2 overflow-y-auto min-h-0 flex-1 -mx-1 px-1">
            {loading ? (
              <p className="text-sm text-gray-500 py-4">Loading...</p>
            ) : reminders.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No reminders for this customer.</p>
            ) : (
              reminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  r={r}
                  onEdit={() => setEditReminder(r)}
                  onDelete={() => setDeleteId(r.id)}
                  onMarkDone={() => handleMarkDone(r)}
                />
              ))
            )}
          </div>
        </div>
      </DialogContent>

      <AddReminderDialog
        open={addOpen}
        onOpenChange={(o) => { setAddOpen(o); if (!o) load(); }}
        entity={customer ? { type: 'customer', id: customer.id } : { type: 'general', id: null }}
        contextLabel={customer ? `${customerName} (${customerId})` : undefined}
        onSaved={load}
      />
      <AddReminderDialog
        open={!!editReminder}
        onOpenChange={(o) => { if (!o) setEditReminder(null); }}
        entity={editReminder ? { type: editReminder.entity_type, id: editReminder.entity_id } : { type: 'general', id: null }}
        editReminder={editReminder || undefined}
        contextLabel={customer ? `${customerName} (${customerId})` : undefined}
        onSaved={() => { setEditReminder(null); load(); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reminder?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
