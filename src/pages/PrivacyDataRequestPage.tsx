import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleHelp,
  ClipboardList,
  Keyboard,
  Lock,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import AltchaWidget from '@/components/AltchaWidget';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { toast } from 'sonner';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { cn } from '@/lib/utils';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  buildVerifyWhatsAppUrl,
  formatWaDisplay,
  getAuthenticityWhatsAppE164,
  loadAuthSession,
  verifyAuthenticityOtp,
} from '@/lib/publicPdfAuthenticity';

function HowToGuideSheet({
  open,
  onOpenChange,
  waDisplay,
  waUrl,
  isEleven,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waDisplay: string;
  waUrl: string;
  isEleven: boolean;
}) {
  const steps = [
    {
      icon: MessageCircle,
      title: 'Open WhatsApp',
      detail: (
        <>
          Tap the green <strong>Open WhatsApp</strong> button. It opens a chat to{' '}
          <strong>{waDisplay}</strong> with <strong>VERIFY</strong> already typed.
        </>
      ),
    },
    {
      icon: WhatsAppIcon,
      title: 'Send the message',
      detail: (
        <>
          Tap <strong>Send</strong>. Do not change the word — it must be exactly{' '}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
            VERIFY
          </span>
          .
        </>
      ),
    },
    {
      icon: Keyboard,
      title: 'Copy the 6-digit code',
      detail: (
        <>
          Wait a few seconds for a reply with a <strong>6-digit code</strong> (valid about 5
          minutes).
        </>
      ),
    },
    {
      icon: Lock,
      title: 'Verify on this page',
      detail: (
        <>
          Enter the <strong>same WhatsApp number</strong> and the code, then tap{' '}
          <strong>Verify WhatsApp number</strong>.
        </>
      ),
    },
    {
      icon: ClipboardList,
      title: 'Submit your privacy request',
      detail: (
        <>
          Choose the request type, add details, and submit. We aim to respond within{' '}
          <strong>72 hours</strong>.
        </>
      ),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl p-0 sm:mx-auto sm:max-w-lg"
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
        <SheetHeader className="shrink-0 space-y-1 border-b px-5 pb-4 pt-4 text-left">
          <SheetTitle className="text-xl">How to verify — easy steps</SheetTitle>
          <SheetDescription className="text-[15px] leading-relaxed">
            Same WhatsApp VERIFY flow as PDF authenticity. Takes about one minute.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <ol className="space-y-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3 rounded-2xl border bg-muted/40 p-3.5">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                        isEleven ? 'bg-emerald-600' : 'bg-sky-700'
                      )}
                    >
                      {i + 1}
                    </span>
                    <Icon className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[15px] font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1ebe57]"
            onClick={() => onOpenChange(false)}
          >
            <WhatsAppIcon className="h-5 w-5 shrink-0 text-white" />
            Start now — open WhatsApp
          </a>
          <p className="pb-6 text-center text-xs text-muted-foreground">
            Tip: use the same phone number on WhatsApp and on this page.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PrivacyDataRequestPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const siteKey = getPublicSiteKey();
  const brand = siteKey === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const isEleven = siteKey === 'elevenro';
  const waE164 = getAuthenticityWhatsAppE164();
  const waUrl = buildVerifyWhatsAppUrl(waE164);
  const waDisplay = formatWaDisplay(waE164);

  const altchaTokenRef = useRef('');
  const altchaPayloadRef = useRef<string | undefined>(undefined);

  const [requestType, setRequestType] = useState('access');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');
  const [submittedType, setSubmittedType] = useState('');

  useEffect(() => {
    const existing = loadAuthSession();
    if (existing?.sessionToken && existing.phone) {
      setSessionToken(existing.sessionToken);
      setPhone(existing.phone);
      setPhoneVerified(true);
    }
  }, []);

  const handleAltchaVerify = useCallback((ok: boolean, payload?: string, loginToken?: string) => {
    if (!ok) return;
    altchaTokenRef.current = loginToken || '';
    altchaPayloadRef.current = payload;
  }, []);

  const phoneDigits = phone.replace(/\D/g, '').slice(0, 10);
  const phoneValid = phoneDigits.length === 10 && /^[6-9]/.test(phoneDigits);
  const otpValid = otp.replace(/\D/g, '').length === 6;

  async function onVerifyPhone() {
    setVerifyError('');
    if (!phoneValid || !otpValid) {
      setVerifyError('Enter your 10-digit WhatsApp number and the 6-digit code.');
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await verifyAuthenticityOtp({
        phone: phoneDigits,
        otp: otp.replace(/\D/g, ''),
        altchaLoginToken: altchaTokenRef.current || undefined,
        altchaPayload: altchaPayloadRef.current,
      });
      if (!res.ok) {
        setVerifyError(res.error);
        toast.error(res.error);
        return;
      }
      setSessionToken(res.session.sessionToken);
      setPhoneVerified(true);
      setOtp('');
      toast.success('WhatsApp number verified');
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneVerified || !sessionToken || !phoneValid) {
      toast.error('Verify your WhatsApp number first');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/privacy-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType,
          brand,
          name,
          phone: phoneDigits,
          email,
          details,
          sessionToken,
          website: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data.error || 'Could not submit request'));
        return;
      }
      toast.success(String(data.message || 'Request received. We aim to respond within 72 hours.'));
      setSubmittedRef(String(data.id || ''));
      setSubmittedType(requestType);
      setSubmitted(true);
      setDetails('');
    } catch {
      toast.error('Network error — try again');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-xl">
            <Card className="overflow-hidden border-emerald-200/80 shadow-none">
              <CardContent className="space-y-4 p-6 sm:p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Request received</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Thanks{name.trim() ? `, ${name.trim()}` : ''}. We got your{' '}
                    <span className="font-medium text-foreground">
                      {submittedType.replace(/_/g, ' ')}
                    </span>{' '}
                    request for WhatsApp <span className="font-medium text-foreground">{phoneDigits}</span>.
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm space-y-1.5">
                  <p>
                    We aim to <strong>acknowledge within 72 hours</strong> and resolve within 30 days
                    where required.
                  </p>
                  {submittedRef ? (
                    <p className="text-muted-foreground text-xs">
                      Reference: <span className="font-mono">{submittedRef.slice(0, 8)}…</span>
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    We may contact you on the verified WhatsApp number if we need more details.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    to="/"
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Back to home
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSubmitted(false);
                      setSubmittedRef('');
                      setPhoneVerified(true);
                    }}
                  >
                    Submit another request
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Policy:{' '}
                  <Link to="/privacy-policy" className="underline underline-offset-2">
                    Privacy Policy
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-xl space-y-6">
          <div>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Privacy &amp; data request</h1>
            <p className="text-muted-foreground text-sm">
              Access, correction, deletion, consent withdrawal, or a privacy grievance. See our{' '}
              <Link to="/privacy-policy" className="text-primary underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className={cn(
                'mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline',
                isEleven ? 'text-emerald-700' : 'text-sky-700'
              )}
            >
              <CircleHelp className="h-4 w-4" />
              How to verify — step by step
            </button>
          </div>

          <HowToGuideSheet
            open={guideOpen}
            onOpenChange={setGuideOpen}
            waDisplay={waDisplay}
            waUrl={waUrl}
            isEleven={isEleven}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit a request</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                  <Label htmlFor="pr-website">Website</Label>
                  <Input
                    id="pr-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {/* Hidden ALTCHA — runs in background like /authenticity */}
                <AltchaWidget hidden tokenPurpose="booking" onVerify={handleAltchaVerify} />

                {!phoneVerified ? (
                  <div className="space-y-5">
                    <ol className="space-y-3.5">
                      {[
                        <>
                          WhatsApp <span className="font-semibold">{waDisplay}</span> and send{' '}
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-wide">
                            VERIFY
                          </span>
                        </>,
                        <>Enter that WhatsApp number and the 6-digit code (valid 5 minutes).</>,
                        <>Then choose your request type and submit.</>,
                      ].map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                              isEleven ? 'bg-emerald-600' : 'bg-sky-700'
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>

                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className={cn(
                        'w-full cursor-pointer text-left text-sm font-medium underline-offset-2 hover:underline',
                        isEleven ? 'text-emerald-700' : 'text-sky-700'
                      )}
                    >
                      Confused? Open the full picture guide →
                    </button>

                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1ebe57]"
                    >
                      <WhatsAppIcon className="h-5 w-5 shrink-0 text-white" />
                      Open WhatsApp · send VERIFY
                    </a>

                    <div className="space-y-2">
                      <Label htmlFor="pr-phone">WhatsApp number</Label>
                      <Input
                        id="pr-phone"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={phoneDigits}
                        onChange={(e) => {
                          setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                          setPhoneVerified(false);
                          setSessionToken('');
                          setVerifyError('');
                        }}
                        placeholder="10-digit mobile"
                        className="h-12"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>6-digit code</Label>
                      <InputOTP
                        maxLength={6}
                        pattern={REGEXP_ONLY_DIGITS}
                        value={otp}
                        onChange={(v) => {
                          setOtp(v);
                          setVerifyError('');
                        }}
                        containerClassName="w-full justify-between gap-1.5"
                      >
                        <InputOTPGroup className="flex w-full justify-between gap-1.5">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-12 w-[14%] min-w-0 flex-1 rounded-xl"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    {verifyError ? (
                      <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                        {verifyError}
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      className="w-full h-12"
                      disabled={!phoneValid || !otpValid || verifyingOtp}
                      onClick={() => void onVerifyPhone()}
                    >
                      {verifyingOtp ? 'Verifying…' : 'Verify WhatsApp number'}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
                    Verified WhatsApp · {phoneDigits}{' '}
                    <button
                      type="button"
                      className="ml-2 underline underline-offset-2"
                      onClick={() => {
                        setPhoneVerified(false);
                        setSessionToken('');
                        setOtp('');
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}

                {phoneVerified ? (
                  <>
                    <div className="space-y-2">
                      <Label>Request type</Label>
                      <Select value={requestType} onValueChange={setRequestType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="access">Access / copy of my data</SelectItem>
                          <SelectItem value="correction">Correct my information</SelectItem>
                          <SelectItem value="erasure">Delete / erase (where applicable)</SelectItem>
                          <SelectItem value="withdraw_consent">Withdraw optional consent</SelectItem>
                          <SelectItem value="grievance">Privacy grievance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-name">Name</Label>
                      <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-email">Email (optional)</Label>
                      <Input
                        id="pr-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-details">Details</Label>
                      <Textarea
                        id="pr-details"
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        rows={4}
                        placeholder="What should we look up or change?"
                      />
                    </div>
                    <Button type="submit" disabled={submitting} className="w-full h-12">
                      {submitting ? 'Submitting…' : 'Submit request'}
                    </Button>
                  </>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyDataRequestPage;
