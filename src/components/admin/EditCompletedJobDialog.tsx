import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { ImagePlus, X, ChevronDown, RotateCw } from 'lucide-react';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';
import { rotateImageUrlAndReupload } from '@/lib/imageRotate';
import {
  deriveAmcServicePeriodKind,
  resolveAmcServicePeriodMonths,
  type AmcServicePeriodKind,
} from '@/lib/amcAutoJobSchedule';
import { getDefaultLeadCost } from '@/lib/adminUtils';
import {
  isLeadSourceAllowCustomText,
  leadSourceValueForSave,
} from '@/lib/leadCatalog';
import { LeadSourceSelect } from '@/components/admin/LeadSourceSelect';
import PendingPaymentFields from '@/components/job/PendingPaymentFields';
import {
  type PaidTodayMode,
} from '@/lib/jobPendingPayment';
import {
  captureSourceLabel,
  lookupCaptureSource,
  type PhotoCaptureSource,
} from '@/lib/billPhotoCapture';

function sanitizeMoneyInput(raw: string): string {
  if (raw == null) return '';
  let cleaned = String(raw).replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1 && cleaned.length - dotIdx - 1 > 2) {
    cleaned = cleaned.slice(0, dotIdx + 3);
  }
  return cleaned;
}

function parseMoneyAmount(raw: string): number {
  if (raw == null) return NaN;
  const trimmed = String(raw).trim();
  if (trimmed === '') return NaN;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

type ServiceBrand = 'elevenro' | 'hydrogenro';

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
  const [jobParts, setJobParts] = useState<Array<{ inventory_id: string; product_name: string; code: string | null; quantity_used: number }>>([]);
  const [loadingJobParts, setLoadingJobParts] = useState(false);
  const [showPerItemHide, setShowPerItemHide] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingPaymentPhoto, setUploadingPaymentPhoto] = useState(false);
  const [rotatingPhotoKey, setRotatingPhotoKey] = useState<string | null>(null);
  const [dragOverPayment, setDragOverPayment] = useState(false);
  const [dragOverBill, setDragOverBill] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const paymentInputRef = useRef<HTMLInputElement>(null);
  // Snapshot of editData when the dialog opened, to detect whether anything changed / discard on dismiss.
  const initialDataSnapshotRef = useRef<string | null>(null);

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
    const baseList = editData.paymentScreenshots || [];
    try {
      const urls = await uploadFiles(Array.from(files), true);
      if (urls.length > 0) {
        onEditDataChange({ ...editData, paymentScreenshots: [...baseList, ...urls] });
        toast.success(`${urls.length} payment screenshot(s) added`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploadingPaymentPhoto(false);
    }
  }, [editData, onEditDataChange, uploadFiles]);

  const handleBillFiles = useCallback(async (
    files: FileList | null,
    captureSource: PhotoCaptureSource = 'gallery'
  ) => {
    if (!files?.length) return;
    setUploadingPhotos(true);
    const baseList = editData.billPhotos || [];
    try {
      const urls = await uploadFiles(Array.from(files), false);
      if (urls.length > 0) {
        const nextSources: Record<string, PhotoCaptureSource> = {
          ...(editData.billPhotoSources || {}),
        };
        for (const url of urls) nextSources[url] = captureSource;
        onEditDataChange({
          ...editData,
          billPhotos: [...baseList, ...urls],
          billPhotoSources: nextSources,
        });
        toast.success(`${urls.length} bill photo(s) added`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploadingPhotos(false);
    }
  }, [editData, onEditDataChange, uploadFiles]);

  const handleRotatePhoto = useCallback(
    async (field: 'paymentScreenshots' | 'billPhotos', index: number) => {
      const list = [...(editData[field] || [])];
      const url = list[index];
      if (!url) return;

      const key = `${field}-${index}`;
      setRotatingPhotoKey(key);
      try {
        const newUrl = await rotateImageUrlAndReupload(url);
        list[index] = newUrl;
        const next: Record<string, any> = { ...editData, [field]: list };
        if (field === 'billPhotos') {
          const sources: Record<string, PhotoCaptureSource> = {
            ...(editData.billPhotoSources || {}),
          };
          const prevSource = lookupCaptureSource(sources, url);
          if (prevSource) {
            delete sources[url];
            sources[newUrl] = prevSource;
          }
          next.billPhotoSources = sources;
        }
        onEditDataChange(next);
        toast.success('Photo rotated');
      } catch (err: any) {
        console.error('Rotate photo failed:', err);
        toast.error(err?.message || 'Failed to rotate photo');
      } finally {
        setRotatingPhotoKey(null);
      }
    },
    [editData, onEditDataChange]
  );

  const renderEditablePhotoThumb = (
    url: string,
    idx: number,
    field: 'paymentScreenshots' | 'billPhotos',
    options: { alt: string; borderClass: string }
  ) => {
    const rotateKey = `${field}-${idx}`;
    const isRotating = rotatingPhotoKey === rotateKey;
    const sourceLabel =
      field === 'billPhotos'
        ? captureSourceLabel(lookupCaptureSource(editData.billPhotoSources, url))
        : null;

    return (
      <div key={`${field}-${idx}-${url}`} className="relative group">
        <img
          src={url}
          alt={options.alt}
          className={`w-20 h-20 object-cover rounded-lg ${options.borderClass} ${isRotating ? 'opacity-50' : ''}`}
        />
        {sourceLabel ? (
          <span className="absolute top-0 left-0 max-w-[calc(100%-1.25rem)] rounded-br bg-black/65 px-1 py-px text-[9px] font-medium leading-tight text-white">
            {sourceLabel}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void handleRotatePhoto(field, idx)}
          disabled={isRotating || rotatingPhotoKey !== null}
          className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 disabled:opacity-60"
          aria-label="Rotate photo 90 degrees"
          title="Rotate 90°"
        >
          <RotateCw className={`w-3 h-3 ${isRotating ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => {
            const list = [...(editData[field] || [])];
            list.splice(idx, 1);
            onEditDataChange({ ...editData, [field]: list });
          }}
          disabled={isRotating}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 hover:opacity-100 disabled:opacity-60"
          aria-label="Remove photo"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

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

  // Load this job's used parts (for the per-item "hide from top-up" list). Technician jobs
  // store parts in job_parts_used; office jobs have none here (no technician top-up).
  useEffect(() => {
    if (!open || !job?.id) {
      setJobParts([]);
      return;
    }
    let cancelled = false;
    setLoadingJobParts(true);
    db.jobPartsUsed
      .getByJob(job.id)
      .then(({ data }) => {
        if (cancelled) return;
        const grouped = new Map<string, { inventory_id: string; product_name: string; code: string | null; quantity_used: number }>();
        (data || []).forEach((row: any) => {
          // Custom one-off parts have no inventory_id and aren't tracked in stock,
          // so they can't be moved to/from main and don't belong in the hide list.
          if (!row.inventory_id) return;
          const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
          const key = row.inventory_id;
          const existing = grouped.get(key);
          if (existing) {
            existing.quantity_used += Number(row.quantity_used) || 0;
          } else {
            grouped.set(key, {
              inventory_id: row.inventory_id,
              product_name: inv?.product_name || 'Unknown item',
              code: inv?.code ?? null,
              quantity_used: Number(row.quantity_used) || 0,
            });
          }
        });
        setJobParts(Array.from(grouped.values()));
      })
      .finally(() => {
        if (!cancelled) setLoadingJobParts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, job?.id]);

  // Reveal the per-item list automatically when the job already has some parts hidden.
  useEffect(() => {
    if (open && Array.isArray(editData.topupHiddenInventoryIds) && editData.topupHiddenInventoryIds.length > 0) {
      setShowPerItemHide(true);
    }
  }, [open]);

  // Capture the initial edit data when the dialog opens (parent sets editData and opens
  // in the same batch, so this snapshot is reliable). Used to skip the save on a no-op close.
  useEffect(() => {
    if (open) {
      try { initialDataSnapshotRef.current = JSON.stringify(editData ?? {}); }
      catch { initialDataSnapshotRef.current = null; }
    } else {
      initialDataSnapshotRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hiddenPartIds: string[] = Array.isArray(editData.topupHiddenInventoryIds)
    ? editData.topupHiddenInventoryIds
    : [];

  const togglePartHidden = (inventoryId: string, hide: boolean) => {
    const set = new Set(hiddenPartIds);
    if (hide) set.add(inventoryId);
    else set.delete(inventoryId);
    onEditDataChange({ ...editData, topupHiddenInventoryIds: Array.from(set) });
  };

  /** Partial: when cash/online change, total amount follows their sum; if both cleared, keep current total. */
  const amountFromPartialStrings = (cashStr: string, onlineStr: string): string => {
    const cashT = String(cashStr ?? '').trim();
    const onlineT = String(onlineStr ?? '').trim();
    const c = parseFloat(cashT);
    const o = parseFloat(onlineT);
    const cN = Number.isFinite(c) ? c : 0;
    const oN = Number.isFinite(o) ? o : 0;
    if (!cashT && !onlineT) {
      return editData.amount === '' || editData.amount == null ? '' : String(editData.amount);
    }
    const sum = cN + oN;
    return String(Math.round(sum * 100) / 100);
  };

  // Save only via the explicit Save button — dismiss/back discards (matches Edit Job).
  const handleDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      try {
        if (initialDataSnapshotRef.current) {
          onEditDataChange(JSON.parse(initialDataSnapshotRef.current));
        }
      } catch {
        // ignore snapshot restore errors
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Completed Job Details</DialogTitle>
          <DialogDescription>
            Update completion information for {(job as any)?.job_number || job?.jobNumber}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Service brand */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Serviced as brand</Label>
            <p className="text-sm text-muted-foreground">
              This will be used for this job’s customer message and booking details next time.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => onEditDataChange({ ...editData, serviceBrand: 'elevenro' as ServiceBrand })}
                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                  editData.serviceBrand === 'elevenro'
                    ? 'border-black bg-black text-white shadow-md'
                    : 'border-border bg-card text-foreground/90 hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                <span className="font-medium text-sm">ElevenRO</span>
              </button>
              <button
                type="button"
                onClick={() => onEditDataChange({ ...editData, serviceBrand: 'hydrogenro' as ServiceBrand })}
                className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                  editData.serviceBrand === 'hydrogenro'
                    ? 'border-black bg-black text-white shadow-md'
                    : 'border-border bg-card text-foreground/90 hover:border-primary/30 hover:bg-muted/40'
                }`}
              >
                <span className="font-medium text-sm">HydrogenRO</span>
              </button>
            </div>
          </div>

          {/* Amount: for Partial, defaults from job; editing cash/online updates this to their sum; you can still edit total directly. */}
          <div>
            <Label htmlFor="edit-amount">Amount (₹)</Label>
            <Input
              id="edit-amount"
              type="number"
              value={
                editData.amount === '' || editData.amount === undefined || editData.amount === null
                  ? ''
                  : String(editData.amount)
              }
              onChange={(e) => onEditDataChange({ ...editData, amount: e.target.value })}
              placeholder="Enter amount"
            />
            {editData.paymentMethod === 'PARTIAL' && (
              <p className="text-xs text-muted-foreground mt-1">
                Changing cash or online below updates this total automatically; you can adjust the total here too.
              </p>
            )}
          </div>

          {/* Payment Method — Cash / Online / Partial / Pending */}
          <div>
            <Label htmlFor="edit-payment-method">Payment Method</Label>
            <Select
              value={
                editData.paymentMethod === 'UPI' ||
                editData.paymentMethod === 'CARD' ||
                editData.paymentMethod === 'BANK_TRANSFER'
                  ? 'ONLINE'
                  : editData.paymentMethod || 'CASH'
              }
              onValueChange={(value) => {
                const next: any = { ...editData, paymentMethod: value };
                if (value !== 'PARTIAL' && value !== 'PENDING_PAYMENT') {
                  next.partialCashAmount = '';
                  next.partialOnlineAmount = '';
                }
                if (value === 'CASH') {
                  next.qrCodeName = '';
                }
                if (value === 'PENDING_PAYMENT') {
                  next.pendingPaidTodayEnabled = Boolean(editData.pendingPaidTodayEnabled);
                  next.pendingPaidTodayMode = editData.pendingPaidTodayMode || '';
                  next.pendingPaidTodayAmount = editData.pendingPaidTodayAmount || '';
                  next.promisedPaymentDate = editData.promisedPaymentDate || '';
                } else {
                  next.pendingPaidTodayEnabled = false;
                  next.pendingPaidTodayMode = '';
                  next.pendingPaidTodayAmount = '';
                  next.promisedPaymentDate = '';
                }
                onEditDataChange(next);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="PARTIAL">Partial (Cash + Online)</SelectItem>
                <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {editData.paymentMethod === 'PENDING_PAYMENT' && (
            <PendingPaymentFields
              billAmount={parseMoneyAmount(String(editData.amount ?? '')) || 0}
              paidTodayEnabled={Boolean(editData.pendingPaidTodayEnabled)}
              onPaidTodayEnabledChange={(v) =>
                onEditDataChange({ ...editData, pendingPaidTodayEnabled: v })
              }
              paidTodayMode={(editData.pendingPaidTodayMode || '') as PaidTodayMode | ''}
              onPaidTodayModeChange={(v) =>
                onEditDataChange({
                  ...editData,
                  pendingPaidTodayMode: v,
                  pendingPaidTodayAmount: '',
                  partialCashAmount: '',
                  partialOnlineAmount: '',
                })
              }
              paidTodayAmount={String(editData.pendingPaidTodayAmount ?? '')}
              onPaidTodayAmountChange={(v) =>
                onEditDataChange({ ...editData, pendingPaidTodayAmount: v })
              }
              partialCashAmount={String(editData.partialCashAmount ?? '')}
              onPartialCashAmountChange={(v) =>
                onEditDataChange({ ...editData, partialCashAmount: v })
              }
              partialOnlineAmount={String(editData.partialOnlineAmount ?? '')}
              onPartialOnlineAmountChange={(v) =>
                onEditDataChange({ ...editData, partialOnlineAmount: v })
              }
              promisedDate={String(editData.promisedPaymentDate || '')}
              onPromisedDateChange={(v) =>
                onEditDataChange({ ...editData, promisedPaymentDate: v })
              }
              sanitizeMoneyInput={sanitizeMoneyInput}
              parseMoneyAmount={parseMoneyAmount}
            />
          )}

          {/* Partial amounts - required when PARTIAL */}
          {editData.paymentMethod === 'PARTIAL' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-partial-cash">
                  Cash amount (₹) <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="edit-partial-cash"
                  type="number"
                  min={0}
                  step={0.01}
                  required
                  value={editData.partialCashAmount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onEditDataChange({
                      ...editData,
                      partialCashAmount: v,
                      amount: amountFromPartialStrings(v, String(editData.partialOnlineAmount ?? '')),
                    });
                  }}
                  placeholder="Required"
                />
              </div>
              <div>
                <Label htmlFor="edit-partial-online">
                  Online amount (₹) <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="edit-partial-online"
                  type="number"
                  min={0}
                  step={0.01}
                  required
                  value={editData.partialOnlineAmount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onEditDataChange({
                      ...editData,
                      partialOnlineAmount: v,
                      amount: amountFromPartialStrings(String(editData.partialCashAmount ?? ''), v),
                    });
                  }}
                  placeholder="Required"
                />
              </div>
              {(() => {
                const c = parseFloat(String(editData.partialCashAmount ?? '').trim()) || 0;
                const o = parseFloat(String(editData.partialOnlineAmount ?? '').trim()) || 0;
                if (c <= 0 && o <= 0) return null;
                return (
                  <p className="text-sm text-foreground/90 col-span-2">
                    Total (cash + online): <span className="font-semibold">₹{(c + o).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                  </p>
                );
              })()}
            </div>
          )}

          {/* Lead Source */}
          <LeadSourceSelect
            id="edit-lead-source"
            value={editData.leadSource || 'Direct call'}
            customValue={editData.leadSourceCustom || ''}
            onChange={(value) => {
              const jobServiceSubType =
                (job as any)?.service_sub_type || (job as any)?.serviceSubType || '';
              const newLeadCost = isLeadSourceAllowCustomText(value)
                ? (editData.leadCost ?? getDefaultLeadCost(value, jobServiceSubType))
                : getDefaultLeadCost(value, jobServiceSubType);
              onEditDataChange({
                ...editData,
                leadSource: value,
                leadSourceCustom: isLeadSourceAllowCustomText(value)
                  ? editData.leadSourceCustom
                  : '',
                leadCost: newLeadCost,
              });
            }}
            onCustomChange={(custom) =>
              onEditDataChange({ ...editData, leadSourceCustom: custom })
            }
          />

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
            <p className="text-xs text-muted-foreground mt-1">Edit if you need to update lead cost for this job</p>
          </div>

          {/* QR code for online portion (online, partial, or pending paid-today online) */}
          {(editData.paymentMethod === 'ONLINE' ||
            editData.paymentMethod === 'PARTIAL' ||
            (editData.paymentMethod === 'PENDING_PAYMENT' &&
              editData.pendingPaidTodayEnabled &&
              (editData.pendingPaidTodayMode === 'ONLINE' ||
                (editData.pendingPaidTodayMode === 'PARTIAL' &&
                  (parseMoneyAmount(String(editData.partialOnlineAmount ?? '')) || 0) > 0)))) && (
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

          {/* Technician-entered AMC reference details */}
          {editData.amcInfo && (
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Technician AMC Details</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit the AMC details recorded by the technician for this completed job.
            </p>
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
                    min={1}
                    max={10}
                    value={editData.amcInfo?.years || 1}
                    onChange={(e) => {
                      const amcInfo = { ...editData.amcInfo, years: parseInt(e.target.value) || 1 };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="amc-amount">AMC Amount</Label>
                  <Input
                    id="amc-amount"
                    type="text"
                    inputMode="decimal"
                    value={
                      editData.amcInfo?.amount === null ||
                      editData.amcInfo?.amount === undefined
                        ? ''
                        : String(editData.amcInfo.amount)
                    }
                    onChange={(e) => {
                      const value = sanitizeMoneyInput(e.target.value);
                      const amcInfo = {
                        ...editData.amcInfo,
                        amount: value,
                      };
                      onEditDataChange({ ...editData, amcInfo });
                    }}
                    placeholder="AMC amount"
                  />
                </div>
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
                  <SelectTrigger id="amc-prefilter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const sp = deriveAmcServicePeriodKind(editData.amcInfo.service_period_months);
                return (
                <div>
                  <Label className="text-sm font-medium">AMC service period (auto visit)</Label>
                  <Select
                    value={sp.kind}
                    onValueChange={(v: AmcServicePeriodKind) => {
                      const months = resolveAmcServicePeriodMonths(v, sp.custom);
                      onEditDataChange({
                        ...editData,
                        amcInfo: { ...editData.amcInfo, service_period_months: months },
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">Every 4 months</SelectItem>
                      <SelectItem value="6">Every 6 months</SelectItem>
                      <SelectItem value="custom">Custom (months)</SelectItem>
                      <SelectItem value="no_auto">No auto</SelectItem>
                    </SelectContent>
                  </Select>
                  {sp.kind === 'custom' && (
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={sp.custom}
                      onChange={(e) => {
                        const customMonths = Math.max(1, parseInt(e.target.value, 10) || 1);
                        onEditDataChange({
                          ...editData,
                          amcInfo: {
                            ...editData.amcInfo,
                            service_period_months: customMonths,
                          },
                        });
                      }}
                      className="mt-2"
                      placeholder="Months"
                    />
                  )}
                </div>
                );
              })()}
              <div>
                <Label htmlFor="amc-additional-info">Additional Information / Notes</Label>
                <Textarea
                  id="amc-additional-info"
                  value={
                    typeof editData.amcInfo?.additional_info === 'string'
                      ? editData.amcInfo.additional_info
                      : typeof editData.amcInfo?.notes === 'string'
                        ? editData.amcInfo.notes
                        : ''
                  }
                  onChange={(e) => {
                    const text = e.target.value;
                    const amcInfo = {
                      ...editData.amcInfo,
                      additional_info: text,
                      notes: text,
                    };
                    onEditDataChange({ ...editData, amcInfo });
                  }}
                  placeholder="AMC coverage, exclusions, or technician notes"
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
          </div>
          )}

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

          {/* Payment screenshots - multiple, always show add/drop zone */}
          <div className="border-t pt-4">
            <Label className="text-base font-semibold">Payment screenshots</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Drag and drop or click to add. Use the rotate button if a screenshot was uploaded sideways.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editData.paymentScreenshots || []).map((url: string, idx: number) =>
                renderEditablePhotoThumb(url, idx, 'paymentScreenshots', {
                  alt: `Payment ${idx + 1}`,
                  borderClass: 'border-2 border-blue-200',
                })
              )}
            </div>
            <input
              ref={paymentInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handlePaymentFiles(e.target.files);
                e.target.value = '';
              }}
            />
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
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOverPayment ? 'border-blue-500 bg-blue-50' : 'border-border hover:border-blue-400 hover:bg-muted/40'
              } ${uploadingPaymentPhoto ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground/70 mb-1" />
              <p className="text-sm text-muted-foreground">
                {uploadingPaymentPhoto ? 'Uploading...' : 'Drag & drop or click to add payment screenshot(s)'}
              </p>
            </div>
          </div>

          {/* Bill photos - multiple, always show add/drop zone */}
          <div>
            <Label className="text-base font-semibold">Bill photos</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Drag and drop or click to add. Use the rotate button if a photo was uploaded sideways.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {(editData.billPhotos || []).map((url: string, idx: number) =>
                renderEditablePhotoThumb(url, idx, 'billPhotos', {
                  alt: `Bill ${idx + 1}`,
                  borderClass: 'border border-border',
                })
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleBillFiles(e.target.files, 'gallery');
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
                if (files?.length) handleBillFiles(files, 'gallery');
              }}
              onClick={() => photoInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragOverBill ? 'border-green-500 bg-green-50' : 'border-border hover:border-green-400 hover:bg-muted/40'
              } ${uploadingPhotos ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground/70 mb-1" />
              <p className="text-sm text-muted-foreground">
                {uploadingPhotos ? 'Uploading...' : 'Gallery — drag & drop or click'}
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
                <SelectItem value="office">Office (no technician)</SelectItem>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hide spare parts from technician top-up */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="edit-hide-parts-topup" className="text-sm font-medium">
                  Hide all spare parts from top-up
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When on, none of this job&apos;s parts appear in the technician&apos;s
                  &quot;Top Up&quot; used-items list.
                </p>
              </div>
              <Switch
                id="edit-hide-parts-topup"
                checked={!!editData.hidePartsFromTopup}
                onCheckedChange={(checked) =>
                  onEditDataChange({ ...editData, hidePartsFromTopup: checked })
                }
              />
            </div>

            {/* Per-item hide (only relevant when not hiding all), collapsed by default. */}
            {!editData.hidePartsFromTopup && (
              <div className="border-t pt-3">
                <button
                  type="button"
                  onClick={() => setShowPerItemHide((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-xs text-muted-foreground">
                    Or hide only specific parts from top-up
                    {hiddenPartIds.length > 0 ? ` (${hiddenPartIds.length} hidden)` : ''}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${showPerItemHide ? 'rotate-180' : ''}`}
                  />
                </button>

                {showPerItemHide && (
                  <div className="mt-3">
                    {loadingJobParts ? (
                      <p className="text-xs text-muted-foreground">Loading parts…</p>
                    ) : jobParts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No parts recorded for this job.</p>
                    ) : (
                      <div className="space-y-2">
                        {jobParts.map((part) => (
                          <div key={part.inventory_id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <span className="block truncate text-sm">
                                {part.product_name}
                                {part.code ? ` (${part.code})` : ''}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                Qty used: {part.quantity_used}
                              </span>
                            </div>
                            <Switch
                              checked={hiddenPartIds.includes(part.inventory_id)}
                              onCheckedChange={(checked) => togglePartHidden(part.inventory_id, checked)}
                              aria-label={`Hide ${part.product_name} from top-up`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completion Date */}
          <div className="border-t pt-4 space-y-2">
            <Label className="text-sm font-medium">Completion date & time</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-completion-date" className="text-xs text-muted-foreground font-normal">
                  Date
                </Label>
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
                        completedAt: newDate.toISOString(),
                      });
                    } else {
                      onEditDataChange({ ...editData, completedDate: '', completedAt: null });
                    }
                  }}
                  placeholder="Pick date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-completion-time" className="text-xs text-muted-foreground font-normal">
                  Time
                </Label>
                <Input
                  id="edit-completion-time"
                  type="time"
                  step={60}
                  value={editData.completedTime || ''}
                  onChange={(e) => {
                    const timeValue = e.target.value;
                    const existingDate = editData.completedDate || new Date().toISOString().split('T')[0];
                    if (timeValue) {
                      const [hours, minutes] = timeValue.split(':');
                      const newDate = new Date(`${existingDate}T${hours}:${minutes}:00`);
                      onEditDataChange({
                        ...editData,
                        completedTime: timeValue,
                        completedDate: existingDate,
                        completedAt: newDate.toISOString(),
                      });
                    } else {
                      onEditDataChange({ ...editData, completedTime: '', completedAt: null });
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave empty to keep the original completion date</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              try {
                if (initialDataSnapshotRef.current) {
                  onEditDataChange(JSON.parse(initialDataSnapshotRef.current));
                }
              } catch {
                // ignore snapshot restore errors
              }
              onOpenChange(false);
            }}
          >
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

