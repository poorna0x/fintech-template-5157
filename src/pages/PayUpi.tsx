import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Droplets, Phone } from 'lucide-react';
import { getDocumentBrandLabel, normalizeDocumentBrand, type DocumentBrand } from '@/lib/service-brands';
import { UpiOpenAppCta, UpiAppOpenGrid } from '@/components/UpiAppOpenButtons';
import {
  buildUpiAppDeepLinks,
  buildUpiPayDeepLink,
  detectPayPlatform,
  isValidUpiId,
  normalizePaymentPhone,
  normalizeUpiId,
} from '@/lib/upiPaymentAccounts';

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

/** Same mark as the public website header (droplet + brand name). */
function PayBrandMark({ brand }: { brand: DocumentBrand }) {
  const name = brand === 'elevenro' ? 'ElevenRO' : 'Hydrogen RO';
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
        <Droplets className="h-5 w-5 text-white" />
      </div>
      <div className="text-xl font-bold text-slate-900">{name}</div>
    </div>
  );
}

/**
 * Public HTTPS landing for WhatsApp UPI pay links.
 * Dynamic QR + copy details; Android opens UPI apps; iOS guides scan/copy.
 */
const PayUpi = () => {
  const [params] = useSearchParams();
  const qrRef = useRef<HTMLDivElement>(null);
  const [copiedField, setCopiedField] = useState<'upi' | 'phone' | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [launchTried, setLaunchTried] = useState(false);
  const [qrReady, setQrReady] = useState(false);

  const pa = normalizeUpiId(params.get('pa') || '');
  const pn = String(params.get('pn') || '').trim().slice(0, 100);
  const amRaw = params.get('am');
  const am = amRaw != null && amRaw !== '' ? Number(amRaw) : NaN;
  const tn = String(params.get('tn') || '').trim().slice(0, 80);
  const ph = normalizePaymentPhone(params.get('ph') || '');
  const brand: DocumentBrand = normalizeDocumentBrand(params.get('brand')) || 'hydrogenro';
  const valid = isValidUpiId(pa);
  const brandLabel = getDocumentBrandLabel(brand);

  const payInput = useMemo(
    () => ({
      upiId: pa,
      payeeName: pn || undefined,
      amount: Number.isFinite(am) && am > 0 ? am : undefined,
      note: tn || undefined,
      phone: ph || undefined,
      brand,
    }),
    [pa, pn, am, tn, ph, brand]
  );

  const upiLink = useMemo(() => (valid ? buildUpiPayDeepLink(payInput) : null), [valid, payInput]);
  const appLinks = useMemo(() => (valid ? buildUpiAppDeepLinks(payInput) : []), [valid, payInput]);
  const detected = useMemo(() => detectPayPlatform(), []);
  const [pickedDevice, setPickedDevice] = useState<'android' | 'ios' | null>(null);
  const platform = detected === 'other' ? pickedDevice ?? 'other' : detected;
  const needsDevicePick = detected === 'other' && !pickedDevice;
  const showAndroidOpen = platform === 'android';
  const showIosApps = platform === 'ios';

  useEffect(() => {
    document.title = `Pay via UPI | ${brandLabel}`;
  }, [brandLabel]);

  // Android: soft-open system UPI chooser once.
  useEffect(() => {
    if (!upiLink || platform !== 'android' || launchTried) return;
    setLaunchTried(true);
    const t = window.setTimeout(() => {
      window.location.href = upiLink;
    }, 400);
    return () => window.clearTimeout(t);
  }, [upiLink, platform, launchTried]);

  useEffect(() => {
    if (!upiLink || !qrRef.current) return;
    let cancelled = false;
    setQrReady(false);
    const host = qrRef.current;
    host.innerHTML = '';

    void (async () => {
      try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        if (cancelled || !qrRef.current) return;
        const qr = new QRCodeStyling({
          width: 220,
          height: 220,
          type: 'canvas',
          data: upiLink,
          margin: 8,
          qrOptions: { errorCorrectionLevel: 'M' },
          dotsOptions: { color: '#000000', type: 'square' },
          cornersSquareOptions: { color: '#000000', type: 'square' },
          cornersDotOptions: { color: '#000000', type: 'square' },
          backgroundOptions: { color: '#ffffff' },
        });
        qr.append(qrRef.current);
        if (!cancelled) setQrReady(true);
      } catch {
        if (!cancelled) setQrReady(false);
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, [upiLink]);

  const amountLabel =
    Number.isFinite(am) && am > 0
      ? `₹${am.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : null;

  const handleCopy = async (field: 'upi' | 'phone', value: string) => {
    setCopyError(false);
    const ok = await copyText(value);
    if (!ok) {
      setCopyError(true);
      return;
    }
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 2200);
  };

  const shellClass =
    'min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 px-4 py-10 font-sans text-slate-900';

  if (!valid) {
    return (
      <div className={shellClass}>
        <div className="mx-auto max-w-md text-center">
          <PayBrandMark brand={brand} />
          <h1 className="mt-6 text-xl font-semibold">Invalid payment link</h1>
          <p className="mt-2 text-sm text-slate-600">
            This UPI link is missing a valid UPI ID. Ask {brandLabel} for a new payment message.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mx-auto w-full max-w-md">
        <PayBrandMark brand={brand} />

        <div className="mt-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Secure UPI payment</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Pay {brandLabel}</h1>
          {pn ? <p className="mt-1 text-sm text-slate-600">To: {pn}</p> : null}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</p>
          </div>

          <div className="space-y-0 divide-y divide-slate-100">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">UPI ID</p>
                <p className="mt-0.5 select-all break-all font-mono text-sm font-semibold text-slate-900">{pa}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('upi', pa)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiedField === 'upi' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'upi' ? 'Copied' : 'Copy'}
              </button>
            </div>

            {ph ? (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Pay to phone</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {ph}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('phone', ph)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {copiedField === 'phone' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedField === 'phone' ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {copyError ? (
          <p className="mt-3 text-center text-sm text-amber-700">
            Couldn’t copy automatically — long-press the value above and choose Copy.
          </p>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 text-center shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan to pay</p>
          <div className="mt-3 flex justify-center">
            <div
              ref={qrRef}
              className="flex h-[220px] w-[220px] items-center justify-center bg-white"
              aria-label="UPI payment QR code"
            />
          </div>
          {!qrReady ? <p className="mt-2 text-xs text-slate-400">Loading QR…</p> : null}
          {amountLabel ? (
            <p className="mt-4 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{amountLabel}</p>
          ) : null}
          {pn ? <p className="mt-1 text-sm text-slate-600">{pn}</p> : null}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Scan with any UPI app — amount and payee are filled in automatically.
          </p>
        </div>

        {needsDevicePick ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-center text-sm font-semibold text-slate-900">Are you using Android or iPhone?</p>
            <p className="mt-1 text-center text-xs text-slate-500">We’ll show the right payment buttons for your phone.</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPickedDevice('android')}
                className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setPickedDevice('ios')}
                className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                iPhone
              </button>
            </div>
          </div>
        ) : null}

        {!needsDevicePick && showAndroidOpen && upiLink ? (
          <div className="mt-6">
            {detected === 'other' ? (
              <button
                type="button"
                onClick={() => setPickedDevice(null)}
                className="mb-2 w-full text-center text-xs font-medium text-sky-700 hover:underline"
              >
                Change device
              </button>
            ) : null}
            <UpiOpenAppCta href={upiLink} />
          </div>
        ) : null}

        {!needsDevicePick && showIosApps && appLinks.length ? (
          <div className="mt-6">
            {detected === 'other' ? (
              <button
                type="button"
                onClick={() => setPickedDevice(null)}
                className="mb-2 w-full text-center text-xs font-medium text-sky-700 hover:underline"
              >
                Change device
              </button>
            ) : null}
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Open with</p>
            <UpiAppOpenGrid apps={appLinks} />
          </div>
        ) : null}

        <p className="mt-4 px-1 text-center text-sm leading-relaxed text-slate-500">
          (You can also scan the QR above, or copy the UPI ID / phone number and paste it in your UPI app.)
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          Secured UPI payment page for {brandLabel}. If you’ve already paid, you can ignore this link.
        </p>
      </div>
    </div>
  );
};

export default PayUpi;
