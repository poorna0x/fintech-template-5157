import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { Job } from '@/types';

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
        const serviceAddress = (job as any)?.service_address || jobCustomer?.address || {};
        const serviceLocation = (job as any)?.service_location || jobCustomer?.location || {};
        
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
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {(() => {
                    const address = serviceAddress;
                    if (!address || (!address.street && !address.area)) {
                      return 'No address available';
                    }
                    
                    const parts = [];
                    if (address.visible_address) {
                      parts.push(`Location: ${address.visible_address}`);
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
                {serviceLocation?.formattedAddress && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-2">Google Maps Location:</div>
                    <div className="text-xs text-gray-700 break-all">
                      {serviceLocation.formattedAddress}
                    </div>
                    {serviceLocation?.formattedAddress && (
                      <a
                        href={serviceLocation.formattedAddress}
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
                {(serviceLocation?.latitude && serviceLocation?.longitude) && (
                  <div className="mt-2">
                    <a
                      href={`https://www.google.com/maps/place/${serviceLocation.latitude},${serviceLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <MapPin className="w-4 h-4" />
                      Open in Google Maps
                    </a>
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

