import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';

interface EditCompletedJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  editData: any;
  onEditDataChange: (data: any) => void;
  technicians: Technician[];
  onSave: () => Promise<void>;
}

const EditCompletedJobDialog: React.FC<EditCompletedJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  editData,
  onEditDataChange,
  technicians,
  onSave
}) => {
  const [qrCodeNames, setQrCodeNames] = useState<string[]>([]);
  const [qrCodesFetched, setQrCodesFetched] = useState(false);
  const [qrCodesLoading, setQrCodesLoading] = useState(false);

  const loadQrCodeNames = useCallback(async () => {
    if (qrCodesFetched) return;
    setQrCodesLoading(true);
    try {
      const { data, error } = await db.commonQrCodes.getNames();
      if (error) throw error;
      const names = (data || []).map((q: { name: string }) => q.name).filter(Boolean);
      setQrCodeNames(names);
      setQrCodesFetched(true);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load QR codes');
    } finally {
      setQrCodesLoading(false);
    }
  }, [qrCodesFetched]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Completed Job Details</DialogTitle>
          <DialogDescription>
            Update completion information for {(job as any)?.job_number || job?.jobNumber}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Amount */}
          <div>
            <Label htmlFor="edit-amount">Amount (₹)</Label>
            <Input
              id="edit-amount"
              type="number"
              value={editData.amount || ''}
              onChange={(e) => onEditDataChange({ ...editData, amount: e.target.value })}
              placeholder="Enter amount"
            />
          </div>

          {/* Payment Method */}
          <div>
            <Label htmlFor="edit-payment-method">Payment Method</Label>
            <Select
              value={editData.paymentMethod || 'CASH'}
              onValueChange={(value) => onEditDataChange({ ...editData, paymentMethod: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Lead Source */}
          <div>
            <Label htmlFor="edit-lead-source">Lead Source</Label>
            <Select
              value={editData.leadSource || 'Direct call'}
              onValueChange={(value) => {
                const selectedLeadSource = value === 'Other' ? 'Other' : value;
                // Get default lead cost for a source (used when switching to a non-Other source)
                const getDefaultLeadCost = (leadSource: string): string => {
                  switch (leadSource) {
                    case 'Home Triangle': return '200';
                    case 'Home Triangle-Srujan': return '200';
                    case 'Direct call': return '0';
                    case 'RO care india': return '400';
                    case 'Local Ramu': return '500';
                    case 'Google-Leads': return '0';
                    case 'Website': return '0';
                    default: return '0';
                  }
                };
                // When switching to "Other" (custom lead source), preserve existing lead cost so
                // editing custom lead source doesn't reset the value; only set default when switching to a named source.
                const newLeadCost = selectedLeadSource === 'Other'
                  ? (editData.leadCost ?? getDefaultLeadCost(selectedLeadSource))
                  : getDefaultLeadCost(selectedLeadSource);
                onEditDataChange({ 
                  ...editData, 
                  leadSource: selectedLeadSource,
                  leadSourceCustom: value === 'Other' ? editData.leadSourceCustom : '',
                  leadCost: newLeadCost
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Website">Website</SelectItem>
                <SelectItem value="Direct call">Direct call</SelectItem>
                <SelectItem value="Google-Leads">Google-Leads</SelectItem>
                <SelectItem value="RO care india">RO care india</SelectItem>
                <SelectItem value="Home Triangle">Home Triangle</SelectItem>
                <SelectItem value="Home Triangle-Srujan">Home Triangle-Srujan</SelectItem>
                <SelectItem value="Local Ramu">Local Ramu</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {editData.leadSource === 'Other' && (
            <div>
              <Label htmlFor="edit-lead-source-custom">Custom Lead Source</Label>
              <Input
                id="edit-lead-source-custom"
                value={editData.leadSourceCustom || ''}
                onChange={(e) => onEditDataChange({ ...editData, leadSourceCustom: e.target.value })}
                placeholder="Enter custom lead source"
              />
            </div>
          )}

          {/* Lead Cost - Always editable so it can be updated when needed */}
          <div>
            <Label htmlFor="edit-lead-cost">Lead Cost (₹)</Label>
            <Input
              id="edit-lead-cost"
              type="number"
              min="0"
              step="0.01"
              value={editData.leadCost ?? ''}
              onChange={(e) => onEditDataChange({ ...editData, leadCost: e.target.value })}
              placeholder="0 if none"
            />
            <p className="text-xs text-gray-500 mt-1">Edit if you need to update lead cost for this job</p>
          </div>

          {/* QR Code Name (if online payment) - dropdown, fetches list only when opened */}
          {(editData.paymentMethod === 'UPI' || editData.paymentMethod === 'CARD' || editData.paymentMethod === 'BANK_TRANSFER') && (
            <div>
              <Label htmlFor="edit-qr-code">QR Code Name</Label>
              <Select
                value={editData.qrCodeName || '__none__'}
                onValueChange={(value) => onEditDataChange({ ...editData, qrCodeName: value === '__none__' ? '' : value })}
                onOpenChange={(isOpen) => { if (isOpen) loadQrCodeNames(); }}
              >
                <SelectTrigger id="edit-qr-code">
                  <SelectValue placeholder={qrCodesLoading ? 'Loading...' : 'Select QR code'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {qrCodeNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {qrCodesFetched && qrCodeNames.length === 0 && (
                    <SelectItem value="__empty__" disabled>No QR codes found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* AMC Details */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">AMC Details</Label>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="amc-start-date">Start Date</Label>
                  <Input
                    id="amc-start-date"
                    type="date"
                    value={editData.amcInfo?.date_given ? new Date(editData.amcInfo.date_given).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const amcInfo = { ...editData.amcInfo, date_given: e.target.value };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="amc-end-date">End Date</Label>
                  <Input
                    id="amc-end-date"
                    type="date"
                    value={editData.amcInfo?.end_date ? new Date(editData.amcInfo.end_date).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const amcInfo = { ...editData.amcInfo, end_date: e.target.value };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="amc-years">Duration (Years)</Label>
                  <Input
                    id="amc-years"
                    type="number"
                    value={editData.amcInfo?.years || 1}
                    onChange={(e) => {
                      const amcInfo = { ...editData.amcInfo, years: parseInt(e.target.value) || 1 };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="amc-prefilter">Includes Prefilter</Label>
                  <Select
                    value={editData.amcInfo?.includes_prefilter !== undefined ? String(editData.amcInfo.includes_prefilter) : 'false'}
                    onValueChange={(value) => {
                      const amcInfo = { ...editData.amcInfo, includes_prefilter: value === 'true' };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Completion Notes */}
          <div>
            <Label htmlFor="edit-notes">Completion Notes</Label>
            <Textarea
              id="edit-notes"
              value={editData.completionNotes || ''}
              onChange={(e) => onEditDataChange({ ...editData, completionNotes: e.target.value })}
              placeholder="Enter completion notes"
              rows={4}
            />
          </div>

          {/* Completed By */}
          <div>
            <Label htmlFor="edit-completed-by">Completed By</Label>
            <Select
              value={editData.completedBy || ''}
              onValueChange={(value) => onEditDataChange({ ...editData, completedBy: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select who completed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Completion Date */}
          <div className="border-t pt-4">
            <Label htmlFor="edit-completion-date" className="text-base font-semibold">Completion Date & Time</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label htmlFor="edit-completion-date" className="text-sm">Date</Label>
                <Input
                  id="edit-completion-date"
                  type="date"
                  value={editData.completedDate || ''}
                  onChange={(e) => {
                    const dateValue = e.target.value;
                    // If time is already set, preserve it
                    const existingCompletedAt = editData.completedAt ? new Date(editData.completedAt) : new Date();
                    if (dateValue) {
                      const newDate = new Date(dateValue);
                      newDate.setHours(existingCompletedAt.getHours());
                      newDate.setMinutes(existingCompletedAt.getMinutes());
                      newDate.setSeconds(existingCompletedAt.getSeconds());
                      const timeStr = editData.completedTime || existingCompletedAt.toTimeString().slice(0, 5);
                      onEditDataChange({ 
                        ...editData, 
                        completedDate: dateValue,
                        completedTime: timeStr,
                        completedAt: newDate.toISOString()
                      });
                    } else {
                      onEditDataChange({ ...editData, completedDate: '', completedAt: null });
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="edit-completion-time" className="text-sm">Time</Label>
                <Input
                  id="edit-completion-time"
                  type="time"
                  value={editData.completedTime || ''}
                  onChange={(e) => {
                    const timeValue = e.target.value;
                    // If date is already set, preserve it, otherwise use today
                    const existingDate = editData.completedDate || new Date().toISOString().split('T')[0];
                    const existingCompletedAt = editData.completedAt ? new Date(editData.completedAt) : new Date();
                    
                    if (timeValue) {
                      const [hours, minutes] = timeValue.split(':');
                      const newDate = new Date(`${existingDate}T${hours}:${minutes}:00`);
                      onEditDataChange({ 
                        ...editData, 
                        completedTime: timeValue,
                        completedDate: existingDate,
                        completedAt: newDate.toISOString()
                      });
                    } else {
                      onEditDataChange({ ...editData, completedTime: '', completedAt: null });
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Leave empty to keep the original completion date</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCompletedJobDialog;

