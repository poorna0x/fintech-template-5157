import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
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
import { LeadSourceSelect } from '@/components/admin/LeadSourceSelect';
import { startWhatsAppBookingQuickAction } from '@/lib/whatsappBookingStart';
import { isLeadSourceAllowCustomText, leadSourceValueForSave } from '@/lib/leadCatalog';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import type { DocumentBrand } from '@/lib/service-brands';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill from open thread */
  defaultPhone?: string;
  defaultName?: string;
  brand?: DocumentBrand | null;
  onStarted?: (phoneE164: string) => void;
};

/**
 * Inbox “Water Filter Service” — collect name / lead, then ask for location only.
 * Does NOT start the full book flow (date/time). Use Book service for that.
 */
export default function WaterFilterServiceStartDialog({
  open,
  onOpenChange,
  defaultPhone = '',
  defaultName = '',
  brand = 'hydrogenro',
  onStarted,
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [leadSource, setLeadSource] = useState<string>('Direct call');
  const [leadCustom, setLeadCustom] = useState('');
  const [showLeadOnWhatsApp, setShowLeadOnWhatsApp] = useState(false);
  const [whatsappLeadLine, setWhatsappLeadLine] = useState('');
  const [busy, setBusy] = useState(false);

  const resolvedLead = leadSourceValueForSave(leadSource, leadCustom) || 'Direct call';

  const syncOpen = (next: boolean) => {
    if (next) {
      setName(String(defaultName || '').trim());
      const digits = String(defaultPhone || '').replace(/\D/g, '');
      setPhone(digits.length >= 10 ? digits.slice(-10) : digits);
      setLeadSource('Direct call');
      setLeadCustom('');
      setShowLeadOnWhatsApp(false);
      setWhatsappLeadLine('');
    }
    onOpenChange(next);
  };

  const handleStart = async () => {
    const customerName = name.trim();
    if (customerName.length < 2) {
      toast.error('Enter customer name');
      return;
    }
    const phoneE164 = formatPhoneForWhatsApp(phone);
    if (!phoneE164 || phoneE164.replace(/\D/g, '').length < 12) {
      toast.error('Enter a valid 10-digit phone');
      return;
    }
    if (isLeadSourceAllowCustomText(leadSource) && !leadCustom.trim()) {
      toast.error('Enter custom lead source');
      return;
    }
    if (showLeadOnWhatsApp && !whatsappLeadLine.trim()) {
      toast.error('Enter WhatsApp intro text, or turn off “Show on WhatsApp”');
      return;
    }

    setBusy(true);
    try {
      const result = await startWhatsAppBookingQuickAction({
        phone: phoneE164,
        action: 'request_location',
        customerName,
        brand: brand === 'elevenro' ? 'elevenro' : 'hydrogenro',
        leadSource: resolvedLead,
        whatsappLeadLine: showLeadOnWhatsApp ? whatsappLeadLine.trim() : '',
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not ask for location');
        return;
      }
      if (result.via === 'template') {
        toast.success(
          `Location ask sent${result.templateName ? ` (${result.templateName})` : ''}. Does not start booking.`
        );
      } else {
        toast.success('Asked for location only — booking is not started.');
      }
      onStarted?.(phoneE164);
      syncOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={syncOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-sky-600" />
            Water Filter Service
          </DialogTitle>
          <DialogDescription>
            Saves name / lead for CRM, then asks the customer for their{' '}
            <strong>location pin only</strong>. Does not start date/time booking — use{' '}
            <strong>Book service</strong> for that.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="wfs-name">Customer name</Label>
            <Input
              id="wfs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wfs-phone">Phone</Label>
            <Input
              id="wfs-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lead source (CRM)</Label>
            <LeadSourceSelect
              value={leadSource}
              customValue={leadCustom}
              onChange={setLeadSource}
              onCustomChange={setLeadCustom}
            />
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5">
            <Checkbox
              id="wfs-show-lead"
              checked={showLeadOnWhatsApp}
              onCheckedChange={(v) => setShowLeadOnWhatsApp(v === true)}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="wfs-show-lead" className="cursor-pointer text-sm font-medium">
                Show intro on WhatsApp
              </Label>
              {showLeadOnWhatsApp ? (
                <Input
                  value={whatsappLeadLine}
                  onChange={(e) => setWhatsappLeadLine(e.target.value)}
                  placeholder="e.g. Google-Leads"
                />
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => syncOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleStart()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
            Ask location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
