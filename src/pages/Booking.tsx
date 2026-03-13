import React, { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, MapPin, Camera, Upload, Check, Phone, Mail, User, Home, Clock, Wrench, Loader2, Search, Navigation, X, ExternalLink } from 'lucide-react';
import { db } from '@/lib/supabase';
import { cloudinaryService, compressImage } from '@/lib/cloudinary';
import { emailService } from '@/lib/email';
import { isIOS, isPWA, shouldUseFileInputFallback, requestCameraAccess, createVideoElement } from '@/lib/cameraUtils';
import { generateJobNumber } from '@/lib/supabase';
import AltchaWidget from '@/components/AltchaWidget';
import HoneypotField from '@/components/HoneypotField';
import BehavioralTracker from '@/components/BehavioralTracker';
import SecurityStatus from '@/components/SecurityStatus';
import { useSecurity } from '@/contexts/SecurityContext';
import DraggableMap from '@/components/DraggableMap';
import { removePlusCode, haversineKm } from '@/lib/maps';

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

interface FormData {
  // Customer Information
  fullName: string;
  phone: string;
  email: string;
  alternatePhone: string;
  
  // Service Information
  serviceType: 'RO' | 'SOFTENER';
  service: string;
  customService: string; // For "Other" option
  brandName: string;
  modelName: string;
  
  // Location Information
  address: string;
  coordinates: { lat: number; lng: number };
  googleMapsLink: string;
  
  // Scheduling
  serviceDate: string;
  preferredTime: 'FIRST_HALF' | 'SECOND_HALF' | 'CUSTOM';
  preferredTimeCustom?: string;
  
  // Additional Information
  description: string;
  images: File[];
}

const Booking: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [locationTipPopupOpen, setLocationTipPopupOpen] = useState(false);
  const hasShownLocationTipRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  
  // Security context
  const { getSecurityStatus, isHoneypotTriggered, resetSecurity } = useSecurity();
  const loadingRef = useRef(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<any>(null);
  const [showSuccessLoader, setShowSuccessLoader] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [showSecurityStep, setShowSecurityStep] = useState(false);
  const [captchaStartTime] = useState(Date.now());
  const [backgroundVerificationFailed, setBackgroundVerificationFailed] = useState(false);

  // Location search states for service provider
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResult, setLocationSearchResult] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<{ value: number; unit: string } | null>(null);
  const [duration, setDuration] = useState<{ value: number; unit: string } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const locationSearchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Address autocomplete states and refs
  const addressInputRef = useRef<HTMLInputElement>(null);
  const addressAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [currentLocationLoading, setCurrentLocationLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 12.9716, lng: 77.5946 });
  const [mapZoom, setMapZoom] = useState<number>(15);

  // Get tomorrow's date
  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const handleGoHome = () => {
    // Reset form
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      alternatePhone: '',
      serviceType: 'RO',
      service: '',
      customService: '',
      brandName: '',
      modelName: '',
      address: '',
      coordinates: { lat: 0, lng: 0 },
      googleMapsLink: '',
      serviceDate: getTomorrowDate(),
      preferredTime: 'FIRST_HALF',
      description: '',
      images: []
    });
    setCurrentStep(1);
    setShowConfirmation(false);
    setBookingDetails(null);
  };

  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    phone: '',
    email: '',
    alternatePhone: '',
    serviceType: 'RO',
    service: '',
    customService: '',
    brandName: '',
    modelName: '',
    address: '',
    coordinates: { lat: 0, lng: 0 },
    googleMapsLink: '',
    serviceDate: getTomorrowDate(),
    preferredTime: 'FIRST_HALF',
    description: '',
    images: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to format time slot
  const formatTimeSlot = (timeSlot: string, customTime?: string) => {
    // If CUSTOM and custom time is provided, format and display it
    if (timeSlot === 'CUSTOM' && customTime) {
      const [hours, minutes] = customTime.split(':');
      const hour24 = parseInt(hours);
      const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
      const ampm = hour24 >= 12 ? 'PM' : 'AM';
      return `${hour12}:${minutes} ${ampm}`;
    }
    
    const timeMap: { [key: string]: string } = {
      'FIRST_HALF': 'Morning (9 AM - 1 PM)',
      'SECOND_HALF': 'Afternoon (1 PM - 6 PM)',
      'MORNING': 'Morning (9 AM - 1 PM)',
      'AFTERNOON': 'Afternoon (1 PM - 6 PM)',
      'EVENING': 'Evening (6 PM - 9 PM)',
      'CUSTOM': 'Custom Time'
    };
    return timeMap[timeSlot] || timeSlot;
  };
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Brand and model data - Comprehensive list of popular RO and Softener brands in India (including local: Aqua Grand, Aqua Smart, Dolphin, etc.)
  const brandData = {
    'K': ['Kent'],
    'A': ['Aquaguard', 'AO Smith', 'Aqua Fresh', 'Aqua Grand', 'Aqua Smart', 'Aquasure'],
    'P': ['Pureit', 'Protek'],
    'L': ['Livpure', 'LG'],
    'B': ['Blue Star'],
    'T': ['Tata Swach'],
    'E': ['Eureka Forbes'],
    'S': ['Samsung', 'Supreme'],
    'W': ['Whirlpool'],
    'H': ['Havells', 'Hindware', 'Hi-Tech'],
    'D': ['Dolphin'],
    'V': ['V-Guard'],
    'I': ['iSpring'],
    'N': ['Nasaka']
  };

  const modelData = {
    'RO': {
      'Kent': [
        'Ace Plus 8 L RO+UV+UF+TDS',
        'Ace Copper 8 L RO+UV+UF+TDS',
        'Ace 8 L',
        'Pearl ZW 8 L RO+UV+UF+TDS',
        'Pride Plus 8 L',
        'Prime Plus 9 L RO+UV+UF+TDS',
        'Sterling Plus 6 L',
        'Grand 8 L RO',
        'Grand Plus 9 L RO+UV+UF+TDS',
        'Grand Star 9 L',
        'Excell Plus 7 L RO+UV+UF+TDS',
        'Elegant Copper 8 L',
        'Marvel',
        'Sapphire'
      ],
      'Aquaguard': [
        'Delight NXT RO+UV+UF Aquasaver',
        'Delight RO+UV+UF 2X',
        'Aura 2X RO+UV + Copper',
        'Glory RO+UV+UF + Active Copper',
        'Designo NXT Under-counter RO+UV Copper',
        'Blaze Insta WS RO+UV Hot & Ambient',
        'SlimGlass RO+UV'
      ],
      'Pureit': [
        'Marvella 10 L RO+UV',
        'Eco Water Saver RO+UV+MF+Mineral',
        'RO+UV+MF+Copper+Minerial',
        'Classic RO variants'
      ],
      'Livpure': [
        'Pep Pro 7 L RO+UF',
        'Glitz 7 L RO+UF',
        'Glo Star RO+In-Tank UV+UF+Mineraliser',
        'Allura Premia'
      ],
      'Blue Star': [
        'Aristo 7 L RO+UV+UF with Pre-Filter',
        'Mid-range models with taste boosters'
      ],
      'Havells': [
        'Max Alkaline RO+UV',
        'Fab Alkaline RO+UV'
      ],
      'AO Smith': [
        'Z9 Pro Instant Hot & Ambient Purifier',
        'Models with SCMT'
      ],
      'Tata Swach': [
        'Cristella Plus RO Water Purifier',
        'Other RO combo models'
      ],
      'LG': [
        'Puricare WW180EP RO model',
        'Models with mineral booster'
      ],
      'Protek': [
        'Elite Plus 12 L RO+UV+UF'
      ],
      'Aqua Fresh': [
        'Swift 15 L RO+UV+TDS'
      ],
      'Samsung': [
        'PURE RO + UV + UF',
        'PURE RO + UV + Mineral',
        'PURE RO + UV + Alkaline'
      ],
      'Supreme': [
        'Supreme RO + UV',
        'Supreme RO + UV + UF',
        'Supreme RO + UV + Mineral'
      ],
      'Whirlpool': [
        'Whirlpool RO + UV',
        'Whirlpool RO + UV + UF',
        'Whirlpool RO + UV + Mineral'
      ],
      'Hindware': [
        'Hindware RO + UV',
        'Hindware RO + UV + UF',
        'Hindware RO + UV + Mineral'
      ],
      'Aqua Grand': [
        'Aqua Grand RO 8 L',
        'Aqua Grand RO+UV 10 L',
        'Aqua Grand RO+UV+UF',
        'Aqua Grand Deluxe',
        'Aqua Grand Prime'
      ],
      'Aqua Smart': [
        'Aqua Smart RO 7 L',
        'Aqua Smart RO+UV 8 L',
        'Aqua Smart RO+UV+UF',
        'Aqua Smart Pro',
        'Aqua Smart Elite'
      ],
      'Dolphin': [
        'Dolphin RO 8 L',
        'Dolphin RO+UV',
        'Dolphin RO+UV+UF',
        'Dolphin Premium',
        'Dolphin Smart RO'
      ],
      'Aquasure': [
        'Aquasure RO 7 L',
        'Aquasure RO+UV+UF',
        'Aquasure Amrit',
        'Aquasure from Aquaguard'
      ],
      'V-Guard': [
        'V-Guard Zen RO',
        'V-Guard Rocean RO+UV+UF',
        'V-Guard Bliss RO',
        'V-Guard Smart RO'
      ],
      'iSpring': [
        'iSpring RCC7',
        'iSpring RO500',
        'iSpring RO+UV models'
      ],
      'Nasaka': [
        'Nasaka RO 8 L',
        'Nasaka RO+UV',
        'Nasaka RO+UV+UF',
        'Nasaka Mineral RO'
      ],
      'Hi-Tech': [
        'Hi-Tech RO 7 L',
        'Hi-Tech RO+UV',
        'Hi-Tech RO+UV+UF',
        'Hi-Tech Alkaline RO'
      ]
    },
    'SOFTENER': {
      'Kent': [
        'Grand Softener 25L',
        'Supreme Softener 50L',
        'Pearl Softener 30L',
        'Gold Softener 40L'
      ],
      'Aquaguard': [
        'Delight Softener 25L',
        'Geneus Softener 50L',
        'Crystal Softener 30L',
        'Amaze Softener 40L'
      ],
      'AO Smith': [
        'Z1 Softener 25L',
        'Z8 Softener 50L',
        'Delight Softener 30L'
      ],
      'Pureit': [
        'Classic Softener 25L',
        'Advanced Softener 50L',
        'Ultima Softener 30L',
        'Copper+ Softener 40L'
      ],
      'Livpure': [
        'Glo Softener 25L',
        'Smart Softener 50L',
        'Pep Pro Softener 30L'
      ],
      'LG': [
        'Puricare Softener 25L',
        'WW180EP Softener 50L',
        'Puricare Hot & Cold Softener 30L',
        'Puricare Alkaline Softener 40L'
      ],
      'Blue Star': [
        'Aristo Softener 25L',
        'Stella Softener 50L',
        'Majesto Softener 30L'
      ],
      'Tata Swach': [
        'Standard Softener 25L',
        'Advanced Softener 50L',
        'Premium Softener 30L'
      ],
      'Havells': [
        'Max Alkaline Softener',
        'Fab Alkaline Softener'
      ],
      'Protek': [
        'Elite Plus Softener'
      ],
      'Aqua Fresh': [
        'Swift Softener'
      ],
      'Samsung': [
        'PURE Softener 25L',
        'PURE Softener 50L',
        'PURE Softener 30L'
      ],
      'Supreme': [
        'Supreme Softener 25L',
        'Supreme Softener 50L',
        'Supreme Softener 30L'
      ],
      'Whirlpool': [
        'Whirlpool Softener 25L',
        'Whirlpool Softener 50L',
        'Whirlpool Softener 30L'
      ],
      'Hindware': [
        'Hindware Softener 25L',
        'Hindware Softener 50L',
        'Hindware Softener 30L'
      ]
    }
  };

  // Service options based on service type
  const serviceOptions = {
    'RO': [
      'Service',
      'Installation',
      'Reinstallation',
      'Return Complaint',
      'AMC Service',
      'New Purifier Installation',
      'Un-Installation',
      'Repair',
      'General Maintenance',
      'Full Filter Change',
      'Inspection',
      'Other'
    ],
    'SOFTENER': [
      'Installation',
      'Reinstallation',
      'Un-Installation',
      'General Service',
      'Resin Change',
      'Inspection',
      'Other'
    ]
  };

  const steps = [
    { id: 1, title: 'Personal Info', icon: User, emoji: '👤' },
    { id: 2, title: 'Service Details', icon: Wrench, emoji: '🔧' },
    { id: 3, title: 'Location', icon: MapPin, emoji: '📍' },
    { id: 4, title: 'Schedule', icon: Clock, emoji: '⏰' },
    { id: 5, title: 'Review', icon: Check, emoji: '✅' }
  ];

  const totalSteps = steps.length;
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  // Phone number validation and normalization
  const normalizePhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle different formats
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      // Remove country code 91
      cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      // Remove leading 0
      cleaned = cleaned.substring(1);
    } else if (cleaned.length > 10) {
      // If longer than 10, take last 10 digits
      cleaned = cleaned.slice(-10);
    }
    
    // Ensure exactly 10 digits
    if (cleaned.length === 10) {
      return cleaned;
    }
    
    return phone; // Return original if can't normalize
  };

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Phone number validation
  const validatePhoneNumber = (phone: string): boolean => {
    const normalized = normalizePhoneNumber(phone);
    return normalized.length === 10 && /^[6-9]\d{9}$/.test(normalized);
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    let processedValue = value;
    
    // Process phone numbers
    if (field === 'phone' || field === 'alternatePhone') {
      processedValue = normalizePhoneNumber(value);
    }
    
    // Process email
    if (field === 'email') {
      processedValue = value.toLowerCase().trim();
    }

    // Full name: first letter of each word auto caps (don't trim end so space before next word is kept)
    if (field === 'fullName' && typeof value === 'string') {
      const normalized = value.replace(/^\s+/, '').replace(/\s+/g, ' ');
      processedValue = normalized
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        // Restore trailing space if user had one (so "John " stays so they can type "Doe")
        + (value.replace(/\s+$/, '') !== value ? ' ' : '');
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));
    
    // Clear validation when user starts typing
    if (showValidation) {
      setShowValidation(false);
    }
    
    // Reset service when service type changes
    if (field === 'serviceType') {
      setFormData(prev => ({ ...prev, service: '', customService: '' }));
    }
    
    // Handle address autocomplete
  };


  const handleBrandInput = (value: string) => {
    setFormData(prev => ({ ...prev, brandName: value }));
    
    if (value.length > 0) {
      const firstLetter = value.charAt(0).toUpperCase();
      const suggestions = brandData[firstLetter as keyof typeof brandData] || [];
      const filtered = suggestions.filter(brand => 
        brand.toLowerCase().includes(value.toLowerCase())
      );
      setBrandSuggestions(filtered);
      setShowBrandSuggestions(true);
    } else {
      setShowBrandSuggestions(false);
    }
  };

  const handleModelInput = (value: string) => {
    setFormData(prev => ({ ...prev, modelName: value }));
    
    if (value.length > 0 && formData.brandName) {
      const serviceTypeData = modelData[formData.serviceType];
      const brandKey = Object.keys(serviceTypeData).find(key => 
        key.toLowerCase() === formData.brandName.toLowerCase()
      );
      
      if (brandKey) {
        const suggestions = serviceTypeData[brandKey as keyof typeof serviceTypeData] || [];
        const filtered = suggestions.filter(model => 
          model.toLowerCase().includes(value.toLowerCase())
        );
        setModelSuggestions(filtered);
        setShowModelSuggestions(true);
      }
    } else {
      setShowModelSuggestions(false);
    }
  };

  const selectBrand = (brand: string) => {
    setFormData(prev => ({ ...prev, brandName: brand }));
    setShowBrandSuggestions(false);
    setFormData(prev => ({ ...prev, modelName: '' })); // Reset model when brand changes
  };

  const selectModel = (model: string) => {
    setFormData(prev => ({ ...prev, modelName: model }));
    setShowModelSuggestions(false);
  };

  // Initialize Google Maps for both address and location search
  useEffect(() => {
    if (currentStep !== 3) return;
    
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey || apiKey === 'your_google_maps_api_key' || apiKey.length < 20) {
      return;
    }

    let checkInterval: NodeJS.Timeout | null = null;

    // Check if script is already loaded
    if (!window.google || !window.google.maps) {
      // Check if script already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (!existingScript) {
        // Load the script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        
        script.onload = () => {
          initAllAutocompletes();
        };
        
        script.onerror = () => {
          toast.error('Failed to load Google Maps. Please check your API key and billing.');
        };
        
        document.head.appendChild(script);
      } else {
        // Script already exists, wait for it to load
        checkInterval = setInterval(() => {
          if (window.google && window.google.maps && window.google.maps.places) {
            clearInterval(checkInterval as NodeJS.Timeout);
            initAllAutocompletes();
          }
        }, 100);
      }
    } else {
      // Google Maps already loaded, initialize immediately
      initAllAutocompletes();
    }

    function initAllAutocompletes() {
      // Small delay to ensure DOM is ready and refs are attached
      setTimeout(() => {
      // Initialize address autocomplete
      if (addressInputRef.current && window.google?.maps?.places && !addressAutocompleteRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry']
          }
        );

        addressAutocompleteRef.current = autocomplete;

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry && place.geometry.location) {
            const location = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            };
            // Generate Google Maps link from coordinates
            const googleMapsLink = `https://www.google.com/maps/place/${location.lat},${location.lng}`;
            setFormData(prev => ({
              ...prev,
              address: place.formatted_address || '',
              coordinates: location,
              googleMapsLink: googleMapsLink
            }));
            setMapCenter(location);
            toast.success('Address set!');
          }
        });
      }

      // Initialize location search autocomplete
      if (locationSearchInputRef.current && window.google?.maps?.places && !autocompleteRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(
          locationSearchInputRef.current,
          {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry']
          }
        );

        autocompleteRef.current = autocomplete;

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry && place.geometry.location) {
            const location = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            };
            setLocationSearchResult(location);
            setLocationSearchQuery(place.formatted_address || '');
            toast.success('Location found!');
          }
        });
      }
      }, 100);
    }

    // Cleanup function
    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      // Don't remove autocomplete instances as they might be used
    };
  }, [currentStep]);

  // Show location tip popup once when user reaches Service Location step
  useEffect(() => {
    if (currentStep === 3 && !hasShownLocationTipRef.current) {
      hasShownLocationTipRef.current = true;
      setLocationTipPopupOpen(true);
    }
  }, [currentStep]);

  // Get current location handler
  const handleGetCurrentLocation = () => {
    setCurrentLocationLoading(true);

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setCurrentLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        // Reverse geocode to get address
        try {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location }, (results, status) => {
            setCurrentLocationLoading(false);
            
            if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
              const address = results[0].formatted_address;
              // Generate Google Maps link from coordinates
              const googleMapsLink = `https://www.google.com/maps/place/${location.lat},${location.lng}`;
              setFormData(prev => ({
                ...prev,
                address: address,
                coordinates: location,
                googleMapsLink: googleMapsLink
              }));
              // Update the input field
              if (addressInputRef.current) {
                addressInputRef.current.value = address;
              }
              setMapCenter(location);
              setMapZoom(19); // Zoom all the way in to current location
              toast.success('Location captured successfully!');
            } else {
              toast.error('Could not get address for this location');
            }
          });
        } catch (error) {
          setCurrentLocationLoading(false);
          toast.error('Failed to get address');
        }
      },
      (error) => {
        setCurrentLocationLoading(false);
        let errorMsg = 'Failed to get your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Permission denied. Please allow location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        }
        
        toast.error(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Calculate distance and time using Distance Matrix API
  const calculateDistanceAndTime = async (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) => {
    setIsCalculatingDistance(true);
    
    try {
      const distanceMatrix = new window.google.maps.DistanceMatrixService();
      
      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: window.google.maps.TravelMode.DRIVING,
          unitSystem: window.google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          setIsCalculatingDistance(false);
          
          if (status === window.google.maps.DistanceMatrixStatus.OK && response) {
            const result = response.rows[0].elements[0];
            
            if (result.status === window.google.maps.DistanceMatrixElementStatus.OK) {
              setDistance({
                value: result.distance.value,
                unit: result.distance.text,
              });
              setDuration({
                value: result.duration.value,
                unit: result.duration.text,
              });
              toast.success('Distance and time calculated!');
            } else {
              toast.error('Could not calculate distance');
            }
          } else {
            toast.error('Error calculating distance');
          }
        }
      );
    } catch (error) {
      setIsCalculatingDistance(false);
      toast.error('Failed to calculate distance');
    }
  };

  // Memoize the location change handler to prevent DraggableMap from re-rendering
  const handleMapLocationChange = useCallback(async (location: { lat: number; lng: number }) => {
    // Generate Google Maps link from coordinates
    const googleMapsLink = `https://www.google.com/maps/place/${location.lat},${location.lng}`;
    
    setFormData(prev => ({
      ...prev,
      coordinates: location,
      googleMapsLink: googleMapsLink
    }));
    setMapCenter(location);
    
    // Reverse geocode to update the address
    if (window.google?.maps?.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location }, (results, status) => {
          if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
            const address = results[0].formatted_address;
            setFormData(prev => ({
              ...prev,
              address: address
            }));
            // Update the input field
            if (addressInputRef.current) {
              addressInputRef.current.value = address;
            }
          }
        });
      } catch (error) {
        // Reverse geocoding failed, continue without updating address
      }
    }
  }, []);

  // Check if security step should be shown (fallback if auto-verification fails)
  // Start background ALTCHA verification when reaching step 5
  useEffect(() => {
    if (currentStep === 5 && !isCaptchaVerified) {
      // Reset background verification state when entering step 5
      setBackgroundVerificationFailed(false);
      setShowSecurityStep(false);
    } else if (isCaptchaVerified) {
      setShowSecurityStep(false); // Hide if verified
      setBackgroundVerificationFailed(false);
    }
  }, [currentStep, isCaptchaVerified]);

  // Check if background verification failed after timeout
  useEffect(() => {
    if (currentStep === 5 && !isCaptchaVerified && !backgroundVerificationFailed) {
      const timeout = setTimeout(() => {
        // If still not verified after 4 seconds, show manual verification
        if (!isCaptchaVerified) {
          setBackgroundVerificationFailed(true);
          setShowSecurityStep(true);
        }
      }, 4000); // 4 second timeout

      return () => clearTimeout(timeout);
    }
  }, [currentStep, isCaptchaVerified, backgroundVerificationFailed]);

  const nextStep = () => {
    if (currentStep < totalSteps) {
      if (canProceed()) {
        setCurrentStep(currentStep + 1);
        setShowValidation(false);
      } else {
        // Show validation and move to first missing field
        setShowValidation(true);
        let firstMissingField = '';
        
        switch (currentStep) {
          case 1:
            if (!formData.fullName) { firstMissingField = 'fullName'; }
            else if (!formData.phone) { firstMissingField = 'phone'; }
            else if (!formData.email) { firstMissingField = 'email'; }
            break;
          case 2:
            if (!formData.service) { firstMissingField = 'service'; }
            else if (formData.service === 'Other' && !formData.customService) { firstMissingField = 'customService'; }
            break;
          case 3:
            if (!formData.address) { firstMissingField = 'address'; }
            break;
          case 4:
            if (!formData.serviceDate) { firstMissingField = 'serviceDate'; }
            else if (!formData.preferredTime) { firstMissingField = 'preferredTime'; }
            break;
        }
        
        // Auto-focus on first missing field
        if (firstMissingField) {
          setTimeout(() => {
            const element = document.getElementById(firstMissingField);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.focus();
            }
          }, 100);
        }
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const checkLocationPermission = async () => {
    if (!navigator.permissions) {
      return 'unknown';
    }
    
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return permission.state;
    } catch (error) {
      return 'unknown';
    }
  };

  const getCurrentLocation = async () => {
    loadingRef.current = true;
    setIsLoadingLocation(true);
    
    // Show waiting message in address field immediately
    setFormData(prev => ({ 
      ...prev, 
      address: 'Please wait a few seconds while we get your location...'
    }));
    
    // Add a small delay to ensure the loading state is visible
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      if (!navigator.geolocation) {
        toast.error('Geolocation is not supported by this browser.');
        setFormData(prev => ({ 
          ...prev, 
          address: 'Geolocation not supported. Please enter your address manually.'
        }));
        loadingRef.current = false;
        setIsLoadingLocation(false);
        return;
      }

      // Check if we're on HTTPS or localhost
      const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        toast.error('Location access requires HTTPS. Please use a secure connection.');
        setFormData(prev => ({ 
          ...prev, 
          address: 'HTTPS required for location access. Please enter your address manually.'
        }));
        loadingRef.current = false;
        setIsLoadingLocation(false);
        return;
      }

      // Check permission status for informational purposes only
      // Don't block based on permission check - Permissions API is unreliable across browsers
      // Let getCurrentPosition handle permission prompts naturally
      const permissionStatus = await checkLocationPermission();
      // Note: We don't block here even if permissionStatus is 'denied' because:
      // 1. Permissions API can be unreliable (especially on iOS and mobile Chrome)
      // 2. getCurrentPosition will handle permission errors gracefully
      // 3. User might have granted permission but API still shows 'denied'

      // Try with mobile-optimized settings first
      let position: GeolocationPosition;
      try {
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve, 
            (error) => {
              reject(error);
            },
            {
              enableHighAccuracy: true, // Keep high accuracy for exact location
              timeout: 30000, // Increased to 30 seconds for mobile
              maximumAge: 60000 // Reduced to 1 minute for fresher location
            }
          );
        });
      } catch (error) {
        // Fallback with even more relaxed settings
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve, 
            (error) => {
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  reject(new Error('Location access denied. Please allow location permission and try again.'));
                  break;
                case error.POSITION_UNAVAILABLE:
                  reject(new Error('Location information unavailable. Please check your GPS settings.'));
                  break;
                case error.TIMEOUT:
                  reject(new Error('Location request timed out. Please try again or check your internet connection.'));
                  break;
                default:
                  reject(new Error('An unknown error occurred while retrieving location.'));
                  break;
              }
            },
            {
              enableHighAccuracy: true, // Keep high accuracy even in fallback
              timeout: 45000, // Even longer timeout for fallback
              maximumAge: 300000 // Allow older cached location
            }
          );
        });
      }

      const { latitude, longitude } = position.coords;
      
      // Try to get address using Google Geocoding if available, otherwise just store coordinates
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        try {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
            setFormData(prev => ({ 
              ...prev, 
                address: results[0].formatted_address,
              coordinates: { lat: latitude, lng: longitude }
            }));
          } else {
              // Google geocoding failed, prompt user to enter manually
            setFormData(prev => ({ 
              ...prev, 
                address: '',
              coordinates: { lat: latitude, lng: longitude }
            }));
              toast.info('Location detected but couldn\'t get address. Please enter your address manually.');
          }
          
                loadingRef.current = false;
                setIsLoadingLocation(false);
            });
        } catch (error) {
          // Google geocoding error, prompt user to enter manually
          setFormData(prev => ({ 
            ...prev, 
            address: '',
            coordinates: { lat: latitude, lng: longitude }
          }));
          toast.info('Location detected but address lookup failed. Please enter your address manually.');
                loadingRef.current = false;
                setIsLoadingLocation(false);
        }
      } else {
        // Google Maps not available, prompt user to enter manually
        setFormData(prev => ({ 
          ...prev, 
          address: '',
          coordinates: { lat: latitude, lng: longitude }
        }));
        toast.info('Location detected. Please enter your address manually.');
        loadingRef.current = false;
        setIsLoadingLocation(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get current location.';
      toast.error(`${errorMessage} Please try manual entry or check your browser settings.`, { duration: 8000 });
      
      // Show error message in address field
      setFormData(prev => ({ 
        ...prev, 
        address: 'Failed to get location. Please enter your address manually.'
      }));
      
      // Show helpful instructions
      setTimeout(() => {
        toast.info('💡 Alternative: Start typing your address above for suggestions, or enter manually with full details including pincode.', { duration: 10000 });
      }, 2000);
    } finally {
      // Loading state is now managed in the promise callbacks
      // Only turn off loading if there was an error in the try block
      if (loadingRef.current) {
        loadingRef.current = false;
        setIsLoadingLocation(false);
      }
    }
  };


  // Function to convert Google Maps link to embeddable format
  const convertToEmbedUrl = (url: string) => {
    try {
      // Convert various Google Maps URL formats to embed format
      if (url.includes('maps.app.goo.gl')) {
        // For short links, we'll use a generic embed that will redirect
        return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456789!2d77.6325!3d12.8934!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUzJzM2LjIiTiA3N8KwMzcnNTcuMCJF!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin`;
      } else if (url.includes('google.com/maps/place/')) {
        // Extract coordinates from place URL
        const match = url.match(/\/place\/([^/]+)/);
        if (match) {
          const coords = match[1].split(',');
          if (coords.length >= 2) {
            const lat = coords[0];
            const lng = coords[1];
            return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456789!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUzJzM2LjIiTiA3N8KwMzcnNTcuMCJF!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin`;
          }
        }
      }
      // Fallback to a generic embed
      return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456789!2d77.6325!3d12.8934!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUzJzM2LjIiTiA3N8KwMzcnNTcuMCJF!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin`;
    } catch (error) {
      return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.123456789!2d77.6325!3d12.8934!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUzJzM2LjIiTiA3N8KwMzcnNTcuMCJF!5e0!3m2!1sen!2sin!4v1234567890123!5m2!1sen!2sin`;
    }
  };

  // Function to handle Google Maps link changes
  const handleGoogleMapsLinkChange = (value: string) => {
    setFormData(prev => ({ ...prev, googleMapsLink: value }));
  };

  const processFiles = async (files: File[]) => {
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file.`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      const processedFiles = await Promise.all(
        validFiles.map(async (file) => {
          const compressedFile = await compressImage(file, 1280, 0.3); // Aggressive compression
          return compressedFile;
        })
      );

      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...processedFiles]
      }));

      toast.success(`${validFiles.length} image(s) added successfully!`);
    } catch (error) {
      toast.error('Failed to process images. Please try again.');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await processFiles(files);
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    // Check if CAPTCHA is verified before proceeding
    if (!isCaptchaVerified) {
      // Show security step if not verified yet (fallback)
      setShowSecurityStep(true);
      toast.error('Please complete the security check before submitting your booking.');
      return;
    }
    
    // Check security status (silent background check)
    const securityStatus = getSecurityStatus();
    if (!securityStatus.isSecure) {
      toast.error('Please complete the form properly and try again.');
      return;
    }
    
    // Check honeypot (silent background check)
    if (isHoneypotTriggered) {
      toast.error('Please refresh the page and try again.');
      resetSecurity();
      return;
    }
    
    await handleAutoSubmit();
  };

  const handleAutoSubmit = async () => {
    setIsSubmitting(true);
    setShowSuccessLoader(true);
    
    try {
      // Upload images to Cloudinary (non-blocking, continue even if upload fails)
      const imageUrls = formData.images.length > 0 
        ? await Promise.all(
        formData.images.map(file => cloudinaryService.uploadImage(file))
          )
        : [];

      // Check if customer already exists by phone number
      let customer;
      let isExistingCustomer = false;
      let keepPreviousLocation = false; // true when existing customer and new location is same or within 2 km

      let existingCustomer = null;
      let findError = null;
      
      try {
        const result = await db.customers.getByPhone(formData.phone);
        existingCustomer = result.data;
        findError = result.error;
      } catch (networkError: any) {
        // Handle network errors (DNS, connection issues, etc.)
        const errorMessage = networkError?.message || String(networkError);
        if (errorMessage.includes('Failed to fetch') || 
            errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('network')) {
          throw new Error(
            'Unable to connect to the server. Please check your internet connection and ensure the Supabase project is configured correctly. ' +
            'If the problem persists, contact support.'
          );
        }
        findError = networkError;
      }
      
      if (findError && !findError.message?.includes('connect')) {
        // Continue with creating new customer if there's a non-network error
      }
      
      if (existingCustomer) {
        // Customer exists — update their information
        isExistingCustomer = true;

        // Same or within 2 km: keep previous address/location (don't overwrite)
        const existingLoc = (existingCustomer as any).location;
        const existingLat = existingLoc?.latitude ?? existingLoc?.lat;
        const existingLng = existingLoc?.longitude ?? existingLoc?.lng;
        const newLat = formData.coordinates?.lat ?? 0;
        const newLng = formData.coordinates?.lng ?? 0;
        const hasExistingCoords =
          typeof existingLat === 'number' &&
          typeof existingLng === 'number' &&
          (existingLat !== 0 || existingLng !== 0);
        const hasNewCoords =
          typeof newLat === 'number' &&
          typeof newLng === 'number' &&
          (newLat !== 0 || newLng !== 0);
        const keepPreviousLocationValue =
          hasExistingCoords &&
          hasNewCoords &&
          haversineKm(existingLat, existingLng, newLat, newLng) <= 2;
        keepPreviousLocation = keepPreviousLocationValue;

        const updateData: Record<string, unknown> = {
          full_name: formData.fullName,
          email: formData.email,
          alternate_phone: formData.alternatePhone,
          preferred_time_slot: (formData.preferredTime === 'FIRST_HALF' ? 'MORNING' : formData.preferredTime === 'SECOND_HALF' ? 'AFTERNOON' : 'CUSTOM') as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
          custom_time: formData.preferredTime === 'CUSTOM' && formData.preferredTimeCustom ? formData.preferredTimeCustom : null,
          updated_at: new Date().toISOString(),
        };

        if (!keepPreviousLocationValue) {
          updateData.address = {
            street: formData.address,
            area: 'Bangalore',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
          };
          updateData.location = {
            latitude: formData.coordinates.lat,
            longitude: formData.coordinates.lng,
            formattedAddress: (() => {
              let cleanAddress = formData.address || '';
              if (cleanAddress.includes('localhost') || cleanAddress.includes('127.0.0.1')) {
                const match = cleanAddress.match(/localhost[:\d]*\/(.+)/i);
                if (match) {
                  cleanAddress = decodeURIComponent(match[1].replace(/\+/g, ' '));
                } else {
                  cleanAddress = '';
                }
              }
              if (cleanAddress.startsWith('http://') || cleanAddress.startsWith('https://')) {
                return '';
              }
              return cleanAddress;
            })(),
            googleLocation: formData.coordinates.lat !== 0 && formData.coordinates.lng !== 0
              ? `https://www.google.com/maps/place/${formData.coordinates.lat},${formData.coordinates.lng}`
              : null
          };
        }

        let updatedCustomer = null;
        let updateError = null;

        try {
          const result = await db.customers.update((existingCustomer as any).id, updateData);
          updatedCustomer = result.data;
          updateError = result.error;
        } catch (networkError: any) {
          // Handle network errors
          const errorMessage = networkError?.message || String(networkError);
          if (errorMessage.includes('Failed to fetch') || 
              errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
              errorMessage.includes('NetworkError') ||
              errorMessage.includes('network')) {
            throw new Error(
              'Unable to connect to the server. Please check your internet connection and ensure the Supabase project is configured correctly. ' +
              'If the problem persists, contact support.'
            );
          }
          updateError = networkError;
        }
        
        if (updateError) {
          const errorMessage = updateError.message || String(updateError);
          if (errorMessage.includes('Failed to fetch') || 
              errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
            throw new Error(
              'Unable to connect to the database. Please check your internet connection and try again.'
            );
          }
          throw new Error(`Error updating customer: ${errorMessage}`);
        }
        
        if (!updatedCustomer) {
          throw new Error('Customer update failed: No data returned');
        }
        
        customer = updatedCustomer;
      } else {
        // Customer doesn't exist, create new one
        const customerData = {
          full_name: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          alternate_phone: formData.alternatePhone,
          address: {
            street: removePlusCode(formData.address),
            area: 'Bangalore',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
          },
          location: {
            latitude: formData.coordinates.lat,
            longitude: formData.coordinates.lng,
            formattedAddress: (() => {
              // Clean the address - remove any URL prefixes
              let cleanAddress = formData.address || '';
              // Remove localhost URLs
              if (cleanAddress.includes('localhost') || cleanAddress.includes('127.0.0.1')) {
                // Extract just the address part after the URL
                const match = cleanAddress.match(/localhost[:\d]*\/(.+)/i);
                if (match) {
                  cleanAddress = decodeURIComponent(match[1].replace(/\+/g, ' '));
                } else {
                  cleanAddress = '';
                }
              }
              // Remove any http/https URLs
              if (cleanAddress.startsWith('http://') || cleanAddress.startsWith('https://')) {
                return '';
              }
              return cleanAddress;
            })(),
            googleLocation: formData.coordinates.lat !== 0 && formData.coordinates.lng !== 0
              ? `https://www.google.com/maps/place/${formData.coordinates.lat},${formData.coordinates.lng}`
              : (formData.googleMapsLink && formData.googleMapsLink.includes('google.com/maps') 
                  ? formData.googleMapsLink 
                  : null)
          },
          service_type: formData.serviceType,
          brand: formData.brandName || 'Not specified',
          model: formData.modelName || 'Not specified',
          status: 'ACTIVE' as const,
          customer_since: new Date().toISOString(),
          preferred_time_slot: (formData.preferredTime === 'FIRST_HALF' ? 'MORNING' : formData.preferredTime === 'SECOND_HALF' ? 'AFTERNOON' : 'CUSTOM') as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
          custom_time: formData.preferredTime === 'CUSTOM' && formData.preferredTimeCustom ? formData.preferredTimeCustom : null,
          preferred_language: 'ENGLISH' as const,
        };

        let newCustomer = null;
        let customerError = null;
        
        try {
          const result = await db.customers.create(customerData);
          newCustomer = result.data;
          customerError = result.error;
        } catch (networkError: any) {
          // Handle network errors
          const errorMessage = networkError?.message || String(networkError);
          if (errorMessage.includes('Failed to fetch') || 
              errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
              errorMessage.includes('NetworkError') ||
              errorMessage.includes('network')) {
            throw new Error(
              'Unable to connect to the server. Please check your internet connection and ensure the Supabase project is configured correctly. ' +
              'If the problem persists, contact support.'
            );
          }
          customerError = networkError;
        }
        
        if (customerError) {
          const errorMessage = customerError.message || String(customerError);
          if (errorMessage.includes('Failed to fetch') || 
              errorMessage.includes('ERR_NAME_NOT_RESOLVED')) {
            throw new Error(
              'Unable to connect to the database. Please check your internet connection and try again.'
            );
          }
          throw new Error(`Error creating customer: ${errorMessage}`);
        }
        
        if (!newCustomer) {
          throw new Error('Customer creation failed: No data returned');
        }
        
        customer = newCustomer;
      }

      // Create job record (use existing customer address/location when same or within 2 km)
      const custAddr = keepPreviousLocation && customer ? (customer as any).address : null;
      const custLoc = keepPreviousLocation && customer ? (customer as any).location : null;
      const jobServiceAddress = custAddr
        ? {
            street: removePlusCode(custAddr.street || custAddr.visible_address || ''),
            area: custAddr.area || 'Bangalore',
            city: custAddr.city || 'Bangalore',
            state: custAddr.state || 'Karnataka',
            pincode: custAddr.pincode || '560001',
          }
        : {
            street: removePlusCode(formData.address),
            area: 'Bangalore',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
          };
      const jobServiceLocation = custLoc &&
        (typeof (custLoc.latitude ?? custLoc.lat) === 'number') &&
        (typeof (custLoc.longitude ?? custLoc.lng) === 'number')
        ? {
            latitude: custLoc.latitude ?? custLoc.lat,
            longitude: custLoc.longitude ?? custLoc.lng,
            formattedAddress: custLoc.formattedAddress || custLoc.formatted_address || '',
            googleLocation: custLoc.googleLocation || custLoc.google_location ||
              `https://www.google.com/maps/place/${custLoc.latitude ?? custLoc.lat},${custLoc.longitude ?? custLoc.lng}`,
          }
        : {
            latitude: formData.coordinates.lat,
            longitude: formData.coordinates.lng,
            formattedAddress: (() => {
              let cleanAddress = formData.address || '';
              if (cleanAddress.includes('localhost') || cleanAddress.includes('127.0.0.1')) {
                const match = cleanAddress.match(/localhost[:\d]*\/(.+)/i);
                if (match) {
                  cleanAddress = decodeURIComponent(match[1].replace(/\+/g, ' '));
                } else {
                  cleanAddress = '';
                }
              }
              if (cleanAddress.startsWith('http://') || cleanAddress.startsWith('https://')) {
                return '';
              }
              return cleanAddress;
            })(),
            googleLocation: formData.coordinates.lat !== 0 && formData.coordinates.lng !== 0
              ? `https://www.google.com/maps/place/${formData.coordinates.lat},${formData.coordinates.lng}`
              : (formData.googleMapsLink && formData.googleMapsLink.includes('google.com/maps')
                  ? formData.googleMapsLink
                  : null)
          };

      const jobData = {
        job_number: generateJobNumber(formData.serviceType),
        customer_id: customer.id,
        service_type: formData.serviceType,
        service_sub_type: formData.service === 'Other' ? formData.customService : formData.service,
        brand: formData.brandName || 'Not specified',
        model: formData.modelName || 'Not specified',
        status: 'PENDING' as const,
        priority: 'MEDIUM' as const,
        description: formData.description,
        before_photos: imageUrls,
        scheduled_date: formData.serviceDate ? new Date(formData.serviceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        scheduled_time_slot: (formData.preferredTime === 'FIRST_HALF' ? 'MORNING' : formData.preferredTime === 'SECOND_HALF' ? 'AFTERNOON' : 'MORNING') as 'MORNING' | 'AFTERNOON' | 'EVENING',
        estimated_duration: 120,
        service_address: jobServiceAddress,
        service_location: jobServiceLocation,
        requirements: [{
          lead_source: 'Website',
          custom_time: formData.preferredTime === 'CUSTOM' && formData.preferredTimeCustom ? formData.preferredTimeCustom : null
        }],
        estimated_cost: 0,
        payment_status: 'PENDING' as const,
      };

      // Retry once on connection-like failures (transient network/Supabase issues)
      const isConnectionLikeError = (err: any) => {
        const msg = (err?.message || String(err)).toLowerCase();
        return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('connect') || msg.includes('err_name_not_resolved') || msg.includes('unavailable');
      };
      let job: any = null;
      let jobError: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await db.jobs.create(jobData as any);
        job = result.data;
        jobError = result.error;
        if (!jobError) break;
        if (attempt === 0 && isConnectionLikeError(jobError)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      }
      if (jobError) {
        throw new Error(jobError.message);
      }

      const displayAddress = keepPreviousLocation && customer
        ? (jobServiceLocation?.formattedAddress || jobServiceAddress.street || (customer as any).address?.street || formData.address)
        : formData.address;
      const displayMapsLink = keepPreviousLocation && customer && jobServiceLocation
        ? (jobServiceLocation.googleLocation || formData.googleMapsLink)
        : formData.googleMapsLink;

      // Send confirmation email (non-blocking for faster response)
      emailService.sendBookingConfirmation({
          customerName: formData.fullName,
          email: formData.email,
          jobNumber: (job as any)?.job_number || (job as any)?.jobNumber || 'N/A',
          serviceType: formData.serviceType,
          serviceSubType: formData.service === 'Other' ? formData.customService : formData.service,
          brand: formData.brandName || 'Not specified',
          model: formData.modelName || 'Not specified',
          scheduledDate: formData.serviceDate ? formData.serviceDate : new Date().toISOString().split('T')[0],
          scheduledTimeSlot: formData.preferredTime,
          serviceAddress: displayAddress,
          phone: formData.phone,
      }).catch(error => {
        console.error('Email sending failed:', error);
      });

      const customerAction = isExistingCustomer ? 'updated' : 'created';
      
      // Set booking details for confirmation page
      setBookingDetails({
        customerName: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        serviceType: formData.serviceType,
        service: formData.service === 'Other' ? formData.customService : formData.service,
        brandName: formData.brandName || 'Not specified',
        modelName: formData.modelName || 'Not specified',
        address: displayAddress,
        googleMapsLink: displayMapsLink,
        serviceDate: formData.serviceDate,
        preferredTime: formData.preferredTime,
        preferredTimeCustom: formData.preferredTimeCustom,
        description: formData.description,
        customerAction,
        images: formData.images,
      });
      
      // Show confirmation page after 2 seconds
      setTimeout(() => {
        setShowSuccessLoader(false);
        setShowConfirmation(true);
      }, 2000);
      
      // Show toast notification immediately
      toast.success('Booking confirmed successfully!', {
        description: 'You will receive a confirmation email shortly. Please check your spam folder if you don\'t see it.',
        duration: 6000,
      });
      
    } catch (error) {
      
      // Provide user-friendly error messages
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for network-related errors
        if (errorMessage.includes('Failed to fetch') || 
            errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('network') ||
            errorMessage.includes('connect')) {
          errorMessage = 
            'Unable to connect to the server. This could be due to:\n' +
            '• No internet connection\n' +
            '• Database server is unavailable\n' +
            '• Incorrect server configuration\n\n' +
            'Please check your internet connection and try again. If the problem persists, contact support.';
        }
      }
      
      toast.error(`Booking failed: ${errorMessage}`, { duration: 8000 });
      setShowSuccessLoader(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <User className="w-12 h-12 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Personal Information</h3>
              <p className="text-muted-foreground">Tell us about yourself</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  placeholder="Enter your full name"
                  className={`mt-1 ${
                    showValidation && !formData.fullName 
                      ? 'border-2 border-black dark:border-white' 
                      : ''
                  }`}
                />
              </div>
              
              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="9876543210"
                  className={`mt-1 ${
                    showValidation && (!formData.phone || !validatePhoneNumber(formData.phone))
                      ? 'border-2 border-red-500' 
                      : ''
                  }`}
                />
                {formData.phone && !validatePhoneNumber(formData.phone) && (
                  <p className="text-xs text-red-500 mt-1">
                    Please enter a valid 10-digit phone number
                  </p>
                )}
                {formData.phone && validatePhoneNumber(formData.phone) && (
                  <p className="text-xs text-foreground mt-1">
                    ✓ Valid phone number
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  className={`mt-1 ${
                    showValidation && (!formData.email || !validateEmail(formData.email))
                      ? 'border-2 border-red-500' 
                      : ''
                  }`}
                />
                {formData.email && !validateEmail(formData.email) && (
                  <p className="text-xs text-red-500 mt-1">
                    Please enter a valid email address
                  </p>
                )}
                {formData.email && validateEmail(formData.email) && (
                  <p className="text-xs text-foreground mt-1">
                    ✓ Valid email address
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="alternatePhone">Alternate Phone</Label>
                <Input
                  id="alternatePhone"
                  type="tel"
                  value={formData.alternatePhone}
                  onChange={(e) => handleInputChange('alternatePhone', e.target.value)}
                  placeholder="9876543211"
                  className={`mt-1 ${
                    formData.alternatePhone && !validatePhoneNumber(formData.alternatePhone)
                      ? 'border-2 border-red-500' 
                      : ''
                  }`}
                />
                {formData.alternatePhone && !validatePhoneNumber(formData.alternatePhone) && (
                  <p className="text-xs text-red-500 mt-1">
                    Please enter a valid 10-digit phone number
                  </p>
                )}
                {formData.alternatePhone && validatePhoneNumber(formData.alternatePhone) && (
                  <p className="text-xs text-foreground mt-1">
                    ✓ Valid phone number
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Wrench className="w-12 h-12 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Service Details</h3>
              <p className="text-muted-foreground">What service do you need?</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="serviceType">Service Type *</Label>
                <Select value={formData.serviceType} onValueChange={(value: 'RO' | 'SOFTENER') => handleInputChange('serviceType', value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RO">RO Water Purifier</SelectItem>
                    <SelectItem value="SOFTENER">Water Softener</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="service">Service Required *</Label>
                <Select value={formData.service} onValueChange={(value) => handleInputChange('service', value)}>
                  <SelectTrigger className={`mt-1 ${
                    showValidation && !formData.service 
                      ? 'border-2 border-black dark:border-white' 
                      : ''
                  }`}>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceOptions[formData.serviceType].map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Show custom service input when "Other" is selected */}
              {formData.service === 'Other' && (
                <div>
                  <Label htmlFor="customService">Please specify the service *</Label>
                  <Input
                    id="customService"
                    value={formData.customService}
                    onChange={(e) => handleInputChange('customService', e.target.value)}
                    placeholder="Describe the specific service you need..."
                    className={`mt-1 ${
                      showValidation && formData.service === 'Other' && !formData.customService 
                        ? 'border-2 border-black dark:border-white' 
                        : ''
                    }`}
                  />
                </div>
              )}
              
              <div className="relative">
                <Label htmlFor="brandName">Brand Name (Optional)</Label>
                <Input
                  id="brandName"
                  value={formData.brandName}
                  onChange={(e) => handleBrandInput(e.target.value)}
                  onFocus={() => {
                    if (formData.brandName.length > 0) {
                      const firstLetter = formData.brandName.charAt(0).toUpperCase();
                      const suggestions = brandData[firstLetter as keyof typeof brandData] || [];
                      setBrandSuggestions(suggestions);
                      setShowBrandSuggestions(true);
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 200)}
                  placeholder="e.g., Kent, Aquaguard, Pureit, Havells, LG, etc."
                  className="mt-1"
                />
                {showBrandSuggestions && brandSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {brandSuggestions.map((brand, index) => (
                      <div
                        key={index}
                        className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                        onClick={() => selectBrand(brand)}
                      >
                        {brand}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="relative">
                <Label htmlFor="modelName">Model Name (Optional)</Label>
                <Input
                  id="modelName"
                  value={formData.modelName}
                  onChange={(e) => handleModelInput(e.target.value)}
                  onFocus={() => {
                    if (formData.modelName.length > 0 && formData.brandName) {
                      const serviceTypeData = modelData[formData.serviceType];
                      const brandKey = Object.keys(serviceTypeData).find(key => 
                        key.toLowerCase() === formData.brandName.toLowerCase()
                      );
                      if (brandKey) {
                        const suggestions = serviceTypeData[brandKey as keyof typeof serviceTypeData] || [];
                        setModelSuggestions(suggestions);
                        setShowModelSuggestions(true);
                      }
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowModelSuggestions(false), 200)}
                  placeholder={formData.serviceType === 'RO' ? "e.g., Grand Plus, Max, Ultra" : "e.g., Grand Softener 25L, Supreme Softener 50L"}
                  className="mt-1"
                />
                {showModelSuggestions && modelSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {modelSuggestions.map((model, index) => (
                      <div
                        key={index}
                        className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                        onClick={() => selectModel(model)}
                      >
                        {model}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div>
                <Label htmlFor="description">Additional Details</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the issue or any specific requirements..."
                  className="mt-1 min-h-[100px]"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Service Location</h3>
              <p className="text-muted-foreground">Where should we come?</p>
            </div>

            <Dialog open={locationTipPopupOpen} onOpenChange={setLocationTipPopupOpen}>
              <DialogContent className="sm:max-w-md bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <span>💡</span> Location tip
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="text-foreground/90 leading-relaxed pt-1 space-y-2">
                      <p>Can&apos;t find your exact spot? Search for a nearby landmark or tap &quot;Use Current Location&quot;. That&apos;s okay — we&apos;ll confirm the location with you before we come.</p>
                      <p className="text-sm font-medium text-primary">At the bottom, please share your purifier photo too.</p>
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <Button onClick={() => setLocationTipPopupOpen(false)} className="mt-2">
                  Got it
                </Button>
              </DialogContent>
            </Dialog>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="address">Service Address *</Label>
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      ref={addressInputRef}
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="Search your address..."
                      className={`pr-10 ${
                        showValidation && !formData.address 
                          ? 'border-2 border-black dark:border-white' 
                          : ''
                      }`}
                      disabled={currentLocationLoading}
                    />
                    {formData.address ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleInputChange('address', '');
                          if (addressInputRef.current) {
                            addressInputRef.current.value = '';
                          }
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={handleGetCurrentLocation}
                    disabled={currentLocationLoading}
                    variant="outline"
                    className="w-full"
                  >
                    {currentLocationLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Getting Location...
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4 mr-2" />
                        Use Current Location
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Draggable Map */}
              {formData.coordinates.lat !== 0 && formData.coordinates.lng !== 0 && (
                <div className="mt-4">
                  <Label className="mb-2 block">Confirm Your Location on Map</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    💡 Drag the marker to adjust your exact location
                  </p>
                  <div className="rounded-lg overflow-hidden border">
                    <DraggableMap
                      center={mapCenter}
                      onLocationChange={handleMapLocationChange}
                      zoom={mapZoom}
                      height="300px"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>Upload Images (Optional)</Label>
                
                {/* Note about RO and problem images */}
                <div className="mt-2 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>💡 Helpful tip:</strong> Please share images of your RO system and any problems you're experiencing. This helps our technicians understand the issue better and come prepared with the right tools and parts.
                  </p>
                </div>
                
                <div className="mt-2 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {/* Camera input for direct capture */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {/* Drag and Drop Area */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDragOver 
                        ? 'border-primary bg-primary/5' 
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                      Drag and drop images here, or
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        size="sm"
                      >
                        Choose from Gallery
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          // iOS and mobile PWA: Use file input fallback for better reliability
                          if (shouldUseFileInputFallback()) {
                            setTimeout(() => {
                              cameraInputRef.current?.click();
                            }, 100);
                            return;
                          }

                          try {
                            // Request camera access with proper error handling
                            const stream = await requestCameraAccess();
                            if (!stream) {
                              throw new Error('Failed to access camera');
                            }
                            
                            // Create optimized video element
                            const video = createVideoElement();
                              video.srcObject = stream;
                              
                              // Create modal overlay
                              const modal = document.createElement('div');
                              modal.style.position = 'fixed';
                              modal.style.top = '0';
                              modal.style.left = '0';
                              modal.style.width = '100%';
                              modal.style.height = '100%';
                              modal.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
                              modal.style.zIndex = '9999';
                              modal.style.display = 'flex';
                              modal.style.flexDirection = 'column';
                              modal.style.alignItems = 'center';
                              modal.style.justifyContent = 'center';
                              modal.style.gap = '20px';
                              modal.style.padding = '20px';
                              
                              // Video container
                              const videoContainer = document.createElement('div');
                              videoContainer.style.width = '100%';
                              videoContainer.style.maxWidth = '500px';
                            videoContainer.style.aspectRatio = '4/3';
                              videoContainer.style.position = 'relative';
                            videoContainer.style.backgroundColor = 'black';
                            videoContainer.style.borderRadius = '8px';
                            videoContainer.style.overflow = 'hidden';
                              videoContainer.appendChild(video);
                              
                              // Button container
                              const buttonContainer = document.createElement('div');
                              buttonContainer.style.display = 'flex';
                              buttonContainer.style.gap = '10px';
                              
                              // Capture button
                              const captureBtn = document.createElement('button');
                              captureBtn.textContent = 'Capture Photo';
                              captureBtn.style.padding = '12px 24px';
                              captureBtn.style.backgroundColor = '#3b82f6';
                              captureBtn.style.color = 'white';
                              captureBtn.style.border = 'none';
                              captureBtn.style.borderRadius = '8px';
                              captureBtn.style.cursor = 'pointer';
                              captureBtn.style.fontSize = '16px';
                              captureBtn.style.fontWeight = '600';
                              
                              // Cancel button
                              const cancelBtn = document.createElement('button');
                              cancelBtn.textContent = 'Cancel';
                              cancelBtn.style.padding = '12px 24px';
                              cancelBtn.style.backgroundColor = '#6b7280';
                              cancelBtn.style.color = 'white';
                              cancelBtn.style.border = 'none';
                              cancelBtn.style.borderRadius = '8px';
                              cancelBtn.style.cursor = 'pointer';
                              cancelBtn.style.fontSize = '16px';
                              
                            let streamActive = true;
                              const cleanup = () => {
                              if (!streamActive) return;
                              streamActive = false;
                              
                              try {
                                stream.getTracks().forEach(track => track.stop());
                              } catch (e) {
                                console.warn('Error stopping stream:', e);
                              }
                              
                              try {
                                if (video.srcObject) {
                                  video.srcObject = null;
                                }
                              } catch (e) {
                                console.warn('Error clearing video:', e);
                              }
                              
                              try {
                                if (modal.parentNode) {
                                document.body.removeChild(modal);
                                }
                              } catch (e) {
                                console.warn('Error removing modal:', e);
                              }
                              };
                              
                            // Wait for video to be ready
                            let videoReady = false;
                            const enableCapture = () => {
                              if (streamActive && video.videoWidth > 0 && video.videoHeight > 0) {
                                videoReady = true;
                                captureBtn.disabled = false;
                              }
                            };
                            
                            video.onloadedmetadata = enableCapture;
                            video.onloadeddata = enableCapture;
                            video.oncanplay = enableCapture;
                            
                            setTimeout(() => {
                              if (!videoReady && streamActive) {
                                enableCapture();
                              }
                            }, 500);
                              
                            captureBtn.disabled = true;
                              
                              captureBtn.onclick = () => {
                              if (!streamActive || !videoReady || !video.videoWidth || !video.videoHeight) {
                                toast.error('Camera not ready. Please wait a moment.');
                                    return;
                                  }
                                  
                              try {
                                  const canvas = document.createElement('canvas');
                                  canvas.width = video.videoWidth;
                                  canvas.height = video.videoHeight;
                                const ctx = canvas.getContext('2d', { willReadFrequently: false });
                                  
                                  if (!ctx) {
                                  toast.error('Failed to capture photo.');
                                    return;
                                  }
                                  
                                    ctx.drawImage(video, 0, 0);
                                  
                                  canvas.toBlob((blob) => {
                                  if (!blob || !streamActive) return;
                                    
                                    try {
                                      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                                      const dataTransfer = new DataTransfer();
                                      dataTransfer.items.add(file);
                                      cleanup();
                                    processFiles(Array.from(dataTransfer.files));
                                    } catch (fileError) {
                                      console.error('Error creating file:', fileError);
                                    toast.error('Failed to process photo.');
                                      cleanup();
                                    }
                                  }, 'image/jpeg', 0.9);
                                } catch (error: any) {
                                  console.error('Error capturing photo:', error);
                                toast.error('Failed to capture photo.');
                                  cleanup();
                                }
                              };
                              
                              cancelBtn.onclick = cleanup;
                              
                              buttonContainer.appendChild(captureBtn);
                              buttonContainer.appendChild(cancelBtn);
                              
                              modal.appendChild(videoContainer);
                              modal.appendChild(buttonContainer);
                              document.body.appendChild(modal);
                              
                              modal.onclick = (e) => {
                                if (e.target === modal) {
                                  cleanup();
                                }
                              };
                              
                            } catch (error: any) {
                            console.warn('Camera access failed, using file input:', error);
                            setTimeout(() => {
                              cameraInputRef.current?.click();
                            }, 100);
                          }
                        }}
                        size="sm"
                        className="flex items-center gap-1"
                      >
                        <Camera className="w-4 h-4" />
                        Take Photo
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Supports JPG, PNG, WebP (Max 10MB each)
                    </p>
                  </div>
                  
                  {formData.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {formData.images.map((file, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeImage(index)}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Clock className="w-12 h-12 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Schedule Service</h3>
              <p className="text-muted-foreground">When would you like us to come?</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="serviceDate">Service Date *</Label>
                <Input
                  id="serviceDate"
                  type="date"
                  value={formData.serviceDate}
                  onChange={(e) => handleInputChange('serviceDate', e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`mt-1 text-left ${
                    showValidation && !formData.serviceDate
                      ? 'border-2 border-black dark:border-white'
                      : ''
                  }`}
                  style={{
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    fontSize: '16px', // Prevents zoom on iOS
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="preferredTime">Time Slot *</Label>
                <Select value={formData.preferredTime} onValueChange={(value: 'FIRST_HALF' | 'SECOND_HALF' | 'CUSTOM') => {
                  // Clear custom time when CUSTOM is selected
                  if (value === 'CUSTOM') {
                    setFormData(prev => ({ ...prev, preferredTime: value, preferredTimeCustom: '' }));
                  } else {
                    handleInputChange('preferredTime', value);
                  }
                }}>
                  <SelectTrigger className={`mt-1 ${
                    showValidation && !formData.preferredTime 
                      ? 'border-2 border-black dark:border-white' 
                      : ''
                  }`}>
                    <SelectValue placeholder="Select preferred time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST_HALF">Morning (9 AM - 1 PM)</SelectItem>
                    <SelectItem value="SECOND_HALF">Afternoon (1 PM - 6 PM)</SelectItem>
                    <SelectItem value="CUSTOM">Custom Time</SelectItem>
                  </SelectContent>
                </Select>
                {formData.preferredTime === 'CUSTOM' && (() => {
                  // Parse 24-hour format (HH:MM) to 12-hour format components
                  const parseTime = (time24: string) => {
                    if (!time24 || !time24.includes(':')) {
                      return { hour: undefined, minute: undefined, period: 'AM' };
                    }
                    const [hours, minutes] = time24.split(':');
                    const hour24 = parseInt(hours, 10);
                    if (isNaN(hour24)) {
                      return { hour: undefined, minute: undefined, period: 'AM' };
                    }
                    let hour12 = hour24 % 12;
                    if (hour12 === 0) hour12 = 12;
                    const period = hour24 >= 12 ? 'PM' : 'AM';
                    return {
                      hour: String(hour12),
                      minute: minutes || '00',
                      period
                    };
                  };

                  // Convert 12-hour format components to 24-hour format (HH:MM)
                  const formatTime24 = (hour: string | undefined, minute: string | undefined, period: string) => {
                    if (!hour || !minute) return '';
                    let hour24 = parseInt(hour, 10);
                    if (isNaN(hour24)) return '';
                    if (period === 'PM' && hour24 !== 12) {
                      hour24 += 12;
                    } else if (period === 'AM' && hour24 === 12) {
                      hour24 = 0;
                    }
                    return `${String(hour24).padStart(2, '0')}:${minute.padStart(2, '0')}`;
                  };

                  const timeParts = parseTime(formData.preferredTimeCustom || '');

                  return (
                    <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Hour Select */}
                        <Select
                          value={timeParts.hour || ''}
                          onValueChange={(hour) => {
                            const newTime = formatTime24(hour, timeParts.minute || '00', timeParts.period);
                            handleInputChange('preferredTimeCustom', newTime);
                          }}
                        >
                          <SelectTrigger className="flex-1 sm:flex-none sm:w-20 min-w-0">
                            <SelectValue placeholder="Hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                              <SelectItem key={h} value={String(h)}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <span className="text-lg font-semibold flex-shrink-0">:</span>

                        {/* Minute Select */}
                        <Select
                          value={timeParts.minute || ''}
                          onValueChange={(minute) => {
                            const newTime = formatTime24(timeParts.hour || '12', minute, timeParts.period);
                            handleInputChange('preferredTimeCustom', newTime);
                          }}
                        >
                          <SelectTrigger className="flex-1 sm:flex-none sm:w-20 min-w-0">
                            <SelectValue placeholder="Min" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* AM/PM Select */}
                        <Select
                          value={timeParts.period}
                          onValueChange={(period) => {
                            const newTime = formatTime24(timeParts.hour || '12', timeParts.minute || '00', period);
                            handleInputChange('preferredTimeCustom', newTime);
                          }}
                        >
                          <SelectTrigger className="flex-1 sm:flex-none sm:w-20 min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Service Information</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>• We'll call you to confirm the exact time</p>
                  <p>• Our technician will arrive within the selected time slot</p>
                  <p>• Service typically takes 1-2 hours</p>
                  <p>• Free consultation and quote provided</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Check className="w-12 h-12 mx-auto mb-3 text-primary" />
              <h3 className="text-xl font-semibold text-foreground">Review Your Booking</h3>
              <p className="text-muted-foreground">Please review your booking details</p>
            </div>
            
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {formData.fullName}</div>
                  <div><strong>Phone:</strong> {formData.phone}</div>
                  <div><strong>Email:</strong> {formData.email}</div>
                  {formData.alternatePhone && <div><strong>Alternate:</strong> {formData.alternatePhone}</div>}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <Wrench className="w-5 h-5 mr-2" />
                    Service Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Type:</strong> {formData.serviceType}</div>
                  <div><strong>Service:</strong> {formData.service === 'Other' ? formData.customService : formData.service}</div>
                  {formData.brandName && <div><strong>Brand:</strong> {formData.brandName}</div>}
                  {formData.modelName && <div><strong>Model:</strong> {formData.modelName}</div>}
                  {formData.description && <div><strong>Details:</strong> {formData.description}</div>}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <MapPin className="w-5 h-5 mr-2" />
                    Location & Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Address:</strong> {formData.address}</div>
                  {formData.googleMapsLink && (
                    <div>
                      <strong>Google Maps Link:</strong> 
                      <a 
                        href={formData.googleMapsLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-1 text-black hover:text-gray-700 font-medium transition-colors duration-200 underline"
                      >
                        🔗 Open in Maps
                      </a>
                    </div>
                  )}
                  <div><strong>Service Date:</strong> {formData.serviceDate ? new Date(formData.serviceDate).toLocaleDateString() : 'Not selected'}</div>
                  <div><strong>Time Slot:</strong> {formatTimeSlot(formData.preferredTime, formData.preferredTimeCustom)}</div>
                  {formData.images.length > 0 && <div><strong>Images:</strong> {formData.images.length} uploaded</div>}
                </CardContent>
              </Card>
            </div>
            
            {/* Background ALTCHA verification - runs silently in background (hidden) */}
            {currentStep === 5 && !isCaptchaVerified && !backgroundVerificationFailed && (
              <AltchaWidget 
                onVerify={(verified) => {
                  setIsCaptchaVerified(verified);
                  if (verified) {
                    setShowSecurityStep(false);
                    setBackgroundVerificationFailed(false);
                  } else {
                    // Background verification failed, show manual widget
                    setBackgroundVerificationFailed(true);
                    setShowSecurityStep(true);
                  }
                }}
                autoStart={true}
                hidden={true}
              />
            )}

            {/* Manual security widget - only shown if background verification failed */}
            {showSecurityStep && !isCaptchaVerified && backgroundVerificationFailed && (
              <div className="border-t pt-6 mt-6 space-y-4">
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-foreground">Security Verification</h4>
                  <p className="text-sm text-muted-foreground">Please complete the security check to submit your booking</p>
                </div>
                <div className="max-w-md mx-auto">
                  <AltchaWidget 
                    onVerify={(verified) => {
                      setIsCaptchaVerified(verified);
                      if (verified) {
                        setShowSecurityStep(false);
                        setBackgroundVerificationFailed(false);
                      }
                    }}
                    autoStart={true}
                    className="mb-4"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    This helps us prevent automated submissions and ensure your booking is processed securely.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };


  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.fullName && 
               formData.phone && 
               formData.email &&
               validatePhoneNumber(formData.phone) &&
               validateEmail(formData.email) &&
               (formData.alternatePhone === '' || validatePhoneNumber(formData.alternatePhone));
      case 2: {
        const serviceValid = formData.service && (formData.service !== 'Other' || formData.customService);
        return serviceValid; // Brand name and model name are now optional
      }
      case 3:
        return formData.address;
      case 4:
        return formData.serviceDate && formData.preferredTime;
      case 5:
        return true;
      case 6:
        return isCaptchaVerified;
      default:
        return false;
    }
  };

  const hasMissingFields = () => {
    return !canProceed();
  };

  // Show full screen success loader
  if (showSuccessLoader) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground mb-3">Booking...</p>
          <p className="text-lg text-muted-foreground mb-4">Please wait until confirmation message</p>
        </div>
      </div>
    );
  }

  // Show confirmation page if booking is successful
  if (showConfirmation && bookingDetails) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        
        <main className="flex-1 bg-background">
          <div className="container mx-auto px-4 py-6">
            <div className="max-w-2xl mx-auto">
              {/* Success Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-black" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Booking Confirmed! 🎉
                </h1>
                <p className="text-gray-600 dark:text-gray-300">
                  Your service has been scheduled successfully
                </p>
              </div>

              {/* Email Confirmation Alert */}
              <Alert className="mb-6 border-2 border-gray-200 dark:border-gray-700 bg-transparent relative overflow-hidden">
                <div className="absolute inset-0 running-border pointer-events-none"></div>
                <Mail className="h-4 w-4 text-primary relative z-10" />
                <AlertDescription className="text-foreground relative z-10">
                  You will receive a confirmation email shortly at <strong>{bookingDetails.email}</strong>. Please check your spam folder if you don't see it.
                </AlertDescription>
              </Alert>

              {/* Booking Details Card */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Booking Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Customer Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Name</Label>
                      <p className="text-foreground font-medium">{bookingDetails.customerName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone Number</Label>
                      <p className="text-foreground font-medium">{bookingDetails.phone}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</Label>
                      <p className="text-foreground font-medium">{bookingDetails.email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Service Type</Label>
                      <p className="text-foreground font-medium">
                        {bookingDetails.serviceType === 'RO' ? 'RO Water Purifier' : 'Water Softener'}
                      </p>
                    </div>
                  </div>

                  {/* Service Details */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Service Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Service</Label>
                        <p className="text-foreground font-medium">
                          {bookingDetails.service.charAt(0).toUpperCase() + bookingDetails.service.slice(1).toLowerCase()}
                        </p>
                      </div>
                      {bookingDetails.brandName && bookingDetails.brandName !== 'Not specified' && (
                        <div>
                          <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Brand</Label>
                          <p className="text-foreground font-medium">
                            {bookingDetails.brandName.charAt(0).toUpperCase() + bookingDetails.brandName.slice(1).toLowerCase()}
                          </p>
                        </div>
                      )}
                      {bookingDetails.modelName && bookingDetails.modelName !== 'Not specified' && (
                        <div>
                          <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Model</Label>
                          <p className="text-foreground font-medium">
                            {bookingDetails.modelName.charAt(0).toUpperCase() + bookingDetails.modelName.slice(1).toLowerCase()}
                          </p>
                        </div>
                      )}
                      <div>
                        <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Preferred Time</Label>
                        <p className="text-foreground font-medium">
                          {formatTimeSlot(bookingDetails.preferredTime, bookingDetails.preferredTimeCustom)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Schedule
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Service Date</Label>
                        <p className="text-foreground font-medium">
                          {new Date(bookingDetails.serviceDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Time Slot</Label>
                        <p className="text-foreground font-medium">
                          {formatTimeSlot(bookingDetails.preferredTime, bookingDetails.preferredTimeCustom)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Service Address
                    </h4>
                    <p className="text-foreground mb-3">
                      {removePlusCode(bookingDetails.address)}
                    </p>
                    {bookingDetails.googleMapsLink && (
                      <a
                        href={bookingDetails.googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-black hover:text-gray-700 font-medium transition-colors duration-200 hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Maps
                      </a>
                    )}
                  </div>

                  {/* Description */}
                  {bookingDetails.description && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-3">Additional Notes</h4>
                      <p className="text-foreground">{bookingDetails.description}</p>
                    </div>
                  )}

                  {/* Images */}
                  {bookingDetails.images && bookingDetails.images.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-3">Images Uploaded</h4>
                      <p className="text-foreground">{bookingDetails.images.length} image(s) uploaded successfully</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Next Steps */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>What's Next?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-white dark:text-black">1</span>
                    </div>
                    <div>
                      <p className="text-foreground font-medium">Confirmation Email</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        You'll receive a confirmation email with all the details shortly. Please check your spam folder if you don't see it.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-white dark:text-black">2</span>
                    </div>
                    <div>
                      <p className="text-foreground font-medium">Technician Contact</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Our technician will contact you before the scheduled service time.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-white dark:text-black">3</span>
                    </div>
                    <div>
                      <p className="text-foreground font-medium">Service Day</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Our technician will arrive at your location on the scheduled date and time.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Need Help?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-3">
                    <p className="text-foreground">
                      If you have any questions or need to make changes to your booking, please contact us:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 justify-center items-center">
                      <Button 
                        onClick={() => window.open('tel:+918884944288', '_self')}
                        className="flex items-center gap-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-transform duration-300 hover:scale-105"
                      >
                        <Phone className="w-4 h-4" />
                        Call: +91-8884944288
                      </Button>
                      <Button 
                        onClick={() => window.open('https://wa.me/918884944288', '_blank', 'noopener,noreferrer')}
                        className="flex items-center gap-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-transform duration-300 hover:scale-105"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                        </svg>
                        WhatsApp
                      </Button>
                      <Button 
                        onClick={() => window.open('mailto:mail@hydrogenro.com', '_self')}
                        className="flex items-center gap-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-transform duration-300 hover:scale-105"
                      >
                        <Mail className="w-4 h-4" />
                        Email
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-center">
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                  className="flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go to Homepage
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      
      <main className="flex-1 bg-background">
        <div className="container mx-auto px-4 py-6">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Book Your Service
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Get professional RO installation, repair, and maintenance
              </p>
              
              {/* No Account Required Notice */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-w-md mx-auto">
                <div className="flex items-center justify-center gap-2 text-gray-900 dark:text-white">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    No account required! Book directly and we'll contact you.
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bar - Hidden on step 6 */}
            {currentStep !== 6 && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Step {currentStep} of {totalSteps}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {Math.round(progress)}% Complete
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Step Indicators - Hidden on step 6 */}
            {currentStep !== 6 && (
              <div className="flex justify-between mb-8">
                {steps.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  
                  return (
                    <div key={step.id} className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                        isActive ? 'bg-primary text-primary-foreground' :
                        isCompleted ? 'bg-green-500 text-white' :
                        'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {/* Keep Lucide icons as primary, emojis as fallback */}
                        <Icon className="w-5 h-5" />
                      </div>
                      {/* Show text only on desktop */}
                      <span className={`hidden md:block text-xs text-center ${
                        isActive ? 'text-primary font-medium' :
                        isCompleted ? 'text-green-600 dark:text-green-400 font-medium' :
                        'text-gray-500 dark:text-gray-400'
                      }`}>
                        {step.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}


            {/* Form Content */}
            <BehavioralTracker>
              <Card className="mb-6">
                <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
                  {/* Honeypot field - hidden from users */}
                  <HoneypotField />
                  
                  {/* Security runs silently in background - no UI display */}
                  
                  {renderStepContent()}
                </CardContent>
              </Card>
            </BehavioralTracker>

            {/* Navigation Buttons */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 1}
                className="flex items-center"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>

              {currentStep < totalSteps ? (
                <Button
                  onClick={nextStep}
                  className={`flex items-center hover:scale-105 transition-transform ${
                    showValidation && hasMissingFields() 
                      ? 'border-2 border-black dark:border-white' 
                      : ''
                  }`}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!canProceed() || isSubmitting || !isCaptchaVerified}
                  className="flex items-center bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-transform duration-300 hover:scale-105 disabled:hover:scale-100 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Booking'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Booking;