import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Job, Technician } from '@/types';

interface AddTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTeamMemberId: string;
  onTeamMemberSelect: (technicianId: string) => void;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const AddTeamDialog: React.FC<AddTeamDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTeamMemberId,
  onTeamMemberSelect,
  onReloadTechnicians,
  onSave,
  onCancel
}) => {
  if (!job) return null;

  const customer = (job.customer as any) || job.customer;
  const assignedTechnicianId = (job as any).assigned_technician_id || job.assignedTechnicianId;
  const currentTeamMembers = (job as any).team_members || [];
  const teamMembersArray = Array.isArray(currentTeamMembers) ? currentTeamMembers : [];

  // Filter out the assigned technician and existing team members
  const availableTechnicians = technicians.filter(tech => {
    // Exclude inactive technicians
    if ((tech as any).account_status === 'INACTIVE') return false;
    // Exclude the primary assigned technician
    if (tech.id === assignedTechnicianId) return false;
    // Exclude existing team members
    if (teamMembersArray.includes(tech.id)) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[500px] max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Add Team Member</DialogTitle>
          <DialogDescription className="text-sm">
            Select a technician to add as a teammate for this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Job Information */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <div className="font-semibold text-sm sm:text-base">
              {(job as any).job_number || job.jobNumber}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              {customer?.full_name || customer?.fullName || 'Customer'}
            </div>
            {assignedTechnicianId && (() => {
              const assignedTech = technicians.find(t => t.id === assignedTechnicianId);
              return assignedTech ? (
                <div className="text-xs sm:text-sm text-gray-600">
                  <strong>Assigned to:</strong> {assignedTech.fullName}
                </div>
              ) : null;
            })()}
            {teamMembersArray.length > 0 && (
              <div className="text-xs sm:text-sm text-gray-600">
                <strong>Team members:</strong> {teamMembersArray.length}
              </div>
            )}
          </div>

          {/* Team Member Selection */}
          <div className="space-y-2">
            <Label htmlFor="team-member-select" className="text-sm sm:text-base">Select Team Member</Label>
            <Select value={selectedTeamMemberId} onValueChange={onTeamMemberSelect}>
              <SelectTrigger className="w-full border border-gray-300 focus:border-blue-500 focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Choose a technician" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {availableTechnicians.length === 0 ? (
                  <SelectItem value="no-technicians" disabled>
                    No available technicians (all are already assigned or in team)
                  </SelectItem>
                ) : (
                  availableTechnicians.map((technician) => (
                    <SelectItem
                      key={technician.id}
                      value={technician.id || 'unknown'}
                    >
                      {technician.fullName || 'Unknown Technician'} ({technician.employeeId || 'No ID'})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {availableTechnicians.length === 0 && (
              <div className="text-xs text-gray-500 mt-1">
                All technicians are already assigned to this job or are team members
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!selectedTeamMemberId}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            Add Team Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddTeamDialog;

