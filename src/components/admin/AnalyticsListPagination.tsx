import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ANALYTICS_PAGE_SIZES = [10, 20, 50] as const;

/** Anchor class — pairs with scrollToAnalyticsListAnchor (scroll-margin for sticky admin header). */
export const ANALYTICS_LIST_SCROLL_ANCHOR_CLASS = 'scroll-mt-28 sm:scroll-mt-32';

type AnalyticsListPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  itemLabel?: string;
  scrollAnchorId?: string;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

/** Jump to list top after page load; uses scroll-margin on the anchor element. */
export function scrollToAnalyticsListAnchor(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function runScrollAfterPaint(elementId: string) {
  scrollToAnalyticsListAnchor(elementId);
  requestAnimationFrame(() => {
    scrollToAnalyticsListAnchor(elementId);
    window.setTimeout(() => scrollToAnalyticsListAnchor(elementId), 50);
  });
}

type AnalyticsListLoadingOverlayProps = {
  loading: boolean;
  className?: string;
};

/** Dim table + spinner while fetching the next page (keeps layout height stable). */
export function AnalyticsListLoadingOverlay({ loading, className }: AnalyticsListLoadingOverlayProps) {
  if (!loading) return null;
  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/75 backdrop-blur-[2px]',
        className
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span>Loading…</span>
      </div>
    </div>
  );
}

export function AnalyticsListPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  itemLabel = 'items',
  scrollAnchorId,
  loading = false,
  onPageChange,
  onItemsPerPageChange,
}: AnalyticsListPaginationProps) {
  const scrollAfterLoadRef = useRef(false);
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const rangeEnd = Math.min(currentPage * itemsPerPage, totalItems);

  useEffect(() => {
    if (loading || !scrollAfterLoadRef.current || !scrollAnchorId) return;
    scrollAfterLoadRef.current = false;
    runScrollAfterPaint(scrollAnchorId);
  }, [loading, currentPage, scrollAnchorId]);

  const handlePageChange = (page: number) => {
    if (loading || page === currentPage) return;
    scrollAfterLoadRef.current = Boolean(scrollAnchorId);
    onPageChange(page);
  };

  const handlePerPageChange = (size: number) => {
    if (loading || size === itemsPerPage) return;
    scrollAfterLoadRef.current = Boolean(scrollAnchorId);
    onItemsPerPageChange(size);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-3">
      <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left flex items-center justify-center sm:justify-start gap-2">
        {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
        <span>
          {loading
            ? `Loading page ${currentPage}…`
            : `Showing ${rangeStart}–${rangeEnd} of ${totalItems} ${itemLabel}`}
        </span>
      </p>

      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Rows per page</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ANALYTICS_PAGE_SIZES.map((size) => (
            <Button
              key={size}
              type="button"
              size="sm"
              variant={itemsPerPage === size ? 'default' : 'outline'}
              className="h-8 text-xs w-full"
              disabled={loading}
              onClick={() => handlePerPageChange(size)}
            >
              {size}
            </Button>
          ))}
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 touch-manipulation"
            disabled={loading || currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="text-sm text-foreground/90 tabular-nums px-2 text-center min-w-[5.5rem]">
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 touch-manipulation"
            disabled={loading || currentPage >= totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            <span className="hidden sm:inline">Next</span>
            <ArrowRight className="h-4 w-4 sm:ml-1" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
