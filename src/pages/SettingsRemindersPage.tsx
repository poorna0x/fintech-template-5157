import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Bell, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
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

const RECENT_COMPLETED_DAYS = 7;
const PAGE_SIZE = 20;

type CustomerLabel = { name: string; customerId: string };

export default function SettingsRemindersPage() {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
        const cutoff = Date.now() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000;
        list = list.filter((r) => r.completed_at && new Date(r.completed_at).getTime() >= cutoff);
        list.sort((a, b) =>
          b.completed_at && a.completed_at
            ? new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
            : 0
        );
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
                  Load reminders to view and edit. Today = amber, Tomorrow = blue, Overdue = red.
                </CardDescription>
              </div>
              {!loaded ? (
                <Button
                  onClick={load}
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
                      onChange={(e) => setIncludeCompleted(e.target.checked)}
                      className="rounded"
                    />
                    Show completed (last {RECENT_COMPLETED_DAYS} days). Use &quot;Refresh list&quot; to apply.
                  </label>
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
                      onClick={load}
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
              {filteredReminders.length === 0 ? (
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
                    <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
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
            </CardContent>
          )}
        </Card>

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
      </div>
    </div>
  );
}
