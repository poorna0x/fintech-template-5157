import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  OTP_ENABLED,
  FIREBASE_RECAPTCHA_CONTAINER_ID,
  sendBookingOtp,
  verifyBookingOtp,
  resetBookingOtpSession,
} from '@/lib/otp';
import { isFirebaseConfigured } from '@/lib/firebase';

/**
 * Standalone OTP test harness (route: /otp-test).
 * Isolated from the booking flow — exercises Firebase Phone Auth send/verify and
 * shows the resulting ID token so you can confirm OTP works on a deploy without
 * touching the real booking. Safe to leave in; renders nothing useful to bots.
 */
const OtpTest = () => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev].slice(0, 30));

  const onSend = async () => {
    setBusy(true);
    setToken('');
    addLog(`Sending OTP to +91 ${phone} …`);
    const res = await sendBookingOtp(phone);
    if (res.unavailable) addLog('UNAVAILABLE: Firebase not configured.');
    else if (!res.ok) addLog(`SEND FAILED: ${res.error}`);
    else {
      setSent(true);
      addLog('OTP sent. Check SMS.');
    }
    setBusy(false);
  };

  const onVerify = async () => {
    setBusy(true);
    addLog(`Verifying code ${otp} …`);
    const res = await verifyBookingOtp(otp);
    if (res.unavailable) addLog('UNAVAILABLE: Firebase not configured.');
    else if (!res.verified) addLog(`VERIFY FAILED: ${res.error}`);
    else {
      setToken(res.phoneToken || '');
      addLog('VERIFIED ✔ — Firebase ID token received.');
    }
    setBusy(false);
  };

  const onReset = () => {
    resetBookingOtpSession();
    setSent(false);
    setOtp('');
    setToken('');
    addLog('Session reset.');
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-semibold">OTP Test Harness</h1>
          <p className="text-sm text-muted-foreground">
            Isolated from booking. Route: <code>/otp-test</code>
          </p>
        </div>

        <div className="rounded-lg border p-3 text-xs space-y-1">
          <div>
            <strong>OTP_ENABLED:</strong> {String(OTP_ENABLED)}
          </div>
          <div>
            <strong>Firebase configured:</strong> {String(isFirebaseConfigured())}
          </div>
          <div>
            <strong>Host:</strong> {typeof window !== 'undefined' ? window.location.hostname : '—'}
          </div>
        </div>

        {/* Firebase invisible reCAPTCHA renders inside here */}
        <div id={FIREBASE_RECAPTCHA_CONTAINER_ID} className="sr-only" aria-hidden="true" />

        <div className="space-y-2">
          <Label htmlFor="otp-test-phone">Phone (10 digits)</Label>
          <Input
            id="otp-test-phone"
            inputMode="numeric"
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
          <Button onClick={onSend} disabled={busy || phone.length !== 10} className="w-full">
            {busy ? 'Working…' : sent ? 'Resend code' : 'Send code'}
          </Button>
        </div>

        {sent && (
          <div className="space-y-2">
            <Label htmlFor="otp-test-code">Code</Label>
            <Input
              id="otp-test-code"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            <div className="flex gap-2">
              <Button onClick={onVerify} disabled={busy || otp.length < 4} className="flex-1">
                Verify
              </Button>
              <Button onClick={onReset} variant="outline" disabled={busy}>
                Reset
              </Button>
            </div>
          </div>
        )}

        {token && (
          <div className="rounded-lg border p-3 space-y-1">
            <div className="text-xs font-semibold text-green-600">Phone verified ✔</div>
            <div className="text-[10px] break-all text-muted-foreground">
              {token.slice(0, 60)}…
            </div>
          </div>
        )}

        <div className="rounded-lg border p-3">
          <div className="text-xs font-semibold mb-1">Log</div>
          <div className="space-y-1 text-[11px] font-mono text-muted-foreground max-h-64 overflow-auto">
            {log.length === 0 ? <div>—</div> : log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OtpTest;
