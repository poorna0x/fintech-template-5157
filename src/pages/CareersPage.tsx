import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
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

const facts = [
  ['Pay', '₹10,000 basic salary + 10% of the eligible customer bill'],
  ['Minimum', '₹20,000 total after 25 working days. That figure is not the basic salary.'],
  ['With more jobs', 'Earnings can reach about ₹40,000 a month, depending on the work'],
  ['Training', '15 days paid training'],
  ['Also included', 'Shared stay, fuel support, dinner, and 4 days off a month'],
  ['Tools', 'We provide the service bag. It weighs about 5–10 kg'],
];

const fieldNotes = [
  'Your own 2-wheeler and a valid driving licence',
  'Regular travel to customer homes across Bengaluru',
  'Comfortable carrying the service bag',
  'Ready to start from 9:00 AM. Hours follow the day’s bookings',
];

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const controlClass =
  'h-12 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
  const [fieldWorkOk, setFieldWorkOk] = useState(false);
  const [note, setNote] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!fullName.trim() || !phone.trim() || !area.trim() || !experience || !education) {
      setError('Fill in name, phone, area, experience, and background.');
      return;
    }
    if (hasTwoWheeler === null || hasLicence === null) {
      setError('Tell us if you have a 2-wheeler and a driving licence.');
      return;
    }
    if (!fieldWorkOk) {
      setError('Confirm you are comfortable with field work and the service bag.');
      return;
    }
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
          fieldWorkOk,
          note,
          brand: applyBrand,
          company_website: companyWebsite,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) {
        setError(data.error || 'Could not send the application. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not send the application. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Careers</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Service Technician
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            RO and water purifier installation, service, and repair at customer homes in Bengaluru.
            Freshers and experienced candidates can apply. Full-time.
          </p>

          {loadState === 'loading' ? (
            <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {loadState === 'error' ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-5">
              <p className="text-base font-medium text-foreground">This page could not load.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Check your connection and refresh. For a service visit, you can still book online.
              </p>
              <Link to="/book" onClick={() => markWebsiteBookDoor()} className="mt-4 inline-block">
                <Button type="button" className="h-11 rounded-xl bg-sky-700 text-white hover:bg-sky-800">
                  Book a service
                </Button>
              </Link>
            </div>
          ) : null}

          {loadState === 'closed' ? (
            <div className="mt-8 rounded-2xl border border-border bg-card px-5 py-8 text-center">
              <h2 className="text-xl font-semibold text-foreground">
                We are not looking for new hires right now
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                When a technician opening comes up, it will be on this page. If you need an RO
                service, book a visit instead.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link to="/book" onClick={() => markWebsiteBookDoor()}>
                  <Button type="button" className="h-11 w-full rounded-xl bg-sky-700 text-white hover:bg-sky-800 sm:w-auto">
                    Book a service
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button type="button" variant="outline" className="h-11 w-full rounded-xl sm:w-auto">
                    Contact
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          {loadState === 'open' ? (
            <>
              <section className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  The role
                </h2>
                <dl className="mt-3 space-y-3">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                      <dd className="text-sm leading-relaxed text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Before you apply
                </h2>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
                  {fieldNotes.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  ITI, diploma, or another technical background is welcome. It is not required.
                  A commitment of about a year is preferred.
                </p>
              </section>

              <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                {sent ? (
                  <div className="py-6 text-center">
                    <h2 className="text-xl font-semibold text-foreground">Application sent</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Thank you. We will contact you if there is a fit for the team.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-4" noValidate>
                    <h2 className="text-lg font-semibold text-foreground">Apply</h2>
                    <Field label="Full name">
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        className="h-12 rounded-xl text-base"
                        maxLength={80}
                        required
                      />
                    </Field>
                    <Field label="Mobile number">
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="numeric"
                        autoComplete="tel"
                        className="h-12 rounded-xl text-base"
                        placeholder="10-digit mobile"
                        maxLength={14}
                        required
                      />
                    </Field>
                    <Field label="Email (optional)">
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        autoComplete="email"
                        className="h-12 rounded-xl text-base"
                        maxLength={120}
                      />
                    </Field>
                    <Field label="Area in Bengaluru">
                      <Input
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="h-12 rounded-xl text-base"
                        placeholder="Where you live"
                        maxLength={80}
                        required
                      />
                    </Field>
                    <Field label="Experience">
                      <select
                        value={experience}
                        onChange={(e) => setExperience(e.target.value as 'fresher' | 'experienced' | '')}
                        className={controlClass}
                        required
                      >
                        <option value="">Select</option>
                        <option value="fresher">Fresher</option>
                        <option value="experienced">Experienced</option>
                      </select>
                    </Field>
                    {experience === 'experienced' ? (
                      <Field label="What work have you done?">
                        <Input
                          value={experienceDetail}
                          onChange={(e) => setExperienceDetail(e.target.value)}
                          className="h-12 rounded-xl text-base"
                          maxLength={160}
                        />
                      </Field>
                    ) : null}
                    <Field label="Background">
                      <select
                        value={education}
                        onChange={(e) => setEducation(e.target.value)}
                        className={controlClass}
                        required
                      >
                        <option value="">Select</option>
                        {EDUCATION.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <YesNo
                      label="Do you have your own 2-wheeler?"
                      value={hasTwoWheeler}
                      onChange={setHasTwoWheeler}
                    />
                    <YesNo
                      label="Do you have a valid driving licence?"
                      value={hasLicence}
                      onChange={setHasLicence}
                    />
                    <label className="flex items-start gap-3 rounded-xl border border-border px-3 py-3">
                      <input
                        type="checkbox"
                        checked={fieldWorkOk}
                        onChange={(e) => setFieldWorkOk(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="text-sm leading-relaxed text-foreground">
                        I understand this is field work in Bengaluru, and I am comfortable carrying a
                        5–10 kg service bag.
                      </span>
                    </label>
                    <Field label="Anything else (optional)">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={400}
                        rows={3}
                        className={`${controlClass} h-auto py-3`}
                      />
                    </Field>
                    <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                      <label>
                        Company website
                        <input
                          tabIndex={-1}
                          autoComplete="off"
                          value={companyWebsite}
                          onChange={(e) => setCompanyWebsite(e.target.value)}
                        />
                      </label>
                    </div>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="h-12 w-full rounded-xl bg-sky-700 text-base text-white hover:bg-sky-800"
                    >
                      {submitting ? 'Sending…' : 'Submit application'}
                    </Button>
                  </form>
                )}
              </section>
            </>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
};

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ].map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange(option.value)}
              className={`h-11 rounded-xl border text-sm font-medium ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground'
              }`}
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default CareersPage;
