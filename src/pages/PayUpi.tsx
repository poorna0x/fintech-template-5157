import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Download, Droplets, Phone, Share2 } from 'lucide-react';
import { getDocumentBrandLabel, normalizeDocumentBrand, type DocumentBrand } from '@/lib/service-brands';
import { UpiAppOpenGrid, UpiOpenAppCta } from '@/components/UpiAppOpenButtons';
import {
  buildUpiAppDeepLinks,
  buildUpiPayDeepLink,
  detectPayPlatform,
  fetchUpiPayShortLink,
  isValidUpiId,
  normalizePaymentPhone,
  normalizeUpiId,
  type UpiPayLinkRecord,
} from '@/lib/upiPaymentAccounts';

type QrCodeInstance = {
  append: (parent: HTMLElement) => void;
  getRawData: (extension?: 'png' | 'jpeg' | 'webp' | 'svg') => Promise<Blob | Buffer | null>;
};

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

function defaultBrandFromHost(): DocumentBrand {
  if (typeof window === 'undefined') return 'hydrogenro';
  return /elevenro/i.test(window.location.hostname) ? 'elevenro' : 'hydrogenro';
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

async function getQrPngBlob(qr: QrCodeInstance | null): Promise<Blob | null> {
  if (!qr) return null;
  try {
    const raw = await qr.getRawData('png');
    if (!raw) return null;
    if (raw instanceof Blob) return raw;
    return new Blob([raw as BlobPart], { type: 'image/png' });
  } catch {
    return null;
  }
}

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

function UpiIntentFallbackNote({ hasPhone }: { hasPhone: boolean }) {
  return (
    <div className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-left">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 text-xs leading-relaxed text-amber-950">
          <p className="font-semibold">If your phone shows a warning</p>
          <p className="mt-0.5">
            You can ignore it and continue. If payment still fails, scan the QR below or pay using
            the UPI ID{hasPhone ? ' / phone number' : ''} above.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Public HTTPS landing for WhatsApp UPI pay links.
 * Supports short /p/:code and legacy /pay-upi?... query links.
 */
const PayUpi = () => {
  const { code: codeParam } = useParams<{ code?: string }>();
  const [params] = useSearchParams();
  const qrRef = useRef<HTMLDivElement>(null);
  const qrInstanceRef = useRef<QrCodeInstance | null>(null);
  const [copiedField, setCopiedField] = useState<'upi' | 'phone' | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [launchTried, setLaunchTried] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const [actionBusy, setActionBusy] = useState<'download' | 'share' | null>(null);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [shortLink, setShortLink] = useState<UpiPayLinkRecord | null>(null);
  const [shortLinkLoading, setShortLinkLoading] = useState(() => Boolean(codeParam?.trim()));
  const [shortLinkMissing, setShortLinkMissing] = useState(false);

  useEffect(() => {
    const code = String(codeParam || '').trim();
    if (!code) {
      setShortLink(null);
      setShortLinkLoading(false);
      setShortLinkMissing(false);
      return;
    }
    let cancelled = false;
    setShortLinkLoading(true);
    setShortLinkMissing(false);
    void (async () => {
      const row = await fetchUpiPayShortLink(code);
      if (cancelled) return;
      setShortLink(row);
      setShortLinkMissing(!row);
      setShortLinkLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [codeParam]);

  const pa = normalizeUpiId(shortLink?.upiId || params.get('pa') || '');
  const pn = String(shortLink?.payeeName || params.get('pn') || '').trim().slice(0, 100);
  const amRaw = shortLink?.amount != null ? String(shortLink.amount) : params.get('am');
  const am = amRaw != null && amRaw !== '' ? Number(amRaw) : NaN;
  const tn = String(shortLink?.note || params.get('tn') || '').trim().slice(0, 80);
  const ph = normalizePaymentPhone(shortLink?.phone || params.get('ph') || '');
  const brand: DocumentBrand =
    normalizeDocumentBrand(shortLink?.brand || params.get('brand')) || defaultBrandFromHost();
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
  const iosAppLinks = useMemo(() => appLinks.filter((app) => app.id !== 'bhim'), [appLinks]);
  const detected = useMemo(() => detectPayPlatform(), []);
  const [pickedDevice, setPickedDevice] = useState<'android' | 'ios' | null>(null);
  const platform = detected === 'other' ? pickedDevice ?? 'other' : detected;
  const needsDevicePick = detected === 'other' && !pickedDevice;
  const showAndroidOpen = platform === 'android';
  const showIosApps = platform === 'ios';

  useEffect(() => {
    document.title = `Pay via UPI | ${brandLabel}`;
  }, [brandLabel]);

  // Android: soft-open system UPI chooser once (WhatsApp / Chrome in-app).
  useEffect(() => {
    if (!upiLink || platform !== 'android' || launchTried) return;
    setLaunchTried(true);
    const t = window.setTimeout(() => {
      window.location.href = upiLink;
    }, 500);
    return () => window.clearTimeout(t);
  }, [upiLink, platform, launchTried]);

  useEffect(() => {
    if (!upiLink || !qrRef.current) return;
    let cancelled = false;
    setQrReady(false);
    qrInstanceRef.current = null;
    const host = qrRef.current;
    host.innerHTML = '';

    void (async () => {
      try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        if (cancelled || !qrRef.current) return;
        const qr = new QRCodeStyling({
          width: 152,
          height: 152,
          type: 'canvas',
          data: upiLink,
          margin: 5,
          qrOptions: { errorCorrectionLevel: 'M' },
          dotsOptions: { color: '#000000', type: 'square' },
          cornersSquareOptions: { color: '#000000', type: 'square' },
          cornersDotOptions: { color: '#000000', type: 'square' },
          backgroundOptions: { color: '#ffffff' },
        }) as QrCodeInstance;
        qr.append(qrRef.current);
        qrInstanceRef.current = qr;
        if (!cancelled) setQrReady(true);
      } catch {
        qrInstanceRef.current = null;
        if (!cancelled) setQrReady(false);
      }
    })();

    return () => {
      cancelled = true;
      qrInstanceRef.current = null;
      host.innerHTML = '';
    };
  }, [upiLink]);

  const amountLabel =
    Number.isFinite(am) && am > 0
      ? `₹${am.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : null;

  const qrFileName = useMemo(() => {
    const safeBrand = brand === 'elevenro' ? 'elevenro' : 'hydrogen-ro';
    const amt = Number.isFinite(am) && am > 0 ? `-${am.toFixed(0)}` : '';
    return `${safeBrand}-upi-pay${amt}.png`;
  }, [brand, am]);

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

  const handleDownloadQr = async () => {
    setActionHint(null);
    setActionBusy('download');
    try {
      const blob = await getQrPngBlob(qrInstanceRef.current);
      if (!blob) {
        setActionHint('QR isn’t ready yet — wait a moment and try again.');
        return;
      }
      triggerBlobDownload(blob, qrFileName);
      setActionHint('QR saved to your downloads.');
      window.setTimeout(() => setActionHint(null), 2800);
    } finally {
      setActionBusy(null);
    }
  };

  const handleShareWhatsApp = async () => {
    setActionHint(null);
    setActionBusy('share');
    try {
      const blob = await getQrPngBlob(qrInstanceRef.current);
      const shareText = [
        `Pay ${brandLabel} via UPI`,
        amountLabel ? `Amount: ${amountLabel}` : null,
        pn ? `Payee name: ${pn}` : null,
        `UPI ID: ${pa}`,
        ph ? `Phone: ${ph}` : null,
        typeof window !== 'undefined' ? `Pay link: ${window.location.href}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (blob) {
          const file = new File([blob], qrFileName, { type: 'image/png' });
          const payloadWithFile: ShareData = {
            files: [file],
            title: `Pay ${brandLabel}`,
            text: shareText,
          };
          const canFile =
            typeof navigator.canShare !== 'function' || navigator.canShare(payloadWithFile);
          if (canFile) {
            try {
              await navigator.share(payloadWithFile);
              return;
            } catch (e) {
              if (e instanceof DOMException && e.name === 'AbortError') return;
            }
          }
        }
        try {
          await navigator.share({ title: `Pay ${brandLabel}`, text: shareText });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }

      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setActionHint(
        blob
          ? 'Opened WhatsApp — use Download QR if you want to attach the image.'
          : 'Opened WhatsApp — pick a contact to send the payment details.'
      );
      window.setTimeout(() => setActionHint(null), 5000);
    } finally {
      setActionBusy(null);
    }
  };

  const shellClass =
    'min-h-[100dvh] bg-gradient-to-b from-sky-50 via-white to-slate-50 px-4 py-4 pb-6 font-sans text-slate-900 sm:py-6';

  if (shortLinkLoading) {
    return (
      <div className={shellClass}>
        <div className="mx-auto max-w-md text-center">
          <PayBrandMark brand={defaultBrandFromHost()} />
          <p className="mt-6 text-sm text-slate-600">Loading payment…</p>
        </div>
      </div>
    );
  }

  if (shortLinkMissing || !valid) {
    return (
      <div className={shellClass}>
        <div className="mx-auto max-w-md text-center">
          <PayBrandMark brand={brand} />
          <h1 className="mt-6 text-xl font-semibold">
            {shortLinkMissing ? 'Payment link expired' : 'Invalid payment link'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {shortLinkMissing
              ? `This pay link is no longer available. Ask ${brandLabel} for a new payment message.`
              : `This UPI link is missing a valid UPI ID. Ask ${brandLabel} for a new payment message.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mx-auto w-full max-w-md">
        <PayBrandMark brand={brand} />

        <div className="mt-3 text-center sm:mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
            Secure UPI payment
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pay {brandLabel}
          </h1>
          {amountLabel ? (
            <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
              {amountLabel}
            </p>
          ) : null}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
          <div className="border-b border-slate-100 px-4 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Payment details
            </p>
          </div>

          <div className="space-y-0 divide-y divide-slate-100">
            {pn ? (
              <div className="flex items-start gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500">Payee name</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{pn}</p>
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-500">UPI ID</p>
                <p className="mt-0.5 select-all break-all font-mono text-sm font-semibold text-slate-900">
                  {pa}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy('upi', pa)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiedField === 'upi' ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedField === 'upi' ? 'Copied' : 'Copy'}
              </button>
            </div>

            {ph ? (
              <div className="flex items-start gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500">Pay to phone</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {ph}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('phone', ph)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {copiedField === 'phone' ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedField === 'phone' ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {copyError ? (
          <p className="mt-2 text-center text-xs text-amber-700">
            Couldn’t copy automatically — long-press the value above and choose Copy.
          </p>
        ) : null}

        {needsDevicePick ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-center text-sm font-semibold text-slate-900">
              Are you using Android or iPhone?
            </p>
            <p className="mt-0.5 text-center text-xs text-slate-500">
              We’ll show the right payment buttons for your phone.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPickedDevice('android')}
                className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setPickedDevice('ios')}
                className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                iPhone
              </button>
            </div>
          </div>
        ) : null}

        {!needsDevicePick && (showAndroidOpen || showIosApps) ? (
          <div className="mt-3 space-y-2.5">
            {detected === 'other' ? (
              <button
                type="button"
                onClick={() => setPickedDevice(null)}
                className="w-full text-center text-xs font-medium text-sky-700 hover:underline"
              >
                Change device
              </button>
            ) : null}

            <UpiIntentFallbackNote hasPhone={Boolean(ph)} />

            {showAndroidOpen && upiLink ? <UpiOpenAppCta href={upiLink} /> : null}

            {showIosApps && iosAppLinks.length ? (
              <div>
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Open with
                </p>
                <UpiAppOpenGrid apps={iosAppLinks} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          id="pay-qr"
          className="mt-3 scroll-mt-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-center shadow-sm shadow-slate-200/60 sm:p-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Or scan QR to pay
          </p>
          <div className="mt-2 flex justify-center">
            <div
              ref={qrRef}
              className="flex h-[152px] w-[152px] items-center justify-center bg-white"
              aria-label="UPI payment QR code"
            />
          </div>
          {!qrReady ? <p className="mt-1 text-[11px] text-slate-400">Loading QR…</p> : null}
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Amount and payee fill in automatically when you scan.
          </p>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!qrReady || actionBusy !== null}
              onClick={() => void handleDownloadQr()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {actionBusy === 'download' ? 'Saving…' : 'Download QR'}
            </button>
            <button
              type="button"
              disabled={!qrReady || actionBusy !== null}
              onClick={() => void handleShareWhatsApp()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Share2 className="h-3.5 w-3.5" />
              {actionBusy === 'share' ? 'Opening…' : 'Share'}
            </button>
          </div>
          {actionHint ? (
            <p className="mt-2 text-[11px] leading-relaxed text-sky-800">{actionHint}</p>
          ) : null}
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          Secured UPI payment page for {brandLabel}. If you’ve already paid, you can ignore this link.
        </p>
      </div>
    </div>
  );
};

export default PayUpi;
