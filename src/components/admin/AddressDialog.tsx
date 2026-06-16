import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { formatAddressForDisplay, extractCoordinates } from '@/lib/maps';
import { customerNameClassName } from '@/lib/customerDisplay';
import { toast } from 'sonner';
import { captureUserLocation, OFFICE_ORIGIN_LOCATION, writeCachedUserLocation } from '@/lib/captureUserLocation';

interface AddressDialogProps {
  open: { [customerId: string]: boolean };
  onOpenChange: (open: { [customerId: string]: boolean }) => void;
  customers: Customer[];
  currentLocation: { lat: number; lng: number } | null;
  isGettingLocation?: boolean;
  onSetOrigin?: (location: { lat: number; lng: number }) => void;
  customerDistances: Record<string, { distance: string; duration: string; isCalculating: boolean }>;
  onCalculateDistance: (customer: Customer, origin?: { lat: number; lng: number }) => Promise<void>;
}

const AddressDialog: React.FC<AddressDialogProps> = ({
  open,
  onOpenChange,
  customers,
  currentLocation,
  isGettingLocation = false,
  onSetOrigin,
  customerDistances,
  onCalculateDistance
}) => {
  // Only render dialogs that are actually open (avoids mounting many dialogs when e.g. search has many results)
  const openCustomerIds = Object.keys(open).filter((id) => open[id]);
  const customersToRender = customers.filter((c) => openCustomerIds.includes(c.id));

  return (
    <>
      {customersToRender.map((customer) => (
        <Dialog
          key={customer.id}
          open={true}
          onOpenChange={(isOpen) => {
            onOpenChange({ ...open, [customer.id]: isOpen });
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Full Address</DialogTitle>
              <DialogDescription asChild>
                <span>
                  Complete address for{' '}
                  <span className={customerNameClassName(customer)}>{customer.fullName || 'Customer'}</span>
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="text-sm text-foreground whitespace-pre-wrap break-words space-y-2">
                {(() => {
                  const fullAddr = formatAddressForDisplay(customer.address)?.trim();
                  const vis = String(
                    (customer.address as any)?.visible_address ||
                      (customer as any).visible_address ||
                      ''
                  ).trim();
                  const loc = customer.location as any;
                  const locFa = String(loc?.formattedAddress || loc?.formatted_address || '').trim();
                  const gLoc = typeof loc?.googleLocation === 'string' ? loc.googleLocation.trim() : '';

                  if (fullAddr) return <span>{fullAddr}</span>;
                  if (vis) return <span>{vis}</span>;
                  if (locFa) return <span>{locFa}</span>;
                  if (gLoc) {
                    return (
                      <a
                        href={gLoc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 break-all underline-offset-2 hover:underline"
                      >
                        {gLoc}
                      </a>
                    );
                  }
                  return <span className="text-muted-foreground">No address available</span>;
                })()}
              </div>
              
              {/* Distance and Time */}
              <div className="pt-3 border-t border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold text-foreground">Distance & Time</div>
                  <div className="flex flex-wrap gap-1.5">
                    {onSetOrigin && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          disabled={isGettingLocation}
                          onClick={async () => {
                            const result = await captureUserLocation({ skipCache: true });
                            if (result.ok) {
                              onSetOrigin(result.location);
                              writeCachedUserLocation(result.location);
                              toast.success(
                                result.source === 'google_ip'
                                  ? 'Using approximate network location.'
                                  : 'Location updated.'
                              );
                            } else {
                              toast.error(result.error);
                            }
                          }}
                        >
                          {isGettingLocation ? 'Locating…' : 'My location'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => {
                            onSetOrigin(OFFICE_ORIGIN_LOCATION);
                            writeCachedUserLocation(OFFICE_ORIGIN_LOCATION);
                            toast.success('Using office location (Bengaluru).');
                          }}
                        >
                          Office
                        </Button>
                      </>
                    )}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      let origin = currentLocation;
                      if (!origin && onSetOrigin) {
                        const result = await captureUserLocation();
                        if (result.ok) {
                          origin = result.location;
                          onSetOrigin(result.location);
                          writeCachedUserLocation(result.location);
                          if (result.source === 'google_ip') {
                            toast.info('Using approximate network location for distance.');
                          }
                        } else {
                          toast.error(result.error);
                          return;
                        }
                      }
                      if (!origin) {
                        toast.error('Set your location first (My location or Office).');
                        return;
                      }
                      
                      const customerLocation = extractCoordinates(customer.location);
                      let finalCustomerLocation = customerLocation;
                      
                      // If no coordinates from location, try to extract from Google Maps link
                      if (!finalCustomerLocation || finalCustomerLocation.latitude === 0 || finalCustomerLocation.longitude === 0) {
                        const locAny = customer.location as any;
                        const googleMapsLink =
                          locAny?.formattedAddress ||
                          locAny?.formatted_address ||
                          (typeof locAny?.googleLocation === 'string' ? locAny.googleLocation : '');
                        if (
                          googleMapsLink &&
                          (googleMapsLink.includes('google.com/maps') ||
                            googleMapsLink.includes('maps.app.goo.gl') ||
                            googleMapsLink.includes('goo.gl/maps'))
                        ) {
                          finalCustomerLocation = extractCoordinates({ formattedAddress: googleMapsLink });
                        }
                      }
                      
                      if (finalCustomerLocation && finalCustomerLocation.latitude && finalCustomerLocation.longitude) {
                        await onCalculateDistance(customer, origin);
                      } else {
                        toast.error('Customer location coordinates are invalid');
                      }
                    }}
                    disabled={customerDistances[customer.id]?.isCalculating || isGettingLocation}
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
                </div>
                {customerDistances[customer.id] ? (
                  <div className="text-sm">
                    {customerDistances[customer.id].isCalculating ? (
                      <span className="text-muted-foreground">Calculating...</span>
                    ) : (
                      <div className="flex items-center gap-2 text-black font-medium">
                        <span>{customerDistances[customer.id].distance}</span>
                        {customerDistances[customer.id].duration && (
                          <>
                            <span className="text-muted-foreground/70">•</span>
                            <span>{customerDistances[customer.id].duration}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {currentLocation
                      ? 'Click Calculate for driving distance from your origin.'
                      : 'Set My location, Office, or Calculate (will try network location).'}
                  </div>
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

