import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { ImagePlus, X } from 'lucide-react';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';

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
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingPaymentPhoto, setUploadingPaymentPhoto] = useState(false);
  const [dragOverPayment, setDragOverPayment] = useState(false);
  const [dragOverBill, setDragOverBill] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const paymentInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: File[], isPayment: boolean): Promise<string[]> => {
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error ?? `Invalid: ${file.name}`);
        continue;
      }
      const compressed = await compressImage(file, 800, 0.8);
      const result = await cloudinaryService.uploadImage(compressed, 'ro-service', false);
      if (result?.secure_url) added.push(result.secure_url);
    }
    return added;
  }, []);

  const handlePaymentFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingPaymentPhoto(true);
    try {
      const urls = await uploadFiles(Array.from(files), true);
      if (urls.length > 0) {
        onEditDataChange({ ...editData, paymentScreenshot: urls[0] });
        toast.success('Payment screenshot added');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploadingPaymentPhoto(false);
    }
  }, [editData, onEditDataChange, uploadFiles]);

  const handleBillFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingPhotos(true);
    const baseList = editData.billPhotos || [];
    try {
      const urls = await uploadFiles(Array.from(files), false);
      if (urls.length > 0) {
        onEditDataChange({ ...editData, billPhotos: [...baseList, ...urls] });
        toast.success(`${urls.length} bill photo(s) added`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploadingPhotos(false);
    }
  }, [editData, onEditDataChange, uploadFiles]);

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
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="CARD">Card</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Partial amounts - only when PARTIAL */}
          {editData.paymentMethod === 'PARTIAL' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-partial-cash">Cash amount (₹)</Label>
                <Input
                  id="edit-partial-cash"
                  type="number"
                  min={0}
                  step={0.01}
                  value={editData.partialCashAmount ?? ''}
                  onChange={(e) => onEditDataChange({ ...editData, partialCashAmount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="edit-partial-online">Online amount (₹)</Label>
                <Input
                  id="edit-partial-online"
                  type="number"
                  min={0}
                  step={0.01}
                  value={editData.partialOnlineAmount ?? ''}
                  onChange={(e) => onEditDataChange({ ...editData, partialOnlineAmount: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          )}

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
          {(editData.paymentMethod === 'UPI' || editData.paymentMethod === 'CARD' || editData.paymentMethod === 'BANK_TRANSFER' || editData.paymentMethod === 'ONLINE' || editData.paymentMethod === 'PARTIAL') && (
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
                  <DatePicker
                    value={editData.amcInfo?.date_given ? new Date(editData.amcInfo.date_given).toISOString().split('T')[0] : undefined}
                    onChange={(v) => {
                      if (v) {
                        const amcInfo = { ...editData.amcInfo, date_given: v };
                        onEditDataChange({ ...editData, amcInfo });
                      }
                    }}
                    placeholder="Pick date"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="amc-end-date">End Date</Label>
                  <DatePicker
                    value={editData.amcInfo?.end_date ? new Date(editData.amcInfo.end_date).toISOString().split('T')[0] : undefined}
                    onChange={(v) => {
                      if (v) {
                        const amcInfo = { ...editData.amcInfo, end_date: v };
                        onEditDataChange({ ...editData, amcInfo });
                      }
                    }}
                    placeholder="Pick date"
                    className="mt-1"
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

          {/* Payment screenshot - single, drag and drop + select */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Payment screenshot</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">One image. Drag and drop or click to select.</p>
            <input
              ref={paymentInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePaymentFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {editData.paymentScreenshot ? (
              <div className="relative group inline-block">
                <img
                  src={editData.paymentScreenshot}
                  alt="Payment"
                  className="w-32 h-32 object-cover rounded-lg border-2 border-blue-200"
                />
                <button
                  type="button"
                  onClick={() => onEditDataChange({ ...editData, paymentScreenshot: null })}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                  aria-label="Remove payment screenshot"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverPayment(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOverPayment(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverPayment(false);
                  const files = e.dataTransfer.files;
                  if (files?.length) handlePaymentFiles(files);
                }}
                onClick={() => paymentInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragOverPayment ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                } ${uploadingPaymentPhoto ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <ImagePlus className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {uploadingPaymentPhoto ? 'Uploading...' : 'Drag & drop or click to add payment screenshot'}
                </p>
              </div>
            )}
          </div>

          {/* Bill photos - multiple, drag and drop + select */}
          <div>
            <Label className="text-base font-semibold">Bill photos</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">Multiple images. Drag and drop or click to select.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editData.billPhotos || []).map((url: string, idx: number) => (
                <div key={idx} className="relative group">
                  <img
                    src={url}
                    alt={`Bill ${idx + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const list = [...(editData.billPhotos || [])];
                      list.splice(idx, 1);
                      onEditDataChange({ ...editData, billPhotos: list });
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleBillFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBill(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOverBill(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverBill(false);
                const files = e.dataTransfer.files;
                if (files?.length) handleBillFiles(files);
              }}
              onClick={() => photoInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOverBill ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
              } ${uploadingPhotos ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <ImagePlus className="w-8 h-8 mx-auto text-gray-400 mb-1" />
              <p className="text-sm text-gray-600">
                {uploadingPhotos ? 'Uploading...' : 'Drag & drop or click to add bill photos'}
              </p>
            </div>
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
                <DatePicker
                    value={editData.completedDate || undefined}
                    onChange={(dateValue) => {
                      if (dateValue) {
                        const existingCompletedAt = editData.completedAt ? new Date(editData.completedAt) : new Date();
                        const newDate = new Date(dateValue + 'T12:00:00');
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
                    placeholder="Pick date"
                    className="mt-1"
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

