import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Droplets,
  Filter,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Wrench,
} from 'lucide-react';

type ServiceType = 'RO' | 'SOFTENER';
type TimeSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

interface PrototypeForm {
  serviceType: ServiceType | '';
  service: string;
  description: string;
  address: string;
  flatDetails: string;
  serviceDate: string;
  timeSlot: TimeSlot | '';
  fullName: string;
  phone: string;
  email: string;
}

const STEPS = [
  { id: 1, title: 'Service', short: 'What you need' },
  { id: 2, title: 'Details', short: 'Tell us more' },
  { id: 3, title: 'Location', short: 'Where to come' },
  { id: 4, title: 'Schedule', short: 'Pick a slot' },
  { id: 5, title: 'Contact', short: 'Your details' },
  { id: 6, title: 'Review', short: 'Confirm' },
] as const;

const SERVICE_CATALOG: Record<
  ServiceType,
  { label: string; icon: typeof Droplets; tagline: string; fromPrice: number; services: { id: string; label: string; hint: string; price: number }[] }
> = {
  RO: {
    label: 'RO Water Purifier',
    icon: Droplets,
    tagline: 'Repair, service & installation',
    fromPrice: 399,
    services: [
      { id: 'service', label: 'Regular Service', hint: 'Filter check & general upkeep', price: 399 },
      { id: 'repair', label: 'Repair', hint: 'Leak, no water, taste issues', price: 499 },
      { id: 'installation', label: 'Installation', hint: 'New or replacement setup', price: 599 },
      { id: 'amc', label: 'AMC Service', hint: 'Annual maintenance visit', price: 449 },
      { id: 'filter', label: 'Full Filter Change', hint: 'All cartridges replaced', price: 899 },
      { id: 'inspection', label: 'Inspection', hint: 'Health check & report', price: 299 },
    ],
  },
  SOFTENER: {
    label: 'Water Softener',
    icon: Filter,
    tagline: 'Softener service & resin change',
    fromPrice: 499,
    services: [
      { id: 'general', label: 'General Service', hint: 'Salt level & regeneration', price: 499 },
      { id: 'resin', label: 'Resin Change', hint: 'Full resin bed replacement', price: 2499 },
      { id: 'installation', label: 'Installation', hint: 'New softener setup', price: 799 },
      { id: 'inspection', label: 'Inspection', hint: 'Water hardness check', price: 349 },
    ],
  },
};

const TIME_SLOTS: { id: TimeSlot; label: string; range: string }[] = [
  { id: 'MORNING', label: 'Morning', range: '9 AM – 12 PM' },
  { id: 'AFTERNOON', label: 'Afternoon', range: '12 PM – 5 PM' },
  { id: 'EVENING', label: 'Evening', range: '5 PM – 8 PM' },
];

function getNextDates(count = 7): { iso: string; label: string; sub: string }[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out: { iso: string; label: string; sub: string }[] = [];
  const today = new Date();

  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const label = i === 1 ? 'Tomorrow' : days[d.getDay()];
    const sub = `${d.getDate()} ${months[d.getMonth()]}`;
    out.push({ iso, label, sub });
  }
  return out;
}

const INITIAL_FORM: PrototypeForm = {
  serviceType: '',
  service: '',
  description: '',
  address: '',
  flatDetails: '',
  serviceDate: '',
  timeSlot: '',
  fullName: '',
  phone: '',
  email: '',
};

function isStepValid(step: number, form: PrototypeForm): boolean {
  switch (step) {
    case 1:
      return !!form.serviceType && !!form.service;
    case 2:
      return form.description.trim().length >= 8;
    case 3:
      return form.address.trim().length >= 5 && form.flatDetails.trim().length >= 2;
    case 4:
      return !!form.serviceDate && !!form.timeSlot;
    case 5:
      return (
        form.fullName.trim().length >= 2 &&
        /^[6-9]\d{9}$/.test(form.phone.replace(/\D/g, '').slice(-10)) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      );
    case 6:
      return true;
    default:
      return false;
  }
}

const BookingPrototype: React.FC = () => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PrototypeForm>(INITIAL_FORM);
  const [confirmed, setConfirmed] = useState(false);
  const dateOptions = useMemo(() => getNextDates(7), []);

  const selectedCatalog = form.serviceType ? SERVICE_CATALOG[form.serviceType] : null;
  const selectedService = selectedCatalog?.services.find((s) => s.id === form.service);
  const estimate = selectedService?.price ?? selectedCatalog?.fromPrice ?? 399;

  const patch = (updates: Partial<PrototypeForm>) => setForm((prev) => ({ ...prev, ...updates }));

  const goNext = () => {
    if (!isStepValid(step, form)) {
      toast.error('Please complete the required fields to continue.');
      return;
    }
    if (step < STEPS.length) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleMockSubmit = () => {
    setConfirmed(true);
    toast.success('Prototype booking saved locally — no real job was created.');
  };

  if (confirmed) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Looks good!</h1>
              <p className="text-muted-foreground mt-2">
                This is a UI prototype only. Nothing was sent to the server.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5 text-left space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium text-right">{selectedService?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">When</span>
                <span className="font-medium text-right">
                  {form.serviceDate} · {form.timeSlot}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Where</span>
                <span className="font-medium text-right">{form.flatDetails}, {form.address}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-muted-foreground">Est. visit charge</span>
                <span className="font-semibold text-sky-700 dark:text-sky-400">₹{estimate}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Button asChild className="h-12 bg-sky-700 hover:bg-sky-800">
                <Link to="/book">Use live booking page</Link>
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => {
                  setConfirmed(false);
                  setStep(1);
                  setForm(INITIAL_FORM);
                }}
              >
                Restart prototype
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const currentStepMeta = STEPS[step - 1];

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />

      {/* Prototype banner */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
        <p className="text-center text-sm text-amber-900 dark:text-amber-200">
          <Sparkles className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          <strong>UI prototype</strong> — Urban Company–inspired flow for review. No real booking is created.{' '}
          <Link to="/book" className="underline font-medium hover:no-underline">
            Live page →
          </Link>
        </p>
      </div>

      <main className="flex-1 pb-28">
        <div className="max-w-lg mx-auto px-4 pt-4">
          {/* UC-style top bar */}
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
              className={cn(
                'w-10 h-10 rounded-full border bg-card flex items-center justify-center transition-colors',
                step === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'
              )}
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Step {step} of {STEPS.length}
              </p>
              <h1 className="text-xl font-bold text-foreground truncate">{currentStepMeta.title}</h1>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  s.id <= step ? 'bg-sky-600' : 'bg-border'
                )}
              />
            ))}
          </div>

          {/* Trust strip — UC shows social proof early */}
          {step === 1 && (
            <div className="flex items-center justify-center gap-4 mb-6 py-3 px-4 rounded-xl bg-card border text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                5★ rated
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                Verified techs
              </span>
              <span className="w-px h-4 bg-border" />
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-sky-600" />
                Same-day
              </span>
            </div>
          )}

          <div className="space-y-4">
            {/* Step 1: Service type + package cards */}
            {step === 1 && (
              <>
                <p className="text-muted-foreground text-sm">What do you need help with?</p>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(SERVICE_CATALOG) as ServiceType[]).map((type) => {
                    const item = SERVICE_CATALOG[type];
                    const Icon = item.icon;
                    const selected = form.serviceType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => patch({ serviceType: type, service: '' })}
                        className={cn(
                          'rounded-2xl border-2 p-4 text-left transition-all cursor-pointer bg-card',
                          selected
                            ? 'border-sky-600 ring-2 ring-sky-600/20'
                            : 'border-border hover:border-sky-300'
                        )}
                      >
                        <div
                          className={cn(
                            'w-11 h-11 rounded-xl flex items-center justify-center mb-3',
                            selected ? 'bg-sky-100 dark:bg-sky-500/20' : 'bg-muted'
                          )}
                        >
                          <Icon className={cn('w-6 h-6', selected ? 'text-sky-700' : 'text-muted-foreground')} />
                        </div>
                        <p className="font-semibold text-foreground text-sm leading-tight">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.tagline}</p>
                        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 mt-2">
                          From ₹{item.fromPrice}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedCatalog && (
                  <div className="pt-2 space-y-3">
                    <p className="text-sm font-medium text-foreground">Select a package</p>
                    {selectedCatalog.services.map((svc) => {
                      const selected = form.service === svc.id;
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => patch({ service: svc.id })}
                          className={cn(
                            'w-full rounded-2xl border p-4 flex items-center gap-3 text-left transition-all cursor-pointer bg-card',
                            selected ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-500/10' : 'border-border hover:border-sky-200'
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground">{svc.label}</p>
                            <p className="text-sm text-muted-foreground">{svc.hint}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-foreground">₹{svc.price}</p>
                            {selected && <Check className="w-5 h-5 text-sky-600 ml-auto mt-1" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Step 2: Problem description */}
            {step === 2 && (
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center shrink-0">
                    <Wrench className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{selectedService?.label}</p>
                    <p className="text-sm text-muted-foreground">Help the technician prepare</p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">What&apos;s the issue?</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="e.g. Water tastes salty, low pressure, leaking from tap..."
                    className="mt-2 min-h-[120px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {form.description.length}/8 characters minimum
                  </p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  Tip: Mention brand/model if you know it — we&apos;ll ask on the live page too.
                </div>
              </div>
            )}

            {/* Step 3: Location — UC asks address with search feel */}
            {step === 3 && (
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  Service at your doorstep in Bengaluru
                </div>
                <div>
                  <Label htmlFor="address">Area / street / landmark</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="Koramangala 5th Block, near Forum Mall"
                    className="mt-2 h-12"
                  />
                </div>
                <div>
                  <Label htmlFor="flatDetails">Flat / house no. & floor</Label>
                  <Input
                    id="flatDetails"
                    value={form.flatDetails}
                    onChange={(e) => patch({ flatDetails: e.target.value })}
                    placeholder="Flat 302, 3rd floor, Green View Apts"
                    className="mt-2 h-12"
                  />
                </div>
                <Button type="button" variant="outline" className="w-full h-11" disabled>
                  <MapPin className="w-4 h-4 mr-2" />
                  Use current location (mock)
                </Button>
                <p className="text-xs text-muted-foreground">
                  Map pin & Google autocomplete will connect on the real booking page.
                </p>
              </div>
            )}

            {/* Step 4: Schedule — horizontal date chips + time slots */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="w-5 h-5 text-sky-600" />
                    <p className="font-semibold text-foreground">Select date</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    {dateOptions.map((d) => {
                      const selected = form.serviceDate === d.iso;
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() => patch({ serviceDate: d.iso })}
                          className={cn(
                            'shrink-0 w-[72px] rounded-xl border-2 py-3 text-center transition-all cursor-pointer',
                            selected
                              ? 'border-sky-600 bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-200'
                              : 'border-border bg-card hover:border-sky-200'
                          )}
                        >
                          <p className="text-xs font-medium text-muted-foreground">{d.label}</p>
                          <p className="text-sm font-bold mt-0.5">{d.sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-sky-600" />
                    <p className="font-semibold text-foreground">Preferred time</p>
                  </div>
                  <div className="grid gap-2">
                    {TIME_SLOTS.map((slot) => {
                      const selected = form.timeSlot === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => patch({ timeSlot: slot.id })}
                          className={cn(
                            'w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all',
                            selected
                              ? 'border-sky-600 bg-sky-50 dark:bg-sky-500/15'
                              : 'border-border bg-card hover:border-sky-200'
                          )}
                        >
                          <div className="text-left">
                            <p className="font-semibold text-foreground">{slot.label}</p>
                            <p className="text-sm text-muted-foreground">{slot.range}</p>
                          </div>
                          {selected && <Check className="w-5 h-5 text-sky-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Contact — minimal fields, phone-first feel */}
            {step === 5 && (
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4 text-sky-600" />
                  We&apos;ll call to confirm your slot
                </div>
                <div>
                  <Label htmlFor="phone">Mobile number</Label>
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">+91</span>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => patch({ phone: e.target.value })}
                      placeholder="98765 43210"
                      className="h-12 pl-12 text-base"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => patch({ fullName: e.target.value })}
                    placeholder="Your name"
                    className="mt-2 h-12"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email (for confirmation)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => patch({ email: e.target.value })}
                    placeholder="you@email.com"
                    className="mt-2 h-12"
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  No account needed — same as Urban Company&apos;s quick checkout.
                </p>
              </div>
            )}

            {/* Step 6: Review summary card */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card overflow-hidden">
                  <div className="bg-sky-600 px-5 py-4 text-white">
                    <p className="text-sm opacity-90">Your booking</p>
                    <p className="text-lg font-bold">{selectedService?.label}</p>
                  </div>
                  <div className="p-5 space-y-4 text-sm">
                    <ReviewRow icon={Calendar} label="When" value={`${form.serviceDate} · ${form.timeSlot}`} />
                    <ReviewRow
                      icon={MapPin}
                      label="Where"
                      value={`${form.flatDetails}, ${form.address}`}
                    />
                    <ReviewRow icon={User} label="Contact" value={`${form.fullName} · ${form.phone}`} />
                    <ReviewRow icon={Wrench} label="Issue" value={form.description} />
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-muted-foreground">Visit charge (est.)</span>
                      <span className="text-xl font-bold text-foreground">₹{estimate}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Final price confirmed after inspection
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">What happens next (on live page)</p>
                  <p>• Confirmation SMS & email</p>
                  <p>• Technician calls before visit</p>
                  <p>• Pay after service completion</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Sticky bottom bar — UC-style CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
          {step < 6 && selectedService && (
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-lg font-bold text-foreground">₹{estimate}</p>
            </div>
          )}
          <Button
            type="button"
            onClick={step === 6 ? handleMockSubmit : goNext}
            disabled={!isStepValid(step, form)}
            className="flex-1 h-12 text-base font-semibold bg-sky-700 hover:bg-sky-800 disabled:opacity-50"
          >
            {step === 6 ? (
              'Confirm booking (mock)'
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

function ReviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground break-words">{value}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto opacity-0" aria-hidden />
    </div>
  );
}

export default BookingPrototype;
