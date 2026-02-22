import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format, addMonths } from 'date-fns';
import { Bell, Calendar, CalendarClock } from 'lucide-react';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AddReminderDialog } from './AddReminderDialog';
import type { Reminder } from '@/types';

// Only set when user clicks "Got it" (marks complete). Close/X does NOT set this, so popup shows again on next load until Got it.
const SESSION_KEY = 'reminders_popup_gotit_date';

type CustomerLabel = { name: string; customerId: string };

export function TodayRemindersPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [todayReminders, setTodayReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [rescheduleReminder, setRescheduleReminder] = useState<Reminder | null>(null);
  const [markingDone, setMarkingDone] = useState(false);

  const loadToday = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    db.reminders.getForTodayAndTomorrow().then(({ data, error }) => {
      if (error || !data) return;
      const forToday = (data as Reminder[]).filter((r) => r.reminder_at === today);
      setTodayReminders(forToday);
      const customerIds = [...new Set(
        (data as Reminder[])
          .filter((r) => r.entity_type === 'customer' && r.entity_id)
          .map((r) => r.entity_id as string)
      )];
      const labels: Record<string, CustomerLabel> = {};
      Promise.all(
        customerIds.map((id) =>
          db.customers.getById(id).then(({ data: c }) => {
            if (c) labels[id] = { name: (c as any).full_name || 'Customer', customerId: (c as any).customer_id || id.slice(0, 8) };
          })
        )
      ).then(() => setCustomerLabels(labels));
    });
  }, []);

  // Show popup when there are today's reminders. Re-runs on every mount (refresh or navigate to admin/settings/technician).
  // As long as those reminders exist and user hasn't clicked "Got it", popup shows again. Only "Got it" sets SESSION_KEY for today.
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const gotItToday = sessionStorage.getItem(SESSION_KEY);
    if (gotItToday === today) return;

    db.reminders.getForTodayAndTomorrow().then(({ data, error }) => {
      if (error || !data) return;
      const forToday = (data as Reminder[]).filter((r) => r.reminder_at === today);
      if (forToday.length > 0) {
        setTodayReminders(forToday);
        setOpen(true);
        const customerIds = [...new Set(
          forToday
            .filter((r) => r.entity_type === 'customer' && r.entity_id)
            .map((r) => r.entity_id as string)
        )];
        const labels: Record<string, CustomerLabel> = {};
        Promise.all(
          customerIds.map((id) =>
            db.customers.getById(id).then(({ data: c }) => {
              if (c) labels[id] = { name: (c as any).full_name || 'Customer', customerId: (c as any).customer_id || id.slice(0, 8) };
            })
          )
        ).then(() => setCustomerLabels(labels));
      }
    });
  }, []);

  const markOneCompleted = async (r: Reminder) => {
    const now = new Date().toISOString();
    if (r.entity_type === 'job' && r.entity_id) {
      const { error: jobError } = await db.jobs.update(r.entity_id, {
        status: 'COMPLETED',
        completed_at: now,
        end_time: now,
        completed_by: (user as any)?.id || (user as any)?.technicianId || null,
      } as any);
      if (jobError) toast.error('Job could not be marked completed: ' + jobError.message);
    }
    const { error } = await db.reminders.update(r.id, { completed_at: now });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (r.interval_type === 'months' && r.interval_value) {
      const base = new Date(r.reminder_at);
      const nextDate = addMonths(base, r.interval_value);
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
    }
  };

  const handleGotIt = async () => {
    if (todayReminders.length === 0) {
      setOpen(false);
      sessionStorage.setItem(SESSION_KEY, new Date().toISOString().split('T')[0]);
      return;
    }
    setMarkingDone(true);
    try {
      for (const r of todayReminders) {
        await markOneCompleted(r);
      }
      toast.success('Job(s) marked as completed. Popup will not show again today.');
      setOpen(false);
      sessionStorage.setItem(SESSION_KEY, new Date().toISOString().split('T')[0]);
    } catch {
      toast.error('Failed to mark some reminders');
    } finally {
      setMarkingDone(false);
    }
  };

  // Only close the dialog when X or overlay clicked; do NOT set sessionStorage so popup can show again.
  // SessionStorage is set only when "Got it" is pressed (in handleGotIt), so popup won't show again today only after marking complete.
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-3 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Bell className="h-5 w-5 text-amber-500 shrink-0" />
              Reminders for today
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 sm:space-y-3 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto min-h-0 -mx-1 px-1">
            {todayReminders.map((r) => {
              const customer = r.entity_type === 'customer' && r.entity_id ? customerLabels[r.entity_id] : null;
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 sm:p-3"
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <Calendar className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100">{r.title}</p>
                      {customer && (
                        <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                          {customer.name} <span className="font-mono text-gray-500">({customer.customerId})</span>
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">{r.notes}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                        Due: {format(new Date(r.reminder_at), 'PPP')}
                      </p>
                      {r.interval_type === 'months' && r.interval_value && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          Repeats every {r.interval_value} months – next reminder will be created for {format(addMonths(new Date(r.reminder_at), r.interval_value), 'PPP')} when you click Got it.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1 border-t border-amber-200 dark:border-amber-800">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs min-h-9 touch-manipulation"
                      onClick={() => setRescheduleReminder(r)}
                    >
                      <CalendarClock className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      Schedule again
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 flex-shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)} className="min-h-9 w-full sm:w-auto touch-manipulation">
              Close
            </Button>
            <Button onClick={handleGotIt} disabled={markingDone} className="min-h-9 w-full sm:w-auto touch-manipulation">
              {markingDone ? 'Marking...' : 'Got it'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">&quot;Got it&quot; marks the job as completed (when linked to a job) and stops this popup for today.</p>
        </DialogContent>
      </Dialog>

      <AddReminderDialog
        open={!!rescheduleReminder}
        onOpenChange={(o) => {
          if (!o) setRescheduleReminder(null);
        }}
        entity={
          rescheduleReminder
            ? { type: rescheduleReminder.entity_type, id: rescheduleReminder.entity_id }
            : { type: 'general', id: null }
        }
        contextLabel={
          rescheduleReminder && rescheduleReminder.entity_id && customerLabels[rescheduleReminder.entity_id]
            ? `${customerLabels[rescheduleReminder.entity_id].name} (${customerLabels[rescheduleReminder.entity_id].customerId})`
            : undefined
        }
        editReminder={rescheduleReminder || undefined}
        onSaved={() => {
          setRescheduleReminder(null);
          loadToday();
        }}
      />
    </>
  );
}
