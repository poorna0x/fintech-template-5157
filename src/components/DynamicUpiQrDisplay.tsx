import { useEffect, useRef, useState } from 'react';
import {
  buildUpiPayDeepLink,
  isValidUpiId,
  normalizeUpiId,
} from '@/lib/upiPaymentAccounts';

type DynamicUpiQrDisplayProps = {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
  /** Optional label under the QR (e.g. account name). */
  label?: string;
  size?: number;
  className?: string;
};

/**
 * Renders a live UPI payment QR (amount baked into upi://pay).
 * Used when a Common Payment QR has dynamic UPI enabled.
 */
export default function DynamicUpiQrDisplay({
  upiId,
  payeeName,
  amount,
  note,
  label,
  size = 256,
  className,
}: DynamicUpiQrDisplayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pa = normalizeUpiId(upiId);
  const valid = isValidUpiId(pa);
  const am = Number(amount);
  const amountOk = Number.isFinite(am) && am > 0;
  const upiLink =
    valid &&
    buildUpiPayDeepLink({
      upiId: pa,
      payeeName: String(payeeName || '').trim() || undefined,
      amount: amountOk ? am : undefined,
      note: String(note || '').trim() || undefined,
    });

  useEffect(() => {
    if (!upiLink || !hostRef.current) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    setError(null);
    const host = hostRef.current;
    host.innerHTML = '';

    void (async () => {
      try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        if (cancelled || !hostRef.current) return;
        const qr = new QRCodeStyling({
          width: size,
          height: size,
          type: 'canvas',
          data: upiLink,
          margin: 8,
          qrOptions: { errorCorrectionLevel: 'M' },
          dotsOptions: { color: '#000000', type: 'square' },
          cornersSquareOptions: { color: '#000000', type: 'square' },
          cornersDotOptions: { color: '#000000', type: 'square' },
          backgroundOptions: { color: '#ffffff' },
        });
        qr.append(hostRef.current);
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to draw QR');
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, [upiLink, size]);

  if (!valid) {
    return (
      <p className="text-sm text-red-600 text-center">Invalid UPI ID — fix in Settings.</p>
    );
  }

  const amountLabel = amountOk
    ? `₹${am.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : null;

  return (
    <div className={className ?? 'text-center'}>
      {label ? <p className="text-sm font-medium mb-2 text-gray-700">{label}</p> : null}
      {amountLabel ? (
        <p className="text-lg font-semibold text-sky-800 mb-2 tabular-nums">{amountLabel}</p>
      ) : (
        <p className="text-xs text-amber-700 mb-2">Amount not set — customer enters it</p>
      )}
      <div className="flex justify-center">
        <div
          ref={hostRef}
          className="inline-flex items-center justify-center border-2 border-primary rounded-lg shadow-lg bg-white p-2 min-h-[160px] min-w-[160px]"
          aria-label="UPI payment QR code"
        />
      </div>
      {!ready && !error ? (
        <p className="text-xs text-muted-foreground mt-2">Generating QR…</p>
      ) : null}
      {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
      <p className="text-xs text-muted-foreground mt-2 break-all">{pa}</p>
      {amountOk ? (
        <p className="text-[11px] text-muted-foreground mt-1">Dynamic UPI — amount included</p>
      ) : null}
    </div>
  );
}
