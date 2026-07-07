import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';

type DeniedJobsDateFilterProps = {
  value: string;
  onChange: (value: string) => void;
  onToday: () => void;
};

export function DeniedJobsDateFilter({ value, onChange, onToday }: DeniedJobsDateFilterProps) {
  return (
    <div className="mb-4 rounded-lg border border-input bg-muted/20 px-2 py-1.5 sm:px-3 sm:py-2">
      <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 min-w-0 w-full">
        <Label className="text-xs sm:text-sm font-medium text-muted-foreground shrink-0 whitespace-nowrap">
          <span className="sm:hidden">Denied for</span>
          <span className="hidden sm:inline">Show denied jobs for</span>
        </Label>
        <DatePicker
          value={value}
          onChange={(v) => onChange(v ?? value)}
          placeholder="Pick date"
          className="h-9 w-auto shrink-0 px-2 text-xs min-w-[6.75rem] sm:h-10 sm:min-w-[140px] sm:px-3 sm:text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 whitespace-nowrap px-2.5 text-xs sm:h-10 sm:px-4 sm:text-sm"
          onClick={onToday}
        >
          Today
        </Button>
      </div>
    </div>
  );
}
