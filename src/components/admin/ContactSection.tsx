import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mail, MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { extractCoordinates } from '@/lib/maps';
import { toast } from 'sonner';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { getAdminEmailComposerUrl, getAdminWhatsAppComposerUrl, getValidCustomerEmail } from '@/lib/customer-email';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import WhatsAppActionDialog from '@/components/admin/WhatsAppActionDialog';
import PhoneNumbersDialog from '@/components/admin/PhoneNumbersDialog';

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
  /** Load full customer from DB when the list card only has a slim embed (e.g. map pin / coordinates). */
  hydrateCustomerForMaps?: (customerId: string) => Promise<Customer | null>;
  onCustomerPhonesSwapped?: (customer: Customer) => void;
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
  hydrateCustomerForMaps,
  onCustomerPhonesSwapped,
}) => {
  const navigate = useNavigate();
  const customerEmail = getValidCustomerEmail(customer.email);
  const [whatsappChoiceOpen, setWhatsappChoiceOpen] = useState(false);
  const [whatsappNumbersOpen, setWhatsappNumbersOpen] = useState(false);

  const customerDisplayName =
    (customer as any).full_name || customer.fullName || 'Customer';
  const alternatePhone =
    (customer as any).alternate_phone || (customer as any).alternatePhone;

  const handleEmailClick = () => {
    if (!customerEmail) return;
    navigate(getAdminEmailComposerUrl(customer.id, 'general'));
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

  // Mirror the booking page's forgiving geolocation: longer timeout + allow a recent cached
  // fix, then retry with even more relaxed settings. Strict settings (10s, maximumAge: 0)
  // fail on desktops with no GPS, even when the booking page succeeds on the same device.
  const captureCurrentLocation = () => {
    if (currentLocation) return;
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);

    const onSuccess = (position: GeolocationPosition) => {
      setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setIsGettingLocation(false);
    };

    const reportError = (error: GeolocationPositionError) => {
      setIsGettingLocation(false);
      let msg = 'Failed to get your location';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg = 'Permission denied. Allow location access for this site.';
          break;
        case error.POSITION_UNAVAILABLE:
          msg = 'Location information unavailable. Please check your location settings.';
          break;
        case error.TIMEOUT:
          msg = 'Location request timed out. Please try again.';
          break;
      }
      toast.error(msg);
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => {
        // Fallback with relaxed settings (longer timeout, allow older cached fix).
        navigator.geolocation.getCurrentPosition(onSuccess, reportError, {
          enableHighAccuracy: true,
          timeout: 45000,
          maximumAge: 300000,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 60000,
      }
    );
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
        onPhonesSwapped={onCustomerPhonesSwapped}
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
                onClick={async () => {
                  const tryOpenForCustomer = (c: Customer): boolean => {
                    const locAny = c.location as any;
                    const googleLoc =
                      (typeof locAny?.googleLocation === 'string' && locAny.googleLocation) ||
                      (typeof locAny?.google_location === 'string' && locAny.google_location) ||
                      '';
                    if (
                      googleLoc &&
                      (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                      !googleLoc.includes('localhost') &&
                      !googleLoc.includes('127.0.0.1')
                    ) {
                      window.open(googleLoc, '_blank', 'noopener,noreferrer');
                      return true;
                    }
                    const location = extractCoordinates(c.location);
                    if (location && location.latitude !== 0 && location.longitude !== 0) {
                      window.open(
                        `https://www.google.com/maps/place/${location.latitude},${location.longitude}`,
                        '_blank',
                        'noopener,noreferrer'
                      );
                      return true;
                    }
                    return false;
                  };

                  if (tryOpenForCustomer(customer)) return;

                  if (hydrateCustomerForMaps) {
                    const t = toast.loading('Loading location…');
                    try {
                      const full = await hydrateCustomerForMaps(customer.id);
                      toast.dismiss(t);
                      if (full && tryOpenForCustomer(full)) return;
                    } catch {
                      toast.dismiss(t);
                    }
                  }

                  toast.error('Location data not available');
                }}
                className="cursor-pointer"
              >
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">
                Location
              </div>
              <div className="text-xs">
                {(customer.address as any)?.visible_address && String((customer.address as any).visible_address).trim() ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      captureCurrentLocation();
                      setAddressDialogOpen(prev => ({ ...prev, [customer.id]: true }));
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
                      captureCurrentLocation();
                      setAddressDialogOpen(prev => ({ ...prev, [customer.id]: true }));
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

