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

type CustomerLabel = { name: string; customerId: string };

export function TodayRemindersPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [todayReminders, setTodayReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [rescheduleReminder, setRescheduleReminder] = useState<Reminder | null>(null);
  const [markingDone, setMarkingDone] = useState(false);

  const loadToday = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
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
      db.customers.getByIds(customerIds).then(({ data: customers }) => {
        (customers || []).forEach((c: any) => {
          if (c?.id) labels[c.id] = { name: c.full_name || 'Customer', customerId: c.customer_id || c.id.slice(0, 8) };
        });
        setCustomerLabels(labels);
      });
    });
  }, []);

  // Show popup whenever there are reminders for today. Cache result 6h to avoid refetch on every refresh.
  const REMINDERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const REMINDERS_CACHE_KEY = 'reminders_today_cache';

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const applyReminders = (forToday: Reminder[], list: Reminder[]) => {
      if (forToday.length > 0) {
        setTodayReminders(forToday);
        setOpen(true);
        const customerIds = [...new Set(
          forToday
            .filter((r) => r.entity_type === 'customer' && r.entity_id)
            .map((r) => r.entity_id as string)
        )];
        const labels: Record<string, CustomerLabel> = {};
        db.customers.getByIds(customerIds).then(({ data: customers }) => {
          (customers || []).forEach((c: any) => {
            if (c?.id) labels[c.id] = { name: c.full_name || 'Customer', customerId: c.customer_id || c.id.slice(0, 8) };
          });
          setCustomerLabels(labels);
        });
      }
    };

    const tryLoad = (isRetry = false) => {
      const cached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(REMINDERS_CACHE_KEY) : null;
      if (cached && !isRetry) {
        try {
          const { date, data: list, fetchedAt } = JSON.parse(cached) as { date: string; data: Reminder[]; fetchedAt: number };
          if (date === today && Date.now() - fetchedAt < REMINDERS_CACHE_TTL_MS && Array.isArray(list)) {
            const forToday = list.filter((r) => r.reminder_at === today);
            applyReminders(forToday, list);
            return;
          }
        } catch {
          // ignore invalid cache
        }
      }

      db.reminders.getForTodayAndTomorrow().then(({ data, error }) => {
        if (import.meta.env.DEV) {
          console.log('[Reminders popup] getForTodayAndTomorrow' + (isRetry ? ' (retry)' : '') + ':', {
            today,
            error: error?.message ?? null,
            dataLength: Array.isArray(data) ? data.length : 0,
          });
        }
        if (error) {
          toast.error('Reminders could not be loaded. Check RLS policies for the reminders table.');
          return;
        }
        const list = (data || []) as Reminder[];
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(REMINDERS_CACHE_KEY, JSON.stringify({ date: today, data: list, fetchedAt: Date.now() }));
        }
        const forToday = list.filter((r) => r.reminder_at === today);
        applyReminders(forToday, list);
        if (forToday.length === 0 && !isRetry && list.length === 0) {
          retryTimeoutId = setTimeout(() => tryLoad(true), 1500);
        }
      });
    };

    const initialTimeoutId = setTimeout(() => tryLoad(false), 400);
    return () => {
      clearTimeout(initialTimeoutId);
      if (retryTimeoutId != null) clearTimeout(retryTimeoutId);
    };
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
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('reminders_today_cache');
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
      return;
    }
    setMarkingDone(true);
    try {
      for (const r of todayReminders) {
        await markOneCompleted(r);
      }
      toast.success('Reminders marked done. Popup will not show again until there are more reminders for today.');
      setOpen(false);
    } catch {
      toast.error('Failed to mark some reminders');
    } finally {
      setMarkingDone(false);
    }
  };

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
          <p className="text-xs text-muted-foreground pt-1">&quot;Got it&quot; marks the job as completed (when linked to a job) and marks reminders done. The popup will show again whenever there are reminders for today that are not completed.</p>
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
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('reminders_today_cache');
          loadToday();
        }}
      />
    </>
  );
}
