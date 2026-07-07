import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { formatAddressForDisplay } from '@/lib/maps';
import { customerNameClassName } from '@/lib/customerDisplay';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { getLocationUnavailableMessage, resolveCustomerLatLngFromRow } from '@/lib/jobLocationHelpers';
import {
  CustomerLocationVariant,
  getCustomerLocationSlice,
} from '@/lib/customer-locations';

interface AddressDialogProps {
  open: { [customerId: string]: boolean };
  onOpenChange: (open: { [customerId: string]: boolean }) => void;
  customers: Customer[];
  locationVariantByCustomerId?: Record<string, CustomerLocationVariant>;
  currentLocation: { lat: number; lng: number } | null;
  customerDistances: Record<string, { distance: string; duration: string; isCalculating: boolean }>;
  onCalculateDistance: (
    customer: Customer,
    destination: { lat: number; lng: number }
  ) => Promise<void>;
}

const customerForLocationVariant = (
  customer: Customer,
  variant: CustomerLocationVariant
): Customer => {
  if (variant === 'primary') return customer;
  const slice = getCustomerLocationSlice(customer, 'secondary');
  return {
    ...customer,
    visible_address: slice.visibleAddress,
    address: slice.address,
    location: slice.location,
  } as Customer;
};

const AddressDialog: React.FC<AddressDialogProps> = ({
  open,
  onOpenChange,
  customers,
  locationVariantByCustomerId = {},
  currentLocation,
  customerDistances,
  onCalculateDistance
}) => {
  const openCustomerIds = Object.keys(open).filter((id) => open[id]);
  const customersToRender = customers.filter((c) => openCustomerIds.includes(c.id));

  return (
    <>
      {customersToRender.map((customer) => {
        const variant = locationVariantByCustomerId[customer.id] || 'primary';
        const slice = getCustomerLocationSlice(customer, variant);
        const displayCustomer = customerForLocationVariant(customer, variant);
        const variantLabel = variant === 'secondary' ? 'Secondary Location' : 'Primary Location';

        return (
        <Dialog
          key={`${customer.id}-${variant}`}
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
                  {variantLabel} for{' '}
                  <span className={customerNameClassName(customer)}>{customer.fullName || 'Customer'}</span>
                  {slice.visibleAddress ? (
                    <>
                      {' '}
                      — <span className="font-medium">{slice.visibleAddress}</span>
                    </>
                  ) : null}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="text-sm text-foreground whitespace-pre-wrap break-words space-y-2">
                {(() => {
                  const fullAddr = formatAddressForDisplay(slice.address)?.trim();
                  const vis = slice.visibleAddress;
                  const loc = slice.location as any;
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
              
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-foreground">Distance & Time</div>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      if (!currentLocation) {
                        toast.error('Your location is not available. Please enable location services.');
                        return;
                      }

                      let loadingToast: string | number | undefined;
                      const resolved = await resolveCustomerLatLngFromRow(displayCustomer, {
                        getCustomerById: async (id) => {
                          if (variant === 'primary') {
                            return db.customers.getById(id);
                          }
                          const result = await db.customers.getById(id);
                          if (!result.data) return result;
                          return {
                            ...result,
                            data: customerForLocationVariant(
                              result.data as Customer,
                              'secondary'
                            ),
                          };
                        },
                        onResolvingLink: () => {
                          loadingToast = toast.loading('Resolving map link...');
                        },
                      });
                      if (loadingToast !== undefined) toast.dismiss(loadingToast);

                      if (!resolved) {
                        toast.error(getLocationUnavailableMessage({ id: customer.id, customer: displayCustomer }));
                        return;
                      }

                      await onCalculateDistance(customer, {
                        lat: resolved.lat,
                        lng: resolved.lng,
                      });
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
                  <div className="text-xs text-muted-foreground">Click "Calculate" button to get distance and time</div>
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
        );
      })}
    </>
  );
};

export default AddressDialog;
