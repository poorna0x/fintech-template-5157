import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Droplets, Loader2, Star } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getDocumentBrandLabel, type DocumentBrand } from '@/lib/service-brands';
import {
  brandGoogleReviewUrl,
  fetchPublicJobReviewInvite,
  notifyAdminsJobReviewSubmitted,
  submitPublicJobReview,
  type PublicJobReviewInvite,
} from '@/lib/jobReviews';

function BrandMark({ brand }: { brand: DocumentBrand }) {
  const name = brand === 'elevenro' ? 'Eleven RO' : 'Hydrogen RO';
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
        <Droplets className="h-5 w-5 text-white" />
      </div>
      <div className="text-xl font-bold text-slate-900">{name}</div>
    </div>
  );
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="rounded-full p-1.5 touch-manipulation disabled:opacity-60"
          >
            <Star
              className={`h-9 w-9 ${on ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
            />
            <span className="sr-only">{n} star{n === 1 ? '' : 's'}</span>
          </button>
        );
      })}
    </div>
  );
}

function tryCloseReviewTab() {
  try {
    window.close();
  } catch {
    /* ignore */
  }
  try {
    window.open('', '_self');
    window.close();
  } catch {
    /* ignore */
  }
}

const PublicJobReviewPage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<PublicJobReviewInvite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchPublicJobReviewInvite(token || '');
      if (cancelled) return;
      setLoading(false);
      if (!result.invite) {
        setLoadError(
          result.error === 'expired'
            ? 'This review link has expired.'
            : 'This review link is not valid.'
        );
        return;
      }
      setInvite(result.invite);
      if (result.invite.status === 'submitted') {
        setSubmitted(true);
        setRating(result.invite.rating || 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!justSubmitted) return;
    const delay = rating >= 4 ? 8000 : 1800;
    const id = window.setTimeout(() => tryCloseReviewTab(), delay);
    return () => window.clearTimeout(id);
  }, [justSubmitted, rating]);

  const brand: DocumentBrand = invite?.brand || 'hydrogenro';
  const brandLabel = getDocumentBrandLabel(brand);
  const tech = invite?.technicianFirstName;
  const heading = useMemo(() => {
    if (tech) return `How was your visit with ${tech}?`;
    return `How was your ${brandLabel} visit?`;
  }, [tech, brandLabel]);

  const onSubmit = async () => {
    if (!token || rating < 1) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitPublicJobReview({ token, rating, comment });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError('Could not save your review. Please try again.');
      return;
    }
    setSubmitted(true);
    setJustSubmitted(true);
    if (!result.alreadySubmitted) {
      notifyAdminsJobReviewSubmitted(token);
    }
    if (rating < 4) {
      tryCloseReviewTab();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <Header />
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Loading review…</p>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <BrandMark brand={brand} />
            <p className="mt-4 text-sm text-slate-600">{loadError}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <BrandMark brand={brand} />
            {submitted ? (
              <div className="mt-6 text-center space-y-3">
                <p className="text-lg font-semibold text-slate-900">Thank you</p>
                <p className="text-sm text-slate-600">
                  Your review is in
                  {tech ? ` — including for ${tech}` : ''}. You can close this page.
                </p>
                {rating >= 4 && (
                  <div className="pt-2">
                    <p className="text-sm text-slate-600 mb-3">
                      If you have a moment, a Google review also helps other families find us.
                    </p>
                    <a
                      href={brandGoogleReviewUrl(brand)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full h-11 items-center justify-center rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800"
                    >
                      Review us on Google
                    </a>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => tryCloseReviewTab()}
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div className="text-center">
                  <h1 className="text-xl font-semibold text-slate-900">{heading}</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Tap a star. A short comment is optional.
                  </p>
                </div>
                <StarPicker value={rating} onChange={setRating} disabled={submitting} />
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 1000))}
                  placeholder="Anything we should know? (optional)"
                  rows={3}
                  className="resize-none"
                />
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                <Button
                  type="button"
                  className="w-full h-11 bg-black hover:bg-gray-800 text-white"
                  disabled={rating < 1 || submitting}
                  onClick={() => void onSubmit()}
                >
                  {submitting ? 'Sending…' : 'Submit review'}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicJobReviewPage;
