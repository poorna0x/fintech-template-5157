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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Technician } from '@/types';

export type OngoingAssignmentFilter = 'all' | 'assigned' | 'unassigned';

type OngoingJobsFiltersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftAssignmentFilter: OngoingAssignmentFilter;
  onDraftAssignmentFilterChange: (value: OngoingAssignmentFilter) => void;
  draftAssignedTechnicianFilter: string;
  onDraftAssignedTechnicianFilterChange: (value: string) => void;
  draftServiceSubTypeFilter: string;
  onDraftServiceSubTypeFilterChange: (value: string) => void;
  technicians: Technician[];
  serviceSubTypeOptions: string[];
  onReset: () => void;
  onApply: () => void;
};

export function OngoingJobsFiltersDialog({
  open,
  onOpenChange,
  draftAssignmentFilter,
  onDraftAssignmentFilterChange,
  draftAssignedTechnicianFilter,
  onDraftAssignedTechnicianFilterChange,
  draftServiceSubTypeFilter,
  onDraftServiceSubTypeFilterChange,
  technicians,
  serviceSubTypeOptions,
  onReset,
  onApply,
}: OngoingJobsFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ongoing Filters</DialogTitle>
          <DialogDescription>Filter ongoing jobs by assignment, technician, and service type.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assignment</Label>
            <Select
              value={draftAssignmentFilter}
              onValueChange={(v) => onDraftAssignmentFilterChange(v as OngoingAssignmentFilter)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Assigned Technician</Label>
            <Select
              value={draftAssignedTechnicianFilter}
              onValueChange={onDraftAssignedTechnicianFilterChange}
              disabled={draftAssignmentFilter === 'unassigned'}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All technicians" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All technicians</SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.fullName || (t as any).full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Service Sub Type</Label>
            <Select value={draftServiceSubTypeFilter} onValueChange={onDraftServiceSubTypeFilterChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All service sub types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All service sub types</SelectItem>
                {serviceSubTypeOptions.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onReset}>
            Reset
          </Button>
          <Button type="button" onClick={onApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
