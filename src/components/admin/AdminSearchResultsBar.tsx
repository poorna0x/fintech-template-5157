import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

type AdminSearchResultsBarProps = {
  searchTerm: string;
  resultCount: number;
  onClearSearch: () => void;
};

export function AdminSearchResultsBar({
  searchTerm,
  resultCount,
  onClearSearch,
}: AdminSearchResultsBarProps) {
  return (
    <div className="mb-4 hidden sm:flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-gray-700">
      <div>
        Showing results for: <span className="font-medium text-gray-900">"{searchTerm}"</span>
        <span className="ml-2 text-gray-500">
          ({resultCount} customer{resultCount !== 1 ? 's' : ''} found)
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 text-gray-600 hover:text-gray-900"
        onClick={onClearSearch}
      >
        <X className="w-4 h-4 mr-1" />
        Clear search
      </Button>
    </div>
  );
}
