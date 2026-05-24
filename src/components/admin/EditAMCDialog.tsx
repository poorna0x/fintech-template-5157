import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

type ServicePeriodKind = '4' | '6' | 'custom' | 'no_auto';

interface EditAMCDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Raw AMC contract row (as returned by db.amcContracts.getActiveByCustomerId / getById). */
  amcContract: any | null;
  /** Technician list for the "AMC Given By" select. Pass [] if not available. */
  technicians?: Array<{ id: string; full_name?: string; fullName?: string }>;
  /** Called with the updated AMC contract row after a successful save. */
  onSaved?: (updated: any) => void;
}

const getTechnicianDisplayName = (t: any): string => {
  if (!t) return '';
  return t.full_name || t.fullName || 'Unknown';
};

const toIsoDateOnly = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    // Accept either YYYY-MM-DD or full ISO; trim to date portion.
    return value.length >= 10 ? value.slice(0, 10) : value;
  }
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return '';
};

const calculateEndDate = (startDate: string, years: number): string => {
  if (!startDate || !years || years < 1) return '';
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return '';
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + years);
  end.setDate(end.getDate() - 1);
  return end.toISOString().slice(0, 10);
};

const deriveServicePeriodKind = (
  months: number | null | undefined,
): { kind: ServicePeriodKind; custom: number } => {
  if (months == null) return { kind: '4', custom: 4 };
  if (months === 0) return { kind: 'no_auto', custom: 4 };
  if (months === 4) return { kind: '4', custom: 4 };
  if (months === 6) return { kind: '6', custom: 6 };
  return { kind: 'custom', custom: Math.max(1, months) };
};

const parseAdditionalInfoMetadata = (raw: any): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? { ...parsed } : { notes: raw };
    } catch {
      return { notes: raw };
    }
  }
  return {};
};

const EditAMCDialog: React.FC<EditAMCDialogProps> = ({
  open,
  onOpenChange,
  amcContract,
  technicians = [],
  onSaved,
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    years: 1,
    includesPrefilter: false,
    additionalNotes: '',
    servicePeriodKind: '4' as ServicePeriodKind,
    servicePeriodCustomMonths: 4,
    givenByTechnicianId: 'NONE',
  });

  useEffect(() => {
    if (!open || !amcContract) return;
    const meta = parseAdditionalInfoMetadata(amcContract.additional_info);
    const notes =
      (typeof meta.description === 'string' && meta.description) ||
      (typeof meta.notes === 'string' && meta.notes) ||
      '';
    const sp = deriveServicePeriodKind(amcContract.service_period_months);
    setForm({
      startDate: toIsoDateOnly(amcContract.start_date),
      endDate: toIsoDateOnly(amcContract.end_date),
      years: Number(amcContract.years) || 1,
      includesPrefilter: Boolean(amcContract.includes_prefilter),
      additionalNotes: notes,
      servicePeriodKind: sp.kind,
      servicePeriodCustomMonths: sp.custom,
      givenByTechnicianId: amcContract.given_by_technician_id || 'NONE',
    });
  }, [open, amcContract]);

  const handleSave = async () => {
    if (!amcContract?.id) return;
    if (!form.startDate) {
      toast.error('Start date is required');
      return;
    }
    if (!form.years || form.years < 1) {
      toast.error('Duration (years) must be at least 1');
      return;
    }
    setSaving(true);
    try {
      const endDate = form.endDate || calculateEndDate(form.startDate, form.years);

      const { data: current, error: getErr } = await db.amcContracts.getById(amcContract.id);
      if (getErr || !current) {
        throw new Error('AMC contract not found');
      }

      const metadata = parseAdditionalInfoMetadata(current.additional_info);
      metadata.description = form.additionalNotes || null;
      metadata.notes = form.additionalNotes || null;

      const servicePeriodMonths =
        form.servicePeriodKind === 'no_auto'
          ? 0
          : form.servicePeriodKind === '4'
            ? 4
            : form.servicePeriodKind === '6'
              ? 6
              : Math.max(1, form.servicePeriodCustomMonths);

      const { data: updated, error: updateErr } = await db.amcContracts.update(amcContract.id, {
        start_date: form.startDate,
        end_date: endDate,
        years: form.years,
        includes_prefilter: form.includesPrefilter,
        additional_info: JSON.stringify(metadata),
        service_period_months: servicePeriodMonths,
        given_by_technician_id:
          form.givenByTechnicianId === 'NONE' ? null : form.givenByTechnicianId,
      });

      if (updateErr) throw updateErr;

      toast.success('AMC updated successfully');
      onSaved?.(updated);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error updating AMC:', err);
      toast.error('Failed to update AMC: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-green-600" />
            Edit AMC
          </DialogTitle>
          <DialogDescription>
            Update AMC agreement details. Changes apply to the active AMC contract for this
            customer.
          </DialogDescription>
        </DialogHeader>

        {amcContract && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-amc-start-date">Start Date *</Label>
                <DatePicker
                  value={form.startDate || undefined}
                  onChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      startDate: v,
                      endDate: v ? calculateEndDate(v, prev.years) : prev.endDate,
                    }))
                  }
                  placeholder="Pick date"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-amc-years">Duration (Years) *</Label>
                <Input
                  id="edit-amc-years"
                  type="number"
                  min={1}
                  value={form.years}
                  onChange={(e) => {
                    const years = Math.max(1, parseInt(e.target.value, 10) || 1);
                    setForm((prev) => ({
                      ...prev,
                      years,
                      endDate: prev.startDate
                        ? calculateEndDate(prev.startDate, years)
                        : prev.endDate,
                    }));
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="edit-amc-end-date">End Date</Label>
                <DatePicker
                  value={form.endDate || undefined}
                  onChange={(v) => setForm((prev) => ({ ...prev, endDate: v }))}
                  placeholder="Pick date"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-calculated from start date and duration. You can override it manually.
                </p>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <Checkbox
                  id="edit-amc-includes-prefilter"
                  checked={form.includesPrefilter}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, includesPrefilter: checked === true }))
                  }
                />
                <Label htmlFor="edit-amc-includes-prefilter" className="cursor-pointer">
                  Includes Prefilter
                </Label>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm font-medium">AMC Given By</Label>
                <Select
                  value={form.givenByTechnicianId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, givenByTechnicianId: value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unknown / Not assigned</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {getTechnicianDisplayName(tech)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Use this for manually created AMCs. Job-linked AMCs can also be corrected here.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="edit-amc-notes">Description / Summary</Label>
                <Textarea
                  id="edit-amc-notes"
                  value={form.additionalNotes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, additionalNotes: e.target.value }))
                  }
                  placeholder="Enter a description or summary of this AMC contract..."
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm font-medium">
                  AMC service period (auto job creation)
                </Label>
                <Select
                  value={form.servicePeriodKind}
                  onValueChange={(v: ServicePeriodKind) =>
                    setForm((prev) => ({ ...prev, servicePeriodKind: v }))
                  }
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
                {form.servicePeriodKind === 'custom' && (
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.servicePeriodCustomMonths}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        servicePeriodCustomMonths: Math.max(
                          1,
                          parseInt(e.target.value, 10) || 1,
                        ),
                      }))
                    }
                    className="mt-2"
                    placeholder="Months"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !amcContract}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAMCDialog;
