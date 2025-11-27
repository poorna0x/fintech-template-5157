import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Job } from '@/types';

interface DescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobDescription: { jobId: string; description: string } | null;
  jobs: Job[];
}

const DescriptionDialog: React.FC<DescriptionDialogProps> = ({ 
  open, 
  onOpenChange, 
  selectedJobDescription, 
  jobs 
}) => {
  const job = jobs.find(j => j.id === selectedJobDescription?.jobId);
  const jobNumber = job?.job_number || job?.jobNumber || selectedJobDescription?.jobId || 'N/A';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Job Description</DialogTitle>
          <DialogDescription>
            Full description for job {jobNumber}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="prose max-w-none">
            <p className="text-gray-900 whitespace-pre-wrap break-words">
              {selectedJobDescription?.description || 'No description available'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DescriptionDialog;

