import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  CalendarClock,
  FileText,
  Plus,
  CheckCircle2,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  AlertTriangle,
  Repeat,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { addDays, addMonths, format } from 'date-fns';
import { db, supabase } from '@/lib/supabase';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import {
  addMonthsToReminderAt,
  getLocalCalendarDateYmd,
  parseReminderAtLocalDate,
} from '@/lib/pendingPaymentReminder';
import type { Customer, Reminder, ServiceReminderStatus, Technician } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mapCustomerGstFields } from '@/lib/customerGst';
import NewJobDialog from '@/components/admin/NewJobDialog';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';

interface RecurringServiceTrackerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CustomerLabel = {
  id: string;
  name: string;
  customerId: string | null;
  phone: string | null;
  altPhone: string | null;
};

type FilterKey = 'all' | 'week' | 'due' | 'done_today' | ServiceReminderStatus;

/** Default window: reminders due up to this many days ahead (includes overdue). */
const WEEK_WINDOW_DAYS = 7;

const PAGE_SIZE = 12;

const STATUS_META: Record<ServiceReminderStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  not_called: { label: 'Not called', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  no_response: { label: 'No response', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  waiting: { label: 'Waiting for response', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  will_return: { label: 'Will come back', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  confirmed: { label: 'Confirmed', cls: 'bg-green-100 text-green-800 border-green-200' },
  job_created: { label: 'Job created', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

/** Statuses the user can set by hand (job_created is set automatically when a job is made). */
const SETTABLE_STATUSES: ServiceReminderStatus[] = [
  'not_called',
  'no_response',
  'waiting',
  'will_return',
  'confirmed',
  'pending',
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'due', label: 'Due now' },
  { key: 'done_today', label: 'Done today' },
  { key: 'all', label: 'All' },
  { key: 'not_called', label: 'Not called' },
  { key: 'no_response', label: 'No response' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'will_return', label: 'Will return' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'job_created', label: 'Job created' },
];

function labelFromRow(c: any): CustomerLabel {
  return {
    id: c.id,
    name: c.full_name || 'Customer',
    customerId: c.customer_id ?? null,
    phone: c.phone ?? null,
    altPhone: c.alternate_phone ?? null,
  };
}

/** Map Supabase customer row (snake_case) to app Customer shape for reports / new job. */
function mapCustomerRow(row: any): Customer {
  return {
    id: row.id,
    customerId: row.customer_id,
    fullName: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone,
    email: row.email,
    address: {
      street: row.address?.street || '',
      area: row.address?.area || '',
      city: row.address?.city || '',
      state: row.address?.state || '',
      pincode: row.address?.pincode || '',
      landmark: row.address?.landmark,
      visible_address: row.visible_address || row.address?.visible_address || '',
    },
    location: {
      latitude: row.location?.latitude || 0,
      longitude: row.location?.longitude || 0,
      formattedAddress: row.location?.formatted_address || row.location?.formattedAddress || '',
      googlePlaceId: row.location?.google_place_id,
      googleLocation: row.location?.googleLocation || row.location?.google_location || null,
    } as any,
    serviceType: row.service_type,
    brand: row.brand,
    model: row.model,
    installationDate: row.installation_date,
    warrantyExpiry: row.warranty_expiry,
    status: row.status,
    customerSince: row.customer_since,
    lastServiceDate: row.last_service_date,
    notes: row.notes,
    preferredTimeSlot: row.preferred_time_slot,
    customTime: row.custom_time || null,
    preferredLanguage: row.preferred_language,
    has_prefilter: row.has_prefilter ?? null,
    has_google_review: row.has_google_review ?? null,
    customer_tier: row.customer_tier ?? null,
    raw_water_tds: row.raw_water_tds ?? 0,
    ...mapCustomerGstFields(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // snake_case aliases used by some dialogs
    full_name: row.full_name,
    customer_id: row.customer_id,
    service_type: row.service_type,
  } as Customer;
}

function statusOf(r: Reminder): ServiceReminderStatus {
  return (r.service_status as ServiceReminderStatus) || 'pending';
}

function relativeFromNow(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return format(new Date(iso), 'd MMM yyyy');
}

export function RecurringServiceTracker({ open, onOpenChange }: RecurringServiceTrackerProps) {
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [labels, setLabels] = useState<Record<string, CustomerLabel>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterKey>('week');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const techniciansLoadedRef = useRef(false);
  // Mirror of `labels` for reading inside `load` without making it a dependency.
  const labelsRef = useRef<Record<string, CustomerLabel>>({});
  // Cache of full customer rows (for reports / new job) to avoid refetching.
  const fullCustomerCacheRef = useRef<Record<string, Customer>>({});

  // Status edit dialog
  const [statusTarget, setStatusTarget] = useState<Reminder | null>(null);
  const [statusValue, setStatusValue] = useState<ServiceReminderStatus>('not_called');
  const [statusNote, setStatusNote] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Snooze dialog
  const [snoozeTarget, setSnoozeTarget] = useState<Reminder | null>(null);
  const [snoozeDate, setSnoozeDate] = useState<string>('');
  const [snoozeSaving, setSnoozeSaving] = useState(false);

  // Mark-done (complete cycle) confirm
  const [doneTarget, setDoneTarget] = useState<Reminder | null>(null);
  const [doneSaving, setDoneSaving] = useState(false);

  // Reopen dialog (undo a done / pick a new due date)
  const [reopenTarget, setReopenTarget] = useState<Reminder | null>(null);
  const [reopenDate, setReopenDate] = useState<string>('');
  const [reopenSaving, setReopenSaving] = useState(false);

  // Edit-note dialog (the reminder's own description/notes field)
  const [noteTarget, setNoteTarget] = useState<Reminder | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Create job / reports (reuse existing dialogs)
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const jobReminderIdRef = useRef<string | null>(null);

  // Photo viewer for report images (payment/bill click-to-view)
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState<{ url: string; index: number; total: number } | null>(null);
  const [viewerBillPhotos, setViewerBillPhotos] = useState<string[] | null>(null);

  const todayYmd = getLocalCalendarDateYmd();
  const weekEndYmd = format(addDays(new Date(), WEEK_WINDOW_DAYS), 'yyyy-MM-dd');
  const isSearching = search.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  /** Fetch + merge labels only for customer ids we haven't cached yet (low egress). */
  const loadMissingLabels = useCallback(async (rows: Reminder[]) => {
    const ids = [
      ...new Set(
        rows.filter((r) => r.entity_type === 'customer' && r.entity_id).map((r) => r.entity_id as string)
      ),
    ];
    const missing = ids.filter((id) => !labelsRef.current[id]);
    if (!missing.length) return;
    const { data: custRows, error } = await supabase
      .from('customers')
      .select('id, full_name, customer_id, phone, alternate_phone')
      .in('id', missing);
    if (error) throw new Error(error.message);
    const additions: Record<string, CustomerLabel> = {};
    (custRows || []).forEach((c: any) => {
      if (c?.id) additions[c.id] = labelFromRow(c);
    });
    setLabels((prev) => ({ ...prev, ...additions }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim();
      if (filter === 'done_today') {
        // Reminders cleared today (e.g. via the admin "Got it" popup). Paginated, search ignored.
        const { data, error, count } = await db.reminders.getCompletedTodayPaginated({
          page,
          pageSize: PAGE_SIZE,
        });
        if (error) throw new Error(error.message);
        setReminders(data);
        setTotalCount(count);
        await loadMissingLabels(data);
      } else if (q) {
        const { data: custs, error: custErr } = await db.customers.searchSlim(q, 40);
        if (custErr) throw new Error(custErr.message);
        const labelMap: Record<string, CustomerLabel> = {};
        (custs || []).forEach((c: any) => {
          if (c?.id) labelMap[c.id] = labelFromRow(c);
        });
        const ids = Object.keys(labelMap);
        const { data, error } = await db.reminders.getActiveByCustomerIds(ids);
        if (error) throw new Error(error.message);
        let rows = data || [];
        if (filter === 'due') {
          rows = rows.filter((r) => r.reminder_at <= todayYmd);
        } else if (filter === 'week') {
          rows = rows.filter((r) => r.reminder_at <= weekEndYmd);
        } else if (filter !== 'all') {
          rows = rows.filter((r) => statusOf(r) === filter);
        }
        rows = [...rows].sort((a, b) =>
          a.reminder_at < b.reminder_at ? -1 : a.reminder_at > b.reminder_at ? 1 : 0
        );
        setReminders(rows);
        setLabels((prev) => ({ ...prev, ...labelMap }));
        setTotalCount(rows.length);
      } else {
        const status: ServiceReminderStatus | 'all' =
          filter === 'all' || filter === 'due' || filter === 'week' ? 'all' : filter;
        const { data, error, count } = await db.reminders.getActiveRemindersPaginated({
          page,
          pageSize: PAGE_SIZE,
          status,
          dueOnly: filter === 'due',
          untilDate: filter === 'week' ? weekEndYmd : undefined,
        });
        if (error) throw new Error(error.message);
        setReminders(data);
        setTotalCount(count);
        await loadMissingLabels(data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load recurring services');
      setReminders([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [search, filter, page, todayYmd, weekEndYmd, loadMissingLabels]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Keep labelsRef in sync so `load` can dedupe customer fetches without depending on `labels`.
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  // Reset paging when filters/search change.
  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  // Lazily fetch technicians only when first needed (reports / create job).
  const ensureTechnicians = useCallback(async (): Promise<Technician[]> => {
    if (techniciansLoadedRef.current) return technicians;
    const { data } = await db.technicians.getAll();
    const list = (data as Technician[]) || [];
    techniciansLoadedRef.current = true;
    setTechnicians(list);
    return list;
  }, [technicians]);

  // ---- Local (optimistic) list mutations to avoid full reloads ----
  const matchesFilter = useCallback(
    (r: Reminder): boolean => {
      if (filter === 'all') return true;
      // Done-today membership is about completed_at, not status; keep the row on status edits.
      if (filter === 'done_today') return !!r.completed_at;
      if (filter === 'due') return r.reminder_at <= todayYmd;
      if (filter === 'week') return r.reminder_at <= weekEndYmd;
      return statusOf(r) === filter;
    },
    [filter, todayYmd, weekEndYmd]
  );

  const byDueAsc = (a: Reminder, b: Reminder) =>
    a.reminder_at < b.reminder_at ? -1 : a.reminder_at > b.reminder_at ? 1 : 0;

  /** Patch a row in place (keeps due-first order). No count change. */
  const patchLocal = useCallback((id: string, patch: Partial<Reminder>) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)).sort(byDueAsc));
  }, []);

  /** Remove a row from the view + decrement count. Reloads the page only if it just emptied. */
  const removeLocal = useCallback(
    (id: string) => {
      const willEmpty = reminders.length <= 1 && reminders.some((r) => r.id === id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setTotalCount((c) => Math.max(0, c - 1));
      if (willEmpty && (page > 1 || totalCount > 1)) {
        load();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reminders, page, totalCount, load]
  );

  /** Apply an update locally: patch if the row still matches the filter, otherwise drop it. */
  const commitUpdate = useCallback(
    (target: Reminder, patch: Partial<Reminder>) => {
      if (matchesFilter({ ...target, ...patch })) {
        patchLocal(target.id, patch);
      } else {
        removeLocal(target.id);
      }
    },
    [matchesFilter, patchLocal, removeLocal]
  );

  const submitSearch = () => setSearch(searchInput.trim());
  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const openCall = (phone: string | null) => {
    if (!phone) {
      toast.error('No phone number on file');
      return;
    }
    const formatted = formatPhoneForWhatsApp(phone);
    const tel = formatted.startsWith('+')
      ? formatted
      : formatted.startsWith('91') && formatted.length === 12
        ? `+${formatted}`
        : formatted;
    window.location.href = `tel:${tel}`;
  };

  const openWhatsApp = (r: Reminder) => {
    const c = r.entity_id ? labels[r.entity_id] : undefined;
    if (!c?.phone) {
      toast.error('No phone number on file');
      return;
    }
    const every = r.interval_value ? `every ${r.interval_value} month${r.interval_value > 1 ? 's' : ''}` : 'periodic';
    const message = `Hi ${c.name} 😊

This is a friendly reminder for your scheduled ${r.title} (${every}). It's time for your next service.

Would you like us to schedule a visit? Let us know a convenient day and time.

For any help/support:
📞 Phone: 8884944288
📧 Email: info@hydrogenro.com
🌐 Website: https://hydrogenro.com

Thanks & regards 🙏`;
    const url = `https://wa.me/${formatPhoneForWhatsApp(c.phone)}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ---- Status edit ----
  const openStatusDialog = (r: Reminder) => {
    setStatusTarget(r);
    const cur = statusOf(r);
    setStatusValue(cur === 'job_created' ? 'confirmed' : cur);
    setStatusNote(r.status_note || '');
  };

  const saveStatus = async () => {
    if (!statusTarget) return;
    setStatusSaving(true);
    try {
      const note = statusNote.trim() || null;
      const { error } = await db.reminders.updateServiceStatus(statusTarget.id, statusValue, note);
      if (error) throw new Error(error.message);
      toast.success('Status updated');
      commitUpdate(statusTarget, {
        service_status: statusValue,
        status_note: note,
        last_contacted_at: new Date().toISOString(),
      });
      setStatusTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  // ---- Reopen (undo a "done" / "Got it"), optionally for a new due date ----
  const openReopenDialog = (r: Reminder) => {
    setReopenTarget(r);
    // Default to today; user can keep it or pick a future date.
    setReopenDate(todayYmd);
  };

  const quickReopen = (months: number) => {
    setReopenDate(format(addMonths(new Date(), months), 'yyyy-MM-dd'));
  };

  const saveReopen = async () => {
    if (!reopenTarget || !reopenDate) return;
    setReopenSaving(true);
    try {
      const { error } = await db.reminders.update(reopenTarget.id, {
        completed_at: null,
        reminder_at: reopenDate,
      });
      if (error) throw new Error(error.message);
      toast.success(`Reopened for ${format(parseReminderAtLocalDate(reopenDate), 'd MMM yyyy')}`);
      // In the Done-today view it should drop out of the list once reactivated.
      removeLocal(reopenTarget.id);
      setReopenTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reopen');
    } finally {
      setReopenSaving(false);
    }
  };

  // ---- Edit note (reminder's own description/notes) ----
  const openNoteDialog = (r: Reminder) => {
    setNoteTarget(r);
    setNoteText(r.notes || '');
  };

  const saveNote = async () => {
    if (!noteTarget) return;
    setNoteSaving(true);
    try {
      const next = noteText.trim() || null;
      const { error } = await db.reminders.update(noteTarget.id, { notes: next });
      if (error) throw new Error(error.message);
      toast.success('Note saved');
      commitUpdate(noteTarget, { notes: next });
      setNoteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save note');
    } finally {
      setNoteSaving(false);
    }
  };

  // ---- Snooze ----
  const openSnoozeDialog = (r: Reminder) => {
    setSnoozeTarget(r);
    // default suggestion: one month from today
    setSnoozeDate(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
  };

  const quickSnooze = (months: number) => {
    setSnoozeDate(format(addMonths(new Date(), months), 'yyyy-MM-dd'));
  };

  const saveSnooze = async () => {
    if (!snoozeTarget || !snoozeDate) return;
    setSnoozeSaving(true);
    try {
      const { error } = await db.reminders.update(snoozeTarget.id, {
        reminder_at: snoozeDate,
        service_status: 'will_return',
        last_contacted_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      toast.success(`Snoozed to ${format(parseReminderAtLocalDate(snoozeDate), 'd MMM yyyy')}`);
      commitUpdate(snoozeTarget, {
        reminder_at: snoozeDate,
        service_status: 'will_return',
        last_contacted_at: new Date().toISOString(),
      });
      setSnoozeTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to snooze');
    } finally {
      setSnoozeSaving(false);
    }
  };

  // ---- Mark cycle done (recurrence) ----
  const confirmDone = async () => {
    if (!doneTarget) return;
    setDoneSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await db.reminders.update(doneTarget.id, { completed_at: now });
      if (error) throw new Error(error.message);
      if (doneTarget.interval_value && doneTarget.interval_value > 0) {
        const nextAt = addMonthsToReminderAt(doneTarget.reminder_at, doneTarget.interval_value);
        await db.reminders.create({
          entity_type: 'customer',
          entity_id: doneTarget.entity_id,
          title: doneTarget.title,
          notes: doneTarget.notes,
          reminder_at: nextAt,
          interval_type: 'months',
          interval_value: doneTarget.interval_value,
          service_status: 'pending',
        });
        toast.success(
          `Done. Next reminder set for ${format(parseReminderAtLocalDate(nextAt), 'd MMM yyyy')}`
        );
      } else {
        toast.success('Marked done');
      }
      removeLocal(doneTarget.id);
      setDoneTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete');
    } finally {
      setDoneSaving(false);
    }
  };

  // ---- Create job / reports ----
  const loadFullCustomer = async (entityId: string | null): Promise<Customer | null> => {
    if (!entityId) return null;
    const cached = fullCustomerCacheRef.current[entityId];
    if (cached) return cached;
    const { data, error } = await db.customers.getById(entityId);
    if (error || !data) {
      toast.error('Could not load customer');
      return null;
    }
    const mapped = mapCustomerRow(data);
    fullCustomerCacheRef.current[entityId] = mapped;
    return mapped;
  };

  const startCreateJob = async (r: Reminder) => {
    const [customer] = await Promise.all([loadFullCustomer(r.entity_id), ensureTechnicians()]);
    if (!customer) return;
    jobReminderIdRef.current = r.id;
    setActiveCustomer(customer);
    setNewJobOpen(true);
  };

  const startReports = async (r: Reminder) => {
    const [customer] = await Promise.all([loadFullCustomer(r.entity_id), ensureTechnicians()]);
    if (!customer) return;
    setActiveCustomer(customer);
    setReportOpen(true);
  };

  const onJobCreated = async () => {
    const reminderId = jobReminderIdRef.current;
    setNewJobOpen(false);
    if (reminderId) {
      const target = reminders.find((r) => r.id === reminderId);
      await db.reminders.updateServiceStatus(reminderId, 'job_created', null);
      jobReminderIdRef.current = null;
      toast.success('Job created and marked on the reminder');
      if (target) {
        commitUpdate(target, { service_status: 'job_created', last_contacted_at: new Date().toISOString() });
      }
    }
  };

  const summary = useMemo(() => {
    if (isSearching) return `${reminders.length} match${reminders.length === 1 ? '' : 'es'}`;
    const noun = `${totalCount} reminder${totalCount === 1 ? '' : 's'}`;
    if (filter === 'week') return `${noun} due within ${WEEK_WINDOW_DAYS} days (incl. overdue)`;
    if (filter === 'due') return `${noun} due now`;
    if (filter === 'done_today') return `${noun} marked done today`;
    return noun;
  }, [isSearching, reminders.length, totalCount, filter]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Repeat className="w-5 h-5 text-primary" />
              Reminder Tracking
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Shows reminders due within a week by default (overdue first). Switch to “All” for later
              ones, or “Done today” to see what was cleared today (incl. the “Got it” popup) and still
              call, create a job, or reopen it.
            </DialogDescription>
          </DialogHeader>

          {/* Search + filters */}
          <div className="px-4 sm:px-6 pb-2 space-y-2 border-b border-border">
            <div className="flex gap-2">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitSearch();
                  }
                }}
                placeholder={filter === 'done_today' ? 'Search not available in Done today' : 'Search customer by name, phone, or ID'}
                className="min-h-9 flex-1"
                autoComplete="off"
                disabled={filter === 'done_today'}
              />
              <Button type="button" variant="secondary" size="icon" className="h-9 w-9 shrink-0" onClick={submitSearch} title="Search" disabled={filter === 'done_today'}>
                <Search className="h-4 w-4" />
              </Button>
              {isSearching && (
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={clearSearch} title="Clear">
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => load()} title="Refresh" disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    filter === f.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">{loading ? 'Loading…' : summary}</div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-2">
            {!loading && reminders.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-10">
                {filter === 'done_today' ? 'Nothing marked done today yet.' : 'No reminders here.'}
                <div className="mt-1 text-xs">
                  {filter === 'done_today'
                    ? 'Reminders you clear here or via the “Got it” popup will appear here for today.'
                    : 'Add reminders from Settings or a customer. They’ll show up here, due ones first.'}
                </div>
              </div>
            )}

            {reminders.map((r) => {
              const isCustomer = r.entity_type === 'customer' && !!r.entity_id;
              const c = isCustomer && r.entity_id ? labels[r.entity_id] : undefined;
              const st = statusOf(r);
              const meta = STATUS_META[st];
              const isDone = !!r.completed_at;
              const overdue = !isDone && r.reminder_at <= todayYmd;
              const recurring = !!r.interval_value && r.interval_value > 0;
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">
                        {isCustomer ? c?.name || 'Customer' : r.title}
                        {isCustomer && c?.customerId && (
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">({c.customerId})</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isCustomer ? r.title : r.entity_type === 'job' ? 'Job reminder' : 'General reminder'}
                        {recurring ? ` · every ${r.interval_value} month${r.interval_value! > 1 ? 's' : ''}` : ' · one-time'}
                      </div>
                      {r.notes && <div className="text-xs text-muted-foreground/80 mt-0.5 truncate">{r.notes}</div>}
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.cls)}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {isDone ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Marked done {relativeFromNow(r.completed_at)}
                      </span>
                    ) : (
                      <span className={cn('inline-flex items-center gap-1', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                        {overdue && <AlertTriangle className="w-3 h-3" />}
                        <CalendarClock className="w-3 h-3" />
                        {overdue ? 'Due' : 'Next'}: {format(parseReminderAtLocalDate(r.reminder_at), 'd MMM yyyy')}
                      </span>
                    )}
                    {r.last_contacted_at && (
                      <span className="text-muted-foreground">Last contacted {relativeFromNow(r.last_contacted_at)}</span>
                    )}
                    {c?.phone && <span className="text-muted-foreground font-mono">{c.phone}</span>}
                  </div>

                  {r.status_note && (
                    <div className="mt-1.5 rounded bg-muted/50 px-2 py-1 text-xs text-foreground/80">
                      “{r.status_note}”
                    </div>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {isCustomer && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openCall(c?.phone || null)}>
                          <Phone className="w-3.5 h-3.5 mr-1" /> Call
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openWhatsApp(r)}>
                          <WhatsAppIcon className="w-3.5 h-3.5 mr-1 text-green-600" /> WhatsApp
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openStatusDialog(r)}>
                      Set status
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openNoteDialog(r)}>
                      <StickyNote className="w-3.5 h-3.5 mr-1" /> {r.notes ? 'Edit note' : 'Add note'}
                    </Button>
                    {!isDone && (
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openSnoozeDialog(r)}>
                        <CalendarClock className="w-3.5 h-3.5 mr-1" /> Snooze
                      </Button>
                    )}
                    {isCustomer && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => startReports(r)}>
                          <FileText className="w-3.5 h-3.5 mr-1" /> Reports
                        </Button>
                        <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => startCreateJob(r)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Create job
                        </Button>
                      </>
                    )}
                    {isDone ? (
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openReopenDialog(r)}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => setDoneTarget(r)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark done
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination (hidden while searching, except the paginated Done-today view) */}
          {(filter === 'done_today' || !isSearching) && totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 sm:px-6 py-2.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status edit dialog */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Update status</DialogTitle>
            <DialogDescription className="text-xs">
              Track the outcome of your call / follow-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Status</Label>
              <Select value={statusValue} onValueChange={(v) => setStatusValue(v as ServiceReminderStatus)}>
                <SelectTrigger className="mt-1 min-h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETTABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Note (optional)</Label>
              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="e.g. Said to call back next week"
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setStatusTarget(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveStatus} disabled={statusSaving} className="w-full sm:w-auto">
              {statusSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Snooze dialog */}
      <Dialog open={!!snoozeTarget} onOpenChange={(o) => !o && setSnoozeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Snooze reminder</DialogTitle>
            <DialogDescription className="text-xs">
              Customer wants to be contacted later. Pick when to follow up next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickSnooze(1)}>
                +1 month
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickSnooze(2)}>
                +2 months
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickSnooze(3)}>
                +3 months
              </Button>
            </div>
            <div>
              <Label className="text-sm">Follow up on</Label>
              <DatePicker
                value={snoozeDate}
                onChange={(v) => setSnoozeDate(v ?? '')}
                placeholder="Pick date"
                className="mt-1 w-full"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setSnoozeTarget(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveSnooze} disabled={snoozeSaving || !snoozeDate} className="w-full sm:w-auto">
              {snoozeSaving ? 'Saving…' : 'Snooze'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog */}
      <Dialog open={!!reopenTarget} onOpenChange={(o) => !o && setReopenTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Reopen reminder</DialogTitle>
            <DialogDescription className="text-xs">
              Bring this reminder back into the active list. Keep today or pick when it should be due.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setReopenDate(todayYmd)}>
                Today
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickReopen(1)}>
                +1 month
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickReopen(2)}>
                +2 months
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => quickReopen(3)}>
                +3 months
              </Button>
            </div>
            <div>
              <Label className="text-sm">Due on</Label>
              <DatePicker
                value={reopenDate}
                onChange={(v) => setReopenDate(v ?? '')}
                placeholder="Pick date"
                className="mt-1 w-full"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setReopenTarget(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveReopen} disabled={reopenSaving || !reopenDate} className="w-full sm:w-auto">
              {reopenSaving ? 'Saving…' : 'Reopen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit-note dialog */}
      <Dialog open={!!noteTarget} onOpenChange={(o) => !o && setNoteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Reminder note</DialogTitle>
            <DialogDescription className="text-xs">
              This note is saved on the reminder and shown wherever the reminder appears.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">Note</Label>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Prefers a call after 6pm; wants only outside filter changed"
              className="mt-1"
              rows={3}
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setNoteTarget(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveNote} disabled={noteSaving} className="w-full sm:w-auto">
              {noteSaving ? 'Saving…' : 'Save note'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark-done confirm */}
      <Dialog open={!!doneTarget} onOpenChange={(o) => !o && setDoneTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Complete this service cycle?</DialogTitle>
            <DialogDescription className="text-xs">
              {doneTarget?.interval_value
                ? `This reminder will be closed and the next one will be scheduled ${doneTarget.interval_value} month${doneTarget.interval_value > 1 ? 's' : ''} from its current date.`
                : 'This reminder will be marked done.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDoneTarget(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={confirmDone} disabled={doneSaving} className="w-full sm:w-auto">
              {doneSaving ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reuse existing job creation + report dialogs */}
      <NewJobDialog
        open={newJobOpen}
        onOpenChange={(o) => {
          setNewJobOpen(o);
          if (!o) jobReminderIdRef.current = null;
        }}
        customer={activeCustomer}
        technicians={technicians}
        onJobCreated={onJobCreated}
      />
      <CustomerReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        customer={activeCustomer}
        technicians={technicians}
        onPhotoClick={(url, index, total) => {
          setViewerBillPhotos(null);
          setViewerPhoto({ url, index, total });
          setPhotoViewerOpen(true);
        }}
        onBillPhotosClick={(photos, index) => {
          setViewerBillPhotos(photos);
          setViewerPhoto({ url: photos[index], index, total: photos.length });
          setPhotoViewerOpen(true);
        }}
      />

      {/* Photo viewer for report images */}
      {photoViewerOpen && (
        <PhotoViewerDialog
          open={photoViewerOpen}
          onOpenChange={setPhotoViewerOpen}
          selectedPhoto={viewerPhoto}
          selectedBillPhotos={viewerBillPhotos}
          selectedJobPhotos={null}
          onPrevious={() => {
            if (!viewerPhoto || !viewerBillPhotos || viewerBillPhotos.length <= 1) return;
            const newIndex = viewerPhoto.index > 0 ? viewerPhoto.index - 1 : viewerBillPhotos.length - 1;
            setViewerPhoto({ url: viewerBillPhotos[newIndex], index: newIndex, total: viewerBillPhotos.length });
          }}
          onNext={() => {
            if (!viewerPhoto || !viewerBillPhotos || viewerBillPhotos.length <= 1) return;
            const newIndex = viewerPhoto.index < viewerBillPhotos.length - 1 ? viewerPhoto.index + 1 : 0;
            setViewerPhoto({ url: viewerBillPhotos[newIndex], index: newIndex, total: viewerBillPhotos.length });
          }}
          onDownload={(photoUrl, photoIndex) => {
            const link = document.createElement('a');
            link.href = photoUrl;
            link.download = `photo-${photoIndex + 1}.jpg`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.click();
          }}
          onClose={() => {
            setPhotoViewerOpen(false);
            setViewerPhoto(null);
            setViewerBillPhotos(null);
          }}
        />
      )}
    </>
  );
}

export default RecurringServiceTracker;
