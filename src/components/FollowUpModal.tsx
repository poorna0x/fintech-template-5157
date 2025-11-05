import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Calendar as CalendarIcon, Plus, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Job } from '@/types';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
    followUpReason: string;
    parentFollowUpId?: string;
    rescheduleFollowUpId?: string;
  }) => void;
}

export default function FollowUpModal({ isOpen, onClose, job, onScheduleFollowUp }: FollowUpModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingFollowUps, setExistingFollowUps] = useState<FollowUp[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [selectedParentFollowUp, setSelectedParentFollowUp] = useState<string | null>(null);
  const [rescheduleFollowUpId, setRescheduleFollowUpId] = useState<string | null>(null);
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

  // Load existing follow-ups when modal opens
  useEffect(() => {
    if (isOpen && job) {
      loadFollowUps();
    } else {
      setExistingFollowUps([]);
      setSelectedParentFollowUp(null);
      setRescheduleFollowUpId(null);
    }
  }, [isOpen, job]);

  const loadFollowUps = async () => {
    if (!job) return;
    setLoadingFollowUps(true);
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading follow-ups:', error);
      } else {
        setExistingFollowUps(data || []);
      }
    } catch (error) {
      console.error('Error loading follow-ups:', error);
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
    if (!job || !selectedDate || !reason.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const followUpData = {
        followUpDate: selectedDate.toISOString().split('T')[0],
        followUpReason: reason.trim(),
        parentFollowUpId: selectedParentFollowUp || undefined,
        rescheduleFollowUpId: rescheduleFollowUpId || undefined
      };

      await onScheduleFollowUp(job.id, followUpData);
      
      // Reset form
      setSelectedDate(new Date());
      setReason('');
      setSelectedParentFollowUp(null);
      setRescheduleFollowUpId(null);
      
      // Reload follow-ups
      await loadFollowUps();
      
      // Close dialog after successful submission
      onClose();
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      toast.error('Failed to schedule follow-up');
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
                </Badge>
                {node.completed && (
                  <Badge variant="default" className="text-xs bg-green-500">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Completed
                  </Badge>
                )}
              </div>
              <div className="font-medium text-sm text-gray-900 mb-1">
                {node.reason}
              </div>
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
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

          {/* Existing Follow-ups */}
          {loadingFollowUps ? (
            <div className="text-center py-4 text-gray-500">Loading follow-ups...</div>
          ) : followUpTree.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Existing Follow-ups</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {followUpTree.map(node => renderFollowUpTree(node))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500 text-sm">
              No follow-ups yet. Add one below.
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
                <Label htmlFor="followup-reason">Reason *</Label>
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

              <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedParentFollowUp(null);
                      setRescheduleFollowUpId(null);
                      setReason('');
                      setSelectedDate(new Date());
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!selectedDate || !reason.trim() || isSubmitting}
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
