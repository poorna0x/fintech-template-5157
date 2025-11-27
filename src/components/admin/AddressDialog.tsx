import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { formatAddressForDisplay, extractCoordinates } from '@/lib/maps';
import { toast } from 'sonner';

interface AddressDialogProps {
  open: { [customerId: string]: boolean };
  onOpenChange: (open: { [customerId: string]: boolean }) => void;
  customers: Customer[];
  currentLocation: { lat: number; lng: number } | null;
  customerDistances: Record<string, { distance: string; duration: string; isCalculating: boolean }>;
  onCalculateDistance: (customer: Customer) => Promise<void>;
}

const AddressDialog: React.FC<AddressDialogProps> = ({
  open,
  onOpenChange,
  customers,
  currentLocation,
  customerDistances,
  onCalculateDistance
}) => {
  return (
    <>
      {customers.map((customer) => (
        <Dialog
          key={customer.id}
          open={open[customer.id] || false}
          onOpenChange={(isOpen) => {
            onOpenChange({ ...open, [customer.id]: isOpen });
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Full Address</DialogTitle>
              <DialogDescription>
                Complete address for {customer.fullName || 'Customer'}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {formatAddressForDisplay(customer.address) || 'No address available'}
              </div>
              
              {/* Distance and Time */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-900">Distance & Time</div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      if (!currentLocation) {
                        toast.error('Your location is not available. Please enable location services.');
                        return;
                      }
                      
                      const customerLocation = extractCoordinates(customer.location);
                      let finalCustomerLocation = customerLocation;
                      
                      // If no coordinates from location, try to extract from Google Maps link
                      if (!finalCustomerLocation || finalCustomerLocation.latitude === 0 || finalCustomerLocation.longitude === 0) {
                        const googleMapsLink = customer.location?.formattedAddress;
                        if (googleMapsLink && (googleMapsLink.includes('google.com/maps') || googleMapsLink.includes('maps.app.goo.gl'))) {
                          finalCustomerLocation = extractCoordinates({ formattedAddress: googleMapsLink });
                        }
                      }
                      
                      if (finalCustomerLocation && finalCustomerLocation.latitude && finalCustomerLocation.longitude) {
                        await onCalculateDistance(customer);
                      } else {
                        toast.error('Customer location coordinates are invalid');
                      }
                    }}
                    disabled={customerDistances[customer.id]?.isCalculating || !currentLocation}
                    className="bg-black hover:bg-gray-800 text-white text-xs h-7 px-2"
                  >
                    {customerDistances[customer.id]?.isCalculating ? (
                      <>
                        <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        <span className="text-xs">Calculating...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-2.5 h-2.5 mr-1" />
                        <span className="text-xs">Calculate</span>
                      </>
                    )}
                  </Button>
                </div>
                {customerDistances[customer.id] ? (
                  <div className="text-sm">
                    {customerDistances[customer.id].isCalculating ? (
                      <span className="text-gray-500">Calculating...</span>
                    ) : (
                      <div className="flex items-center gap-2 text-black font-medium">
                        <span>{customerDistances[customer.id].distance}</span>
                        {customerDistances[customer.id].duration && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span>{customerDistances[customer.id].duration}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Click "Calculate" button to get distance and time</div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange({ ...open, [customer.id]: false });
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </>
  );
};

export default AddressDialog;

