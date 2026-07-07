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
  mode?: LocationMode;
  onViewAddress?: (customer: Customer, variant: CustomerLocationVariant) => void;
}

const actionBtnBase =
  'flex w-full min-w-0 min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors';

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

  const getLocationSummary = (variant: CustomerLocationVariant) => {
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

  const renderLocationCard = (
    variant: CustomerLocationVariant,
    isPrimary: boolean,
    label: string,
    tierLabel: string
  ) => {
    const summary = getLocationSummary(variant);
    const cardClass = isPrimary
      ? 'border-blue-200 bg-blue-50/80'
      : 'border-border bg-muted/30';
    const tierClass = isPrimary ? 'text-blue-600' : 'text-muted-foreground';

    if (mapsOnly) {
      return (
        <button
          type="button"
          onClick={() => openMaps(variant)}
          className={`w-full rounded-lg border p-4 text-left transition-colors active:opacity-90 ${cardClass}`}
        >
          <div className="font-semibold text-foreground break-words">{label}</div>
          <div className={`mt-0.5 text-sm font-medium ${tierClass}`}>{tierLabel}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground break-words">{summary}</p>
        </button>
      );
    }

    return (
      <div className={`w-full rounded-lg border p-4 ${cardClass}`}>
        <div className="mb-3 w-full">
          <div className="font-semibold text-foreground break-words">{label}</div>
          <div className={`mt-0.5 text-sm font-medium ${tierClass}`}>{tierLabel}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground break-words">{summary}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          {showMaps && (
            <button
              type="button"
              onClick={() => openMaps(variant)}
              className={
                isPrimary
                  ? `${actionBtnBase} border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
                  : `${actionBtnBase} border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
              }
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="truncate">Open Maps</span>
            </button>
          )}
          {showAddress && onViewAddress && (
            <button
              type="button"
              onClick={() => {
                onViewAddress(customer, variant);
                onOpenChange(false);
              }}
              className={
                isPrimary
                  ? `${actionBtnBase} border border-blue-300 bg-white text-blue-700 hover:bg-blue-50`
                  : `${actionBtnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`
              }
            >
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">View Address</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-4 p-4 sm:p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <MapPin className="h-5 w-5 shrink-0 text-blue-600" />
            {mapsOnly ? 'Open in Google Maps' : 'Choose a location'}
          </DialogTitle>
          <DialogDescription asChild>
            <span className="text-sm leading-snug">
              Pick Primary or Secondary for{' '}
              <span className={customerNameClassName(customer)}>
                {(customer as any)?.full_name || customer?.fullName || 'customer'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="w-full max-h-[min(60vh,420px)] space-y-3 overflow-y-auto overscroll-contain">
          {renderLocationCard('primary', true, primaryLabel, 'Primary Location')}
          {hasAlternateLocation(customer) &&
            renderLocationCard('secondary', false, secondaryLabel, 'Secondary Location')}
        </div>

        <DialogFooter className="w-full sm:justify-stretch">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocationsDialog;
