import React, { useCallback, useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHero from '@/components/PageHero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { ShieldCheck, Search, Phone, Package, CheckCircle2, XCircle, AlertCircle, BadgeCheck, Lock } from 'lucide-react';
import AltchaWidget from '@/components/AltchaWidget';
import {
  OTP_ENABLED,
  FIREBASE_RECAPTCHA_CONTAINER_ID,
  sendBookingOtp,
  verifyBookingOtp,
  resetBookingOtpSession,
  prewarmBookingOtp,
  checkOtpRateLimit,
  setWarrantySessionPersistence,
  resumeWarrantySession,
  endWarrantySession,
} from '@/lib/otp';
import { lookupWarrantiesByPhone, warmWarrantyLookup, type WarrantyLookupResponse } from '@/lib/warrantyLookup';
import {
  categoryDef,
  warrantyStatus,
  formatWarrantyDate,
  GENERAL_WARRANTY_POLICY,
  GENERAL_WARRANTY_TERMS,
  type PublicWarranty,
  type PublicWarrantyCustomer,
  type PublicAmcInfo,
} from '@/lib/warranty';

type ViewState = 'idle' | 'loading' | 'results' | 'notfound' | 'error';

/**
 * Normalize anything the user types/pastes/autofills into a standard Indian 10-digit
 * mobile number: strips spaces/dashes, a leading 0, and a +91 / 91 country code.
 *   "+91 77528 94643" → "7752894643"   "09876543210" → "9876543210"
 */
function normalizeIndianMobile(raw: string): string {
  let d = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  return d.slice(0, 10);
}

const Warranty: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<ViewState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [customer, setCustomer] = useState<PublicWarrantyCustomer | null>(null);
  const [warranties, setWarranties] = useState<PublicWarranty[]>([]);
  const [amc, setAmc] = useState<PublicAmcInfo | null>(null);

  // ALTCHA proof-of-work runs in the background; the server requires the resulting
  // login token in production. Empty token is fine in local dev (server skips it).
  const altchaTokenRef = useRef('');
  const altchaPayloadRef = useRef<string | undefined>(undefined);
  // A resumed session lookup waits here until the ALTCHA token is ready (prod needs it).
  const pendingResumeRef = useRef<{ phone: string; phoneToken: string } | null>(null);

  // OTP (only when configured): user proves they own the SIM before any PII is shown.
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpResendAt, setOtpResendAt] = useState(0);
  const [otpNow, setOtpNow] = useState(Date.now());
  // The phone whose OTP session is currently verified (kept per-tab via Firebase).
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [resuming, setResuming] = useState(OTP_ENABLED);

  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const phoneValid = phoneDigits.length === 10 && /^[6-9]/.test(phoneDigits);
  const busy = state === 'loading' || otpSending || otpVerifying;
  const otpResendRemaining = Math.max(0, Math.ceil((otpResendAt - otpNow) / 1000));

  // Run the lookup for an explicit phone (stable identity — only uses setters + refs).
  const doLookup = useCallback(
    async (lookupPhone: string, phoneToken?: string): Promise<WarrantyLookupResponse> => {
      setState('loading');
      setErrorMsg('');
      setCustomer(null);
      setWarranties([]);
      setAmc(null);
      const res = await lookupWarrantiesByPhone(lookupPhone, {
        altchaLoginToken: altchaTokenRef.current || undefined,
        altchaPayload: altchaPayloadRef.current,
        phoneToken,
      });
      if (res.error) {
        setErrorMsg(res.error);
        setState('error');
      } else if (!res.found) {
        setState('notfound');
      } else {
        setCustomer(res.customer || null);
        setWarranties(res.warranties || []);
        setAmc(res.amc ?? null);
        setState('results');
      }
      return res;
    },
    []
  );

  const handleAltchaVerify = useCallback(
    (isValid: boolean, payload?: string, loginToken?: string) => {
      if (isValid && loginToken) {
        altchaTokenRef.current = loginToken;
        altchaPayloadRef.current = payload;
        // Fire any lookup that was waiting for the proof-of-work token.
        const pending = pendingResumeRef.current;
        if (pending) {
          pendingResumeRef.current = null;
          void doLookup(pending.phone, pending.phoneToken);
        }
      }
    },
    [doLookup]
  );

  // On mount: warm the function, prewarm OTP, and silently resume a still-valid
  // per-tab Firebase session so a refresh doesn't re-prompt for an OTP.
  useEffect(() => {
    warmWarrantyLookup();
    if (!OTP_ENABLED) return;
    void prewarmBookingOtp();
    let cancelled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      await setWarrantySessionPersistence();
      const resumed = await resumeWarrantySession();
      if (cancelled) return;
      if (!resumed) {
        setResuming(false);
        return;
      }
      setPhone(resumed.phone);
      setVerifiedPhone(resumed.phone);
      setResuming(false);
      if (altchaTokenRef.current) {
        void doLookup(resumed.phone, resumed.phoneToken);
      } else {
        // Defer until the background ALTCHA token lands; fall back shortly in dev where
        // ALTCHA is not configured (the server skips it there anyway).
        pendingResumeRef.current = resumed;
        fallback = setTimeout(() => {
          const p = pendingResumeRef.current;
          if (!cancelled && p) {
            pendingResumeRef.current = null;
            void doLookup(p.phone, p.phoneToken);
          }
        }, 2500);
      }
    })();
    return () => {
      cancelled = true;
      if (fallback) clearTimeout(fallback);
    };
  }, [doLookup]);

  // Live resend countdown.
  useEffect(() => {
    if (!otpSent || otpResendAt <= Date.now()) return;
    const id = setInterval(() => setOtpNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [otpSent, otpResendAt]);

  // Reset everything when the phone number is edited so a stale OTP / result can't leak.
  const handlePhoneChange = (value: string) => {
    const next = normalizeIndianMobile(value);
    setPhone(next);
    if (otpSent || otpCode || otpError) {
      setOtpSent(false);
      setOtpCode('');
      setOtpError('');
      setOtpResendAt(0);
      resetBookingOtpSession();
    }
    if (state !== 'idle') {
      setState('idle');
      setCustomer(null);
      setWarranties([]);
      setAmc(null);
      setErrorMsg('');
    }
  };

  // OTP off: a single search button (still ALTCHA-gated on the server).
  const handleDirectSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phoneValid || busy) return;
    await doLookup(phoneDigits);
  };

  const handleSendOtp = async () => {
    if (!phoneValid || busy) return;
    setOtpError('');
    const limit = checkOtpRateLimit(phoneDigits);
    if (!limit.allowed) {
      setOtpError(limit.reason || 'Please wait before requesting another code.');
      return;
    }
    setOtpSending(true);
    const res = await sendBookingOtp(phoneDigits);
    setOtpSending(false);
    if (!res.ok) {
      setOtpError(res.error || 'Could not send the OTP. Please try again.');
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setOtpResendAt(Date.now() + 60_000);
    // Warm firebase-admin on the function while the user reads the SMS + types the code,
    // so the post-verify server-side token check hits a warm container.
    warmWarrantyLookup();
  };

  const handleVerifyAndSearch = async () => {
    if (busy) return;
    setOtpError('');
    setOtpVerifying(true);
    // Keep the Firebase session alive so a refresh can silently re-verify (per tab).
    const res = await verifyBookingOtp(otpCode, { keepSession: true });
    if (!res.verified || !res.phoneToken) {
      setOtpVerifying(false);
      setOtpError(res.error || 'Incorrect or expired code. Please try again.');
      return;
    }
    setOtpVerifying(false);
    setVerifiedPhone(phoneDigits);
    const lookup = await doLookup(phoneDigits, res.phoneToken);
    // Collapse the verification UI once we've shown a result for this number.
    if (lookup.found || lookup.error == null) {
      setOtpSent(false);
      setOtpCode('');
    }
  };

  // End the verified session and clear everything (used by "Check another number").
  const handleUseAnotherNumber = async () => {
    pendingResumeRef.current = null;
    await endWarrantySession();
    resetBookingOtpSession();
    setVerifiedPhone(null);
    setPhone('');
    setOtpSent(false);
    setOtpCode('');
    setOtpError('');
    setOtpResendAt(0);
    setState('idle');
    setCustomer(null);
    setWarranties([]);
    setAmc(null);
    setErrorMsg('');
  };

  const otpFlow = OTP_ENABLED;
  const sessionVerified = otpFlow && verifiedPhone !== null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">
        <PageHero
          badge="Warranty self-check"
          title="Check your warranty status"
          description="Enter the mobile number used for your service to see what's covered and when each warranty expires."
          showButtons={false}
        />

        {/* Background ALTCHA proof-of-work (anti-bot). Hidden; runs on load. */}
        <AltchaWidget hidden tokenPurpose="booking" onVerify={handleAltchaVerify} />

        <section className="w-full px-4 py-10 md:py-14">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Search / verification card */}
            <Card>
              <CardContent className="p-5 sm:p-6">
                {/* Firebase invisible reCAPTCHA host (used by OTP send) */}
                {otpFlow && (
                  <div id={FIREBASE_RECAPTCHA_CONTAINER_ID} className="sr-only" aria-hidden="true" />
                )}
                {resuming && !sessionVerified ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2 py-2">
                    <span className="w-4 h-4 border-2 border-muted-foreground/40 border-t-transparent rounded-full animate-spin" />
                    Checking your session…
                  </p>
                ) : sessionVerified ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Verified</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Showing warranty for {verifiedPhone}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => void handleUseAnotherNumber()}
                    >
                      Check another number
                    </Button>
                  </div>
                ) : (
                <form onSubmit={handleDirectSearch} className="space-y-4">
                  <label htmlFor="warranty-phone" className="block text-sm font-medium">
                    Registered mobile number
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="warranty-phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="Enter 10-digit mobile number"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        disabled={otpFlow && otpSent}
                        className="pl-9 h-12 text-base"
                      />
                    </div>
                    {!otpFlow ? (
                      <Button
                        type="submit"
                        disabled={!phoneValid || busy}
                        className="h-12 px-6 bg-sky-600 hover:bg-sky-700 text-white"
                      >
                        {state === 'loading' ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Checking...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Search className="w-4 h-4" />
                            Check warranty
                          </span>
                        )}
                      </Button>
                    ) : !otpSent ? (
                      <Button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={!phoneValid || busy}
                        className="h-12 px-6 bg-sky-600 hover:bg-sky-700 text-white"
                      >
                        {otpSending ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Send OTP
                          </span>
                        )}
                      </Button>
                    ) : null}
                  </div>

                  {phone.length > 0 && !phoneValid && (
                    <p className="text-xs text-amber-600">
                      Enter a valid 10-digit Indian mobile number (starting 6–9).
                    </p>
                  )}

                  {/* OTP entry */}
                  {otpFlow && otpSent && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Lock className="w-4 h-4 text-sky-600" />
                        Enter the 6-digit OTP sent to {phoneDigits}
                      </p>
                      <InputOTP
                        maxLength={6}
                        inputMode="numeric"
                        pattern={REGEXP_ONLY_DIGITS}
                        value={otpCode}
                        disabled={otpVerifying}
                        onChange={setOtpCode}
                        containerClassName="w-full"
                      >
                        <InputOTPGroup className="w-full justify-between gap-1.5 sm:gap-3">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-12 flex-1 rounded-md border border-input bg-background text-lg font-semibold shadow-sm sm:h-14 sm:text-xl"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                      <Button
                        type="button"
                        onClick={handleVerifyAndSearch}
                        disabled={otpCode.length < 6 || busy}
                        className="w-full h-11 bg-sky-600 hover:bg-sky-700 text-white"
                      >
                        {otpVerifying || state === 'loading' ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Verifying...
                          </span>
                        ) : (
                          'Verify & check warranty'
                        )}
                      </Button>
                      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          Didn't get it?
                          <button
                            type="button"
                            className="font-medium text-sky-600 dark:text-sky-400 underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline"
                            onClick={handleSendOtp}
                            disabled={busy || otpResendRemaining > 0}
                          >
                            {otpResendRemaining > 0
                              ? `Resend in ${otpResendRemaining}s`
                              : otpSending
                                ? 'Sending…'
                                : 'Resend OTP'}
                          </button>
                        </span>
                        <button
                          type="button"
                          className="font-medium text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode('');
                            setOtpError('');
                            setOtpResendAt(0);
                            resetBookingOtpSession();
                          }}
                        >
                          Change number
                        </button>
                      </div>
                    </div>
                  )}

                  {otpError && <p className="text-xs text-red-600">{otpError}</p>}

                  <p className="text-xs text-muted-foreground">
                    {otpFlow
                      ? 'We send a one-time code to confirm the number is yours before showing any details.'
                      : 'We only show warranty details for the number you enter.'}
                  </p>
                </form>
                )}
              </CardContent>
            </Card>

            {/* Error */}
            {state === 'error' && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{errorMsg || 'Something went wrong. Please try again.'}</span>
              </div>
            )}

            {/* Not found */}
            {state === 'notfound' && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
                  <p className="font-medium text-foreground">No customer found for this number</p>
                  <p className="text-sm mt-2">
                    We could not find a service record for this mobile number. Use the same number you gave
                    when booking service (primary or alternate). If you think this is a mistake, please contact us.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => window.open('tel:+918884944288', '_self')}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Call support
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {state === 'results' && customer && (
              <div className="space-y-5">
                {/* Customer summary */}
                <Card>
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-lg font-semibold truncate">{customer.name || '—'}</p>
                          {amc?.active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              <BadgeCheck className="h-3 w-3" /> AMC
                            </span>
                          )}
                        </div>
                        {customer.visible_address && (
                          <p className="text-sm text-muted-foreground">{customer.visible_address}</p>
                        )}
                      </div>
                      {customer.customer_id && (
                        <span className="shrink-0 rounded-full bg-sky-100 text-sky-800 px-3 py-1 text-xs font-semibold">
                          {customer.customer_id}
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      {(customer.brand || customer.model) && (
                        <DetailRow label="Unit" value={[customer.brand, customer.model].filter(Boolean).join(' · ')} />
                      )}
                      {customer.address && <DetailRow label="Address" value={customer.address} />}
                      {customer.customer_since && (
                        <DetailRow label="Customer since" value={formatWarrantyDate(customer.customer_since)} />
                      )}
                      {customer.installation_date && (
                        <DetailRow label="Installed on" value={formatWarrantyDate(customer.installation_date)} />
                      )}
                      {customer.last_service_date && (
                        <DetailRow label="Last service" value={formatWarrantyDate(customer.last_service_date)} />
                      )}
                    </dl>
                  </CardContent>
                </Card>

                {/* AMC banner */}
                {amc?.active && (
                  <Card className="border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20">
                    <CardContent className="p-4 sm:p-5 flex items-start gap-3">
                      <BadgeCheck className="w-6 h-6 text-indigo-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-indigo-900 dark:text-indigo-200">
                          Covered under AMC
                        </p>
                        <p className="text-sm text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                          You have an active Annual Maintenance Contract
                          {amc.end_date ? ` valid till ${formatWarrantyDate(amc.end_date)}` : ''}. Services
                          and covered parts are provided as agreed in your AMC agreement.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {warranties.length > 0 ? (
                  warranties.map((w) => <WarrantyCard key={w.id} warranty={w} />)
                ) : amc?.active ? null : (
                  <Card>
                    <CardContent className="p-5 sm:p-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">No specific warranty on record</p>
                          <p className="text-sm text-muted-foreground mt-1">{GENERAL_WARRANTY_POLICY}</p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Terms &amp; conditions
                        </p>
                        <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                          {GENERAL_WARRANTY_TERMS.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-foreground break-words">{value}</dd>
  </div>
);

const WarrantyCard: React.FC<{ warranty: PublicWarranty }> = ({ warranty }) => {
  // Header status uses the latest COVERED item end date (or the warranty end date).
  const coveredItems = warranty.items.filter((it) => it.covered !== false);
  const overallEnd =
    coveredItems.length > 0
      ? coveredItems.reduce((max, it) => (it.end_date > max ? it.end_date : max), coveredItems[0].end_date)
      : warranty.end_date;
  const overall = warrantyStatus(overallEnd);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-600" />
            <div>
              <p className="font-semibold">Warranty</p>
              <p className="text-xs text-muted-foreground">
                From {formatWarrantyDate(warranty.start_date)}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${overall.toneClass}`}>
            {overall.label}
          </span>
        </div>

        {warranty.items.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Covered until <span className="font-medium text-foreground">{formatWarrantyDate(warranty.end_date)}</span>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {warranty.items.map((it) => {
              const cat = categoryDef(it.category);
              const notCovered = it.covered === false;
              const st = warrantyStatus(it.end_date);
              // Hide the category badge when the label is just the category name (no new info).
              const showBadge = it.label.trim().toLowerCase() !== cat.label.toLowerCase();
              return (
                <div key={it.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium truncate ${notCovered ? 'text-muted-foreground' : ''}`}>
                        {it.label}
                      </span>
                      {showBadge && (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cat.badgeClass}`}>
                          {cat.label}
                        </span>
                      )}
                    </div>
                    {!notCovered && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Until {formatWarrantyDate(it.end_date)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium">
                    {notCovered ? (
                      <>
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Not covered</span>
                      </>
                    ) : (
                      <>
                        {st.active ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={st.active ? 'text-emerald-700' : 'text-red-600'}>{st.label}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {warranty.notes && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Terms & conditions
            </p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{warranty.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Warranty;
