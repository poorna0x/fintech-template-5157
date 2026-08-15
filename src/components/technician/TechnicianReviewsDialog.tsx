import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MessageSquareText, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  fetchTechnicianReviewsPage,
  TECHNICIAN_REVIEWS_PAGE_SIZE,
  type TechnicianReview,
} from '@/lib/technicianReviews';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicianId: string;
};

function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function pageNumbers(page: number, totalPages: number): number[] {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, page - 1), totalPages - 2);
  return Array.from({ length: 3 }, (_, index) => start + index);
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
      title={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn(
            'h-4 w-4',
            index < rating
              ? 'fill-amber-400 text-amber-500'
              : 'fill-transparent text-muted-foreground/35'
          )}
        />
      ))}
      <span className="ml-1 text-xs font-semibold tabular-nums">{rating}/5</span>
    </div>
  );
}

function ReviewCard({ review }: { review: TechnicianReview }) {
  return (
    <article className="rounded-xl border bg-card p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <RatingStars rating={review.rating} />
        <Badge variant="outline" className="shrink-0 font-normal">
          {review.brand === 'elevenro' ? 'ElevenRO' : 'HydrogenRO'}
        </Badge>
      </div>
      <div className="mt-3 flex items-start gap-2.5">
        <MessageSquareText
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        <p className={cn(
          'min-w-0 whitespace-pre-wrap break-words text-sm leading-6',
          !review.comment && 'italic text-muted-foreground'
        )}>
          {review.comment || 'No written feedback'}
        </p>
      </div>
      <time
        dateTime={review.submittedAt}
        className="mt-3 block text-xs text-muted-foreground"
      >
        {formatReviewDate(review.submittedAt)}
      </time>
    </article>
  );
}

export default function TechnicianReviewsDialog({
  open,
  onOpenChange,
  technicianId,
}: Props) {
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<TechnicianReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / TECHNICIAN_REVIEWS_PAGE_SIZE));
  const visiblePages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);

  useEffect(() => {
    if (!open) {
      setPage(1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTechnicianReviewsPage(technicianId, page)
      .then((result) => {
        if (cancelled) return;
        setReviews(result.reviews);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setReviews([]);
        setError(err instanceof Error ? err.message : 'Could not load reviews');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, page, reloadKey, technicianId]);

  const changePage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-5">
          <DialogTitle className="flex items-center gap-2">
            <Star aria-hidden="true" className="h-5 w-5 fill-amber-400 text-amber-500" />
            My Reviews
          </DialogTitle>
          <DialogDescription>
            {loading && total === 0
              ? 'Loading customer feedback…'
              : `${total.toLocaleString()} customer ${total === 1 ? 'review' : 'reviews'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/25 p-3 sm:p-4">
          <div aria-live="polite">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Loading reviews…
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 cursor-pointer"
                  onClick={() => setReloadKey((current) => current + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : reviews.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                <Star aria-hidden="true" className="h-9 w-9 text-muted-foreground/40" />
                <p className="mt-3 font-medium">No reviews yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customer feedback will appear here after it is submitted.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
              </div>
            )}
          </div>
        </div>

        {!loading && !error && total > TECHNICIAN_REVIEWS_PAGE_SIZE ? (
          <nav
            aria-label="Reviews pagination"
            className="flex items-center justify-between gap-2 border-t bg-background px-3 py-3 sm:px-4"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 cursor-pointer px-2.5 sm:px-3"
              disabled={page <= 1}
              onClick={() => changePage(page - 1)}
              aria-label="Previous reviews page"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <div className="flex min-w-0 items-center justify-center gap-1">
              {visiblePages.map((pageNumber) => (
                <Button
                  key={pageNumber}
                  type="button"
                  variant={pageNumber === page ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 w-9 cursor-pointer p-0 tabular-nums"
                  onClick={() => changePage(pageNumber)}
                  aria-label={`Reviews page ${pageNumber}`}
                  aria-current={pageNumber === page ? 'page' : undefined}
                >
                  {pageNumber}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 cursor-pointer px-2.5 sm:px-3"
              disabled={page >= totalPages}
              onClick={() => changePage(page + 1)}
              aria-label="Next reviews page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </nav>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
