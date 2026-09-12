import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, Copy, Download, Droplets, Phone, Share2 } from 'lucide-react';
import { buildTechSharePayMessage } from '@/components/job/ShareQrLinkPanel';
import { getDocumentBrandLabel, normalizeDocumentBrand, type DocumentBrand } from '@/lib/service-brands';
import {
  buildUpiPayDeepLink,
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
 * Supports short /p/:code and legacy /pay-upi?... query links.
 *
 * UPI app deep-links are intentionally omitted — NPCI / store policy blocks
 * third-party “Open in GPay/PhonePe” from web. Customers scan or save the QR.
 */
const PayUpi = () => {
  const { code: codeParam } = useParams<{ code?: string }>();
  const [params] = useSearchParams();
  const qrRef = useRef<HTMLDivElement>(null);
  const qrInstanceRef = useRef<QrCodeInstance | null>(null);
  const [copiedField, setCopiedField] = useState<'upi' | 'phone' | null>(null);
  const [copyError, setCopyError] = useState(false);
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

  const rawQr = shortLink?.qrCodeUrl || params.get('qr') || '';
  const qrCodeUrl = rawQr && rawQr !== '[object Object]' ? rawQr.trim() : '';

  const dynamicParam = params.get('dyn') ?? params.get('dynamic');
  const isDynamicUpi =
    shortLink?.dynamicUpiEnabled !== undefined
      ? Boolean(shortLink.dynamicUpiEnabled)
      : dynamicParam !== null
        ? dynamicParam !== '0' && dynamicParam !== 'false'
        : !qrCodeUrl;

  const validUpi = isValidUpiId(pa);
  const hasStaticQr = Boolean(qrCodeUrl);
  const valid = isDynamicUpi ? validUpi : validUpi || hasStaticQr;
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

  const upiLink = useMemo(
    () => (isDynamicUpi && validUpi ? buildUpiPayDeepLink(payInput) : null),
    [isDynamicUpi, validUpi, payInput]
  );

  useEffect(() => {
    document.title = `Pay via UPI | ${brandLabel}`;
  }, [brandLabel]);

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
          // Compact so payment details + QR fit together on a phone screen.
          width: 176,
          height: 176,
          type: 'canvas',
          data: upiLink,
          margin: 6,
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
    const amt =
      Number.isFinite(am) && am > 0 ? `-${am.toFixed(0)}` : '';
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

  const getStaticQrBlob = async (): Promise<Blob | null> => {
    if (!qrCodeUrl) return null;
    try {
      const res = await fetch(qrCodeUrl);
      if (res.ok) return await res.blob();
      return null;
    } catch {
      return null;
    }
  };

  const handleDownloadQr = async () => {
    setActionHint(null);
    setActionBusy('download');
    try {
      let blob: Blob | null = null;
      if (isDynamicUpi) {
        blob = await getQrPngBlob(qrInstanceRef.current);
      } else {
        blob = await getStaticQrBlob();
      }
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

  /**
   * Share QR to WhatsApp (or any app). Never auto-downloads —
   * use Download QR for that. Prefers Web Share with the image when available.
   */
  const handleShareWhatsApp = async () => {
    setActionHint(null);
    setActionBusy('share');
    try {
      let blob: Blob | null = null;
      if (isDynamicUpi) {
        blob = await getQrPngBlob(qrInstanceRef.current);
      } else {
        blob = await getStaticQrBlob();
      }
      const payLink =
        typeof window !== 'undefined' ? window.location.href : '';
      const shareText = buildTechSharePayMessage({
        brandLabel,
        amount: Number.isFinite(am) && am > 0 ? am : null,
        payeeName: pn,
        upiId: pa,
        phone: ph,
        payLink,
      });

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (blob) {
          const file = new File([blob], qrFileName, { type: blob.type || 'image/png' });
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

      // No Web Share (typical desktop): open WhatsApp contact picker with text only.
      // Do not download — Download QR is a separate action.
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
    'min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 px-4 py-5 sm:py-10 font-sans text-slate-900';

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
              : `This payment link is missing payment details. Ask ${brandLabel} for a new payment message.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mx-auto w-full max-w-md">
        <PayBrandMark brand={brand} />

        <div className="mt-4 text-center sm:mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Secure UPI payment</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Pay {brandLabel}
          </h1>
          {amountLabel ? (
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
              {amountLabel}
            </p>
          ) : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment details</p>
          </div>

          <div className="space-y-0 divide-y divide-slate-100">
            {pn ? (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Payee name</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{pn}</p>
                </div>
              </div>
            ) : null}

            {pa ? (
              <div className="flex items-start gap-3 px-4 py-2.5">
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
            ) : null}

            {ph ? (
              <div className="flex items-start gap-3 px-4 py-2.5">
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
          <p className="mt-2 text-center text-sm text-amber-700">
            Couldn’t copy automatically — long-press the value above and choose Copy.
          </p>
        ) : null}

        <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-center shadow-sm shadow-slate-200/60 sm:mt-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan to pay</p>
          <div className="mt-2.5 flex justify-center">
            {isDynamicUpi ? (
              <div
                ref={qrRef}
                className="flex h-[176px] w-[176px] items-center justify-center bg-white"
                aria-label="UPI payment QR code"
              />
            ) : qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="UPI payment QR"
                className="max-h-[220px] max-w-[220px] object-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"
                onLoad={() => setQrReady(true)}
              />
            ) : (
              <div className="flex h-[120px] w-full max-w-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                <p className="text-xs font-medium text-slate-700">QR code image not attached</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Please pay directly using the UPI ID or phone number above.
                </p>
              </div>
            )}
          </div>
          {!qrReady && (isDynamicUpi || qrCodeUrl) ? (
            <p className="mt-1.5 text-xs text-slate-400">Loading QR…</p>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {isDynamicUpi
              ? 'Open any UPI app and scan this QR — amount and payee fill in automatically.'
              : qrCodeUrl
                ? 'Open any UPI app (GPay, PhonePe, Paytm, etc.) and scan this QR to complete the payment.'
                : 'Copy the UPI ID or phone number above to complete the payment in your UPI app.'}
          </p>

          {(isDynamicUpi || qrCodeUrl) ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!qrReady || actionBusy !== null}
                onClick={() => void handleDownloadQr()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {actionBusy === 'download' ? 'Saving…' : 'Download QR'}
              </button>
              <button
                type="button"
                disabled={!qrReady || actionBusy !== null}
                onClick={() => void handleShareWhatsApp()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {actionBusy === 'share' ? 'Opening…' : 'Share'}
              </button>
            </div>
          ) : null}
          {actionHint ? (
            <p className="mt-2 text-xs leading-relaxed text-sky-800">{actionHint}</p>
          ) : null}
        </div>
          {actionHint ? (
            <p className="mt-2 text-xs leading-relaxed text-sky-800">{actionHint}</p>
          ) : null}
        </div>

        <p className="mt-3 px-1 text-center text-xs leading-relaxed text-slate-500 sm:mt-4 sm:text-sm">
          Or copy the UPI ID / phone number above and paste it in your UPI app.
        </p>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400 sm:mt-8">
          Secured UPI payment page for {brandLabel}. If you’ve already paid, you can ignore this link.
        </p>
      </div>
    </div>
  );
};

export default PayUpi;
