import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import AltchaWidget from '@/components/AltchaWidget';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { toast } from 'sonner';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  buildVerifyWhatsAppUrl,
  formatWaDisplay,
  getAuthenticityWhatsAppE164,
  loadAuthSession,
  verifyAuthenticityOtp,
} from '@/lib/publicPdfAuthenticity';

const PrivacyDataRequestPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const brand = getPublicSiteKey() === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const waE164 = getAuthenticityWhatsAppE164();
  const waUrl = buildVerifyWhatsAppUrl(waE164);
  const waDisplay = formatWaDisplay(waE164);

  const [requestType, setRequestType] = useState('access');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [altchaPayload, setAltchaPayload] = useState('');
  const [altchaLoginToken, setAltchaLoginToken] = useState('');
  const [altchaOk, setAltchaOk] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const existing = loadAuthSession();
    if (existing?.sessionToken && existing.phone) {
      setSessionToken(existing.sessionToken);
      setPhone(existing.phone);
      setPhoneVerified(true);
    }
  }, []);

  const phoneDigits = phone.replace(/\D/g, '').slice(0, 10);
  const phoneValid = phoneDigits.length === 10;
  const otpValid = otp.replace(/\D/g, '').length === 6;

  async function onVerifyPhone() {
    if (!phoneValid) {
      toast.error('Enter your 10-digit WhatsApp number');
      return;
    }
    if (!otpValid) {
      toast.error('Enter the 6-digit code from WhatsApp');
      return;
    }
    if (!altchaOk) {
      toast.error('Wait for the security check to finish');
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await verifyAuthenticityOtp({
        phone: phoneDigits,
        otp: otp.replace(/\D/g, ''),
        altchaLoginToken: altchaLoginToken || undefined,
        altchaPayload: altchaPayload || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSessionToken(res.session.sessionToken);
      setPhoneVerified(true);
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
      setDetails('');
      setOtp('');
    } catch {
      toast.error('Network error — try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-xl">
          <h1 className="text-3xl font-bold mb-2">Privacy &amp; data request</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Request access, correction, deletion, consent withdrawal, or raise a privacy grievance.
            See our{' '}
            <Link to="/privacy-policy" className="text-primary underline">
              Privacy Policy
            </Link>
            . Phone is verified the same way as PDF authenticity (WhatsApp{' '}
            <span className="font-mono text-xs">VERIFY</span>) so we know it is you.
          </p>
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

                {!phoneVerified ? (
                  <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">
                      1) Open WhatsApp to <strong>{waDisplay}</strong> and send{' '}
                      <span className="font-mono text-xs font-semibold">VERIFY</span>
                      <br />
                      2) Enter that number + the 6-digit code here
                    </p>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1ebe57]"
                    >
                      <WhatsAppIcon className="h-5 w-5 text-white" />
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
                        }}
                        placeholder="10-digit mobile"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>6-digit code</Label>
                      <InputOTP
                        maxLength={6}
                        pattern={REGEXP_ONLY_DIGITS}
                        value={otp}
                        onChange={setOtp}
                        containerClassName="w-full justify-between gap-1.5"
                      >
                        <InputOTPGroup className="flex w-full justify-between gap-1.5">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot key={i} index={i} className="h-11 w-10 sm:w-11" />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Quick anti-spam check</p>
                      <AltchaWidget
                        tokenPurpose="booking"
                        onVerify={(ok, payload, loginToken) => {
                          setAltchaOk(Boolean(ok && (payload || loginToken)));
                          setAltchaPayload(payload || '');
                          setAltchaLoginToken(loginToken || '');
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={!phoneValid || !otpValid || !altchaOk || verifyingOtp}
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
                    <Button type="submit" disabled={submitting} className="w-full">
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
