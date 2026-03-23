import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Edit3, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Reminder } from '@/types';
import { db, supabase } from '@/lib/supabase';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';

const PENDING_PAYMENT_TITLE = 'Pending payment';
const PAGE_SIZE = 20;

function parsePendingAmount(notes: string | null | undefined): number {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return 0;
  // Allow values like "1234", "₹1234", "1,234.50", etc.
  const normalized = raw.replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parsePendingNotes(notes: string | null | undefined): { amount_pending: number; note?: string } {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return { amount_pending: 0 };

  // New format: JSON { amount_pending: number, note?: string|null }
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { amount_pending?: unknown; note?: unknown };
      const amount_pending = typeof parsed.amount_pending === 'number' ? parsed.amount_pending : parsePendingAmount(raw);
      const note = typeof parsed.note === 'string' ? parsed.note : undefined;
      return { amount_pending, note };
    } catch {
      // fallthrough to legacy parsing
    }
  }

  // Legacy format: notes was just amount string
  return { amount_pending: parsePendingAmount(raw), note: undefined };
}

type PendingPaymentReminder = Reminder & { amount_pending: number; note?: string };

type CustomerLabel = {
  id: string;
  name: string;
  customerId: string;
  phone?: string;
  alternatePhone?: string;
};

function getCustomerLabelFromRow(c: any): CustomerLabel {
  return {
    id: c.id,
    name: c.full_name || c.fullName || 'Customer',
    customerId: c.customer_id || c.customerId || c.id?.slice?.(0, 8) || '',
    phone: c.phone ?? c.customer_phone ?? undefined,
    alternatePhone: c.alternate_phone ?? c.alternatePhone ?? undefined,
  };
}

function PendingPaymentFormDialogV2({
  open,
  onOpenChange,
  editReminder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editReminder: Reminder | null;
  onSaved: () => void;
}) {
  const isEdit = !!editReminder?.id;

  const [customerId, setCustomerId] = useState<string>('');
  const [customerLabel, setCustomerLabel] = useState<CustomerLabel | null>(null);

  const [amountStr, setAmountStr] = useState<string>('');
  const [noteStr, setNoteStr] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(() => format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));

  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saveConfirmBusy, setSaveConfirmBusy] = useState(false);
  const [savePayload, setSavePayload] = useState<{
    mode: 'create' | 'update';
    reminderId?: string;
    customerId?: string;
    reminderAt: string;
    parsedAmount: number;
    note: string | null;
  } | null>(null);

  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerLabel[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [hasAttemptedCustomerSearch, setHasAttemptedCustomerSearch] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Reset search UI state every time we open.
    setCustomerSearchOpen(false);
    setCustomerQuery('');
    setCustomerResults([]);
    setCustomerLoading(false);
    setHasAttemptedCustomerSearch(false);
    setSaveConfirmOpen(false);
    setSaveConfirmBusy(false);
    setSavePayload(null);

    if (isEdit && editReminder) {
      const nextCustomerId = (editReminder.entity_id as string) ?? '';
      setCustomerId(nextCustomerId);
      const parsed = parsePendingNotes(editReminder.notes);
      setAmountStr(() => (parsed.amount_pending ? String(parsed.amount_pending) : ''));
      setNoteStr(parsed.note ?? '');
      setDueDate(
        editReminder.reminder_at ? String(editReminder.reminder_at) : format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
      );
      // Fetch label for just the selected customer (avoid loading all customers).
      (async () => {
        if (!nextCustomerId) return;
        const { data, error } = await db.customers.getById(nextCustomerId);
        if (error) return;
        if (data) setCustomerLabel(getCustomerLabelFromRow(data));
      })();
    } else {
      setCustomerId('');
      setCustomerLabel(null);
      setAmountStr('');
      setNoteStr('');
      setDueDate(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
    }
  }, [open, isEdit, editReminder]);

  const handleCustomerSearch = async () => {
    const q = customerQuery.trim();
    if (!q) {
      setCustomerResults([]);
      setHasAttemptedCustomerSearch(false);
      return;
    }
    setHasAttemptedCustomerSearch(true);
    setCustomerLoading(true);
    try {
      const { data, error } = await db.customers.search(q, 20);
      if (error) throw error;
      setCustomerResults((data || []).map(getCustomerLabelFromRow));
    } catch (err: any) {
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedAmount = Number(String(amountStr).replace(/[^0-9.-]/g, ''));
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid pending amount');
      return;
    }
    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }

    setSavePayload({
      mode: isEdit && editReminder ? 'update' : 'create',
      reminderId: isEdit && editReminder ? editReminder.id : undefined,
      customerId: isEdit && editReminder ? undefined : customerId,
      reminderAt: dueDate,
      parsedAmount,
      note: noteStr.trim() || null,
    });
    setSaveConfirmOpen(true);
  };

  const confirmSave = async () => {
    if (!savePayload) return;
    setSaveConfirmBusy(true);
    try {
      if (savePayload.mode === 'update' && savePayload.reminderId) {
        const { error } = await db.reminders.update(savePayload.reminderId, {
          title: PENDING_PAYMENT_TITLE,
          notes: JSON.stringify({
            amount_pending: savePayload.parsedAmount,
            note: savePayload.note,
          }),
          reminder_at: savePayload.reminderAt,
        });
        if (error) throw new Error(error.message);
        toast.success('Pending payment updated');
      } else {
        const { error } = await db.reminders.create({
          entity_type: 'customer',
          entity_id: savePayload.customerId ?? null,
          title: PENDING_PAYMENT_TITLE,
          notes: JSON.stringify({
            amount_pending: savePayload.parsedAmount,
            note: savePayload.note,
          }),
          reminder_at: savePayload.reminderAt,
        });
        if (error) throw new Error(error.message);
        toast.success('Pending payment added');
      }
      onSaved();
      setSaveConfirmOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save pending payment');
    } finally {
      setSaveConfirmBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {isEdit ? 'Edit pending payment' : 'Add pending payment'}
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            Add customer, pending amount, and due date. Mark as completed when received.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Customer *</Label>
            {isEdit ? (
              <div className="flex items-center gap-3 border rounded-lg p-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{customerLabel?.name ?? 'Customer'}</div>
                  <div className="text-xs text-muted-foreground truncate">{customerLabel?.customerId ?? ''}</div>
                </div>
              </div>
            ) : (
              <div>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-10"
                      aria-expanded={customerSearchOpen}
                    >
                      <span className="truncate">{customerLabel ? customerLabel.name : 'Select customer'}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
                    align="start"
                    sideOffset={4}
                  >
                    <Command shouldFilter={false}>
                      <div className="p-3 pb-2">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Search customer by name, ID, or phone..."
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            className="h-10"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={handleCustomerSearch}
                            disabled={customerLoading}
                            title="Search"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <CommandList className="max-h-[340px]">
                        <CommandEmpty>
                          {customerLoading
                            ? 'Searching...'
                            : hasAttemptedCustomerSearch
                              ? 'No customers match.'
                              : 'Type and click search.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {customerResults.slice(0, 20).map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCustomerId(c.id);
                                setCustomerLabel(c);
                                setCustomerSearchOpen(false);
                                setCustomerQuery('');
                                setCustomerResults([]);
                                setHasAttemptedCustomerSearch(false);
                              }}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted"
                            >
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="text-sm font-medium truncate">{c.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{c.customerId}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-amount">Pending amount *</Label>
            <Input
              id="pending-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="e.g. 2500"
              className="min-h-9"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pending-note">Note (optional)</Label>
            <Input
              id="pending-note"
              value={noteStr}
              onChange={(e) => setNoteStr(e.target.value)}
              placeholder="e.g. Service payment, AMC pending..."
              className="min-h-9"
            />
          </div>

          <div className="space-y-2">
            <Label>Due date *</Label>
            <DatePicker
              value={dueDate || undefined}
              onChange={(v) => setDueDate(v || '')}
              placeholder="Pick due date"
              className="w-full"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-9 w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" className="min-h-9 w-full sm:w-auto">
              {isEdit ? 'Save changes' : 'Add pending payment'}
            </Button>
          </div>
        </form>

        <AlertDialog
          open={saveConfirmOpen}
          onOpenChange={(o) => {
            setSaveConfirmOpen(o);
            if (!o) setSavePayload(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isEdit ? 'Save changes?' : 'Add pending payment?'}</AlertDialogTitle>
              <AlertDialogDescription>
                This will {isEdit ? 'update' : 'create'} the pending payment entry for the selected customer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={confirmSave}
                disabled={saveConfirmBusy}
              >
                {saveConfirmBusy ? 'Saving...' : 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPendingPaymentsDialogV2({
  open,
  onOpenChange,
  initialAction = 'list',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAction?: 'list' | 'add';
}) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [payments, setPayments] = useState<PendingPaymentReminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});

  const [searchQuery, setSearchQuery] = useState('');

  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState<PendingPaymentReminder | null>(null);

  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [completeConfirmBusy, setCompleteConfirmBusy] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<PendingPaymentReminder | null>(null);

  const openWhatsApp = (phone: string, message: string) => {
    if (!phone) return;
    const formatted = formatPhoneForWhatsApp(phone);
    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const buildPendingPaymentMessage = (payment: PendingPaymentReminder, customer: CustomerLabel) => {
    const amount = Number(payment.amount_pending) || 0;
    const formattedAmount = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });

    // Keep it polite + short, include contact info like other admin WhatsApp templates.
    return `Hi ${customer.name} 😊

Hope you're doing well. Just a quick reminder that you have a pending payment of ₹${formattedAmount}.

Request you to please clear the payment at your earliest convenience. If you have already paid, kindly ignore this message.

For any help/support:
📞 Phone: 8884944288
📧 Email: info@hydrogenro.com
🌐 Website: https://hydrogenro.com

Thanks & regards 🙏`;
  };

  useEffect(() => {
    if (!open) return;
    if (initialAction === 'add') {
      // Important: reset list state so we don't show previously loaded payments in the background.
      // The component stays mounted, so we must clear cached list data explicitly.
      setLoaded(false);
      setPayments([]);
      setCustomerLabels({});
      setSearchQuery('');
      setLoading(false);
      setEditReminder(null);
      setFormOpen(true);
    } else {
      setFormOpen(false);
      setEditReminder(null);
    }
  }, [open, initialAction]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const c = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
      const due = p.reminder_at ? format(new Date(p.reminder_at), 'yyyy-MM-dd') : '';
      const amount = p.amount_pending ? String(p.amount_pending) : '';
      return (
        (c?.name || '').toLowerCase().includes(q) ||
        (c?.customerId || '').toLowerCase().includes(q) ||
        (p.entity_id || '').toLowerCase().includes(q) ||
        due.includes(q) ||
        amount.includes(q)
      );
    });
  }, [payments, customerLabels, searchQuery]);

  const totalPending = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + (Number(p.amount_pending) || 0), 0),
    [filteredPayments]
  );

  const load = async () => {
    setLoading(true);
    try {
      const from = 0;
      const to = PAGE_SIZE - 1;
      const { data: reminderRows, error: reminderError } = await supabase
        .from('reminders')
        .select('*')
        .eq('entity_type', 'customer')
        .eq('title', PENDING_PAYMENT_TITLE)
        .is('completed_at', null)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (reminderError) throw reminderError;

      const list = ((reminderRows || []) as Reminder[]).map((r) => {
        const parsed = parsePendingNotes(r.notes);
        return {
          ...r,
          amount_pending: parsed.amount_pending,
          note: parsed.note,
        };
      }) as PendingPaymentReminder[];

      const customerIds = [...new Set(list.filter((r) => !!r.entity_id).map((r) => r.entity_id as string))];
      // Fetch only required customer fields for the loaded page (keeps egress low).
      const { data: custRows, error: custError } = await supabase
        .from('customers')
        .select('id, full_name, customer_id, phone, alternate_phone')
        .in('id', customerIds);
      if (custError) throw custError;

      const labelMap: Record<string, CustomerLabel> = {};
      (custRows || []).forEach((c: any) => {
        if (c?.id) labelMap[c.id] = getCustomerLabelFromRow(c);
      });

      setPayments(list);
      setCustomerLabels(labelMap);
      setLoaded(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  // When user is adding/editing, render ONLY the add/edit dialog.
  // This prevents the pending list UI from showing behind the form.
  if (open && (initialAction === 'add' || formOpen)) {
    return (
      <PendingPaymentFormDialogV2
        open={open}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
        editReminder={editReminder}
        onSaved={() => {
          // Don’t auto-load list after add/edit; user clicks "Load pending payments" when needed.
          setLoaded(false);
          setPayments([]);
          setCustomerLabels({});
          setSearchQuery('');
        }}
      />
    );
  }

  const handleOpenAdd = () => {
    setEditReminder(null);
    setFormOpen(true);
  };

  const openEdit = (r: Reminder) => {
    setEditReminder(r);
    setFormOpen(true);
  };

  const handleMarkCompleted = (r: Reminder) => {
    setCompleteTarget(r as PendingPaymentReminder);
    setCompleteConfirmOpen(true);
  };

  const confirmMarkCompleted = async () => {
    if (!completeTarget) return;
    setCompleteConfirmBusy(true);
    try {
      const { error } = await db.reminders.update(completeTarget.id, { completed_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      toast.success('Marked pending payment as collected');
      await load(); // reload current page
      setCompleteConfirmOpen(false);
      setCompleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark collected');
    } finally {
      setCompleteConfirmBusy(false);
    }
  };

  const handleWhatsAppClick = (p: PendingPaymentReminder) => {
    const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
    if (!customer) {
      toast.error('Customer info not loaded');
      return;
    }
    const primary = customer.phone;
    const alternate = customer.alternatePhone;
    if (!primary && !alternate) {
      toast.error('Customer phone number is missing');
      return;
    }

    const message = buildPendingPaymentMessage(p, customer);

    if (alternate && alternate.trim() && alternate.trim() !== primary?.trim()) {
      setWhatsappTarget(p);
      setWhatsappDialogOpen(true);
      return;
    }

    openWhatsApp(primary || alternate || '', message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Badge className="bg-blue-600 text-white">₹</Badge>
            Pending payments
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            Use <strong>Load</strong> to fetch pending payments. Add/edit amount & due date. Mark as completed when received.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!loaded ? (
            <div className="flex flex-col gap-3">
              <Button onClick={load} disabled={loading} className="w-full sm:w-auto min-h-9">
                {loading ? 'Loading...' : 'Load pending payments'}
              </Button>
              <Button onClick={handleOpenAdd} variant="outline" disabled={loading} className="w-full sm:w-auto min-h-9">
                <Plus className="w-4 h-4 mr-2" />
                Add pending payment
              </Button>
              <p className="text-sm text-muted-foreground">
                Stored as customer reminders titled <span className="font-mono">{PENDING_PAYMENT_TITLE}</span>.
              </p>
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">No pending payments found.</div>
              <Button onClick={handleOpenAdd} className="w-full sm:w-auto min-h-9">
                <Plus className="w-4 h-4 mr-2" />
                Add pending payment
              </Button>
              <Button variant="outline" onClick={load} disabled={loading} className="w-full sm:w-auto min-h-9">
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 min-w-0">
                  <Input
                    placeholder="Search in this page (customer, due date, amount)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="min-h-9 border border-input focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleOpenAdd}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    disabled={loading}
                    title="Add pending payment"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={load}
                    disabled={loading}
                    size="icon"
                    className="h-10 w-10"
                    title="Refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {filteredPayments.map((p) => {
                  const due = p.reminder_at ? new Date(p.reminder_at) : null;
                  const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
                  const dueLabel =
                    due && !Number.isNaN(due.getTime()) ? format(due, 'PPP') : '—';

                  return (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-background"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {customer?.name ?? 'Customer'}
                          </div>
                          {customer?.customerId && (
                            <span className="text-xs text-muted-foreground font-mono truncate">
                              ({customer.customerId})
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            Due: {dueLabel}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">Pending amount</span>
                          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            ₹{(Number(p.amount_pending) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {p.note && (
                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            Note: {p.note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEdit(p)}
                          className="h-9 w-9"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => handleMarkCompleted(p)}
                          className="h-9 w-9 bg-green-600 hover:bg-green-700"
                          title="Completed"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => handleWhatsAppClick(p)}
                          className="h-9 w-9 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                          title="Notify on WhatsApp"
                        >
                          <WhatsAppIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Total pending: <span className="font-medium text-foreground">₹{totalPending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <AlertDialog
          open={completeConfirmOpen}
          onOpenChange={(o) => {
            setCompleteConfirmOpen(o);
            if (!o) setCompleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as collected?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark this pending payment as completed and remove it from the pending list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                onClick={confirmMarkCompleted}
                disabled={completeConfirmBusy}
              >
                {completeConfirmBusy ? 'Updating...' : 'Mark as collected'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={whatsappDialogOpen}
          onOpenChange={(o) => {
            setWhatsappDialogOpen(o);
            if (!o) setWhatsappTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {whatsappTarget && (
              <>
                {(() => {
                  const customer = whatsappTarget.entity_id ? customerLabels[whatsappTarget.entity_id as string] : undefined;
                  const primaryPhone = customer?.phone;
                  const alternatePhone = customer?.alternatePhone;
                  const message = customer ? buildPendingPaymentMessage(whatsappTarget, customer) : '';
                  const hasAlternate = !!alternatePhone && alternatePhone.trim() !== (primaryPhone || '').trim();

                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <WhatsAppIcon className="w-5 h-5 text-green-600" />
                          Notify via WhatsApp
                        </DialogTitle>
                        <DialogDescription>
                          Send a pending payment notification to the customer.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="py-4 space-y-3">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                          <div className="text-sm text-gray-700">
                            <strong>Customer:</strong> {customer?.name ?? 'Customer'}
                          </div>
                          <div className="text-sm text-gray-700">
                            <strong>Primary:</strong> {primaryPhone ?? '—'}
                          </div>
                          {hasAlternate && (
                            <div className="text-sm text-gray-700">
                              <strong>Alternate:</strong> {alternatePhone}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Message Preview</Label>
                          <div className="mt-1 p-3 bg-white border border-gray-200 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {message}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {hasAlternate ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => {
                                  if (!primaryPhone) return;
                                  openWhatsApp(primaryPhone, message);
                                  setWhatsappDialogOpen(false);
                                }}
                              >
                                <WhatsAppIcon className="w-4 h-4 mr-2" />
                                Primary: {primaryPhone}
                              </Button>
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => {
                                  if (!alternatePhone) return;
                                  openWhatsApp(alternatePhone, message);
                                  setWhatsappDialogOpen(false);
                                }}
                              >
                                <WhatsAppIcon className="w-4 h-4 mr-2" />
                                Alternate: {alternatePhone}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              className="w-full bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => {
                                if (!primaryPhone) return;
                                openWhatsApp(primaryPhone, message);
                                setWhatsappDialogOpen(false);
                              }}
                            >
                              <WhatsAppIcon className="w-4 h-4 mr-2" />
                              Send WhatsApp Message
                            </Button>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)}>
                          Close
                        </Button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

