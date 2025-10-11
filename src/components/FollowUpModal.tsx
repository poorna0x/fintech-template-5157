import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// import { Calendar } from '@/components/ui/calendar';
// import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Calendar as CalendarIcon, Clock } from 'lucide-react';
// import { format } from 'date-fns';
import { Job } from '@/types';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onScheduleFollowUp: (jobId: string, followUpData: {
    followUpDate: string;
    followUpTime: string;
    followUpNotes?: string;
  }) => void;
}

export default function FollowUpModal({ isOpen, onClose, job, onScheduleFollowUp }: FollowUpModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00'
  ];

  const handleSubmit = async () => {
    if (!job || !selectedDate || !selectedTime) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const followUpData = {
        followUpDate: selectedDate.toISOString().split('T')[0],
        followUpTime: selectedTime,
        followUpNotes: notes.trim() || undefined
      };

      await onScheduleFollowUp(job.id, followUpData);
      
      // Reset form
      setSelectedDate(new Date());
      setSelectedTime('');
      setNotes('');
      onClose();
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              Schedule Follow-up
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          {job && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">
                Job: {job.jobNumber}
              </div>
              <div className="text-sm text-gray-600">
                {job.serviceType} - {job.serviceSubType}
              </div>
              <div className="text-sm text-gray-600">
                Customer: {job.customer?.fullName || 'Unknown'}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="followup-date">Follow-up Date</Label>
            <Input
              id="followup-date"
              type="date"
              value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setSelectedDate(e.target.value ? new Date(e.target.value) : undefined)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup-time">Follow-up Time</Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4" />
                      {time}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup-notes">Notes (Optional)</Label>
            <Textarea
              id="followup-notes"
              placeholder="Add any notes for the follow-up..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedDate || !selectedTime || isSubmitting}
            >
              {isSubmitting ? 'Scheduling...' : 'Schedule Follow-up'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
