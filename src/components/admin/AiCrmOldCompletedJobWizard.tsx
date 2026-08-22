import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Check,
  ChevronLeft,
  History,
  Loader2,
  MapPin,
} from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import { db } from '@/lib/supabase';
import { transformTechnicianData } from '@/lib/adminDashboardTransforms';
import { toast } from 'sonner';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import {
  createOldCompletedJob,
  OLD_JOB_TECHNICIAN_OFFICE,
  saveOldJobCustomer,
  saveOldJobModel,
  type OldJobSavedCustomer,
} from '@/lib/aiCrmOldCompletedJob';
import {
  formatDateLabel,
  parseFlexibleCompletedDate,
} from '@/lib/parseFlexibleDate';

const STEPS = [
  { id: 'customer', title: 'Customer' },
  { id: 'model', title: 'Model' },
  { id: 'date', title: 'Date' },
  { id: 'bill', title: 'Bill photo' },
  { id: 'payment', title: 'Payment photo' },
  { id: 'technician', title: 'Technician' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

type TechnicianOption = { id: string; fullName: string };

export type AiCrmOldCompletedJobWizardProps = {
  onCancel: () => void;
  onFinished: (result: {
    customerId: string;
    customerName: string;
    jobId: string;
    jobNumber: string;
    dateLabel: string;
  }) => void;
};

export default function AiCrmOldCompletedJobWizard({
  onCancel,
  onFinished,
}: AiCrmOldCompletedJobWizardProps) {
  const [step, setStep] = useState<StepId>('customer');
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [googleLocation, setGoogleLocation] = useState('');
  const [customer, setCustomer] = useState<OldJobSavedCustomer | null>(null);
  const [model, setModel] = useState('');
  const [modelPhotos, setModelPhotos] = useState<string[]>([]);
  const [modelUploading, setModelUploading] = useState(false);
  const [dateText, setDateText] = useState('');
  const [completedDate, setCompletedDate] = useState<string | undefined>();
  const [billPhotos, setBillPhotos] = useState<string[]>([]);
  const [billUploading, setBillUploading] = useState(false);
  const [billAmount, setBillAmount] = useState('');
  const [paymentPhotos, setPaymentPhotos] = useState<string[]>([]);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [technicianId, setTechnicianId] = useState('');

  const stepIndex = STEPS.findIndex((row) => row.id === step);
  const parsedDate = useMemo(() => parseFlexibleCompletedDate(dateText), [dateText]);

  useEffect(() => {
    let cancelled = false;
    void db.technicians.getAllForDashboard(100, { activeRosterOnly: true }).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setTechnicians(data.map(transformTechnicianData).map((t) => ({ id: t.id, fullName: t.fullName })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goBack = () => {
    if (stepIndex <= 0) {
      onCancel();
      return;
    }
    setStep(STEPS[stepIndex - 1].id);
  };

  const saveCustomerStep = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveOldJobCustomer({ fullName, phone, googleLocation });
      if (!result.ok) {
        toast.error(result.error, TOAST_VALIDATION);
        return;
      }
      setCustomer(result.customer);
      toast.success(
        result.customer.existing
          ? `Using existing customer ${result.customer.fullName}`
          : `${result.customer.fullName} saved`
      );
      setStep('model');
    } finally {
      setBusy(false);
    }
  };

  const saveModelStep = async () => {
    if (!customer || busy || modelUploading) return;
    setBusy(true);
    try {
      const result = await saveOldJobModel({
        customerId: customer.id,
        model,
        photoUrls: modelPhotos,
      });
      if (!result.ok) {
        toast.error(result.error, TOAST_VALIDATION);
        return;
      }
      setStep('date');
    } finally {
      setBusy(false);
    }
  };

  const saveDateStep = () => {
    const iso = completedDate || parseFlexibleCompletedDate(dateText)?.iso;
    if (!iso) {
      toast.error('Enter a date like last Sep or 24 September 2025', TOAST_VALIDATION);
      return;
    }
    setCompletedDate(iso);
    setStep('bill');
  };

  const saveBillStep = () => {
    if (billUploading) {
      toast.error('Wait for the bill photo to finish uploading', TOAST_VALIDATION);
      return;
    }
    if (!billPhotos.length) {
      toast.error('Add the bill photo', TOAST_VALIDATION);
      return;
    }
    setStep('payment');
  };

  const finishJob = async () => {
    if (!customer || !completedDate || busy) return;
    if (!technicianId) {
      toast.error('Pick who completed this job', TOAST_VALIDATION);
      return;
    }
    if (billUploading || paymentUploading) {
      toast.error('Wait for photos to finish uploading', TOAST_VALIDATION);
      return;
    }
    setBusy(true);
    try {
      const amountRaw = billAmount.trim();
      const amount = amountRaw ? Number(amountRaw) : 0;
      if (amountRaw && (!Number.isFinite(amount) || amount < 0)) {
        toast.error('Enter a valid bill amount, or leave it blank', TOAST_VALIDATION);
        return;
      }
      const result = await createOldCompletedJob({
        customerId: customer.id,
        completedDateIso: completedDate,
        technicianId,
        billPhotoUrls: billPhotos,
        paymentPhotoUrl: paymentPhotos[0] || null,
        billAmount: amountRaw ? amount : 0,
      });
      if (!result.ok) {
        toast.error(result.error, TOAST_VALIDATION);
        return;
      }
      toast.success(`Completed ${result.jobNumber} on ${result.dateLabel}`);
      onFinished({
        customerId: customer.id,
        customerName: customer.fullName,
        jobId: result.jobId,
        jobNumber: result.jobNumber,
        dateLabel: result.dateLabel,
      });
    } finally {
      setBusy(false);
    }
  };

  const continueLabel =
    step === 'technician' ? 'Complete job' : step === 'payment' ? 'Continue' : 'Save and continue';

  const onContinue = () => {
    if (step === 'customer') return void saveCustomerStep();
    if (step === 'model') return void saveModelStep();
    if (step === 'date') return saveDateStep();
    if (step === 'bill') return saveBillStep();
    if (step === 'payment') {
      setStep('technician');
      return;
    }
    return void finishJob();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <History className="h-4 w-4 text-sky-700" />
            Log old completed job
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].title}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="flex gap-1" aria-hidden>
        {STEPS.map((row, index) => (
          <span
            key={row.id}
            className={`h-1 flex-1 rounded-full ${index <= stepIndex ? 'bg-sky-600' : 'bg-muted'}`}
          />
        ))}
      </div>

      {step === 'customer' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="old-job-name">Customer name</Label>
            <Input
              id="old-job-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="old-job-phone">Phone</Label>
            <Input
              id="old-job-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="old-job-maps">Google location</Label>
            <Input
              id="old-job-maps"
              value={googleLocation}
              onChange={(e) => setGoogleLocation(e.target.value)}
              placeholder="Paste Google Maps link"
            />
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              Paste the pin link. Short maps.app.goo.gl links work too.
            </p>
          </div>
        </div>
      ) : null}

      {step === 'model' ? (
        <div className="space-y-3">
          {customer ? (
            <p className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
              Saved {customer.fullName}
              {customer.customerCode ? ` · ${customer.customerCode}` : ''} · {customer.phone}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="old-job-model">Model name</Label>
            <Input
              id="old-job-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. Kent Grand Plus"
            />
          </div>
          <ImageUpload
            compact
            skipOfflineQueue
            folder="ai-crm-old-jobs"
            photoType="other"
            maxImages={3}
            title="Model photo"
            description="Photo of the purifier"
            initialImages={modelPhotos}
            onImagesChange={setModelPhotos}
            onUploadStateChange={setModelUploading}
          />
        </div>
      ) : null}

      {step === 'date' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="old-job-date-text">Completed date</Label>
            <Input
              id="old-job-date-text"
              value={dateText}
              onChange={(e) => {
                const value = e.target.value;
                setDateText(value);
                const parsed = parseFlexibleCompletedDate(value);
                if (parsed) setCompletedDate(parsed.iso);
              }}
              placeholder='last Sep, or 24 September 2025'
            />
            {parsedDate ? (
              <p className="text-xs text-sky-800">
                {parsedDate.guessedDay
                  ? `Using ${parsedDate.label} — pick the exact day below if needed.`
                  : `Using ${parsedDate.label}`}
              </p>
            ) : dateText.trim() ? (
              <p className="text-xs text-amber-700">Could not read that date. Try 24 Sep 2025.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Type a casual date or pick one below.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Exact day</Label>
            <DatePicker
              value={completedDate}
              onChange={setCompletedDate}
              placeholder="Pick completed date"
            />
          </div>
        </div>
      ) : null}

      {step === 'bill' ? (
        <div className="space-y-3">
          {completedDate ? (
            <p className="text-xs text-muted-foreground">Completed {formatDateLabel(completedDate)}</p>
          ) : null}
          <ImageUpload
            compact
            skipOfflineQueue
            folder="ai-crm-old-jobs"
            photoType="bill"
            maxImages={3}
            title="Bill photo"
            description="Photo of the bill"
            initialImages={billPhotos}
            onImagesChange={setBillPhotos}
            onUploadStateChange={setBillUploading}
          />
          <div className="space-y-1.5">
            <Label htmlFor="old-job-amount">Bill amount (optional)</Label>
            <Input
              id="old-job-amount"
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="Leave blank if unknown"
            />
          </div>
        </div>
      ) : null}

      {step === 'payment' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Payment screenshot is optional — skip if you do not have it.</p>
          <ImageUpload
            compact
            skipOfflineQueue
            folder="ai-crm-old-jobs"
            photoType="payment"
            maxImages={2}
            title="Payment photo"
            description="UPI screenshot or receipt"
            initialImages={paymentPhotos}
            onImagesChange={setPaymentPhotos}
            onUploadStateChange={setPaymentUploading}
          />
        </div>
      ) : null}

      {step === 'technician' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="old-job-tech">Completed by</Label>
            <select
              id="old-job-tech"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              className="flex h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select technician</option>
              <option value={OLD_JOB_TECHNICIAN_OFFICE}>Office</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
            {customer?.fullName || 'Customer'}
            {completedDate ? ` · ${formatDateLabel(completedDate)}` : ''}
            {model ? ` · ${model}` : ''}
            {paymentPhotos.length ? ' · payment photo added' : ' · payment photo skipped'}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={goBack} disabled={busy}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {stepIndex === 0 ? 'Close' : 'Back'}
        </Button>
        <div className="flex gap-2">
          {step === 'payment' ? (
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={busy || paymentUploading}
              onClick={() => {
                setPaymentPhotos([]);
                setStep('technician');
              }}
            >
              Skip
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-9 bg-sky-700 hover:bg-sky-800"
            disabled={busy || modelUploading || billUploading || paymentUploading}
            onClick={onContinue}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
