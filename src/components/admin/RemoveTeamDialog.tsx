import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Job, Technician } from '@/types';
import { X } from 'lucide-react';

interface RemoveTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTeamMemberId: string;
  onTeamMemberSelect: (technicianId: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const RemoveTeamDialog: React.FC<RemoveTeamDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTeamMemberId,
  onTeamMemberSelect,
  onSave,
  onCancel
}) => {
  if (!job) return null;

  const customer = (job.customer as any) || job.customer;
  const currentTeamMembers = (job as any).team_members || [];
  const teamMembersArray = Array.isArray(currentTeamMembers) ? currentTeamMembers : [];

  // Get team member technician objects
  const teamMemberTechnicians = technicians.filter(tech => 
    teamMembersArray.includes(tech.id)
  );

  if (teamMemberTechnicians.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[500px] max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Remove Team Member</DialogTitle>
            <DialogDescription className="text-sm">
              No team members to remove
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[500px] max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Remove Team Member</DialogTitle>
          <DialogDescription className="text-sm">
            Select a team member to remove from this job
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
            <div className="text-xs sm:text-sm text-gray-600">
              <strong>Team members:</strong> {teamMembersArray.length}
            </div>
          </div>

          {/* Team Member Selection */}
          <div className="space-y-2">
            <Label htmlFor="team-member-remove-select" className="text-sm sm:text-base">Select Team Member to Remove</Label>
            <Select value={selectedTeamMemberId} onValueChange={onTeamMemberSelect}>
              <SelectTrigger className="w-full border border-gray-300 focus:border-red-500 focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Choose a team member" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {teamMemberTechnicians.map((technician) => (
                  <SelectItem
                    key={technician.id}
                    value={technician.id || 'unknown'}
                  >
                    {technician.fullName || (technician as any).full_name || 'Unknown Technician'} ({technician.employeeId || (technician as any).employee_id || 'No ID'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
          >
            <X className="mr-2 h-4 w-4" />
            Remove Team Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RemoveTeamDialog;

