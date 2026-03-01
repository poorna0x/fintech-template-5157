import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Reminder } from '@/types';

export type ReminderEntity = { type: 'customer' | 'job' | 'general'; id: string | null };

interface AddReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: ReminderEntity;
  contextLabel?: string;
  onSaved?: () => void;
  editReminder?: Reminder | null;
}

export function AddReminderDialog({
  open,
  onOpenChange,
  entity,
  contextLabel,
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

  const isEdit = !!editReminder?.id;

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
      }
    }
  }, [open, editReminder]);

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
          entity_type: entity.type,
          entity_id: entity.id || null,
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
          <DialogTitle className="text-base sm:text-lg">{isEdit ? 'Edit reminder' : 'Add reminder'}</DialogTitle>
        </DialogHeader>
        {contextLabel && (
          <p className="text-xs sm:text-sm text-muted-foreground">{contextLabel}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
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
