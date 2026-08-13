import { useMemo, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { type DocumentBrand } from '@/lib/service-brands';
import {
  CommonQrCode,
  isDynamicUpiQr,
  isDynamicUpiTechnician,
  TechnicianQrPickerRow,
} from '@/lib/qrCodeManager';
import { normalizePaymentPhone } from '@/lib/upiPaymentAccounts';
import { sendPayQrWhatsApp } from '@/lib/whatsappPayQrShare';
import { waPlainLabelValue } from '@/lib/whatsappMessageFormat';

export const SHARE_QR_LINK_VALUE = 'share_qr_link';

type ShareUpiOption = {
  /** Prefixed id: common_<uuid> or technician_<uuid> */
  key: string;
  name: string;
  upiId: string;
  payeeName?: string;
  phone?: string;
  imageUrl?: string;
};

type ShareQrLinkPanelProps = {
  commonQrCodes: CommonQrCode[];
  /** Technician personal Dynamic UPI options (optional). */
  technicians?: TechnicianQrPickerRow[];
  selectedUpiQrId: string;
  onSelectUpiQrId: (id: string) => void;
  amount: number;
  brand: DocumentBrand;
  customerPhone?: string | null;
  customerName?: string | null;
  note?: string | null;
  jobId?: string | null;
  customerId?: string | null;
  jobRef?: string | null;
};

/** Build the same concise share text as the public /p pay page. */
export function buildTechSharePayMessage(input: {
  brandLabel: string;
  amount?: number | null;
  payeeName?: string | null;
  upiId: string;
  phone?: string | null;
  payLink: string;
}): string {
  const amountLabel =
    Number.isFinite(Number(input.amount)) && Number(input.amount) > 0
      ? `₹${Number(input.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : null;
  const phone = normalizePaymentPhone(input.phone || '');
  return [
    `Pay ${input.brandLabel} via UPI`,
    amountLabel ? waPlainLabelValue('Amount', amountLabel) : null,
    input.payeeName ? waPlainLabelValue('Payee name', input.payeeName) : null,
    waPlainLabelValue('UPI ID', input.upiId),
    phone ? waPlainLabelValue('Phone', phone) : null,
    waPlainLabelValue('Pay link', input.payLink),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * After choosing "Share QR Link" in Select QR Code: pick which Dynamic UPI
 * account to use, then send the pay QR (Cloud API image template) on WhatsApp.
 */
export default function ShareQrLinkPanel({
  commonQrCodes,
  technicians = [],
  selectedUpiQrId,
  onSelectUpiQrId,
  amount,
  brand,
  customerPhone,
  customerName,
  note,
  jobId,
  customerId,
  jobRef,
}: ShareQrLinkPanelProps) {
  const [sharing, setSharing] = useState(false);
  const [waPhone, setWaPhone] = useState(() => String(customerPhone || '').trim());

  useEffect(() => {
    setWaPhone(String(customerPhone || '').trim());
  }, [customerPhone]);

  const dynamicOptions = useMemo((): ShareUpiOption[] => {
    const fromCommon: ShareUpiOption[] = commonQrCodes
      .filter((qr) => isDynamicUpiQr(qr))
      .map((qr) => ({
        key: `common_${qr.id}`,
        name: qr.name,
        upiId: qr.upiId || '',
        payeeName: qr.payeeName || qr.name,
        phone: qr.phone,
        imageUrl: qr.qrCodeUrl,
      }));
    const fromTech: ShareUpiOption[] = technicians
      .filter((t) => isDynamicUpiTechnician(t))
      .map((t) => ({
        key: `technician_${t.id}`,
        name: `${t.fullName}'s QR`,
        upiId: t.upiId || '',
        payeeName: t.payeeName || t.fullName,
        phone: t.upiPhone,
        imageUrl: t.qrCode,
      }));
    return [...fromCommon, ...fromTech];
  }, [commonQrCodes, technicians]);

  const selectedQr = useMemo(
    () => dynamicOptions.find((q) => q.key === selectedUpiQrId) || null,
    [dynamicOptions, selectedUpiQrId]
  );

  // Migrate legacy bare common-QR UUIDs to prefixed keys.
  useEffect(() => {
    if (!selectedUpiQrId) return;
    if (
      selectedUpiQrId.startsWith('common_') ||
      selectedUpiQrId.startsWith('technician_')
    ) {
      return;
    }
    const legacy = dynamicOptions.find((o) => o.key === `common_${selectedUpiQrId}`);
    if (legacy) onSelectUpiQrId(legacy.key);
  }, [selectedUpiQrId, dynamicOptions, onSelectUpiQrId]);

  const handleShare = async () => {
    if (!selectedQr) {
      toast.error('Select which UPI / QR to use');
      return;
    }
    const phone = String(waPhone || '').trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error('Enter a valid customer phone for WhatsApp');
      return;
    }
    const am = Number(amount);
    if (!Number.isFinite(am) || am <= 0) {
      toast.error('Enter a valid online / bill amount first');
      return;
    }

    setSharing(true);
    try {
      const result = await sendPayQrWhatsApp({
        to: phone,
        amount: am,
        brand,
        upiId: selectedQr.upiId || '',
        payeeName: selectedQr.payeeName || selectedQr.name,
        paymentPhone: selectedQr.phone,
        customerName: customerName || 'there',
        customerId,
        note: note || customerName || selectedQr.name,
        jobRef: jobRef || note || customerName || 'your service visit',
        jobId,
        watchPhotos: true,
        source: 'pending_payment',
      });
      if (!result.ok) {
        toast.error(result.error || 'Could not send pay QR on WhatsApp');
        return;
      }
      toast.success(
        'Pay QR sent on WhatsApp. Photos from this number for the next 30 minutes will be forwarded to you.'
      );
    } catch (e) {
      console.error('[ShareQrLink]', e);
      toast.error('Failed to send pay QR on WhatsApp');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
      <div>
        <p className="text-sm font-semibold text-emerald-950">Send pay QR on WhatsApp</p>
        <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/85">
          Customer not on site? Pick the UPI account and send the QR + Pay now button from the
          business WhatsApp. You can change the number below.
        </p>
      </div>

      <div>
        <Label className="text-sm">Which UPI / QR? *</Label>
        {dynamicOptions.length === 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            No Dynamic UPI accounts available. Enable Dynamic UPI on a common QR or
            technician QR in Settings.
          </p>
        ) : (
          <Select value={selectedUpiQrId || undefined} onValueChange={onSelectUpiQrId}>
            <SelectTrigger className="mt-1 h-11 rounded-xl bg-white">
              <SelectValue placeholder="Select UPI account" />
            </SelectTrigger>
            <SelectContent className="!z-[110]">
              {dynamicOptions.map((qr) => (
                <SelectItem key={qr.key} value={qr.key}>
                  {qr.name}
                  {qr.upiId ? ` · ${qr.upiId}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label htmlFor="share-qr-wa-phone" className="text-sm">
          WhatsApp number *
        </Label>
        <Input
          id="share-qr-wa-phone"
          className="mt-1 h-11 rounded-xl bg-white"
          value={waPhone}
          onChange={(e) => setWaPhone(e.target.value)}
          placeholder="10-digit mobile"
          inputMode="tel"
          autoComplete="tel"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/70">
          Prefills from the customer — edit to send to any other number.
        </p>
      </div>

      {selectedQr ? (
        <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-xs text-slate-700 space-y-0.5">
          <p>
            <span className="text-slate-500">Payee:</span> {selectedQr.payeeName || selectedQr.name}
          </p>
          <p>
            <span className="text-slate-500">UPI ID:</span> {selectedQr.upiId}
          </p>
          {selectedQr.phone ? (
            <p>
              <span className="text-slate-500">UPI phone:</span> {selectedQr.phone}
            </p>
          ) : null}
          {Number.isFinite(amount) && amount > 0 ? (
            <p>
              <span className="text-slate-500">Amount:</span> ₹
              {amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button
        type="button"
        className="h-11 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800"
        disabled={sharing || !selectedUpiQrId || dynamicOptions.length === 0}
        onClick={() => void handleShare()}
      >
        {sharing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending pay QR…
          </>
        ) : (
          <>
            <WhatsAppIcon className="mr-2 h-4 w-4" />
            Send pay QR on WhatsApp
          </>
        )}
      </Button>
      <p className="text-[11px] leading-relaxed text-emerald-900/70">
        For 30 minutes after send, photos from this number are forwarded to you (push + WhatsApp).
        Then continue Next and complete the job.
      </p>
    </div>
  );
}
