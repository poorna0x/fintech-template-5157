import { useEffect, useState } from 'react';
import { Loader2, MapPin, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getDefaultLeadCost,
  isHomeTriangleLeadSource,
} from '@/lib/adminUtils';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import {
  getWhatsAppBookingLeadSources,
  startQuickCustomerCreateBooking,
} from '@/lib/whatsappBookingStart';

export type QuickCustomerServiceKind = 'Service' | 'Installation';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function QuickCustomerCreateDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [leadSource, setLeadSource] = useState('Direct call');
  const [leadCustom, setLeadCustom] = useState('');
  const [showLeadOnWhatsApp, setShowLeadOnWhatsApp] = useState(false);
  const [whatsappLeadLine, setWhatsappLeadLine] = useState('');
  const [serviceKind, setServiceKind] = useState<QuickCustomerServiceKind>('Service');
  const [leadCost, setLeadCost] = useState('0');
  const [requireOtp, setRequireOtp] = useState(false);
  const [busy, setBusy] = useState(false);

  const resolvedLead =
    leadSource === 'Other' ? leadCustom.trim() || 'Other' : leadSource.trim() || 'Direct call';

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setLeadSource('Direct call');
    setLeadCustom('');
    setShowLeadOnWhatsApp(false);
    setWhatsappLeadLine('');
    setServiceKind('Service');
    setLeadCost(getDefaultLeadCost('Direct call', 'Service'));
    setRequireOtp(false);
  }, [open]);

  const applyLeadDefaults = (nextLead: string, nextService: QuickCustomerServiceKind) => {
    const subType = nextService === 'Installation' ? 'Installation' : 'Service';
    setLeadCost(getDefaultLeadCost(nextLead, subType));
    setRequireOtp(isHomeTriangleLeadSource(nextLead));
  };

  const handleLeadChange = (value: string) => {
    setLeadSource(value);
    if (value !== 'Other') {
      applyLeadDefaults(value, serviceKind);
      setLeadCustom('');
      if (showLeadOnWhatsApp) setWhatsappLeadLine(value);
    } else {
      setRequireOtp(false);
      setLeadCost('0');
      if (showLeadOnWhatsApp) setWhatsappLeadLine(leadCustom);
    }
  };

  const handleServiceChange = (value: QuickCustomerServiceKind) => {
    setServiceKind(value);
    const leadForCost = leadSource === 'Other' ? 'Other' : leadSource;
    const subType = value === 'Installation' ? 'Installation' : 'Service';
    setLeadCost(getDefaultLeadCost(leadForCost, subType));
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
    if (leadSource === 'Other' && !leadCustom.trim()) {
      toast.error('Enter custom lead source');
      return;
    }
    if (showLeadOnWhatsApp && !whatsappLeadLine.trim()) {
      toast.error('Enter WhatsApp intro text, or turn off “Show on WhatsApp”');
      return;
    }
    const costNum = Number(leadCost);
    if (!Number.isFinite(costNum) || costNum < 0) {
      toast.error('Lead cost must be a valid number');
      return;
    }

    const phoneE164 = formatPhoneForWhatsApp(phone10);
    if (!phoneE164) {
      toast.error('Invalid phone');
      return;
    }

    const serviceSubType = serviceKind === 'Installation' ? 'Installation' : 'Repair';
    const serviceLabel =
      serviceKind === 'Installation' ? 'Installation' : 'Service / Repair';

    setBusy(true);
    try {
      // Do NOT create CRM customer here — bot creates after location + photo + confirm.
      const wa = await startQuickCustomerCreateBooking({
        phone: phoneE164,
        customerName,
        leadSource: resolvedLead,
        whatsappLeadLine: showLeadOnWhatsApp ? whatsappLeadLine.trim() : '',
        serviceSubType,
        serviceLabel,
        leadCost: costNum,
        requireOtp,
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
          <DialogDescription>
            Name, phone, CRM lead source, and Service / Installation. WhatsApp asks for location
            first (optional intro line). Customer is created only after location → flat → photo →
            date/time → confirm.
          </DialogDescription>
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
          <div className="space-y-1.5">
            <Label>Lead source (CRM) *</Label>
            <Select value={leadSource} onValueChange={handleLeadChange}>
              <SelectTrigger>
                <SelectValue placeholder="Lead source" />
              </SelectTrigger>
              <SelectContent className="!z-[120]">
                {getWhatsAppBookingLeadSources().map((src) => (
                  <SelectItem key={src} value={src}>
                    {src}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {leadSource === 'Other' ? (
            <div className="space-y-1.5">
              <Label htmlFor="qc-lead-custom">Custom lead source *</Label>
              <Input
                id="qc-lead-custom"
                value={leadCustom}
                onChange={(e) => {
                  setLeadCustom(e.target.value);
                  if (showLeadOnWhatsApp) setWhatsappLeadLine(e.target.value);
                }}
                placeholder="e.g. Facebook ad"
              />
            </div>
          ) : null}
          <div className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2">
            <Checkbox
              id="qc-wa-lead"
              checked={showLeadOnWhatsApp}
              onCheckedChange={(v) => {
                const on = v === true;
                setShowLeadOnWhatsApp(on);
                if (on && !whatsappLeadLine.trim()) setWhatsappLeadLine(resolvedLead);
              }}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="qc-wa-lead" className="cursor-pointer font-normal leading-snug">
                Show intro on WhatsApp (optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Off = skip. On = “from Direct call - Hydrogen RO Water Filter Service” (edit lead text).
              </p>
              {showLeadOnWhatsApp ? (
                <Input
                  value={whatsappLeadLine}
                  onChange={(e) => setWhatsappLeadLine(e.target.value.slice(0, 80))}
                  placeholder="e.g. Direct call, Google-Leads, or any text"
                />
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service type *</Label>
            <Select
              value={serviceKind}
              onValueChange={(v) => handleServiceChange(v as QuickCustomerServiceKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="!z-[120]">
                <SelectItem value="Service">Service / Repair</SelectItem>
                <SelectItem value="Installation">Installation</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Home Triangle + Installation defaults lead cost to ₹116 (else ₹231).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qc-lead-cost">Lead cost (₹) *</Label>
            <Input
              id="qc-lead-cost"
              type="number"
              min="0"
              step="1"
              value={leadCost}
              onChange={(e) => setLeadCost(e.target.value)}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={requireOtp}
              onCheckedChange={(v) => setRequireOtp(v === true)}
            />
            Require OTP (auto-on for Home Triangle)
          </label>
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
    </Dialog>
  );
}
