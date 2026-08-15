import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomAppointmentTimeSelect } from './CustomAppointmentTimeSelect';
import { nextPresetAppointmentTime } from '@/lib/adminAppointmentTimes';

export type MoveToOngoingTimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';

type MoveToOngoingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  onDateChange: (date: string) => void;
  timeSlot: MoveToOngoingTimeSlot;
  onTimeSlotChange: (slot: MoveToOngoingTimeSlot) => void;
  customTime: string;
  onCustomTimeChange: (time: string) => void;
  isUpdating: boolean;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function MoveToOngoingDialog({
  open,
  onOpenChange,
  date,
  onDateChange,
  timeSlot,
  onTimeSlotChange,
  customTime,
  onCustomTimeChange,
  isUpdating,
  onCancel,
  onSubmit,
}: MoveToOngoingDialogProps) {
  const handleTimeSlotChange = (value: MoveToOngoingTimeSlot) => {
    onTimeSlotChange(value);
    onCustomTimeChange(value === 'CUSTOM' ? nextPresetAppointmentTime() : '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Ongoing</DialogTitle>
          <DialogDescription>
            Please select the new scheduled date and time slot for this job.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="admin-ongoing-date">Scheduled Date *</Label>
            <DatePicker
              value={date}
              onChange={(v) => v && onDateChange(v)}
              placeholder="Pick date"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="admin-ongoing-time-slot">Time Slot *</Label>
            <Select value={timeSlot} onValueChange={(value) => handleTimeSlotChange(value as MoveToOngoingTimeSlot)}>
              <SelectTrigger id="admin-ongoing-time-slot" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Morning (9 AM - 12 PM)</SelectItem>
                <SelectItem value="AFTERNOON">Afternoon (12 PM - 5 PM)</SelectItem>
                <SelectItem value="EVENING">Evening (5 PM - 8 PM)</SelectItem>
                <SelectItem value="CUSTOM">Custom Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {timeSlot === 'CUSTOM' && (
            <div>
              <Label htmlFor="admin-ongoing-custom-time">Visit time *</Label>
              <CustomAppointmentTimeSelect
                id="admin-ongoing-custom-time"
                className="mt-1"
                value={customTime}
                onChange={onCustomTimeChange}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isUpdating || !date || (timeSlot === 'CUSTOM' && !customTime)}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {isUpdating ? 'Moving...' : 'Move to Ongoing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
