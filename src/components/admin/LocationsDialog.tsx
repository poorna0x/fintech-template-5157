import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { customerNameClassName } from '@/lib/customerDisplay';
import {
  CustomerLocationVariant,
  getCustomerLocationSlice,
  getPrimaryLocationLabel,
  getSecondaryLocationLabel,
  hasAlternateLocation,
  openCustomerLocationInMaps,
} from '@/lib/customer-locations';
import { formatAddressForDisplay } from '@/lib/maps';
import { toast } from 'sonner';

type LocationMode = 'maps' | 'address' | 'both';

interface LocationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  /** Which actions to show on each location card. Defaults to 'both'. */
  mode?: LocationMode;
  onViewAddress?: (customer: Customer, variant: CustomerLocationVariant) => void;
}

const LocationsDialog: React.FC<LocationsDialogProps> = ({
  open,
  onOpenChange,
  customer,
  mode = 'both',
  onViewAddress,
}) => {
  if (!customer) return null;

  const mapsOnly = mode === 'maps';
  const showMaps = mode === 'maps' || mode === 'both';
  const showAddress = mode === 'address' || mode === 'both';
  const primaryLabel = getPrimaryLocationLabel(customer);
  const secondaryLabel = getSecondaryLocationLabel(customer);

  const renderLocationSummary = (variant: CustomerLocationVariant) => {
    const slice = getCustomerLocationSlice(customer, variant);
    const fullAddr = formatAddressForDisplay(slice.address)?.trim();
    if (fullAddr) return fullAddr;
    if (slice.visibleAddress) return slice.visibleAddress;
    const locFa = String(slice.location?.formattedAddress || '').trim();
    if (locFa) return locFa;
    return variant === 'primary' ? 'Primary location' : 'Secondary location';
  };

  const openMaps = (variant: CustomerLocationVariant) => {
    const opened = openCustomerLocationInMaps(customer, variant);
    if (opened) {
      onOpenChange(false);
    } else {
      toast.error('Location data not available');
    }
  };

  const renderMapsAction = (variant: CustomerLocationVariant, isPrimary: boolean) => (
    <button
      type="button"
      onClick={() => openMaps(variant)}
      className={
        isPrimary
          ? 'inline-flex items-center gap-1.5 rounded-lg border-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-600 hover:text-white'
          : 'inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-500 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-600 hover:text-white'
      }
    >
      <ExternalLink className="h-4 w-4" />
      Open Maps
    </button>
  );

  const renderAddressAction = (variant: CustomerLocationVariant, isPrimary: boolean) => (
    <button
      type="button"
      onClick={() => {
        if (onViewAddress) {
          onViewAddress(customer, variant);
          onOpenChange(false);
        }
      }}
      className={
        isPrimary
          ? 'inline-flex items-center gap-1.5 rounded-lg border-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-600 hover:text-white'
          : 'inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-500 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-600 hover:text-white'
      }
    >
      <MapPin className="h-4 w-4" />
      View Address
    </button>
  );

  const renderActions = (variant: CustomerLocationVariant, isPrimary: boolean) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {showMaps && renderMapsAction(variant, isPrimary)}
      {showAddress && onViewAddress && renderAddressAction(variant, isPrimary)}
    </div>
  );

  const renderLocationCard = (
    variant: CustomerLocationVariant,
    isPrimary: boolean,
    label: string,
    tierLabel: string
  ) => {
    const cardClass = isPrimary
      ? 'border-blue-200 bg-blue-50/80 hover:border-blue-300 hover:bg-blue-50'
      : 'border-border bg-muted/30 hover:border-gray-300 hover:bg-muted/50';
    const tierClass = isPrimary ? 'text-blue-600' : 'text-muted-foreground';

    const content = (
      <>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground truncate">{label}</div>
          <div className={`text-sm font-medium ${tierClass}`}>{tierLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {renderLocationSummary(variant)}
          </div>
        </div>
        {!mapsOnly && renderActions(variant, isPrimary)}
      </>
    );

    if (mapsOnly) {
      return (
        <button
          type="button"
          onClick={() => openMaps(variant)}
          className={`flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${cardClass}`}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${cardClass}`}
      >
        {content}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            {mapsOnly ? 'Open in Google Maps' : 'Customer Locations'}
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              {mapsOnly ? 'Choose which location to open for ' : 'Choose a location for '}
              <span className={customerNameClassName(customer)}>
                {(customer as any)?.full_name || customer?.fullName || 'customer'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {renderLocationCard('primary', true, primaryLabel, 'Primary Location')}

          {hasAlternateLocation(customer) &&
            renderLocationCard('secondary', false, secondaryLabel, 'Secondary Location')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationsDialog;
