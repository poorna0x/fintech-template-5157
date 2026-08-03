import { useEffect, useState } from 'react';
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
  /**
   * Static common-QR image URL. If dynamic generation fails (or UPI ID is
   * invalid), this image is shown instead so the technician can still collect.
   */
  fallbackImageUrl?: string;
};

const GENERATE_TIMEOUT_MS = 10_000;

/**
 * Renders a live UPI payment QR (amount baked into upi://pay).
 * Falls back to the uploaded static QR image when generation fails.
 */
export default function DynamicUpiQrDisplay({
  upiId,
  payeeName,
  amount,
  note,
  label,
  size = 256,
  className,
  fallbackImageUrl,
}: DynamicUpiQrDisplayProps) {
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackBroken, setFallbackBroken] = useState(false);

  const pa = normalizeUpiId(upiId);
  const valid = isValidUpiId(pa);
  const am = Number(amount);
  const amountOk = Number.isFinite(am) && am > 0;
  const fallback =
    typeof fallbackImageUrl === 'string' &&
    (fallbackImageUrl.trim().startsWith('http') || fallbackImageUrl.trim().startsWith('data:'))
      ? fallbackImageUrl.trim()
      : '';
  const upiLink =
    valid &&
    buildUpiPayDeepLink({
      upiId: pa,
      payeeName: String(payeeName || '').trim() || undefined,
      amount: amountOk ? am : undefined,
      note: String(note || '').trim() || undefined,
    });

  // Reset fallback-broken when the image URL changes.
  useEffect(() => {
    setFallbackBroken(false);
  }, [fallback]);

  useEffect(() => {
    if (!upiLink) {
      setReady(false);
      if (!valid) setError('Invalid UPI ID');
      else setError('Could not build UPI link');
      return;
    }
    // Host mounts after first paint — depend on hostEl so we retry when ready.
    if (!hostEl) return;

    let cancelled = false;
    setReady(false);
    setError(null);
    hostEl.innerHTML = '';

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setError('QR generation timed out');
        setReady(false);
      }
    }, GENERATE_TIMEOUT_MS);

    void (async () => {
      try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        if (cancelled || !hostEl.isConnected) return;
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
        qr.append(hostEl);
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setError(e instanceof Error ? e.message : 'Failed to draw QR');
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try {
        hostEl.innerHTML = '';
      } catch {
        /* unmounted */
      }
    };
  }, [upiLink, size, valid, hostEl]);

  const useFallback = Boolean(fallback) && (!valid || !!error) && !fallbackBroken;

  if (useFallback) {
    return (
      <div className={className ?? 'text-center'}>
        {label ? <p className="text-sm font-medium mb-2 text-gray-700">{label}</p> : null}
        {amountLabel(amountOk, am)}
        <img
          src={fallback}
          alt={label || 'Payment QR'}
          className="w-64 h-64 object-contain mx-auto border-2 border-primary rounded-lg shadow-lg bg-white p-3"
          onError={() => setFallbackBroken(true)}
        />
        <p className="text-xs text-amber-700 mt-2">
          Dynamic UPI unavailable — showing saved QR image
        </p>
      </div>
    );
  }

  if (!valid || (error && !fallback) || fallbackBroken) {
    return (
      <div className={className ?? 'text-center space-y-1'}>
        <p className="text-sm text-red-600">
          {!valid
            ? 'Invalid UPI ID — fix in Settings.'
            : fallbackBroken
              ? 'Dynamic UPI failed and the backup QR image could not load.'
              : `Dynamic UPI failed${error ? `: ${error}` : ''}.`}
        </p>
        {!fallback ? (
          <p className="text-xs text-muted-foreground">
            Upload a backup QR image on this common QR in Settings, or fix the UPI ID.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className ?? 'text-center'}>
      {label ? <p className="text-sm font-medium mb-2 text-gray-700">{label}</p> : null}
      {amountLabel(amountOk, am)}
      <div className="flex justify-center">
        <div
          ref={setHostEl}
          className="inline-flex items-center justify-center border-2 border-primary rounded-lg shadow-lg bg-white p-2 min-h-[160px] min-w-[160px]"
          aria-label="UPI payment QR code"
        />
      </div>
      {!ready && !error ? (
        <p className="text-xs text-muted-foreground mt-2">Generating QR…</p>
      ) : null}
      <p className="text-xs text-muted-foreground mt-2 break-all">{pa}</p>
      {amountOk ? (
        <p className="text-[11px] text-muted-foreground mt-1">Dynamic UPI — amount included</p>
      ) : null}
    </div>
  );
}

function amountLabel(amountOk: boolean, am: number) {
  if (amountOk) {
    return (
      <p className="text-lg font-semibold text-sky-800 mb-2 tabular-nums">
        ₹{am.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </p>
    );
  }
  return <p className="text-xs text-amber-700 mb-2">Amount not set — customer enters it</p>;
}
