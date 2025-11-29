import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Job, Technician } from '@/types';
import { MapPin } from 'lucide-react';

interface AssignJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  onTechnicianSelect: (technicianId: string) => void;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const AssignJobDialog: React.FC<AssignJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTechnicianId,
  onTechnicianSelect,
  onReloadTechnicians,
  onSave,
  onCancel
}) => {
  if (!job) return null;

  const customer = (job.customer as any) || job.customer;
  const serviceLocation = (job.service_location as any) || job.serviceLocation || {};
  const googleMapsLink = serviceLocation.googleLocation || serviceLocation.google_location || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[600px] max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Assign Job to Technician</DialogTitle>
          <DialogDescription className="text-sm">
            Choose how to assign this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 px-1">
          {/* Job Information */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <div className="font-semibold text-sm sm:text-base">
              {(job as any).job_number || job.jobNumber}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              {customer?.full_name || customer?.fullName || 'Customer'}
            </div>
            {googleMapsLink && (
              <a
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs sm:text-sm text-blue-600 hover:text-blue-700 mt-1"
              >
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                Open in Google Maps
              </a>
            )}
          </div>

          {/* Technician Selection */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Label htmlFor="technician-select" className="text-sm sm:text-base">Select Technician</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReloadTechnicians}
                className="text-xs w-full sm:w-auto"
              >
                🔄 Refresh List
              </Button>
            </div>
            <Select value={selectedTechnicianId} onValueChange={onTechnicianSelect}>
              <SelectTrigger className="w-full border border-gray-300 focus:border-blue-500 focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Choose a technician" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {technicians.length === 0 ? (
                  <SelectItem value="no-technicians" disabled>
                    No technicians available
                  </SelectItem>
                ) : (
                  technicians
                    .filter(tech => tech.account_status !== 'INACTIVE')
                    .map((technician) => (
                      <SelectItem
                        key={technician.id}
                        value={technician.id || 'unknown'}
                      >
                        <div className="flex items-center gap-2">
                          <span>{technician.fullName || 'Unknown Technician'}</span>
                          {technician.employeeId && (
                            <span className="text-xs text-gray-500">({technician.employeeId})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter className="mt-4 flex-shrink-0 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!selectedTechnicianId}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            Assign Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignJobDialog;

