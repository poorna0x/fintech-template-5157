import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
export const ANALYTICS_PAGE_SIZES = [10, 20, 50] as const;

type AnalyticsListPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  itemLabel?: string;
  scrollAnchorId?: string;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
};

function scrollToAnchor(id: string) {
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

export function AnalyticsListPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  itemLabel = 'items',
  scrollAnchorId,
  onPageChange,
  onItemsPerPageChange,
}: AnalyticsListPaginationProps) {
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const rangeEnd = Math.min(currentPage * itemsPerPage, totalItems);

  const handlePageChange = (page: number) => {
    onPageChange(page);
    if (scrollAnchorId) scrollToAnchor(scrollAnchorId);
  };

  const handlePerPageChange = (size: number) => {
    onItemsPerPageChange(size);
    if (scrollAnchorId) scrollToAnchor(scrollAnchorId);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-3">
      <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
        Showing {rangeStart}–{rangeEnd} of {totalItems} {itemLabel}
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
            disabled={currentPage <= 1}
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
            disabled={currentPage >= totalPages}
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
