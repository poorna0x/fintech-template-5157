import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Job } from '@/types';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';

interface EditJobFormData {
  serviceType: 'RO' | 'SOFTENER';
  serviceSubType: string;
  serviceSubTypeCustom: string;
  description: string;
  scheduledDate: string;
  scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM' | 'FLEXIBLE';
  scheduledTimeCustom: string;
  lead_source: string;
  lead_source_custom: string;
  cost_agreed: string;
}

interface EditJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onJobUpdated: (job: Job) => void;
}

const EditJobDialog: React.FC<EditJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  onJobUpdated
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [forceOpen, setForceOpen] = useState(true);
  const allowCloseRef = useRef(false);
  const initialFormDataRef = useRef<EditJobFormData | null>(null);
  const [editJobFormData, setEditJobFormData] = useState<EditJobFormData>({
    serviceType: 'RO',
    serviceSubType: 'Installation',
    serviceSubTypeCustom: '',
    description: '',
    scheduledDate: '',
    scheduledTimeSlot: 'MORNING',
    scheduledTimeCustom: '',
    lead_source: 'Direct call',
    lead_source_custom: '',
    cost_agreed: ''
  });

  useEffect(() => {
    if (job && open) {
      // Determine if service sub type is custom
      const serviceSubType = job.service_sub_type || job.serviceSubType || 'Installation';
      const isCustomSubType = !['Installation', 'Reinstallation', 'Service', 'Repair', 'Other'].includes(serviceSubType);
      
      // Determine if time slot is custom
      const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot || 'MORNING';
      const isCustomTimeSlot = !['MORNING', 'AFTERNOON', 'EVENING'].includes(timeSlot);
      
      // Convert custom time to HH:MM format for time picker
      let customTimeValue = '';
      if (isCustomTimeSlot && timeSlot) {
        const timeStr = timeSlot.toString();
        if (timeStr.includes(':')) {
          customTimeValue = timeStr;
        } else if (timeStr.includes('AM') || timeStr.includes('PM')) {
          const time = new Date(`2000-01-01 ${timeStr}`);
          if (!isNaN(time.getTime())) {
            customTimeValue = time.toTimeString().slice(0, 5);
          }
        }
      }
      
      // Extract lead_source and cost_range from requirements
      let leadSource = 'Direct call';
      let leadSourceCustom = '';
      let costAgreed = '';
      try {
        const requirements = (job as any).requirements;
        if (requirements) {
          let reqs = requirements;
          if (typeof reqs === 'string') {
            reqs = JSON.parse(reqs);
          }
          if (Array.isArray(reqs)) {
            const req = reqs.find((r: any) => r && typeof r === 'object');
            if (req) {
              if (req.lead_source) {
                leadSource = req.lead_source === 'Other' ? 'Other' : req.lead_source;
                leadSourceCustom = req.lead_source === 'Other' ? (req.lead_source_custom || '') : '';
              }
              if (req.cost_range) {
                costAgreed = req.cost_range;
              }
            }
          } else if (reqs && typeof reqs === 'object') {
            if (reqs.lead_source) {
              leadSource = reqs.lead_source === 'Other' ? 'Other' : reqs.lead_source;
              leadSourceCustom = reqs.lead_source === 'Other' ? (reqs.lead_source_custom || '') : '';
            }
            if (reqs.cost_range) {
              costAgreed = reqs.cost_range;
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      // If cost_range not found in requirements, try to get from estimated_cost
      if (!costAgreed && ((job as any).estimated_cost || job.estimatedCost)) {
        const estimatedCost = (job as any).estimated_cost || job.estimatedCost || 0;
        costAgreed = estimatedCost.toString();
      }

      const formData = {
        serviceType: (job.service_type || job.serviceType || 'RO') as 'RO' | 'SOFTENER',
        serviceSubType: isCustomSubType ? 'Custom' : serviceSubType,
        serviceSubTypeCustom: isCustomSubType ? serviceSubType : '',
        description: job.description || '',
        scheduledDate: job.scheduled_date || job.scheduledDate || '',
        scheduledTimeSlot: isCustomTimeSlot ? 'CUSTOM' : (timeSlot as 'MORNING' | 'AFTERNOON' | 'EVENING'),
        scheduledTimeCustom: customTimeValue,
        lead_source: leadSource,
        lead_source_custom: leadSourceCustom,
        cost_agreed: costAgreed
      };
      setEditJobFormData(formData);
      // Store initial form data to detect changes
      initialFormDataRef.current = formData;
    }
  }, [job, open]);

  // Reset close flag when dialog opens
  useEffect(() => {
    if (open) {
      allowCloseRef.current = false;
      setIsClosing(false);
      setForceOpen(true);
    }
  }, [open]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!initialFormDataRef.current) return false;
    const initial = initialFormDataRef.current;
    return (
      initial.serviceType !== editJobFormData.serviceType ||
      initial.serviceSubType !== editJobFormData.serviceSubType ||
      initial.serviceSubTypeCustom !== editJobFormData.serviceSubTypeCustom ||
      initial.description !== editJobFormData.description ||
      initial.scheduledDate !== editJobFormData.scheduledDate ||
      initial.scheduledTimeSlot !== editJobFormData.scheduledTimeSlot ||
      initial.scheduledTimeCustom !== editJobFormData.scheduledTimeCustom ||
      initial.lead_source !== editJobFormData.lead_source ||
      initial.lead_source_custom !== editJobFormData.lead_source_custom ||
      initial.cost_agreed !== editJobFormData.cost_agreed
    );
  };

  const handleSubmit = async () => {
    if (!job) return;

    try {
      // Convert time picker value to readable format for custom time
      let timeSlotValue = editJobFormData.scheduledTimeSlot;
      let customTimeInRequirements = null;
      
      if (editJobFormData.scheduledTimeSlot === 'CUSTOM' && editJobFormData.scheduledTimeCustom) {
        customTimeInRequirements = editJobFormData.scheduledTimeCustom;
        const [hours] = editJobFormData.scheduledTimeCustom.split(':').map(Number);
        const hour24 = parseInt(hours.toString());
        if (hour24 < 13) {
          timeSlotValue = 'MORNING';
        } else if (hour24 < 18) {
          timeSlotValue = 'AFTERNOON';
        } else {
          timeSlotValue = 'EVENING';
        }
      } else if (editJobFormData.scheduledTimeSlot === 'FLEXIBLE') {
        timeSlotValue = 'MORNING';
      } else {
        timeSlotValue = editJobFormData.scheduledTimeSlot as 'MORNING' | 'AFTERNOON' | 'EVENING';
      }

      // Get existing requirements or create new one
      let requirements = (job as any).requirements || [];
      if (typeof requirements === 'string') {
        try {
          requirements = JSON.parse(requirements);
        } catch (e) {
          requirements = [];
        }
      }
      if (!Array.isArray(requirements)) {
        requirements = [requirements];
      }
      
      // Update or add lead_source and custom_time
      const leadSourceValue = editJobFormData.lead_source === 'Other' 
        ? (editJobFormData.lead_source_custom || 'Other')
        : editJobFormData.lead_source;
      
      // Find existing requirement object or create new one
      let reqObj = requirements.find((r: any) => r && typeof r === 'object') || {};
      reqObj.lead_source = leadSourceValue;
      if (editJobFormData.lead_source === 'Other' && editJobFormData.lead_source_custom) {
        reqObj.lead_source_custom = editJobFormData.lead_source_custom;
      }
      if (customTimeInRequirements) {
        reqObj.custom_time = customTimeInRequirements;
      }
      if (editJobFormData.scheduledTimeSlot === 'FLEXIBLE') {
        reqObj.flexible_time = true;
      }
      if (editJobFormData.cost_agreed && editJobFormData.cost_agreed.trim()) {
        reqObj.cost_range = editJobFormData.cost_agreed.trim();
      }
      
      requirements = [reqObj];

      // Calculate estimated_cost from cost_agreed (take first number if range)
      const estimatedCost = editJobFormData.cost_agreed 
        ? (parseFloat(editJobFormData.cost_agreed.toString().split('-')[0].trim()) || 0)
        : 0;

      const { data: updatedJob, error } = await db.jobs.update(job.id, {
        service_type: editJobFormData.serviceType,
        service_sub_type: editJobFormData.serviceSubType === 'Custom' ? editJobFormData.serviceSubTypeCustom : editJobFormData.serviceSubType,
        description: editJobFormData.description.trim(),
        scheduled_date: editJobFormData.scheduledDate,
        scheduled_time_slot: timeSlotValue,
        estimated_cost: estimatedCost,
        requirements: requirements
      });

      if (error) {
        throw new Error(error.message);
      }

      onJobUpdated(updatedJob);
      
      // Update initial form data ref after successful save
      initialFormDataRef.current = { ...editJobFormData };
      
      // Only close if we're in the process of closing (user clicked Update or Cancel button)
      if (isClosing && allowCloseRef.current) {
        toast.success('Job updated successfully');
        allowCloseRef.current = false;
        setIsClosing(false);
        setForceOpen(false);
        onOpenChange(false);
      } else {
        // Silent save (from Cancel button with unsaved changes)
        toast.success('Changes saved');
        // After saving, close the dialog
        setForceOpen(false);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error updating job:', error);
      toast.error('Failed to update job');
      // Don't close on error
      setIsClosing(false);
    }
  };

  if (!job) return null;

  const handleDialogOpenChange = (isOpen: boolean) => {
    // Only allow closing if explicitly requested (via Cancel or Update button)
    // Completely prevent accidental closing from clicking outside or ESC
    if (!isOpen) {
      // User is trying to close - only allow if we explicitly set allowCloseRef
      if (allowCloseRef.current) {
        allowCloseRef.current = false;
        setIsClosing(false);
        setForceOpen(false);
        onOpenChange(false);
      } else {
        // Prevent closing - force the dialog to stay open
        // Don't call onOpenChange(false) and ensure open prop stays true
        setForceOpen(true);
        // Don't propagate the close event to parent
        // The dialog will stay open because we're not calling onOpenChange(false)
        return;
      }
      return;
    }
    // Dialog is opening - allow it and reset flags
    setIsClosing(false);
    allowCloseRef.current = false;
    setForceOpen(true);
    if (isOpen) {
      onOpenChange(true);
    }
  };

  const handleCancel = async () => {
    // Check if there are unsaved changes
    if (hasUnsavedChanges()) {
      // Save changes before closing
      allowCloseRef.current = true;
      setIsClosing(true);
      setForceOpen(false);
      await handleSubmit();
    } else {
      // No changes, just close
      allowCloseRef.current = true;
      setIsClosing(true);
      setForceOpen(false);
      onOpenChange(false);
    }
  };

  const handleUpdate = () => {
    allowCloseRef.current = true;
    setIsClosing(true);
    handleSubmit();
  };

  // Use forceOpen to ensure dialog stays open unless explicitly closed
  // If parent sets open to false, respect it. Otherwise, use forceOpen to control
  const dialogOpen = open ? forceOpen : false;
  
  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange} modal={true}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
        onPointerDownOutside={(e) => {
          // Prevent closing when clicking outside - user must use Cancel button
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Prevent closing when clicking outside - user must use Cancel button
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing on ESC key - user must use Cancel button
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>
            Update job details and information
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={(e) => {
          e.preventDefault(); // Prevent form auto-submission
          handleUpdate();
        }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-service-type">Service Type</Label>
              <Select 
                value={editJobFormData.serviceType} 
                onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, serviceType: value as 'RO' | 'SOFTENER' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RO">RO</SelectItem>
                  <SelectItem value="SOFTENER">Softener</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-service-subtype">Service Sub Type</Label>
              <Select 
                value={editJobFormData.serviceSubType} 
                onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, serviceSubType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service sub type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Installation">Installation</SelectItem>
                  <SelectItem value="Reinstallation">Reinstallation</SelectItem>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Repair">Repair</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {editJobFormData.serviceSubType === 'Custom' && (
                <Input
                  className="mt-2"
                  placeholder="Enter custom service sub type"
                  value={editJobFormData.serviceSubTypeCustom}
                  onChange={(e) => setEditJobFormData(prev => ({ ...prev, serviceSubTypeCustom: e.target.value }))}
                />
              )}
            </div>

            <div>
              <Label htmlFor="edit-scheduled-date">Scheduled Date</Label>
              <Input
                id="edit-scheduled-date"
                type="date"
                value={editJobFormData.scheduledDate}
                onChange={(e) => setEditJobFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="edit-time-slot">Time Slot</Label>
              <Select 
                value={editJobFormData.scheduledTimeSlot} 
                onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, scheduledTimeSlot: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MORNING">Morning (9 AM - 1 PM)</SelectItem>
                  <SelectItem value="AFTERNOON">Afternoon (1 PM - 6 PM)</SelectItem>
                  <SelectItem value="EVENING">Evening (6 PM - 9 PM)</SelectItem>
                  <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                  <SelectItem value="CUSTOM">Custom Time</SelectItem>
                </SelectContent>
              </Select>
              {editJobFormData.scheduledTimeSlot === 'CUSTOM' && (
                <Input
                  className="mt-2"
                  type="time"
                  value={editJobFormData.scheduledTimeCustom}
                  onChange={(e) => setEditJobFormData(prev => ({ ...prev, scheduledTimeCustom: e.target.value }))}
                />
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={editJobFormData.description}
              onChange={(e) => setEditJobFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Job description and special instructions..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-lead-source">Lead Source</Label>
              <Select 
                value={editJobFormData.lead_source} 
                onValueChange={(value) => setEditJobFormData(prev => ({ ...prev, lead_source: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select lead source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Website">Website</SelectItem>
                  <SelectItem value="Direct call">Direct call</SelectItem>
                  <SelectItem value="RO care india">RO care india</SelectItem>
                  <SelectItem value="Home triangle">Home triangle</SelectItem>
                  <SelectItem value="Local Ramu">Local Ramu</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editJobFormData.lead_source === 'Other' && (
              <div>
                <Label htmlFor="edit-lead-source-custom">Custom Lead Source</Label>
                <Input
                  id="edit-lead-source-custom"
                  value={editJobFormData.lead_source_custom}
                  onChange={(e) => setEditJobFormData(prev => ({ ...prev, lead_source_custom: e.target.value }))}
                  placeholder="Enter custom lead source"
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="edit-cost-agreed">Cost Already Agreed (INR)</Label>
            <Input
              id="edit-cost-agreed"
              type="text"
              value={editJobFormData.cost_agreed}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^[\d\s-]+$/.test(value)) {
                  setEditJobFormData(prev => ({ ...prev, cost_agreed: value }));
                }
              }}
              placeholder="e.g., 400 or 400-500"
            />
            <p className="text-xs text-gray-500 mt-1">Enter a single amount or a range (e.g., 400-500)</p>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleUpdate}>
            Update Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditJobDialog;

