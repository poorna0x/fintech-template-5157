import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildUpiPayDeepLink, isValidUpiId, normalizeUpiId } from '@/lib/upiPaymentAccounts';

/**
 * Public HTTPS landing page for WhatsApp UPI pay links.
 * WhatsApp only auto-links https:// — this page opens upi:// on Android.
 */
const PayUpi = () => {
  const [params] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [launchTried, setLaunchTried] = useState(false);

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
    // Give the page a tick to paint the fallback button, then open UPI apps.
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
    try {
      await navigator.clipboard.writeText(pa);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
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
          <p className="mt-1 break-all font-mono text-base font-semibold">{pa}</p>
          <button
            type="button"
            onClick={() => void copyUpiId()}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            {copied ? 'Copied' : 'Copy UPI ID'}
          </button>
        </div>

        {upiLink ? (
          <a
            href={upiLink}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-sky-700 py-3.5 text-base font-semibold text-white hover:bg-sky-800"
          >
            {isAndroid ? 'Open UPI app' : 'Open payment app'}
          </a>
        ) : null}

        <p className="mt-4 text-center text-sm text-slate-500">
          {isAndroid
            ? 'If nothing opens, tap Open UPI app or copy the UPI ID into GPay / PhonePe / Paytm.'
            : 'On iPhone, copy the UPI ID and paste it into GPay, PhonePe, or Paytm.'}
        </p>
      </div>
    </div>
  );
};

export default PayUpi;
