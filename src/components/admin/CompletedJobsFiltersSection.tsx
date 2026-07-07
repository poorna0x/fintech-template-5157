import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';

export type CompletedDatePreset = 'day' | 'week' | 'month' | 'custom';

type CompletedJobsFiltersSectionProps = {
  completedDatePreset: CompletedDatePreset;
  completedDateFilter: string;
  onPickDay: (date: string) => void;
  onQuickToday: () => void;
  onSwitchToSingleDay: () => void;
  onOpenFilters: () => void;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  draftDatePreset: CompletedDatePreset;
  onDraftDatePresetChange: (preset: CompletedDatePreset) => void;
  draftDateFilter: string;
  onDraftDateFilterChange: (date: string) => void;
  draftRangeStartDate: string;
  onDraftRangeStartDateChange: (date: string) => void;
  draftRangeEndDate: string;
  onDraftRangeEndDateChange: (date: string) => void;
  draftLeadTypeFilter: string;
  onDraftLeadTypeFilterChange: (value: string) => void;
  draftServiceSubTypeFilter: string;
  onDraftServiceSubTypeFilterChange: (value: string) => void;
  draftCompletedByFilter: string;
  onDraftCompletedByFilterChange: (value: string) => void;
  leadTypeOptions: string[];
  serviceSubTypeOptions: string[];
  completedByOptions: string[];
  onResetFilters: () => void;
  onApplyFilters: () => void;
};

export function CompletedJobsFiltersSection({
  completedDatePreset,
  completedDateFilter,
  onPickDay,
  onQuickToday,
  onSwitchToSingleDay,
  onOpenFilters,
  dialogOpen,
  onDialogOpenChange,
  draftDatePreset,
  onDraftDatePresetChange,
  draftDateFilter,
  onDraftDateFilterChange,
  draftRangeStartDate,
  onDraftRangeStartDateChange,
  draftRangeEndDate,
  onDraftRangeEndDateChange,
  draftLeadTypeFilter,
  onDraftLeadTypeFilterChange,
  draftServiceSubTypeFilter,
  onDraftServiceSubTypeFilterChange,
  draftCompletedByFilter,
  onDraftCompletedByFilterChange,
  leadTypeOptions,
  serviceSubTypeOptions,
  completedByOptions,
  onResetFilters,
  onApplyFilters,
}: CompletedJobsFiltersSectionProps) {
  const handleDraftPresetChange = (value: CompletedDatePreset) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    onDraftDatePresetChange(value);
    if (value === 'day') {
      onDraftDateFilterChange(todayStr);
    } else if (value === 'week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6);
      const start = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      onDraftRangeStartDateChange(start);
      onDraftRangeEndDateChange(todayStr);
    } else if (value === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const start = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`;
      onDraftRangeStartDateChange(start);
      onDraftRangeEndDateChange(todayStr);
    } else if (value === 'custom') {
      if (!draftRangeStartDate) onDraftRangeStartDateChange(todayStr);
      if (!draftRangeEndDate) onDraftRangeEndDateChange(todayStr);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-input bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            {completedDatePreset === 'day' ? (
              <>
                <div className="min-w-0">
                  <DatePicker
                    value={completedDateFilter}
                    onChange={(v) => v && onPickDay(v)}
                    placeholder="Pick date"
                    className="w-auto min-w-[140px]"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="h-10 shrink-0 px-3 sm:px-4"
                  onClick={onQuickToday}
                >
                  Today
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="h-10 shrink-0 px-3 text-xs sm:px-4 sm:text-sm"
                onClick={onSwitchToSingleDay}
              >
                <span className="sm:hidden">Single day</span>
                <span className="hidden sm:inline">Switch to single day</span>
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onOpenFilters}
            className="shrink-0 h-10 w-10 p-0 sm:w-auto sm:px-3"
            aria-label="Completed jobs filters"
          >
            <Filter className="h-4 w-4 sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">Filters</span>
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Completed Jobs Filters</DialogTitle>
            <DialogDescription>Choose filters to narrow completed jobs.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date Filter</Label>
              <Select value={draftDatePreset} onValueChange={(v) => handleDraftPresetChange(v as CompletedDatePreset)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Single day</SelectItem>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draftDatePreset === 'day' ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Completed On</Label>
                <div className="inline-flex w-full items-center gap-2">
                  <DatePicker
                    value={draftDateFilter}
                    onChange={(v) => onDraftDateFilterChange(v ?? draftDateFilter)}
                    placeholder="Pick date"
                    className="flex-1 w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <DatePicker
                    value={draftRangeStartDate}
                    onChange={(v) => {
                      const nextStart = v ?? draftRangeStartDate;
                      if (!nextStart) return;
                      onDraftRangeStartDateChange(nextStart);
                      if (draftRangeEndDate && nextStart > draftRangeEndDate) {
                        onDraftRangeEndDateChange(nextStart);
                      }
                    }}
                    placeholder="Start date"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <DatePicker
                    value={draftRangeEndDate}
                    onChange={(v) => {
                      const nextEnd = v ?? draftRangeEndDate;
                      if (!nextEnd) return;
                      onDraftRangeEndDateChange(nextEnd);
                      if (draftRangeStartDate && nextEnd < draftRangeStartDate) {
                        onDraftRangeStartDateChange(nextEnd);
                      }
                    }}
                    placeholder="End date"
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Lead Type</Label>
              <Select value={draftLeadTypeFilter} onValueChange={onDraftLeadTypeFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All lead types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All lead types</SelectItem>
                  {leadTypeOptions.map((leadType) => (
                    <SelectItem key={leadType} value={leadType}>
                      {leadType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Service Sub Type</Label>
              <Select value={draftServiceSubTypeFilter} onValueChange={onDraftServiceSubTypeFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All service sub types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All service sub types</SelectItem>
                  {serviceSubTypeOptions.map((subType) => (
                    <SelectItem key={subType} value={subType}>
                      {subType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Completed By</Label>
              <Select value={draftCompletedByFilter} onValueChange={onDraftCompletedByFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All technicians</SelectItem>
                  {completedByOptions.map((completedBy) => (
                    <SelectItem key={completedBy} value={completedBy}>
                      {completedBy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onResetFilters}>
              Reset Filters
            </Button>
            <Button type="button" onClick={onApplyFilters}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
