import React, { useState, useMemo } from 'react';
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
import { format, addMonths } from 'date-fns';
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

const RECENT_COMPLETED_DAYS = 7;
const PAGE_SIZE = 20;

type CustomerLabel = { name: string; customerId: string };

interface SettingsRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsRemindersDialog({ open, onOpenChange }: SettingsRemindersDialogProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = (overrides?: { includeCompleted?: boolean; showAll?: boolean }) => {
    const include = overrides?.includeCompleted ?? includeCompleted;
    const showAll = overrides?.showAll ?? showAllReminders;
    setLoading(true);
    // showAll = only active; include = active + recent completed; neither = active only
    db.reminders.getAll(include && !showAll).then(({ data, error }) => {
      if (error) {
        setLoading(false);
        toast.error(error.message);
        return;
      }
      let list = (data as Reminder[]) || [];
      if (showAll || !include) {
        // Show only active reminders
        list = list.filter((r) => !r.completed_at);
        list.sort((a, b) => new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime());
      } else {
        // Include recent completed: active + completed in last 7 days
        const cutoff = Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000;
        list = list.filter(
          (r) =>
            !r.completed_at ||
            (r.completed_at && new Date(r.completed_at).getTime() >= cutoff)
        );
        list.sort((a, b) => {
          if (a.completed_at && b.completed_at)
            return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
          if (a.completed_at) return 1;
          if (b.completed_at) return -1;
          return new Date(b.reminder_at).getTime() - new Date(a.reminder_at).getTime();
        });
      }
      setReminders(list);
      const customerIds = [
        ...new Set(
          list.filter((r) => r.entity_type === 'customer' && r.entity_id).map((r) => r.entity_id as string)
        ),
      ];
      const labels: Record<string, CustomerLabel> = {};
      Promise.all(
        customerIds.map((id) =>
          db.customers.getById(id).then(({ data: c }) => {
            if (c)
              labels[id] = {
                name: (c as any).full_name || 'Customer',
                customerId: (c as any).customer_id || id.slice(0, 8),
              };
          })
        )
      ).then(() => setCustomerLabels(labels));
      setLoaded(true);
      setLoading(false);
      setPage(1);
    });
  };

  const filteredReminders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reminders;
    return reminders.filter((r) => {
      const label =
        r.entity_type === 'customer' && r.entity_id ? customerLabels[r.entity_id] : null;
      const matchLabel =
        label &&
        (label.name.toLowerCase().includes(q) || label.customerId.toLowerCase().includes(q));
      const matchTitle =
        r.title.toLowerCase().includes(q) || (r.notes && r.notes.toLowerCase().includes(q));
      return !!(matchLabel || matchTitle);
    });
  }, [reminders, customerLabels, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredReminders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedReminders = useMemo(
    () =>
      filteredReminders.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredReminders, currentPage]
  );

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
      if (createError)
        toast.error('Marked done but failed to create next: ' + createError.message);
      else toast.success(`Marked done. Next reminder set for ${format(nextDate, 'PPP')}.`);
    } else {
      toast.success('Marked done');
    }
    load();
  };

  const handleIncludeChange = (checked: boolean) => {
    setIncludeCompleted(checked);
    if (checked) setShowAllReminders(false);
    if (loaded) load({ includeCompleted: checked, showAll: checked ? false : showAllReminders });
  };

  const handleShowAllChange = (checked: boolean) => {
    setShowAllReminders(checked);
    if (checked) setIncludeCompleted(false);
    if (loaded) load({ showAll: checked, includeCompleted: checked ? false : includeCompleted });
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
            <Button onClick={() => load({ includeCompleted: false, showAll: false })} disabled={loading} className="w-full sm:w-auto min-h-9">
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
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer name, ID, or reminder title..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 min-h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => load({})}
                disabled={loading}
                className="w-full sm:w-auto min-h-9"
              >
                {loading ? 'Refreshing...' : 'Refresh list'}
              </Button>
            </>
          )}

          {loaded && (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
              {filteredReminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? 'No reminders match your search.'
                    : showAllReminders || !includeCompleted
                      ? 'No active reminders.'
                      : `No completed reminders in the last ${RECENT_COMPLETED_DAYS} days.`}
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {paginatedReminders.map((r) => (
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
                    <div className="flex items-center justify-between gap-4 pt-3 border-t sticky bottom-0 bg-background">
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages} ({filteredReminders.length} reminder
                        {filteredReminders.length !== 1 ? 's' : ''})
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
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
      </DialogContent>
    </Dialog>
  );
}
