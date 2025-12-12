import React from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';
import { Customer } from '@/types';
import { extractCoordinates } from '@/lib/maps';
import { toast } from 'sonner';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { formatPhoneForWhatsApp } from '@/lib/utils';

interface ContactSectionProps {
  customer: Customer;
  handlePhoneClick: (customer: Customer) => void;
  currentLocation: { lat: number; lng: number } | null;
  isGettingLocation: boolean;
  customerDistances: Record<string, { distance: string; duration: string; isCalculating: boolean }>;
  setCurrentLocation: (location: { lat: number; lng: number }) => void;
  setIsGettingLocation: (isGetting: boolean) => void;
  setAddressDialogOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export const ContactSection: React.FC<ContactSectionProps> = ({
  customer,
  handlePhoneClick,
  currentLocation,
  isGettingLocation,
  customerDistances,
  setCurrentLocation,
  setIsGettingLocation,
  setAddressDialogOpen,
}) => {
  return (
    <div className="p-4 border-b border-gray-100">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Phone */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <button 
                onClick={() => {
                  if (customer.alternate_phone) {
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
        
        {/* Email */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail') ? (
                <a href={`mailto:${customer.email}`} className="cursor-pointer">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </a>
              ) : (
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail') 
                  ? customer.email 
                  : 'nomail@mail'}
              </div>
              <div className="text-xs text-gray-500">Email</div>
            </div>
          </div>
        </div>
        
        {/* WhatsApp */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <button
                onClick={() => {
                  const phoneToUse = customer.phone || '';
                  
                  if (!phoneToUse) {
                    toast.error('Phone number not available');
                    return;
                  }
                  
                  const formattedPhone = formatPhoneForWhatsApp(phoneToUse);
                  const whatsappUrl = `https://wa.me/${formattedPhone}`;
                  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                }}
                className="cursor-pointer"
              >
                <WhatsAppIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 hover:text-green-600 transition-colors" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">WhatsApp</div>
              <div className="text-xs text-gray-500">Send Message</div>
            </div>
          </div>
        </div>
        
        {/* Location */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <button
                onClick={() => {
                  const googleLoc = (customer.location as any)?.googleLocation;
                  if (googleLoc && typeof googleLoc === 'string' && 
                      (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                      !googleLoc.includes('localhost') && 
                      !googleLoc.includes('127.0.0.1')) {
                    window.open(googleLoc, '_blank', 'noopener,noreferrer');
                  } else {
                    const location = extractCoordinates(customer.location);
                    if (location && location.latitude !== 0 && location.longitude !== 0) {
                      window.open(`https://www.google.com/maps/place/${location.latitude},${location.longitude}`, '_blank', 'noopener,noreferrer');
                    } else {
                      toast.error('Location data not available');
                    }
                  }
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
                    onClick={async (e) => {
                      e.stopPropagation();
                      
                      if (!currentLocation) {
                        if (!navigator.geolocation) {
                          toast.error('Geolocation is not supported by your browser');
                          return;
                        }
                        
                        setIsGettingLocation(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            const location = {
                              lat: position.coords.latitude,
                              lng: position.coords.longitude
                            };
                            setCurrentLocation(location);
                            setIsGettingLocation(false);
                          },
                          (error) => {
                            setIsGettingLocation(false);
                            toast.error('Failed to get your location');
                          },
                          {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0,
                          }
                        );
                      }
                      
                      setAddressDialogOpen(prev => ({ ...prev, [customer.id]: true }));
                    }}
                    className="text-left text-black hover:text-gray-700 hover:underline transition-colors cursor-pointer font-medium w-full text-left"
                    title="Click to view full address and calculate distance"
                  >
                    {String((customer.address as any).visible_address).trim()}
                  </button>
                ) : (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      
                      if (!currentLocation) {
                        if (!navigator.geolocation) {
                          toast.error('Geolocation is not supported by your browser');
                          return;
                        }
                        
                        setIsGettingLocation(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            const location = {
                              lat: position.coords.latitude,
                              lng: position.coords.longitude
                            };
                            setCurrentLocation(location);
                            setIsGettingLocation(false);
                          },
                          (error) => {
                            setIsGettingLocation(false);
                            toast.error('Failed to get your location');
                          },
                          {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0,
                          }
                        );
                      }
                      
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

