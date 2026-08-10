import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  startWaterFilterServiceBooking,
  WHATSAPP_BOOKING_LEAD_SOURCES,
} from '@/lib/whatsappBookingStart';
import { formatPhoneForWhatsApp } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill from open thread */
  defaultPhone?: string;
  defaultName?: string;
  onStarted?: (phoneE164: string) => void;
};

export default function WaterFilterServiceStartDialog({
  open,
  onOpenChange,
  defaultPhone = '',
  defaultName = '',
  onStarted,
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [leadSource, setLeadSource] = useState<string>('Direct call');
  const [leadCustom, setLeadCustom] = useState('');
  const [busy, setBusy] = useState(false);

  const syncOpen = (next: boolean) => {
    if (next) {
      setName(String(defaultName || '').trim());
      const digits = String(defaultPhone || '').replace(/\D/g, '');
      setPhone(digits.length >= 10 ? digits.slice(-10) : digits);
      setLeadSource('Direct call');
      setLeadCustom('');
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
    const lead =
      leadSource === 'Other'
        ? leadCustom.trim() || 'Other'
        : leadSource.trim() || 'Direct call';
    if (leadSource === 'Other' && !leadCustom.trim()) {
      toast.error('Enter custom lead source');
      return;
    }

    setBusy(true);
    try {
      const result = await startWaterFilterServiceBooking({
        phone: phoneE164,
        customerName,
        leadSource: lead,
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not start Water Filter Service');
        return;
      }
      if (result.via === 'template') {
        toast.success(
          `Invite sent${result.templateName ? ` (${result.templateName})` : ''}. When they reply, bot asks for location first.`
        );
      } else {
        toast.success('Asked for location on WhatsApp — booking continues step by step.');
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
            Enter name, phone, and lead source. We ask the customer for{' '}
            <strong>location first</strong>, then date → time → purifier photo.
            {` `}
            If the 24h window is closed, a cold template is sent and the bot continues when they
            reply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="wfs-name">Customer name *</Label>
            <Input
              id="wfs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wfs-phone">Phone *</Label>
            <Input
              id="wfs-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lead source *</Label>
            <Select value={leadSource} onValueChange={setLeadSource}>
              <SelectTrigger>
                <SelectValue placeholder="Lead source" />
              </SelectTrigger>
              <SelectContent className="!z-[120]">
                {WHATSAPP_BOOKING_LEAD_SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>
                    {src}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {leadSource === 'Other' ? (
            <div className="space-y-1.5">
              <Label htmlFor="wfs-lead-custom">Custom lead source *</Label>
              <Input
                id="wfs-lead-custom"
                value={leadCustom}
                onChange={(e) => setLeadCustom(e.target.value)}
                placeholder="e.g. Facebook ad"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => syncOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleStart()}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              'Ask location & start'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
