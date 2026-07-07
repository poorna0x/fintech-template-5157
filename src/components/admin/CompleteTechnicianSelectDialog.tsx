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
import type { Job, Technician } from '@/types';

type CompleteTechnicianSelectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  onSelectedTechnicianChange: (technicianId: string) => void;
  onContinue: () => void;
};

export default function CompleteTechnicianSelectDialog({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTechnicianId,
  onSelectedTechnicianChange,
  onContinue,
}: CompleteTechnicianSelectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Technician</DialogTitle>
          <DialogDescription>
            Select the technician who completed this job, or choose Office if no technician was involved
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {job && (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="font-medium text-sm">
                Job: {(job as any).job_number || job.jobNumber}
              </p>
              <p className="text-sm text-gray-600">
                {(job.serviceType || (job as any).service_type || 'N/A')} -{' '}
                {(job.serviceSubType || (job as any).service_sub_type || 'N/A')}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="technician-select-complete">Completed By *</Label>
            <Select value={selectedTechnicianId} onValueChange={onSelectedTechnicianChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a technician" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Office (no technician)</SelectItem>
                {technicians
                  .filter((tech) => !(tech as any).account_status || (tech as any).account_status === 'ACTIVE')
                  .map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.fullName || 'Unknown'} ({technician.employeeId || 'No ID'})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onContinue}
            disabled={!selectedTechnicianId}
            className="bg-black hover:bg-gray-800 text-white"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
