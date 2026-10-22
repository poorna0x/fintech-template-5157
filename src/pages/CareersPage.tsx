import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Check, Home, Loader2, MapPin } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import AltchaWidget from '@/components/AltchaWidget';
import TurnstileWidget, {
  isTurnstileEnabled,
  type TurnstileWidgetHandle,
} from '@/components/TurnstileWidget';
import { Input } from '@/components/ui/input';
import { markWebsiteBookDoor } from '@/lib/websiteBookingDoor';
import { getBrandSeoProfile } from '@/lib/publicSiteSeo';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';

const EDUCATION = [
  { value: 'iti', label: 'ITI' },
  { value: 'diploma', label: 'Diploma / Polytechnic' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'other', label: 'Other technical background' },
  { value: 'none', label: 'No technical course yet' },
] as const;

type LoadState = 'loading' | 'open' | 'closed' | 'error';
type FieldKey =
  | 'fullName'
  | 'phone'
  | 'email'
  | 'area'
  | 'experience'
  | 'education'
  | 'twoWheeler'
  | 'licence';

const FIELD_ORDER: FieldKey[] = [
  'fullName',
  'phone',
  'email',
  'area',
  'experience',
  'education',
  'twoWheeler',
  'licence',
];

/** Indian mobile: 10 digits starting 6–9. Also accepts 0 or +91 in front. */
function mobileNumberError(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 'Add your mobile number so we can reach you.';
  let ten = digits;
  if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else if (digits.length !== 10) return 'Enter all 10 digits of your mobile number.';
  if (!/^[6-9]\d{9}$/.test(ten)) return 'Indian mobiles start with 6, 7, 8, or 9.';
  return null;
}

function nameError(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return 'Add your name so we know who to call.';
  if (name.length < 2) return 'Add your full name.';
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return 'Use letters for your name.';
  return null;
}

function emailError(raw: string): string | null {
  const email = raw.trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Check the email, or leave it blank.';
  return null;
}

function areaError(raw: string): string | null {
  if (raw.trim().length < 2) return 'Add the city or area where you live.';
  return null;
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28">
      <label className="block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground">
            {label}
            {optional ? null : <span className="text-destructive"> *</span>}
          </span>
          {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
        </span>
        <div className="mt-2">{children}</div>
      </label>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Choice({
  label,
  selected,
  invalid,
  onClick,
}: {
  label: string;
  selected: boolean;
  invalid?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 cursor-pointer rounded-xl border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? 'border-sky-700 bg-sky-700 text-white'
          : invalid
            ? 'border-red-500 bg-red-50 text-foreground'
            : 'border-sky-200 bg-white text-foreground hover:border-sky-700/40'
      }`}
    >
      {label}
    </button>
  );
}

function controlClass(invalid: boolean) {
  return [
    'h-12 w-full rounded-xl border bg-white px-3.5 text-base text-foreground shadow-sm transition-colors',
    'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2',
    invalid
      ? 'border-destructive focus-visible:ring-destructive/40'
      : 'border-sky-200 focus-visible:border-sky-700 focus-visible:ring-sky-700/30',
  ].join(' ');
}

const ROLE_POINTS = [
  { icon: MapPin, title: 'Based in Bengaluru', text: 'Be ready to move here for the job.' },
  { icon: Home, title: 'Stay is provided', text: 'A place to stay comes with the role.' },
  { icon: Bike, title: 'Your own 2-wheeler', text: 'You ride between customer visits.' },
] as const;

function RoleIntro() {
  return (
    <header className="lg:sticky lg:top-6">
      <p className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Careers
      </p>
      <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground">
        Service Technician
      </h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
        A short application. We read every one, and we will call if there is a fit.
      </p>
      <ul className="mt-6 space-y-3">
        {ROLE_POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-sm">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
              <point.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">{point.title}</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{point.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </header>
  );
}

function SectionLabel({ step, title }: { step: string; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-700 text-[11px] font-semibold text-white">
        {step}
      </span>
      {title}
    </h2>
  );
}

const CareersPage = () => {
  const siteKey = getPublicSiteKey();
  const brandName = getBrandSeoProfile(siteKey).brandName;
  const applyBrand = siteKey === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [experience, setExperience] = useState<'fresher' | 'experienced' | ''>('');
  const [experienceDetail, setExperienceDetail] = useState('');
  const [education, setEducation] = useState('');
  const [hasTwoWheeler, setHasTwoWheeler] = useState<boolean | null>(null);
  const [hasLicence, setHasLicence] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [altchaToken, setAltchaToken] = useState('');
  const [altchaPayload, setAltchaPayload] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [sent, setSent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [focusKey, setFocusKey] = useState<FieldKey | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `Service Technician Job in Bengaluru | ${brandName}`;
    return () => {
      document.title = previous;
    };
  }, [brandName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/.netlify/functions/job-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadState('error');
          return;
        }
        setLoadState(data.open === true ? 'open' : 'closed');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const node = document.getElementById(`career-${focusKey}`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    const input = node?.querySelector('input, select, textarea, button');
    if (input instanceof HTMLElement) input.focus();
    setFocusKey(null);
  }, [focusKey]);

  useEffect(() => {
    if (!confirming) return;
    const node = document.getElementById('career-relocate');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [confirming]);

  const touch = (key: FieldKey) => setTouched((prev) => ({ ...prev, [key]: true }));
  const show = (key: FieldKey, message: string | null) =>
    message && (attempted || touched[key]) ? message : '';

  const errors: Partial<Record<FieldKey, string>> = {
    fullName: nameError(fullName) || undefined,
    phone: mobileNumberError(phone) || undefined,
    email: emailError(email) || undefined,
    area: areaError(area) || undefined,
    experience: experience ? undefined : 'Choose fresher or experienced.',
    education: education ? undefined : 'Choose the closest background.',
    twoWheeler: hasTwoWheeler === null ? 'Let us know if you have a 2-wheeler.' : undefined,
    licence: hasLicence === null ? 'Let us know if you have a driving licence.' : undefined,
  };
  const visibleErrors = FIELD_ORDER.filter((key) => show(key, errors[key] || null));
  const missingCount = FIELD_ORDER.filter((key) => errors[key]).length;
  const securityReady = Boolean(altchaToken) && (!isTurnstileEnabled() || Boolean(turnstileToken));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setServerError('');
    setAttempted(true);
    const first = FIELD_ORDER.find((key) => errors[key]);
    if (first) {
      setConfirming(false);
      setFocusKey(first);
      return;
    }
    setConfirming(true);
  };

  const sendApplication = async () => {
    setServerError('');
    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/job-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          fullName,
          phone,
          email,
          area,
          experience,
          experienceDetail,
          education,
          hasTwoWheeler,
          hasLicence,
          note,
          brand: applyBrand,
          company_website: companyWebsite,
          altchaLoginToken: altchaToken,
          altchaPayload,
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setTurnstileToken('');
        turnstileRef.current?.reset();
        setServerError(data.error || 'Could not send the application. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setServerError('Could not send the application. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-background to-background">
      <Header />
      <main className="relative px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(2,132,199,0.16),transparent_68%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12">
          <RoleIntro />
          <div>

          {loadState === 'loading' ? (
            <div className="space-y-3 rounded-3xl border border-border/80 bg-card p-5 shadow-sm" aria-hidden="true">
              <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-12 animate-pulse rounded-xl bg-muted" />
              <div className="h-12 animate-pulse rounded-xl bg-muted" />
              <div className="h-12 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : null}

          {loadState === 'error' ? (
            <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
              <p className="text-base font-medium text-foreground">This page could not load.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Check your connection and refresh. For a service visit, you can still book online.
              </p>
              <Link to="/book" onClick={() => markWebsiteBookDoor()} className="mt-5 inline-block">
                <Button type="button" className="h-11 rounded-xl bg-sky-700 text-white hover:bg-sky-800">
                  Book a service
                </Button>
              </Link>
            </div>
          ) : null}

          {loadState === 'closed' ? (
            <div className="rounded-3xl border border-border/80 bg-card px-6 py-10 text-center shadow-sm">
              <h2 className="text-xl font-semibold text-foreground">
                We are not looking for new hires right now
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                When a technician opening comes up, it will be on this page.
              </p>
              <div className="mt-6 flex justify-center">
                <Link to="/contact">
                  <Button type="button" variant="outline" className="h-11 rounded-xl px-5">
                    Contact
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          {loadState === 'open' ? (
            <section className="rounded-[28px] border border-white bg-white p-4 shadow-[0_24px_60px_-32px_rgba(3,105,161,0.45)] sm:p-7">
              {sent ? (
                <div className="px-2 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-foreground">Application sent</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Thank you. We will contact you if there is a fit for the team.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-8" noValidate>
                  {attempted && missingCount > 0 ? (
                    <p role="status" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-snug text-destructive">
                      {missingCount === 1
                        ? 'One answer still needs a look. It is highlighted below.'
                        : `${missingCount} answers still need a look. They are highlighted below.`}
                    </p>
                  ) : null}

                  <section className="space-y-4">
                    <SectionLabel step="1" title="About you" />
                    <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="career-fullName" label="Full name" error={show('fullName', errors.fullName || null)}>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onBlur={() => touch('fullName')}
                        autoComplete="name"
                        className={controlClass(!!show('fullName', errors.fullName || null))}
                        maxLength={80}
                        aria-invalid={!!show('fullName', errors.fullName || null)}
                        aria-describedby={show('fullName', errors.fullName || null) ? 'career-fullName-error' : undefined}
                      />
                    </Field>
                    <Field id="career-phone" label="Mobile number" error={show('phone', errors.phone || null)}>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={() => touch('phone')}
                        inputMode="numeric"
                        autoComplete="tel"
                        className={controlClass(!!show('phone', errors.phone || null))}
                        placeholder="10-digit mobile"
                        maxLength={16}
                        aria-invalid={!!show('phone', errors.phone || null)}
                        aria-describedby={show('phone', errors.phone || null) ? 'career-phone-error' : undefined}
                      />
                    </Field>
                    <Field
                      id="career-email"
                      label="Email"
                      optional
                      error={show('email', errors.email || null)}
                    >
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => touch('email')}
                        type="email"
                        autoComplete="email"
                        className={controlClass(!!show('email', errors.email || null))}
                        maxLength={120}
                        aria-invalid={!!show('email', errors.email || null)}
                        aria-describedby={show('email', errors.email || null) ? 'career-email-error' : undefined}
                      />
                    </Field>
                    <Field id="career-area" label="Where you live" error={show('area', errors.area || null)}>
                      <Input
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        onBlur={() => touch('area')}
                        autoComplete="address-level2"
                        className={controlClass(!!show('area', errors.area || null))}
                        placeholder="City or area"
                        maxLength={80}
                        aria-invalid={!!show('area', errors.area || null)}
                        aria-describedby={show('area', errors.area || null) ? 'career-area-error' : undefined}
                      />
                    </Field>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionLabel step="2" title="Background" />
                    <div id="career-experience" className="scroll-mt-28">
                      <fieldset>
                        <legend className="text-sm font-medium text-foreground">
                          Experience <span className="text-destructive">*</span>
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Choice
                            label="Fresher"
                            selected={experience === 'fresher'}
                            invalid={!!show('experience', errors.experience || null)}
                            onClick={() => setExperience('fresher')}
                          />
                          <Choice
                            label="Experienced"
                            selected={experience === 'experienced'}
                            invalid={!!show('experience', errors.experience || null)}
                            onClick={() => setExperience('experienced')}
                          />
                        </div>
                      </fieldset>
                      {show('experience', errors.experience || null) ? (
                        <p id="career-experience-error" role="alert" className="mt-1.5 text-sm leading-snug text-destructive">
                          {errors.experience}
                        </p>
                      ) : null}
                    </div>
                    {experience === 'experienced' ? (
                      <Field id="career-experience-detail" label="What work have you done?" optional>
                        <Input
                          value={experienceDetail}
                          onChange={(e) => setExperienceDetail(e.target.value)}
                          className={controlClass(false)}
                          maxLength={160}
                        />
                      </Field>
                    ) : null}
                    <Field id="career-education" label="Background" error={show('education', errors.education || null)}>
                      <select
                        value={education}
                        onChange={(e) => setEducation(e.target.value)}
                        onBlur={() => touch('education')}
                        className={`${controlClass(!!show('education', errors.education || null))} cursor-pointer`}
                        aria-invalid={!!show('education', errors.education || null)}
                        aria-describedby={show('education', errors.education || null) ? 'career-education-error' : undefined}
                      >
                        <option value="">Select</option>
                        {EDUCATION.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </section>

                  <section className="space-y-4">
                    <SectionLabel step="3" title="Getting around" />
                    <YesNo
                      id="career-twoWheeler"
                      label="Do you have your own 2-wheeler?"
                      value={hasTwoWheeler}
                      error={show('twoWheeler', errors.twoWheeler || null)}
                      onChange={setHasTwoWheeler}
                    />
                    <YesNo
                      id="career-licence"
                      label="Do you have a valid driving licence?"
                      value={hasLicence}
                      error={show('licence', errors.licence || null)}
                      onChange={setHasLicence}
                    />
                  </section>

                  <Field id="career-note" label="Anything else" optional>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={400}
                      rows={3}
                      className={`${controlClass(false)} h-auto py-3`}
                    />
                  </Field>

                  <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                    />
                  </div>

                  <AltchaWidget
                    hidden
                    autoStart
                    tokenPurpose="booking"
                    onVerify={(ok, payload, loginToken) => {
                      if (payload) setAltchaPayload(payload);
                      if (loginToken) setAltchaToken(loginToken);
                      if (!ok) {
                        setAltchaToken('');
                        setAltchaPayload('');
                      }
                    }}
                  />
                  {isTurnstileEnabled() ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">Security check</p>
                      <div className="mt-2">
                        <TurnstileWidget
                          ref={turnstileRef}
                          action="job_application"
                          onToken={setTurnstileToken}
                        />
                      </div>
                    </div>
                  ) : null}
                  {serverError && !confirming ? (
                    <p role="alert" className="text-sm leading-snug text-destructive">
                      {serverError}
                    </p>
                  ) : null}

                  {confirming ? (
                    <div
                      id="career-relocate"
                      role="region"
                      aria-label="Before you send"
                      className="scroll-mt-28 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4"
                    >
                      <p className="text-base font-semibold text-foreground">This job is in Bengaluru</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        You should be willing to relocate to Bengaluru. We will provide a place to stay.
                      </p>
                      {serverError ? (
                        <p role="alert" className="mt-3 text-sm leading-snug text-destructive">
                          {serverError}
                        </p>
                      ) : null}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 cursor-pointer rounded-xl"
                          onClick={() => setConfirming(false)}
                          disabled={submitting}
                        >
                          Go back
                        </Button>
                        <Button
                          type="button"
                          className="h-12 cursor-pointer rounded-xl bg-sky-700 text-white hover:bg-sky-800"
                          onClick={sendApplication}
                          disabled={submitting || !securityReady}
                          aria-busy={submitting || !securityReady}
                        >
                          {submitting || !securityReady ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              {submitting ? 'Sending…' : 'Please wait…'}
                            </span>
                          ) : (
                            'Send application'
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="submit"
                      disabled={submitting}
                      aria-busy={!securityReady}
                      className="h-12 w-full cursor-pointer rounded-xl bg-sky-700 text-base font-semibold text-white hover:bg-sky-800"
                    >
                      {!securityReady ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Checking…
                        </span>
                      ) : (
                        'Submit application'
                      )}
                    </Button>
                  )}
                  {visibleErrors.length > 0 ? <span className="sr-only">{visibleErrors.length} fields need attention</span> : null}
                </form>
              )}
            </section>
          ) : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

function YesNo({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  error: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div id={id} className="scroll-mt-28">
      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          {label} <span className="text-destructive">*</span>
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ].map((option) => (
            <Choice
              key={option.label}
              label={option.label}
              selected={value === option.value}
              invalid={!!error}
              onClick={() => onChange(option.value)}
            />
          ))}
        </div>
      </fieldset>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default CareersPage;
