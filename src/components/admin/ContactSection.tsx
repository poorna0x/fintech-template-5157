import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mail, MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { toast } from 'sonner';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { getAdminEmailComposerUrl, getAdminWhatsAppComposerUrl, getValidCustomerEmail } from '@/lib/customer-email';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import WhatsAppActionDialog from '@/components/admin/WhatsAppActionDialog';
import PhoneNumbersDialog from '@/components/admin/PhoneNumbersDialog';
import LocationsDialog from '@/components/admin/LocationsDialog';
import {
  CustomerLocationVariant,
  getPrimaryLocationLabel,
  hasMultipleCustomerLocations,
  openCustomerLocationInMaps,
} from '@/lib/customer-locations';
import {
  geolocationFailureMessage,
  getDeviceLocation,
  isGeolocationPositionError,
} from '@/lib/geolocation';

interface ContactSectionProps {
  customer: Customer;
  handlePhoneClick: (customer: Customer) => void;
  handleWhatsAppClick?: (customer: Customer) => void;
  currentLocation: { lat: number; lng: number } | null;
  isGettingLocation: boolean;
  customerDistances: Record<string, { distance: string; duration: string; isCalculating: boolean }>;
  setCurrentLocation: (location: { lat: number; lng: number }) => void;
  setIsGettingLocation: (isGetting: boolean) => void;
  setAddressDialogOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setAddressLocationVariant?: React.Dispatch<
    React.SetStateAction<Record<string, CustomerLocationVariant>>
  >;
  /** Load full customer from DB when the list card only has a slim embed (e.g. map pin / coordinates). */
  hydrateCustomerForMaps?: (customerId: string) => Promise<Customer | null>;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  customer,
  handlePhoneClick,
  handleWhatsAppClick,
  currentLocation,
  isGettingLocation,
  customerDistances,
  setCurrentLocation,
  setIsGettingLocation,
  setAddressDialogOpen,
  setAddressLocationVariant,
  hydrateCustomerForMaps,
}) => {
  const navigate = useNavigate();
  const customerEmail = getValidCustomerEmail(customer.email);
  const [whatsappChoiceOpen, setWhatsappChoiceOpen] = useState(false);
  const [whatsappNumbersOpen, setWhatsappNumbersOpen] = useState(false);
  const [locationsDialogOpen, setLocationsDialogOpen] = useState(false);
  const [locationsDialogCustomer, setLocationsDialogCustomer] = useState<Customer | null>(null);

  const customerDisplayName =
    (customer as any).full_name || customer.fullName || 'Customer';
  const alternatePhone =
    (customer as any).alternate_phone || (customer as any).alternatePhone;

  const handleEmailClick = () => {
    if (!customerEmail) return;
    navigate(getAdminEmailComposerUrl(customer.id));
  };

  const openWhatsAppDirect = () => {
    if (!customer.phone?.trim()) {
      toast.error('Phone number not available');
      return;
    }
    if (alternatePhone && String(alternatePhone).trim() !== customer.phone?.trim()) {
      setWhatsappNumbersOpen(true);
      return;
    }
    window.open(
      `https://wa.me/${formatPhoneForWhatsApp(customer.phone)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const openWhatsAppTemplate = () => {
    if (!customer.phone?.trim()) {
      toast.error('Phone number not available');
      return;
    }
    if (handleWhatsAppClick) {
      handleWhatsAppClick(customer);
      return;
    }
    navigate(getAdminWhatsAppComposerUrl(customer.id, 'general'));
  };

  const handleWhatsAppCardClick = () => {
    if (!customer.phone?.trim()) {
      toast.error('Phone number not available');
      return;
    }
    setWhatsappChoiceOpen(true);
  };

  const captureCurrentLocation = async () => {
    if (currentLocation || isGettingLocation) return;
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    try {
      const location = await getDeviceLocation();
      setCurrentLocation({ lat: location.lat, lng: location.lng });
    } catch (error) {
      if (isGeolocationPositionError(error)) {
        toast.error(geolocationFailureMessage(error));
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to get your location');
      }
    } finally {
      setIsGettingLocation(false);
    }
  };

  const loadCustomerForLocation = async (): Promise<Customer> => {
    if (hydrateCustomerForMaps) {
      const full = await hydrateCustomerForMaps(customer.id);
      if (full) return full;
    }
    return customer;
  };

  const openAddressDialog = (variant: CustomerLocationVariant = 'primary') => {
    captureCurrentLocation();
    setAddressLocationVariant?.((prev) => ({ ...prev, [customer.id]: variant }));
    setAddressDialogOpen((prev) => ({ ...prev, [customer.id]: true }));
  };

  const handleLocationLabelClick = async () => {
    let c = customer;
    if (!hasMultipleCustomerLocations(c) && hydrateCustomerForMaps) {
      const t = toast.loading('Loading…');
      try {
        c = await loadCustomerForLocation();
      } finally {
        toast.dismiss(t);
      }
    }

    if (hasMultipleCustomerLocations(c)) {
      setLocationsDialogCustomer(c);
      setLocationsDialogOpen(true);
      return;
    }
    openAddressDialog('primary');
  };

  const handleMapPinClick = async () => {
    const t = toast.loading('Loading location…');
    try {
      const c = await loadCustomerForLocation();

      if (hasMultipleCustomerLocations(c)) {
        setLocationsDialogCustomer(c);
        setLocationsDialogOpen(true);
        return;
      }

      if (openCustomerLocationInMaps(c, 'primary')) return;
      toast.error('Location data not available');
    } catch {
      toast.error('Location data not available');
    } finally {
      toast.dismiss(t);
    }
  };

  return (
    <div className="p-4 border-b border-gray-100">
      <WhatsAppActionDialog
        open={whatsappChoiceOpen}
        onOpenChange={setWhatsappChoiceOpen}
        customerName={customerDisplayName}
        onOpenWhatsApp={openWhatsAppDirect}
        onOpenTemplate={openWhatsAppTemplate}
      />
      <PhoneNumbersDialog
        open={whatsappNumbersOpen}
        onOpenChange={setWhatsappNumbersOpen}
        customer={customer}
        mode="whatsapp"
      />
      <LocationsDialog
        open={locationsDialogOpen}
        onOpenChange={setLocationsDialogOpen}
        customer={locationsDialogCustomer || customer}
        mode="both"
        onViewAddress={(_c, variant) => openAddressDialog(variant)}
      />
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Phone */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <button 
                onClick={() => {
                  const altPhone = (customer as any).alternate_phone || (customer as any).alternatePhone;
                  if (altPhone) {
                    handlePhoneClick(customer);
                  } else {
                    window.open(`tel:${customer.phone}`, '_self');
                  }
                }}
                className="cursor-pointer"
              >
                <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{customer.phone}</div>
              <div className="text-xs text-gray-500">Primary</div>
            </div>
          </div>
        </div>
        
        {/* Email — opens composer only when a real address is stored */}
        <div
          className={`bg-white rounded-lg p-3 border border-gray-200 transition-all duration-200 ${
            customerEmail
              ? 'hover:border-gray-300 hover:shadow-sm cursor-pointer'
              : 'opacity-90'
          }`}
          onClick={customerEmail ? handleEmailClick : undefined}
          onKeyDown={
            customerEmail
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEmailClick();
                  }
                }
              : undefined
          }
          role={customerEmail ? 'button' : undefined}
          tabIndex={customerEmail ? 0 : undefined}
          title={customerEmail ? 'Send email to this customer' : undefined}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail
                className={`w-4 h-4 sm:w-5 sm:h-5 ${customerEmail ? 'text-gray-600' : 'text-gray-400'}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {customerEmail || 'nomail@mail'}
              </div>
              <div className="text-xs text-gray-500">{customerEmail ? 'Send email' : 'Email'}</div>
            </div>
          </div>
        </div>
        
        {/* WhatsApp — opens composer when phone is on file */}
        <div
          className={`bg-white rounded-lg p-3 border border-gray-200 transition-all duration-200 ${
            customer.phone?.trim()
              ? 'hover:border-gray-300 hover:shadow-sm cursor-pointer'
              : 'opacity-90'
          }`}
          onClick={customer.phone?.trim() ? handleWhatsAppCardClick : undefined}
          onKeyDown={
            customer.phone?.trim()
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleWhatsAppCardClick();
                  }
                }
              : undefined
          }
          role={customer.phone?.trim() ? 'button' : undefined}
          tabIndex={customer.phone?.trim() ? 0 : undefined}
          title={customer.phone?.trim() ? 'WhatsApp — open chat or use template' : undefined}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon
                className={`w-4 h-4 sm:w-5 sm:h-5 ${
                  customer.phone?.trim() ? 'text-gray-600' : 'text-gray-400'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
              <div className="text-xs text-gray-500">
                {customer.phone?.trim() ? 'Send message' : 'No phone'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Location */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <button
                onClick={handleMapPinClick}
                className="cursor-pointer"
              >
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">
                {hasMultipleCustomerLocations(customer)
                  ? getPrimaryLocationLabel(customer)
                  : 'Location'}
              </div>
              <div className="text-xs">
                {hasMultipleCustomerLocations(customer) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationLabelClick();
                    }}
                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                    title="Click to choose primary or secondary location"
                  >
                    Primary · Secondary
                  </button>
                ) : (customer.address as any)?.visible_address && String((customer.address as any).visible_address).trim() ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationLabelClick();
                    }}
                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                    title="Click to view full address and calculate distance"
                  >
                    {String((customer.address as any).visible_address).trim()}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationLabelClick();
                    }}
                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                    title="Click to view full address and calculate distance"
                  >
                    Location
                  </button>
                )}
                {customerDistances[customer.id] && (
                  <div className="mt-1 text-xs font-medium text-black">
                    {customerDistances[customer.id].isCalculating ? (
                      <span className="text-gray-400">Calculating...</span>
                    ) : (
                      <>
                        {customerDistances[customer.id].distance} • {customerDistances[customer.id].duration}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

