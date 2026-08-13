import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import {
  CheckCircle2,
  FileWarning,
  Loader2,
  Lock,
  ShieldCheck,
  Upload,
  X,
  AlertTriangle,
  CircleHelp,
  MessageCircle,
  Keyboard,
  FileUp,
} from 'lucide-react';
import Header from '@/components/Header';
import AltchaWidget from '@/components/AltchaWidget';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { cn } from '@/lib/utils';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  buildVerifyWhatsAppUrl,
  clearAuthSession,
  formatBytes,
  formatWaDisplay,
  getAuthenticityWhatsAppE164,
  hashAndCheckPdfFile,
  loadAuthSession,
  verifyAuthenticityOtp,
  type PublicAuthCheckResult,
  type StoredAuthSession,
} from '@/lib/publicPdfAuthenticity';

type UnlockState = 'locked' | 'unlocking' | 'unlocked';

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
          Tap the green <strong>Open WhatsApp</strong> button on this page. It opens a chat to{' '}
          <strong>{waDisplay}</strong> with the word <strong>VERIFY</strong> already typed.
        </>
      ),
    },
    {
      icon: WhatsAppIcon,
      title: 'Send the message',
      detail: (
        <>
          In WhatsApp, tap <strong>Send</strong>. Do not change the word — it must be exactly{' '}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold">
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
          Wait a few seconds. You will get a reply like{' '}
          <em>“Your authenticity code is 123456”</em>. Remember those <strong>6 numbers</strong>{' '}
          (they work for 5 minutes only).
        </>
      ),
    },
    {
      icon: Lock,
      title: 'Come back and unlock',
      detail: (
        <>
          Return to this page. Type your <strong>same WhatsApp mobile number</strong> (10 digits)
          and the <strong>6-digit code</strong>, then tap <strong>Unlock verification</strong>.
        </>
      ),
    },
    {
      icon: FileUp,
      title: 'Upload your PDF',
      detail: (
        <>
          Tap <strong>Choose PDF</strong> and pick the document we sent you. The file stays on your
          phone — we only check a fingerprint. You will see <strong>Authentic</strong> or{' '}
          <strong>Not authentic</strong>.
        </>
      ),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl border-slate-200 p-0 sm:mx-auto sm:max-w-lg"
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <SheetHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 pb-4 pt-4 text-left">
          <SheetTitle className="text-xl">How to verify — easy steps</SheetTitle>
          <SheetDescription className="text-[15px] leading-relaxed text-slate-600">
            Follow these steps one by one. It takes about one minute.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <ol className="space-y-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                        isEleven ? 'bg-emerald-600' : 'bg-sky-700'
                      )}
                    >
                      {i + 1}
                    </span>
                    <Icon className="mt-1 h-4 w-4 text-slate-400" aria-hidden />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[15px] font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 mb-2 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] active:scale-[0.99]"
            onClick={() => onOpenChange(false)}
          >
            <WhatsAppIcon className="h-5 w-5 shrink-0 text-white" />
            Start now — open WhatsApp
          </a>
          <p className="pb-6 text-center text-xs text-slate-500">
            Tip: use the same phone number on WhatsApp and on this page.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PublicPdfAuthenticityPage() {
  const siteKey = getPublicSiteKey();
  const waE164 = getAuthenticityWhatsAppE164();
  const waDisplay = formatWaDisplay(waE164);
  const waUrl = buildVerifyWhatsAppUrl(waE164);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const altchaTokenRef = useRef('');
  const altchaPayloadRef = useRef<string | undefined>(undefined);
  const dragDepth = useRef(0);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [unlockState, setUnlockState] = useState<UnlockState>('locked');
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [unlockError, setUnlockError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<PublicAuthCheckResult | null>(null);
  const [checkError, setCheckError] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const phoneValid = phoneDigits.length === 10 && /^[6-9]/.test(phoneDigits);
  const otpValid = otp.replace(/\D/g, '').length === 6;
  const isEleven = siteKey === 'elevenro';

  useEffect(() => {
    const existing = loadAuthSession();
    if (existing) {
      setSession(existing);
      setUnlockState('unlocked');
      if (existing.phone) setPhone(existing.phone);
    }
  }, []);

  const handleAltchaVerify = useCallback(
    (ok: boolean, payload?: string, loginToken?: string) => {
      if (!ok) return;
      altchaTokenRef.current = loginToken || '';
      altchaPayloadRef.current = payload;
    },
    []
  );

  const handleUnlock = async () => {
    setUnlockError('');
    if (!phoneValid || !otpValid) {
      setUnlockError('Enter your 10-digit WhatsApp number and the 6-digit code.');
      return;
    }
    setUnlockState('unlocking');
    const res = await verifyAuthenticityOtp({
      phone: phoneDigits,
      otp: otp.replace(/\D/g, ''),
      altchaLoginToken: altchaTokenRef.current || undefined,
      altchaPayload: altchaPayloadRef.current,
    });
    if (!res.ok) {
      setUnlockError(res.error);
      setUnlockState('locked');
      return;
    }
    setSession(res.session);
    setUnlockState('unlocked');
    setOtp('');
  };

  const handleLock = () => {
    clearAuthSession();
    setSession(null);
    setUnlockState('locked');
    setResult(null);
    setCheckError('');
    setSelectedFile(null);
  };

  const runFileCheck = useCallback(
    async (file: File) => {
      if (!session?.sessionToken) return;
      setSelectedFile(file);
      setBusy(true);
      setResult(null);
      setCheckError('');
      try {
        const out = await hashAndCheckPdfFile(file, session.sessionToken);
        if (!out.ok) {
          setCheckError(out.error);
          if (/session/i.test(out.error)) handleLock();
          return;
        }
        setResult(out.result);
      } finally {
        setBusy(false);
      }
    },
    [session?.sessionToken]
  );

  const onPickFiles = (list: FileList | File[] | null) => {
    const file = list?.[0];
    if (!file) return;
    void runFileCheck(file);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    onPickFiles(e.dataTransfer?.files || null);
  };

  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col text-slate-900 antialiased',
        isEleven
          ? 'bg-[radial-gradient(120%_80%_at_50%_-10%,#ecfdf5_0%,#f8fafc_45%,#f1f5f9_100%)]'
          : 'bg-[radial-gradient(120%_80%_at_50%_-10%,#e0f2fe_0%,#f8fafc_45%,#f1f5f9_100%)]'
      )}
    >
      <Header />

      <main className="relative z-0 mx-auto w-full max-w-lg flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <div className="mb-7 text-center sm:mb-9">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5',
              isEleven ? 'bg-emerald-600 text-white' : 'bg-sky-700 text-white'
            )}
          >
            <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Document authenticity
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-slate-600 sm:text-[15px]">
            Confirm a PDF was issued by us. No customer address or email is collected here.
          </p>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className={cn(
              'mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold shadow-sm transition active:scale-[0.99]',
              isEleven
                ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                : 'border-sky-200 text-sky-800 hover:bg-sky-50'
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

        {unlockState !== 'unlocked' ? (
          <section className="relative space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:p-7">
              <ol className="space-y-3.5">
                {[
                  <>
                    WhatsApp <span className="font-semibold text-slate-900">{waDisplay}</span> and
                    send{' '}
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-wide text-slate-800">
                      VERIFY
                    </span>
                  </>,
                  <>Enter that WhatsApp number and the 6-digit code (valid 5 minutes).</>,
                  <>Upload the PDF. Hashing stays on your device — only the hash is checked.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-600">
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
                  'mt-4 w-full cursor-pointer text-left text-sm font-medium underline-offset-2 hover:underline',
                  isEleven ? 'text-emerald-700' : 'text-sky-700'
                )}
              >
                Confused? Open the full picture guide →
              </button>

              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40 focus-visible:ring-offset-2"
              >
                <WhatsAppIcon className="h-5 w-5 shrink-0 text-white" />
                Open WhatsApp · send VERIFY
              </a>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.22)] backdrop-blur-sm sm:p-7">
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="auth-phone"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    WhatsApp number
                  </label>
                  <Input
                    id="auth-phone"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="h-12 rounded-xl border-slate-200 bg-white text-base shadow-none focus-visible:ring-sky-500/30"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-otp"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Authenticity code
                  </label>
                  <InputOTP
                    id="auth-otp"
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={otp}
                    onChange={setOtp}
                    containerClassName="w-full justify-between gap-1.5 sm:gap-2"
                  >
                    <InputOTPGroup className="flex w-full justify-between gap-1.5 sm:gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-12 w-[14%] min-w-0 flex-1 rounded-xl border-slate-200 text-base first:rounded-xl last:rounded-xl sm:h-12"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <AltchaWidget hidden tokenPurpose="booking" onVerify={handleAltchaVerify} />

                {unlockError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {unlockError}
                  </p>
                )}

                <Button
                  type="button"
                  className={cn(
                    'h-12 w-full cursor-pointer rounded-2xl text-[15px] font-semibold shadow-sm transition active:scale-[0.99]',
                    isEleven
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-sky-800 hover:bg-sky-900'
                  )}
                  disabled={!phoneValid || !otpValid || unlockState === 'unlocking'}
                  onClick={() => void handleUnlock()}
                >
                  {unlockState === 'unlocking' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Unlocking…
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Unlock verification
                    </>
                  )}
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="relative space-y-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm text-slate-600">
                Session active
                {session?.phone ? (
                  <span className="text-slate-400"> · ···{session.phone.slice(-4)}</span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={handleLock}
                className="min-h-10 cursor-pointer rounded-lg px-2 text-sm font-medium text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
              >
                End session
              </button>
            </div>

            <div
              onDragEnter={onDragEnter}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                'rounded-3xl border border-dashed bg-white/85 p-6 text-center shadow-[0_12px_40px_-18px_rgba(15,23,42,0.22)] backdrop-blur-sm transition-colors sm:p-8',
                dragging
                  ? isEleven
                    ? 'border-emerald-500 bg-emerald-50/70'
                    : 'border-sky-500 bg-sky-50/70'
                  : 'border-slate-200/90'
              )}
            >
              <div
                className={cn(
                  'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl',
                  isEleven ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                )}
              >
                <Upload className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900">Upload PDF to verify</p>
              <p className="mt-1 text-sm text-slate-500">
                Drag & drop or choose a file · max 20 MB
              </p>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="secondary"
                className="mt-5 h-11 min-w-[10rem] cursor-pointer rounded-xl px-6"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  'Choose PDF'
                )}
              </Button>
              {selectedFile && (
                <div className="mx-auto mt-4 flex max-w-full items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="truncate font-medium">{selectedFile.name}</span>
                  <span className="shrink-0 text-slate-400">({formatBytes(selectedFile.size)})</span>
                  <button
                    type="button"
                    aria-label="Clear file"
                    className="ml-0.5 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-slate-200/80"
                    onClick={() => {
                      setSelectedFile(null);
                      setResult(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {checkError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {checkError}
              </p>
            )}

            {result && (
              <div
                className={cn(
                  'animate-in fade-in-0 slide-in-from-bottom-2 rounded-3xl border p-5 duration-300 sm:p-6',
                  result.authentic
                    ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-950'
                    : 'border-amber-200/80 bg-amber-50/90 text-amber-950'
                )}
              >
                <div className="flex items-center gap-2.5 text-base font-semibold">
                  {result.authentic ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  ) : (
                    <FileWarning className="h-5 w-5 shrink-0 text-amber-600" />
                  )}
                  {result.authentic ? 'Authentic document' : 'Not authentic'}
                </div>
                {result.authentic ? (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                        Type
                      </dt>
                      <dd className="mt-0.5 font-medium">{result.documentType}</dd>
                    </div>
                    {result.documentRef && (
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                          Reference
                        </dt>
                        <dd className="mt-0.5 break-all font-medium">{result.documentRef}</dd>
                      </div>
                    )}
                    {result.generatedOn && (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                          Generated
                        </dt>
                        <dd className="mt-0.5 font-medium">{result.generatedOn}</dd>
                      </div>
                    )}
                    {result.verifyCode && (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                          Verify code
                        </dt>
                        <dd className="mt-0.5 font-mono text-[15px] font-semibold tracking-wider">
                          {result.verifyCode}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed opacity-90">
                    No matching fingerprint. The file may have been altered, or it was not issued
                    through our system.
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
