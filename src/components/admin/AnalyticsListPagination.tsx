import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

export const ANALYTICS_PAGE_SIZES = [10, 20, 50] as const;

/** Sticky admin header + small gap so list headers sit just below the bar. */
const SCROLL_TOP_OFFSET_PX = 96;

type AnalyticsListPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  itemLabel?: string;
  scrollAnchorId?: string;
  /** When true, page buttons are disabled and scroll runs after loading finishes. */
  loading?: boolean;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

export function scrollToAnalyticsListAnchor(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_TOP_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
    if (!loading && scrollAfterLoadRef.current && scrollAnchorId) {
      scrollAfterLoadRef.current = false;
      requestAnimationFrame(() => {
        scrollToAnalyticsListAnchor(scrollAnchorId);
      });
    }
  }, [loading, scrollAnchorId]);

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
