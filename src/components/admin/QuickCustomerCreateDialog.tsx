import { useEffect, useState } from 'react';
import { Loader2, MapPin, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { startQuickCustomerCreateBooking } from '@/lib/whatsappBookingStart';
import {
  getDefaultLeadCost,
  isLeadSourceAllowCustomText,
  isLeadSourceRequiresOtp,
  isServiceSubTypeAllowCustomText,
  leadSourceValueForSave,
} from '@/lib/leadCatalog';
import { LeadSourceSelect } from '@/components/admin/LeadSourceSelect';
import { ServiceSubTypeSelect } from '@/components/admin/ServiceSubTypeSelect';

const QUICK_CUSTOMER_BRAND = 'hydrogenro' as const;
const PRIMARY_SUB_TYPES = ['Service', 'Reinstallation'] as const;
const MORE_VALUE = '__more__';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function QuickCustomerCreateDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [leadSource, setLeadSource] = useState('Direct call');
  const [leadCustom, setLeadCustom] = useState('');
  const [subType, setSubType] = useState('Service');
  const [subCustom, setSubCustom] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreDraft, setMoreDraft] = useState('Installation');
  const [moreDraftCustom, setMoreDraftCustom] = useState('');
  const [busy, setBusy] = useState(false);

  const resolvedLead = leadSourceValueForSave(leadSource, leadCustom) || 'Direct call';
  const isPrimarySubType = (PRIMARY_SUB_TYPES as readonly string[]).includes(subType);
  const selectValue = isPrimarySubType ? subType : MORE_VALUE;

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setLeadSource('Direct call');
    setLeadCustom('');
    setSubType('Service');
    setSubCustom('');
    setMoreOpen(false);
    setMoreDraft('Installation');
    setMoreDraftCustom('');
  }, [open]);

  const handleLeadChange = (value: string) => {
    setLeadSource(value);
    if (!isLeadSourceAllowCustomText(value)) setLeadCustom('');
  };

  const openMoreDialog = () => {
    const draft = isPrimarySubType ? 'Installation' : subType;
    setMoreDraft(draft);
    setMoreDraftCustom(isPrimarySubType ? '' : subCustom);
    setMoreOpen(true);
  };

  const handleSubTypeSelect = (value: string) => {
    if (value === MORE_VALUE) {
      openMoreDialog();
      return;
    }
    setSubType(value);
    setSubCustom('');
  };

  const confirmMore = () => {
    if (isServiceSubTypeAllowCustomText(moreDraft) && !moreDraftCustom.trim()) {
      toast.error('Enter custom sub-service type');
      return;
    }
    setSubType(moreDraft);
    setSubCustom(moreDraftCustom);
    setMoreOpen(false);
  };

  const handleSubmit = async () => {
    const customerName = name.trim();
    if (customerName.length < 2) {
      toast.error('Enter customer name');
      return;
    }
    const phone10 = String(phone || '').replace(/\D/g, '').slice(-10);
    if (phone10.length !== 10) {
      toast.error('Enter a valid 10-digit phone');
      return;
    }
    if (isLeadSourceAllowCustomText(leadSource) && !leadCustom.trim()) {
      toast.error('Enter custom lead source');
      return;
    }
    if (isServiceSubTypeAllowCustomText(subType) && !subCustom.trim()) {
      toast.error('Enter custom sub-service type');
      return;
    }

    const phoneE164 = formatPhoneForWhatsApp(phone10);
    if (!phoneE164) {
      toast.error('Invalid phone');
      return;
    }

    const serviceSubType = isServiceSubTypeAllowCustomText(subType)
      ? subCustom.trim()
      : subType;
    const costNum = Number(getDefaultLeadCost(resolvedLead, serviceSubType));
    const requireOtp = isLeadSourceRequiresOtp(resolvedLead);

    setBusy(true);
    try {
      const wa = await startQuickCustomerCreateBooking({
        phone: phoneE164,
        customerName,
        leadSource: resolvedLead,
        whatsappLeadLine: '',
        serviceSubType,
        serviceLabel: serviceSubType,
        leadCost: Number.isFinite(costNum) && costNum >= 0 ? costNum : 0,
        requireOtp,
        brand: QUICK_CUSTOMER_BRAND,
      });

      if (!wa.ok) {
        toast.error(wa.error || 'Could not ask for location on WhatsApp');
        return;
      }

      if (wa.via === 'template') {
        toast.success(
          `Location invite sent${wa.templateName ? ` (${wa.templateName})` : ''}. Customer is created after they finish booking (location → photo → confirm).`
        );
      } else {
        toast.success(
          'Asked for location on WhatsApp. Customer is created after they finish booking (location → photo → confirm).'
        );
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Quick create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-sky-600" />
            Quick customer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="qc-name">Customer name *</Label>
            <Input
              id="qc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qc-phone">Phone *</Label>
            <Input
              id="qc-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
            />
          </div>
          <LeadSourceSelect
            id="qc-lead"
            required
            value={leadSource}
            customValue={leadCustom}
            onChange={handleLeadChange}
            onCustomChange={setLeadCustom}
          />
          <div className="space-y-1.5">
            <Label htmlFor="qc-sub-type">Sub-type *</Label>
            <select
              id="qc-sub-type"
              required
              value={selectValue}
              onChange={(e) => handleSubTypeSelect(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="Service">Service</option>
              <option value="Reinstallation">Reinstallation</option>
              <option value={MORE_VALUE}>More</option>
            </select>
            {!isPrimarySubType ? (
              <p className="text-xs text-muted-foreground">
                {isServiceSubTypeAllowCustomText(subType) ? subCustom.trim() || subType : subType}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-4 w-4" />
                Ask location on WhatsApp
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          overlayClassName="z-[60]"
          className="z-[61] sm:max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>More sub-types</DialogTitle>
            <DialogDescription>Installation and the rest of the catalog.</DialogDescription>
          </DialogHeader>
          <ServiceSubTypeSelect
            id="qc-sub-type-more"
            label="Sub-type"
            value={moreDraft}
            customValue={moreDraftCustom}
            onChange={setMoreDraft}
            onCustomChange={setMoreDraftCustom}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoreOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmMore}>
              Use this
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
