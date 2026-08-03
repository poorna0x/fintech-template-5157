import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildUpiPayDeepLink, isValidUpiId, normalizeUpiId } from '@/lib/upiPaymentAccounts';

/**
 * Public HTTPS landing page for WhatsApp UPI pay links.
 * WhatsApp only auto-links https:// — this page opens upi:// on Android
 * and offers a one-tap Copy UPI ID (needed on iPhone).
 */
const PayUpi = () => {
  const [params] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [launchTried, setLaunchTried] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const pa = normalizeUpiId(params.get('pa') || '');
  const pn = String(params.get('pn') || '').trim().slice(0, 100);
  const amRaw = params.get('am');
  const am = amRaw != null && amRaw !== '' ? Number(amRaw) : NaN;
  const tn = String(params.get('tn') || '').trim().slice(0, 80);
  const valid = isValidUpiId(pa);

  const upiLink = useMemo(() => {
    if (!valid) return null;
    return buildUpiPayDeepLink({
      upiId: pa,
      payeeName: pn || undefined,
      amount: Number.isFinite(am) && am > 0 ? am : undefined,
      note: tn || undefined,
    });
  }, [valid, pa, pn, am, tn]);

  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /android/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    document.title = 'Pay via UPI | Hydrogen RO';
  }, []);

  useEffect(() => {
    if (!upiLink || !isAndroid || launchTried) return;
    setLaunchTried(true);
    const t = window.setTimeout(() => {
      window.location.href = upiLink;
    }, 250);
    return () => window.clearTimeout(t);
  }, [upiLink, isAndroid, launchTried]);

  const amountLabel =
    Number.isFinite(am) && am > 0
      ? `₹${am.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : null;

  const copyUpiId = async () => {
    setCopyError(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pa);
      } else {
        const el = document.createElement('textarea');
        el.value = pa;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  };

  if (!valid) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 font-sans text-slate-900">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold">Invalid payment link</h1>
          <p className="mt-2 text-sm text-slate-600">
            This UPI link is missing a valid UPI ID. Ask Hydrogen RO for a new payment message.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white px-4 py-12 font-sans text-slate-900">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-medium text-sky-700">Hydrogen RO</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pay via UPI</h1>
        {amountLabel ? (
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{amountLabel}</p>
        ) : null}
        {pn ? <p className="mt-1 text-sm text-slate-600">To: {pn}</p> : null}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">UPI ID</p>
          <p className="mt-1 select-all break-all font-mono text-base font-semibold">{pa}</p>
        </div>

        {/* iPhone: Copy is the main action. Android: Pay first, Copy second. */}
        {!isAndroid ? (
          <button
            type="button"
            onClick={() => void copyUpiId()}
            className="mt-4 w-full rounded-xl bg-sky-700 py-3.5 text-base font-semibold text-white hover:bg-sky-800"
          >
            {copied ? 'UPI ID copied' : 'Copy UPI ID'}
          </button>
        ) : null}

        {upiLink ? (
          <a
            href={upiLink}
            className={
              isAndroid
                ? 'mt-4 flex w-full items-center justify-center rounded-xl bg-sky-700 py-3.5 text-base font-semibold text-white hover:bg-sky-800'
                : 'mt-3 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-3 text-base font-semibold text-slate-800 hover:bg-slate-50'
            }
          >
            {isAndroid ? 'Open UPI app' : 'Try open payment app'}
          </a>
        ) : null}

        {isAndroid ? (
          <button
            type="button"
            onClick={() => void copyUpiId()}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-3 text-base font-semibold text-slate-800 hover:bg-slate-50"
          >
            {copied ? 'UPI ID copied' : 'Copy UPI ID'}
          </button>
        ) : null}

        {copyError ? (
          <p className="mt-3 text-center text-sm text-amber-700">
            Couldn’t copy automatically — long-press the UPI ID above and choose Copy.
          </p>
        ) : null}

        <p className="mt-4 text-center text-sm text-slate-500">
          {isAndroid
            ? 'If nothing opens, tap Open UPI app or Copy UPI ID into GPay / PhonePe / Paytm.'
            : 'Tap Copy UPI ID, then paste it into GPay, PhonePe, or Paytm.'}
        </p>
      </div>
    </div>
  );
};

export default PayUpi;
