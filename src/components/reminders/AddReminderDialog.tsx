import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Reminder } from '@/types';

type SlimCustomer = {
  id: string;
  full_name: string | null;
  customer_id: string | null;
  phone?: string | null;
};

export type ReminderEntity = { type: 'customer' | 'job' | 'general'; id: string | null };

interface AddReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: ReminderEntity;
  contextLabel?: string;
  /** When true (e.g. Settings), new reminders can be general or linked to a searched customer. */
  allowChooseCustomer?: boolean;
  /** New reminder only: show customer search only; saved as a customer reminder. */
  requireCustomerPick?: boolean;
  /** New reminder only: overrides the dialog title. */
  dialogTitle?: string;
  onSaved?: () => void;
  editReminder?: Reminder | null;
}

export function AddReminderDialog({
  open,
  onOpenChange,
  entity,
  contextLabel,
  allowChooseCustomer = false,
  requireCustomerPick = false,
  dialogTitle,
  onSaved,
  editReminder,
}: AddReminderDialogProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [repeatType, setRepeatType] = useState<'none' | 'months'>('none');
  const [repeatValueStr, setRepeatValueStr] = useState<string>('1');
  const [saving, setSaving] = useState(false);
  const [attachMode, setAttachMode] = useState<'general' | 'customer'>('general');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<SlimCustomer[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SlimCustomer | null>(null);

  const isEdit = !!editReminder?.id;

  const showLinkChoice = useMemo(
    () =>
      allowChooseCustomer &&
      !requireCustomerPick &&
      !isEdit &&
      entity.type === 'general' &&
      (entity.id === null || entity.id === undefined),
    [allowChooseCustomer, requireCustomerPick, isEdit, entity.type, entity.id]
  );

  const showCustomerPickerOnly = useMemo(
    () =>
      requireCustomerPick &&
      !isEdit &&
      entity.type === 'general' &&
      (entity.id === null || entity.id === undefined),
    [requireCustomerPick, isEdit, entity.type, entity.id]
  );

  const showCustomerSearch =
    showCustomerPickerOnly || (showLinkChoice && attachMode === 'customer');

  useEffect(() => {
    if (open) {
      if (editReminder) {
        setTitle(editReminder.title);
        setNotes(editReminder.notes || '');
        setDate(editReminder.reminder_at ? new Date(editReminder.reminder_at) : new Date());
        setRepeatType(editReminder.interval_type === 'months' ? 'months' : 'none');
        setRepeatValueStr(editReminder.interval_value != null ? String(editReminder.interval_value) : '1');
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        setDate(d);
        setTitle('');
        setNotes('');
        setRepeatType('none');
        setRepeatValueStr('1');
        setAttachMode(requireCustomerPick ? 'customer' : 'general');
        setCustomerQuery('');
        setCustomerResults([]);
        setSelectedCustomer(null);
      }
    }
  }, [open, editReminder, requireCustomerPick]);

  useEffect(() => {
    if (!open || isEdit || !showCustomerSearch) {
      if (!open || isEdit) {
        setCustomerSearchLoading(false);
      }
      return;
    }
    const q = customerQuery.trim();
    if (!q) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return;
    }
    setCustomerSearchLoading(true);
    const t = window.setTimeout(() => {
      db.customers.searchSlim(q, 30).then(({ data, error }) => {
        setCustomerSearchLoading(false);
        if (error) {
          setCustomerResults([]);
          return;
        }
        setCustomerResults((data as SlimCustomer[]) || []);
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [customerQuery, open, isEdit, showCustomerSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast.error('Please enter what this reminder is about');
      return;
    }
    const intervalType = repeatType === 'none' ? null : 'months';
    const parsed = intervalType ? (parseInt(repeatValueStr.trim(), 10) || 0) : null;
    const intervalValue = intervalType && parsed >= 1 && parsed <= 24 ? parsed : null;
    if (intervalType && (parsed < 1 || parsed > 24)) {
      toast.error('Enter months between 1 and 24');
      return;
    }

    if (showCustomerPickerOnly && !selectedCustomer) {
      toast.error('Search and select a customer');
      return;
    }
    if (showLinkChoice && attachMode === 'customer' && !selectedCustomer) {
      toast.error('Search and select a customer, or choose General reminder');
      return;
    }

    const createEntityType: 'customer' | 'job' | 'general' =
      showCustomerPickerOnly && selectedCustomer
        ? 'customer'
        : showLinkChoice && attachMode === 'customer' && selectedCustomer
          ? 'customer'
          : entity.type;
    const createEntityId: string | null =
      showCustomerPickerOnly && selectedCustomer
        ? selectedCustomer.id
        : showLinkChoice && attachMode === 'customer' && selectedCustomer
          ? selectedCustomer.id
          : entity.id || null;

    setSaving(true);
    try {
      // For new interval reminders: you only select interval — first reminder = today + X months (no date picker). When they mark it done, next = that date + X months. When editing, keep existing reminder_at.
      const reminderAt =
        isEdit && editReminder && intervalType
          ? (editReminder.reminder_at ?? format(date, 'yyyy-MM-dd'))
          : intervalType && !isEdit
            ? format(addMonths(new Date(), intervalValue ?? 0), 'yyyy-MM-dd')
            : format(date, 'yyyy-MM-dd');
      if (isEdit && editReminder) {
        const { error } = await db.reminders.update(editReminder.id, {
          title: t,
          notes: notes.trim() || null,
          reminder_at: reminderAt,
          interval_type: intervalType,
          interval_value: intervalValue,
        });
        if (error) throw new Error(error.message);
        toast.success('Reminder updated');
      } else {
        const { error } = await db.reminders.create({
          entity_type: createEntityType,
          entity_id: createEntityId,
          title: t,
          notes: notes.trim() || null,
          reminder_at: reminderAt,
          interval_type: intervalType,
          interval_value: intervalValue,
        });
        if (error) throw new Error(error.message);
        toast.success('Reminder added');
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {isEdit ? 'Edit reminder' : dialogTitle || 'Add reminder'}
          </DialogTitle>
        </DialogHeader>
        {contextLabel && (
          <p className="text-xs sm:text-sm text-muted-foreground">{contextLabel}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {showLinkChoice && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium">Reminder type</Label>
              <RadioGroup
                value={attachMode}
                onValueChange={(v) => {
                  const next = v as 'general' | 'customer';
                  setAttachMode(next);
                  if (next === 'general') {
                    setSelectedCustomer(null);
                    setCustomerQuery('');
                    setCustomerResults([]);
                  }
                }}
                className="grid gap-2"
              >
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="general" id="rem-attach-general" />
                  <span>General — not linked to a customer</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="customer" id="rem-attach-customer" />
                  <span>Linked to a customer</span>
                </label>
              </RadioGroup>
              {attachMode === 'customer' && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="reminder-customer-search">Find customer</Label>
                  <Input
                    id="reminder-customer-search"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setSelectedCustomer(null);
                    }}
                    placeholder="Name, phone, or customer ID"
                    className="min-h-9"
                    autoComplete="off"
                  />
                  {selectedCustomer && (
                    <p className="text-xs text-muted-foreground">
                      Selected:{' '}
                      <span className="font-medium text-foreground">
                        {selectedCustomer.full_name || 'Customer'}{' '}
                        <span className="font-mono">
                          ({selectedCustomer.customer_id || selectedCustomer.id.slice(0, 8)})
                        </span>
                      </span>
                    </p>
                  )}
                  {customerSearchLoading && (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  )}
                  {!customerSearchLoading && customerQuery.trim() && customerResults.length === 0 && (
                    <p className="text-xs text-muted-foreground">No matches.</p>
                  )}
                  {customerResults.length > 0 && (
                    <ul className="max-h-36 overflow-y-auto rounded-md border border-border bg-background text-sm">
                      {customerResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={cn(
                              'w-full text-left px-2 py-2 hover:bg-muted/80 border-b border-border last:border-0',
                              selectedCustomer?.id === c.id && 'bg-muted'
                            )}
                            onClick={() => setSelectedCustomer(c)}
                          >
                            <span className="font-medium">{c.full_name || 'Customer'}</span>
                            <span className="block text-xs text-muted-foreground font-mono">
                              {c.customer_id || c.id.slice(0, 8)}
                              {c.phone ? ` · ${c.phone}` : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          {showCustomerPickerOnly && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label htmlFor="reminder-customer-search-only">Find customer *</Label>
              <Input
                id="reminder-customer-search-only"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomer(null);
                }}
                placeholder="Name, phone, or customer ID"
                className="min-h-9"
                autoComplete="off"
              />
              {selectedCustomer && (
                <p className="text-xs text-muted-foreground">
                  Selected:{' '}
                  <span className="font-medium text-foreground">
                    {selectedCustomer.full_name || 'Customer'}{' '}
                    <span className="font-mono">
                      ({selectedCustomer.customer_id || selectedCustomer.id.slice(0, 8)})
                    </span>
                  </span>
                </p>
              )}
              {customerSearchLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
              {!customerSearchLoading && customerQuery.trim() && customerResults.length === 0 && (
                <p className="text-xs text-muted-foreground">No matches.</p>
              )}
              {customerResults.length > 0 && (
                <ul className="max-h-36 overflow-y-auto rounded-md border border-border bg-background text-sm">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={cn(
                          'w-full text-left px-2 py-2 hover:bg-muted/80 border-b border-border last:border-0',
                          selectedCustomer?.id === c.id && 'bg-muted'
                        )}
                        onClick={() => setSelectedCustomer(c)}
                      >
                        <span className="font-medium">{c.full_name || 'Customer'}</span>
                        <span className="block text-xs text-muted-foreground font-mono">
                          {c.customer_id || c.id.slice(0, 8)}
                          {c.phone ? ` · ${c.phone}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="reminder-title">What is this reminder about? *</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Change filter, Call back for AMC"
              className="mt-1 min-h-9"
            />
          </div>
          <div>
            <Label htmlFor="reminder-notes">Notes (optional)</Label>
            <Input
              id="reminder-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Extra details"
              className="mt-1 min-h-9"
            />
          </div>
          <div>
            <Label>Remind on date</Label>
            {repeatType === 'months' ? (
              <p className="text-sm text-muted-foreground mt-1">
                {isEdit && editReminder?.reminder_at ? (
                  <>First reminder was on <strong>{format(new Date(editReminder.reminder_at), 'PPP')}</strong>. Next reminders every {repeatValueStr.trim() || '?'} months from that date.</>
                ) : (
                  <>First reminder: <strong>today</strong>. (Date is ignored for repeating reminders.)</>
                )}
              </p>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full mt-1 justify-start text-left font-normal min-h-9')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {date ? format(date, 'PPP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="space-y-2">
            <Label>Repeat</Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={repeatType} onValueChange={(v) => setRepeatType(v as 'none' | 'months')}>
                <SelectTrigger className="w-full sm:w-[140px] min-h-9">
                  <SelectValue placeholder="Don't repeat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't repeat</SelectItem>
                  <SelectItem value="months">Every N months</SelectItem>
                </SelectContent>
              </Select>
              {repeatType === 'months' && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={repeatValueStr}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d{1,2}$/.test(v)) setRepeatValueStr(v);
                    }}
                    placeholder="1"
                    className="w-14 sm:w-16 min-h-9"
                    aria-label="Months"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">months</span>
                </div>
              )}
            </div>
            {repeatType === 'months' && (
              <p className="text-xs text-muted-foreground">
                First reminder: in {repeatValueStr.trim() || '?'} months from today. When you mark it done (Got it), the next will be {repeatValueStr.trim() || '?'} months after that, and so on.
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-9 w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-h-9 w-full sm:w-auto">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Add reminder'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
