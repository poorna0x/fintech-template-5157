import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { Job, Technician } from '@/types';

interface ReassignJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  onTechnicianSelect: (id: string) => void;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const ReassignJobDialog: React.FC<ReassignJobDialogProps> = ({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[600px] max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Reassign Job to Technician</DialogTitle>
          <DialogDescription className="text-sm">
            Choose how to reassign this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 sm:space-y-6 overflow-y-auto flex-1 pr-1 sm:pr-2">
          {/* Job Details */}
          {job && (
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <span className="font-mono font-bold text-base sm:text-lg">{(job as any)?.job_number}</span>
                <Badge className="bg-blue-100 text-blue-800 text-xs sm:text-sm w-fit">
                  {(job as any)?.service_type} - {(job as any)?.service_sub_type}
                </Badge>
              </div>
              <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                <p><strong>Customer:</strong> {(job as any)?.customer?.full_name || 'N/A'}</p>
                <p><strong>Scheduled:</strong> {(job as any)?.scheduled_date} - {(job as any)?.scheduled_time_slot}</p>
                <p className="truncate"><strong>Location:</strong> {(job as any)?.service_address?.street || 'N/A'}</p>
              </div>
              {(job as any)?.service_location?.googleLocation && (
                <a 
                  href={(job as any)?.service_location?.googleLocation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium mt-2"
                >
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                  Open in Google Maps
                </a>
              )}
            </div>
          )}

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
            Reassign Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignJobDialog;

