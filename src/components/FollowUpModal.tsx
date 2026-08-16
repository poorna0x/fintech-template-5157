import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Calendar as CalendarIcon, Plus, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Job } from '@/types';
import { supabase, FOLLOW_UP_ROW_COLUMNS } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { hasAutoMoveToOngoingOnDate } from '@/lib/followUpToOngoing';
import { nextPresetAppointmentTime } from '@/lib/adminAppointmentTimes';
import { CustomAppointmentTimeSelect } from '@/components/admin/CustomAppointmentTimeSelect';

interface FollowUp {
  id: string;
  job_id: string;
  parent_follow_up_id?: string;
  follow_up_date: string;
  follow_up_time?: string;
  reason: string;
  notes?: string;
  scheduled_by?: string;
  scheduled_at: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  onScheduleFollowUp: (jobId: string, followUpData: {
    followUpDate: string;
    followUpTime: string;
    followUpReason: string;
    parentFollowUpId?: string;
    rescheduleFollowUpId?: string;
    autoMoveToOngoingOnDate?: boolean;
    addAmcReminder?: boolean;
  }) => void;
  hasActiveAmc?: boolean;
}

export default function FollowUpModal({
  isOpen,
  onClose,
  job,
  onScheduleFollowUp,
  hasActiveAmc = false,
}: FollowUpModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState(() => nextPresetAppointmentTime());
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingFollowUps, setExistingFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [selectedParentFollowUp, setSelectedParentFollowUp] = useState<string | null>(null);
  const [rescheduleFollowUpId, setRescheduleFollowUpId] = useState<string | null>(null);
  const [autoMoveToOngoingOnDate, setAutoMoveToOngoingOnDate] = useState(false);
  const [addAmcReminder, setAddAmcReminder] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const reasonInputRef = useRef<HTMLInputElement>(null);

  const suggestedReasons = [
    'Need new RO',
    'Not picking up call',
    'Not confirmed',
    'Customer rescheduled',
    'Equipment not available',
    'Waiting for customer decision',
    'Need to visit again',
    'Customer wants to think',
    'Price negotiation needed',
    'Technical issue pending',
    'Installation date conflict',
    'Customer not available'
  ];

  const filteredSuggestions = useMemo(() => {
    if (!reason.trim()) return [];
    const lowerReason = reason.toLowerCase();
    return suggestedReasons.filter(s => 
      s.toLowerCase().includes(lowerReason)
    );
  }, [reason]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen && job) {
      // Reset form fields
      setSelectedDate(new Date());
      setSelectedTime(nextPresetAppointmentTime());
      setReason('');
      setSelectedParentFollowUp(null);
      setRescheduleFollowUpId(null);
      setAutoMoveToOngoingOnDate(hasAutoMoveToOngoingOnDate((job as any).requirements));
      setAddAmcReminder(
        Boolean((job as any).include_amc_follow_up ?? (job as any).includeAmcFollowUp)
      );
    } else {
      setExistingFollowUps([]);
      setSelectedParentFollowUp(null);
      setRescheduleFollowUpId(null);
      setAutoMoveToOngoingOnDate(false);
      setAddAmcReminder(false);
    }
  }, [isOpen, job]);

  const loadFollowUps = async () => {
    if (!job) return;
    setLoadingFollowUps(true);
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select(FOLLOW_UP_ROW_COLUMNS)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading follow-ups:', error);
        // If 401 error, show user-friendly message
        if (error.code === 'PGRST301' || error.message?.includes('401') || error.message?.includes('unauthorized')) {
          console.warn('Authentication error loading follow-ups. This might be a permissions issue.');
          // Still set empty array so UI doesn't break
        }
        setExistingFollowUps([]);
        return;
      }
      
      // If no follow-ups found in table but job has follow-up data, create a record
      if ((!data || data.length === 0) && job.status === 'FOLLOW_UP') {
        const followUpDate = (job as any).follow_up_date || job.followUpDate;
        const followUpTime = (job as any).follow_up_time || job.followUpTime;
        const followUpNotes = (job as any).follow_up_notes || job.followUpNotes;
        const followUpScheduledAt = (job as any).follow_up_scheduled_at || job.followUpScheduledAt;
        const followUpScheduledBy = (job as any).follow_up_scheduled_by || job.followUpScheduledBy;
        
        if (followUpDate && followUpNotes) {
          // Create follow-up record from job data
          // scheduled_by must be a UUID (null if not available)
          const { data: newFollowUp, error: createError } = await supabase
            .from('follow_ups')
            .insert({
              job_id: job.id,
              follow_up_date: followUpDate,
              follow_up_time: followUpTime || null,
              reason: followUpNotes,
              scheduled_by: followUpScheduledBy || null, // Must be UUID or null, not a string
              completed: false
            })
            .select()
            .single();
          
          if (createError) {
            console.error('Error creating follow-up record from job data:', createError);
            // If 401 error, don't try to create - just show empty list
            if (createError.code === 'PGRST301' || createError.message?.includes('401') || createError.message?.includes('unauthorized')) {
              console.warn('Authentication error creating follow-up. Permissions may not be set up.');
              return;
            }
          } else if (newFollowUp) {
            // Map the created record to match the FollowUp interface
            const mappedFollowUp: FollowUp = {
              id: newFollowUp.id,
              job_id: newFollowUp.job_id,
              parent_follow_up_id: newFollowUp.parent_follow_up_id,
              follow_up_date: newFollowUp.follow_up_date,
              follow_up_time: newFollowUp.follow_up_time,
              reason: newFollowUp.reason,
              notes: newFollowUp.notes,
              scheduled_by: newFollowUp.scheduled_by,
              scheduled_at: newFollowUp.scheduled_at || newFollowUp.created_at,
              completed: newFollowUp.completed || false,
              completed_at: newFollowUp.completed_at,
              created_at: newFollowUp.created_at,
              updated_at: newFollowUp.updated_at || newFollowUp.created_at
            };
            setExistingFollowUps([mappedFollowUp]);
            return;
          }
        }
      }
      
      // Map the data to match the FollowUp interface
      const mappedFollowUps: FollowUp[] = (data || []).map((fu: any) => ({
        id: fu.id,
        job_id: fu.job_id,
        parent_follow_up_id: fu.parent_follow_up_id,
        follow_up_date: fu.follow_up_date,
        follow_up_time: fu.follow_up_time,
        reason: fu.reason,
        notes: fu.notes,
        scheduled_by: fu.scheduled_by,
        scheduled_at: fu.scheduled_at || fu.created_at,
        completed: fu.completed || false,
        completed_at: fu.completed_at,
        created_at: fu.created_at,
        updated_at: fu.updated_at || fu.created_at
      }));
      
      setExistingFollowUps(mappedFollowUps);
    } catch (error) {
      console.error('Error loading follow-ups:', error);
      setExistingFollowUps([]);
    } finally {
      setLoadingFollowUps(false);
    }
  };

  // Build follow-up tree structure
  const buildFollowUpTree = (followUps: FollowUp[]) => {
    const map = new Map<string, FollowUp & { children: FollowUp[] }>();
    const roots: (FollowUp & { children: FollowUp[] })[] = [];

    followUps.forEach(fu => {
      map.set(fu.id, { ...fu, children: [] });
    });

    followUps.forEach(fu => {
      const node = map.get(fu.id)!;
      if (fu.parent_follow_up_id && map.has(fu.parent_follow_up_id)) {
        map.get(fu.parent_follow_up_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const followUpTree = useMemo(() => {
    return buildFollowUpTree(existingFollowUps.filter(fu => !fu.completed));
  }, [existingFollowUps]);

  const handleSubmit = async () => {
    if (!job || !selectedDate || !selectedTime) {
      toast.error('Please pick a follow-up date and time');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Format date in local timezone to avoid UTC conversion issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      
      const followUpData = {
        followUpDate: formattedDate,
        followUpTime: selectedTime,
        followUpReason: reason.trim() || 'Not confirmed',
        parentFollowUpId: selectedParentFollowUp || undefined,
        rescheduleFollowUpId: rescheduleFollowUpId || undefined,
        autoMoveToOngoingOnDate: selectedParentFollowUp ? undefined : autoMoveToOngoingOnDate,
        addAmcReminder: selectedParentFollowUp ? undefined : addAmcReminder,
      };

      await onScheduleFollowUp(job.id, followUpData);
      
      // Reset form
      setSelectedDate(new Date());
      setSelectedTime(nextPresetAppointmentTime());
      setReason('');
      setSelectedParentFollowUp(null);
      setRescheduleFollowUpId(null);
      setAutoMoveToOngoingOnDate(false);
      setAddAmcReminder(false);
      
      // Reload follow-ups
      await loadFollowUps();
      
      // Close dialog after successful submission
      onClose();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to schedule follow-up';
      if (process.env.NODE_ENV === 'development') {
        console.error('Error scheduling follow-up:', error);
      }
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setReason(suggestion);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const renderFollowUpTree = (node: FollowUp & { children: FollowUp[] }, level: number = 0) => {
    const indent = level * 20;
    return (
      <div key={node.id} className="mb-3" style={{ marginLeft: `${indent}px` }}>
        <Card className="p-3 border-l-4 border-l-blue-500">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  <CalendarIcon className="w-3 h-3 mr-1" />
                  {new Date(node.follow_up_date).toLocaleDateString()}
                  {node.follow_up_time ? ` · ${node.follow_up_time.slice(0, 5)}` : ''}
                </Badge>
                {node.completed && (
                  <Badge variant="default" className="text-xs bg-green-500">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Completed
                  </Badge>
                )}
              </div>
              {node.reason?.trim() && (
                <div className="font-medium text-sm text-gray-900 mb-1">
                  {node.reason}
                </div>
              )}
              {node.notes && (
                <div className="text-xs text-gray-600 mb-2">
                  {node.notes}
                </div>
              )}
              <div className="text-xs text-gray-500">
                Scheduled: {new Date(node.scheduled_at).toLocaleString()}
              </div>
            </div>
            {!node.completed && (
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRescheduleFollowUpId(node.id);
                    setSelectedDate(new Date(node.follow_up_date));
                    setSelectedTime(node.follow_up_time?.slice(0, 5) || nextPresetAppointmentTime());
                    setReason(node.reason);
                  }}
                  className="text-xs"
                  title="Reschedule this follow-up"
                >
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedParentFollowUp(node.id);
                  }}
                  className="text-xs"
                  title="Add nested follow-up"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </Card>
        {node.children.map(child => renderFollowUpTree(child, level + 1))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Follow-ups for Job {job?.jobNumber}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {job && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">
                Job: {job.jobNumber || job.job_number || 'N/A'}
              </div>
              <div className="text-sm text-gray-600">
                {(job.serviceType || job.service_type) && (job.serviceSubType || job.service_sub_type) 
                  ? `${job.serviceType || job.service_type} - ${job.serviceSubType || job.service_sub_type}`
                  : 'Service details not available'}
              </div>
              <div className="text-sm text-gray-600">
                Customer: {job.customer?.fullName || job.customer?.full_name || 'Unknown'}
              </div>
            </div>
          )}

          {/* Add New Follow-up Form */}
          <Card className="p-4 border-2 border-dashed">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">
                {rescheduleFollowUpId ? 'Reschedule Follow-up' : selectedParentFollowUp ? 'Add Follow-up to Follow-up' : 'Add New Follow-up'}
              </h3>
              {(selectedParentFollowUp || rescheduleFollowUpId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedParentFollowUp(null);
                    setRescheduleFollowUpId(null);
                    setSelectedDate(new Date());
                    setSelectedTime(nextPresetAppointmentTime());
                    setReason('');
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Follow-up Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="followup-time">Follow-up Time *</Label>
                <CustomAppointmentTimeSelect
                  id="followup-time"
                  value={selectedTime}
                  onChange={setSelectedTime}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="followup-reason">Reason</Label>
                <div className="relative">
                  <Input
                    ref={reasonInputRef}
                    id="followup-reason"
                    placeholder="Type a reason..."
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setShowSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setShowSuggestions(reason.length > 0)}
                    onBlur={() => {
                      // Delay to allow clicking on suggestions
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    className="w-full"
                  />
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSuggestionClick(suggestion);
                            setShowSuggestions(false);
                            reasonInputRef.current?.blur();
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!selectedParentFollowUp && (
                <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
                  <Checkbox
                    id="auto-move-to-ongoing"
                    checked={autoMoveToOngoingOnDate}
                    onCheckedChange={(checked) => setAutoMoveToOngoingOnDate(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="auto-move-to-ongoing" className="text-sm font-medium leading-snug cursor-pointer">
                      Auto move to Ongoing on follow-up day
                    </Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      When checked, this job moves to Ongoing as unassigned on the follow-up date when you open admin.
                    </p>
                  </div>
                </div>
              )}

              {hasActiveAmc && !selectedParentFollowUp && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                  <Checkbox
                    id="add-amc-reminder"
                    checked={addAmcReminder}
                    onCheckedChange={(checked) => setAddAmcReminder(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="add-amc-reminder" className="text-sm font-medium leading-snug cursor-pointer">
                      Add reminder and show in Follow-up
                    </Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Creates a customer reminder for this date. AMC Service jobs are normally hidden from Follow-up, but this one will appear like a normal follow-up.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedParentFollowUp(null);
                      setRescheduleFollowUpId(null);
                      setReason('');
                      setSelectedDate(new Date());
                      setSelectedTime(nextPresetAppointmentTime());
                      onClose();
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!selectedDate || !selectedTime || isSubmitting}
                  >
                    {isSubmitting ? (rescheduleFollowUpId ? 'Rescheduling...' : 'Scheduling...') : (rescheduleFollowUpId ? 'Reschedule Follow-up' : 'Schedule Follow-up')}
                  </Button>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
