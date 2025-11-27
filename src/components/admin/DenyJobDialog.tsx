import React, { useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Job } from '@/types';

interface DenyJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  denyReason: string;
  onDenyReasonChange: (reason: string) => void;
  onDeny: () => void;
}

const suggestedDenialReasons = [
  'Customer not available',
  'Customer cancelled',
  'Customer not responding',
  'Wrong address provided',
  'Location not accessible',
  'Equipment not available',
  'Technical issue',
  'Customer not interested',
  'Price too high',
  'Already serviced by another company',
  'Customer moved',
  'Equipment damaged beyond repair',
  'No response from customer',
  'Customer rescheduled multiple times',
  'Safety concerns',
  'Incomplete information'
];

const DenyJobDialog: React.FC<DenyJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  denyReason,
  onDenyReasonChange,
  onDeny
}) => {
  const denyReasonInputRef = useRef<HTMLTextAreaElement>(null);
  const [showDenySuggestions, setShowDenySuggestions] = React.useState(false);

  const filteredDenialSuggestions = useMemo(() => {
    if (!denyReason.trim()) return [];
    const lowerReason = denyReason.toLowerCase();
    return suggestedDenialReasons.filter(s => 
      s.toLowerCase().includes(lowerReason)
    );
  }, [denyReason]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deny Job</DialogTitle>
          <DialogDescription>
            Please provide a reason for denying this job.
          </DialogDescription>
        </DialogHeader>
        
        {job && (
          <div className="p-3 bg-gray-50 rounded-lg mb-4">
            <div className="text-sm font-medium text-gray-900">
              Job: {(job as any).job_number || job.jobNumber}
            </div>
            <div className="text-sm text-gray-600">
              {((job as any).service_type || job.serviceType || 'N/A')} - {((job as any).service_sub_type || job.serviceSubType || 'N/A')}
            </div>
            <div className="text-sm text-gray-600">
              Customer: {(job.customer as any)?.full_name || job.customer?.fullName || 'Unknown'}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="deny-reason">Reason for Denial *</Label>
            <div className="relative">
              <Textarea
                ref={denyReasonInputRef}
                id="deny-reason"
                placeholder="Type a reason..."
                value={denyReason}
                onChange={(e) => {
                  onDenyReasonChange(e.target.value);
                  setShowDenySuggestions(e.target.value.length > 0);
                }}
                onFocus={() => setShowDenySuggestions(denyReason.length > 0)}
                onBlur={() => {
                  setTimeout(() => setShowDenySuggestions(false), 200);
                }}
                rows={3}
                className="mt-1 pr-10"
                required
              />
              {showDenySuggestions && filteredDenialSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredDenialSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onDenyReasonChange(suggestion);
                        setShowDenySuggestions(false);
                        denyReasonInputRef.current?.blur();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!showDenySuggestions && denyReason.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Start typing to see suggested reasons
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onDenyReasonChange('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={onDeny}
            disabled={!denyReason.trim()}
            variant="destructive"
          >
            Deny Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DenyJobDialog;

