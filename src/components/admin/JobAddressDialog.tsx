import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { Job } from '@/types';
import { getLocationLinkFromObject } from '@/lib/jobLocationHelpers';
import { getJobLocationDisplay } from '@/lib/customer-locations';

interface JobAddressDialogProps {
  open: { [jobId: string]: boolean };
  onOpenChange: (open: { [jobId: string]: boolean }) => void;
  jobs: Job[];
}

const JobAddressDialog: React.FC<JobAddressDialogProps> = ({ open, onOpenChange, jobs }) => {
  return (
    <>
      {jobs.map((job) => {
        const jobCustomer = job.customer as any;
        const display = getJobLocationDisplay(job, jobCustomer);
        const serviceAddress = display.address || {};
        const serviceLocation = display.location || {};
        const googleMapsLink = getLocationLinkFromObject(serviceLocation);
        const locationDisplay =
          serviceLocation?.googleLocation ||
          (serviceLocation as any)?.google_location ||
          serviceLocation?.formattedAddress ||
          (serviceLocation as any)?.formatted_address ||
          googleMapsLink;
        
        return (
          <Dialog
            key={job.id}
            open={open[job.id] || false}
            onOpenChange={(isOpen) => {
              onOpenChange({ ...open, [job.id]: isOpen });
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Full Address</DialogTitle>
                <DialogDescription>
                  Complete address for job {job?.job_number || job?.jobNumber || job.id}
                  {display.variant === 'secondary' ? ' (secondary site)' : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {(() => {
                    const address = serviceAddress as any;
                    if (!address || (!address.street && !address.area && !display.visibleLabel)) {
                      return 'No address available';
                    }
                    
                    const parts = [];
                    const visible = address.visible_address || display.visibleLabel;
                    if (visible) {
                      parts.push(`Location: ${visible}`);
                    }
                    if (address.street) parts.push(address.street);
                    if (address.area) parts.push(address.area);
                    if (address.city) parts.push(address.city);
                    if (address.state) parts.push(address.state);
                    if (address.pincode) parts.push(address.pincode);
                    if (address.landmark) parts.push(`Landmark: ${address.landmark}`);
                    
                    return parts.length > 0 ? parts.join(', ') : 'No address available';
                  })()}
                </div>
                {locationDisplay && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-2">Google Maps Location:</div>
                    <div className="text-xs text-foreground/90 break-all">
                      {locationDisplay}
                    </div>
                    {googleMapsLink && (
                      <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium mt-2"
                      >
                        <MapPin className="w-4 h-4" />
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange({ ...open, [job.id]: false });
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })}
    </>
  );
};

export default JobAddressDialog;
