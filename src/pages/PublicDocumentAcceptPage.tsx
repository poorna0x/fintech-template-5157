import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock3,
  Droplets,
  FileCheck2,
  Loader2,
  MailCheck,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  acceptPublicDocument,
  fetchPublicDocumentAcceptInvite,
  type PublicDocumentAcceptInvite,
} from '@/lib/documentAcceptPreview';
import { getDocumentBrandLabel, type DocumentBrand } from '@/lib/service-brands';

function BrandMark({ brand }: { brand: DocumentBrand }) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
        <Droplets className="h-5 w-5 text-white" />
      </span>
      <span className="text-xl font-bold text-slate-900">{getDocumentBrandLabel(brand)}</span>
    </div>
  );
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PublicDocumentAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<PublicDocumentAcceptInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchPublicDocumentAcceptInvite(token);
      if (cancelled) return;
      setLoading(false);
      if (!result.invite) {
        setError(result.error === 'expired' ? 'This Accept link has expired.' : 'This Accept link is not valid.');
        return;
      }
      setInvite(result.invite);
      setConfirmationId(result.invite.confirmationId);
      setDeliveryStatus(result.invite.deliveryStatus);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    if (!agreed || !token || !invite) return;
    setSubmitting(true);
    setError(null);
    const result = await acceptPublicDocument(token);
    setSubmitting(false);
    if (!result.ok) {
      if (result.accepted || result.error === 'delivery_failed') {
        setConfirmationId(result.confirmationId || invite.confirmationId);
        setDeliveryStatus('failed');
        setError('Your acceptance was recorded, but the original email could not be sent. Tap retry below.');
        return;
      }
      setError(result.error === 'expired' ? 'This Accept link has expired.' : 'Could not record acceptance. Please try again.');
      return;
    }
    setConfirmationId(result.confirmationId || invite.confirmationId);
    setDeliveryStatus(result.deliveryStatus || 'sent');
    setInvite((current) => current ? { ...current, status: 'accepted' } : current);
  };

  const retryDelivery = async () => {
    setAgreed(true);
    setSubmitting(true);
    setError(null);
    const result = await acceptPublicDocument(token);
    setSubmitting(false);
    setConfirmationId(result.confirmationId || confirmationId);
    setDeliveryStatus(result.deliveryStatus || (result.ok ? 'sent' : 'failed'));
    if (!result.ok) {
      setError('The original email still could not be sent. Please reply to the preview email for help.');
    }
  };

  const brand: DocumentBrand = invite?.brand || 'hydrogenro';
  const accepted = invite?.status === 'accepted';
  const delivered = accepted && deliveryStatus === 'sent';
  const expired = invite?.status === 'expired';

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 via-slate-50 to-white">
      <Header />
      <main className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {loading ? (
          <div className="flex flex-col items-center py-20 text-slate-500">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-sky-600" />
            <p className="text-sm">Checking your secure link…</p>
          </div>
        ) : !invite ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <BrandMark brand={brand} />
            <TriangleAlert className="mx-auto mt-6 h-10 w-10 text-amber-500" />
            <h1 className="mt-3 text-lg font-semibold text-slate-900">Link unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-sky-50/70 px-6 py-5">
              <BrandMark brand={brand} />
            </div>
            <div className="p-6">
              {delivered ? (
                <div className="text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <MailCheck className="h-7 w-7 text-emerald-700" />
                  </span>
                  <h1 className="mt-4 text-xl font-semibold text-slate-900">Accepted successfully</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The verified original {invite.documentLabel} has been sent to the same email address.
                  </p>
                  {confirmationId ? (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Confirmation ID</p>
                      <p className="mt-1 break-all font-mono text-sm font-semibold text-emerald-950">{confirmationId}</p>
                    </div>
                  ) : null}
                </div>
              ) : expired ? (
                <div className="text-center">
                  <Clock3 className="mx-auto h-10 w-10 text-amber-500" />
                  <h1 className="mt-3 text-xl font-semibold text-slate-900">This link has expired</h1>
                  <p className="mt-2 text-sm text-slate-600">Ask the sender for a new preview and Accept link.</p>
                </div>
              ) : accepted && deliveryStatus === 'failed' ? (
                <div className="text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <h1 className="mt-3 text-xl font-semibold text-slate-900">Acceptance recorded</h1>
                  <p className="mt-2 text-sm text-slate-600">
                    We could not send the original email yet. You can safely retry without accepting twice.
                  </p>
                  {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
                  <Button className="mt-5 h-11 w-full" disabled={submitting} onClick={() => void retryDelivery()}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
                    Retry original email
                  </Button>
                </div>
              ) : accepted && deliveryStatus === 'sending' ? (
                <div className="py-4 text-center">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-600" />
                  <h1 className="mt-4 text-xl font-semibold text-slate-900">Preparing your original</h1>
                  <p className="mt-2 text-sm text-slate-600">
                    Your acceptance is recorded. The original PDF email is being sent now.
                  </p>
                  {confirmationId ? (
                    <p className="mt-4 break-all font-mono text-xs text-slate-500">{confirmationId}</p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <div className="text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100">
                      <FileCheck2 className="h-6 w-6 text-sky-700" />
                    </span>
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Review & Accept</h1>
                    <p className="mt-1 text-sm text-slate-600">Hi {invite.customerName}, please confirm the preview emailed to you.</p>
                  </div>

                  <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Document</span>
                      <span className="text-right font-medium text-slate-900">{invite.documentLabel}</span>
                    </div>
                    {invite.documentRef ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Reference</span>
                        <span className="break-all text-right font-medium text-slate-900">{invite.documentRef}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Link expires</span>
                      <span className="text-right font-medium text-slate-900">{formatExpiry(invite.expiresAt)}</span>
                    </div>
                  </div>

                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(value) => setAgreed(value === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm leading-6 text-slate-700">
                      I have read the preview PDF and agree to its terms, conditions, scope, pricing, validity, and policies. I request the verified original by email.
                    </span>
                  </label>

                  {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
                  <Button
                    className="mt-5 h-12 w-full bg-slate-950 text-white hover:bg-slate-800"
                    disabled={!agreed || submitting}
                    onClick={() => void accept()}
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    {submitting ? 'Recording acceptance…' : 'I Accept'}
                  </Button>
                  <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                    Single-use secure confirmation. The original is sent only after acceptance.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
