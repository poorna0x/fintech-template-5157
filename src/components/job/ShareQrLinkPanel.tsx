import { useMemo, useState, useEffect } from 'react';
import { Loader2, Share2 } from 'lucide-react';
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
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { getDocumentBrandLabel, type DocumentBrand } from '@/lib/service-brands';
import {
  CommonQrCode,
  isDynamicUpiQr,
  isDynamicUpiTechnician,
  TechnicianQrPickerRow,
} from '@/lib/qrCodeManager';
import {
  buildUpiPayShortHttpsLink,
  createUpiPayShortLink,
  normalizePaymentPhone,
  resolveUpiPaySiteOrigin,
} from '@/lib/upiPaymentAccounts';

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
    amountLabel ? `Amount: ${amountLabel}` : null,
    input.payeeName ? `Payee name: ${input.payeeName}` : null,
    `UPI ID: ${input.upiId}`,
    phone ? `Phone: ${phone}` : null,
    `Pay link: ${input.payLink}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * After choosing "Share QR Link" in Select QR Code: pick which Dynamic UPI
 * account to use, then WhatsApp the customer the short pay link.
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
}: ShareQrLinkPanelProps) {
  const [sharing, setSharing] = useState(false);
  const [waPhone, setWaPhone] = useState(() => String(customerPhone || '').trim());
  const brandLabel = getDocumentBrandLabel(brand);

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
      const payeeName = selectedQr.payeeName || selectedQr.name;
      const payPhone = normalizePaymentPhone(selectedQr.phone || '');
      const code = await createUpiPayShortLink({
        upiId: selectedQr.upiId || '',
        payeeName,
        amount: am,
        note: String(note || customerName || selectedQr.name || '')
          .trim()
          .slice(0, 80),
        phone: payPhone || undefined,
        brand,
      });
      const origin = resolveUpiPaySiteOrigin(brand);
      const payLink = code
        ? buildUpiPayShortHttpsLink(origin, code)
        : null;
      if (!payLink) {
        toast.error(
          'Could not create pay link — run the technician pay-link SQL, or try again'
        );
        return;
      }
      const message = buildTechSharePayMessage({
        brandLabel,
        amount: am,
        payeeName,
        upiId: selectedQr.upiId || '',
        phone: payPhone,
        payLink,
      });
      const wa = formatPhoneForWhatsApp(phone);
      window.open(
        `https://wa.me/${wa}?text=${encodeURIComponent(message)}`,
        '_blank',
        'noopener,noreferrer'
      );
      toast.success('WhatsApp opened with pay link');
    } catch (e) {
      console.error('[ShareQrLink]', e);
      toast.error('Failed to share pay link');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div>
        <p className="text-sm font-semibold text-emerald-900">Share QR Link</p>
        <p className="mt-0.5 text-xs text-emerald-800/80">
          Customer not on site? Pick the UPI account and send a pay link (QR page) on WhatsApp.
        </p>
      </div>

      <div>
        <Label>Which UPI / QR? *</Label>
        {dynamicOptions.length === 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            No Dynamic UPI accounts available. Enable Dynamic UPI on a common QR or
            technician QR in Settings.
          </p>
        ) : (
          <Select value={selectedUpiQrId || undefined} onValueChange={onSelectUpiQrId}>
            <SelectTrigger className="mt-1 bg-white">
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
        <Label htmlFor="share-qr-wa-phone">Customer WhatsApp phone *</Label>
        <Input
          id="share-qr-wa-phone"
          className="mt-1 bg-white"
          value={waPhone}
          onChange={(e) => setWaPhone(e.target.value)}
          placeholder="10-digit mobile"
          inputMode="tel"
        />
        <p className="mt-1 text-[11px] text-emerald-900/70">
          Prefills from customer — edit if you need to send to another number.
        </p>
      </div>

      {selectedQr ? (
        <div className="rounded-md border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-700 space-y-0.5">
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
        className="w-full bg-emerald-700 hover:bg-emerald-800"
        disabled={sharing || !selectedUpiQrId || dynamicOptions.length === 0}
        onClick={() => void handleShare()}
      >
        {sharing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparing link…
          </>
        ) : (
          <>
            <Share2 className="mr-2 h-4 w-4" />
            Share to customer WhatsApp
          </>
        )}
      </Button>
      <p className="text-[11px] text-emerald-900/70">
        After they pay, continue Next and attach the payment screenshot (optional) to complete the job.
      </p>
    </div>
  );
}
