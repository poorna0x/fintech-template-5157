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
import AltchaWidget from '@/components/AltchaWidget';
import { toast } from 'sonner';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const PrivacyDataRequestPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const brand = getPublicSiteKey() === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const [requestType, setRequestType] = useState('access');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [altcha, setAltcha] = useState('');
  const [altchaOk, setAltchaOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10 && !email.trim()) {
      toast.error('Enter a 10-digit mobile number or an email');
      return;
    }
    if (phoneDigits && phoneDigits.length !== 10) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    if (!altchaOk || !altcha) {
      toast.error('Wait for the security check to finish, then submit');
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
          altcha,
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
      setAltcha('');
      setAltchaOk(false);
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
            . We may verify your phone before sharing personal data (same idea as authenticity
            checks) — that is allowed and recommended under Indian privacy law.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit a request</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                {/* Honeypot — hidden from people, bots often fill it */}
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
                  <Label htmlFor="pr-phone">Phone</Label>
                  <Input
                    id="pr-phone"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pr-email">Email (optional if phone given)</Label>
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
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Quick anti-spam check (no CAPTCHA typing). Wait until it finishes before
                    submit.
                  </p>
                  <AltchaWidget
                    tokenPurpose="booking"
                    onVerify={(ok, payload) => {
                      setAltchaOk(Boolean(ok && payload));
                      setAltcha(ok && payload ? payload : '');
                    }}
                  />
                </div>
                <Button type="submit" disabled={submitting || !altchaOk} className="w-full">
                  {submitting ? 'Submitting…' : altchaOk ? 'Submit request' : 'Waiting for security check…'}
                </Button>
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
