import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Customer } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { MapPin, Download, ExternalLink, Trash2 } from 'lucide-react';
import { mapServiceTypesToDbValue, extractLocationFromAddressString, bangaloreAreas } from '@/lib/adminUtils';

// Brand and model data
const brandData = {
  'K': ['Kent'],
  'A': ['Aquaguard', 'AO Smith', 'Aqua Fresh'],
  'P': ['Pureit', 'Protek'],
  'L': ['Livpure', 'LG'],
  'B': ['Blue Star'],
  'T': ['Tata Swach'],
  'E': ['Eureka Forbes'],
  'S': ['Samsung', 'Supreme'],
  'W': ['Whirlpool'],
  'H': ['Havells', 'Hindware']
};

const modelData = {
  'RO': {
    'Kent': ['Ace Plus 8 L RO+UV+UF+TDS', 'Ace Copper 8 L RO+UV+UF+TDS', 'Ace 8 L', 'Pearl ZW 8 L RO+UV+UF+TDS', 'Pride Plus 8 L', 'Prime Plus 9 L RO+UV+UF+TDS', 'Sterling Plus 6 L', 'Grand 8 L RO', 'Grand Plus 9 L RO+UV+UF+TDS', 'Grand Star 9 L', 'Excell Plus 7 L RO+UV+UF+TDS', 'Elegant Copper 8 L', 'Marvel', 'Sapphire'],
    'Aquaguard': ['Delight NXT RO+UV+UF Aquasaver', 'Delight RO+UV+UF 2X', 'Aura 2X RO+UV + Copper', 'Glory RO+UV+UF + Active Copper', 'Designo NXT Under-counter RO+UV Copper', 'Blaze Insta WS RO+UV Hot & Ambient', 'SlimGlass RO+UV'],
    'Pureit': ['Marvella 10 L RO+UV', 'Eco Water Saver RO+UV+MF+Mineral', 'RO+UV+MF+Copper+Minerial', 'Classic RO variants'],
    'Livpure': ['Pep Pro 7 L RO+UF', 'Glitz 7 L RO+UF', 'Glo Star RO+In-Tank UV+UF+Mineraliser', 'Allura Premia'],
    'Blue Star': ['Aristo 7 L RO+UV+UF with Pre-Filter', 'Mid-range models with taste boosters'],
    'Havells': ['Max Alkaline RO+UV', 'Fab Alkaline RO+UV'],
    'AO Smith': ['Z9 Pro Instant Hot & Ambient Purifier', 'Models with SCMT'],
    'Tata Swach': ['Cristella Plus RO Water Purifier', 'Other RO combo models'],
    'LG': ['Puricare WW180EP RO model', 'Models with mineral booster'],
    'Protek': ['Elite Plus 12 L RO+UV+UF'],
    'Aqua Fresh': ['Swift 15 L RO+UV+TDS'],
    'Samsung': ['PURE RO + UV + UF', 'PURE RO + UV + Mineral', 'PURE RO + UV + Alkaline'],
    'Supreme': ['Supreme RO + UV', 'Supreme RO + UV + UF', 'Supreme RO + UV + Mineral'],
    'Whirlpool': ['Whirlpool RO + UV', 'Whirlpool RO + UV + UF', 'Whirlpool RO + UV + Mineral'],
    'Hindware': ['Hindware RO + UV', 'Hindware RO + UV + UF'],
    'Eureka Forbes': ['Aquaguard RO + UV', 'Aquaguard RO + UV + UF']
  },
  'SOFTENER': {
    'Kent': ['Grand Softener 25L', 'Grand Softener 50L'],
    'Aquaguard': ['Supreme Softener 25L', 'Supreme Softener 50L'],
    'Pureit': ['Pureit Softener 25L', 'Pureit Softener 50L'],
    'Livpure': ['Livpure Softener 25L', 'Livpure Softener 50L'],
    'Blue Star': ['Blue Star Softener 25L', 'Blue Star Softener 50L']
  }
};

// Parse database service_type value back to array
const parseDbServiceType = (serviceType: string): string[] => {
  if (!serviceType) return ['RO'];
  switch (serviceType) {
    case 'ALL_SERVICES': return ['RO', 'SOFTENER', 'AC'];
    case 'RO_SOFTENER': return ['RO', 'SOFTENER'];
    case 'RO_AC': return ['RO', 'AC'];
    case 'SOFTENER_AC': return ['SOFTENER', 'AC'];
    case 'RO':
    case 'SOFTENER':
    case 'AC':
    case 'APPLIANCE':
      return [serviceType];
    default:
      if (serviceType.includes(',')) {
        return serviceType.split(',').map((s: string) => s.trim());
      }
      return [serviceType];
  }
};

// Transform customer data
const transformCustomerData = (customer: any): Customer => ({
  id: customer.id,
  customerId: customer.customer_id,
  fullName: customer.full_name,
  phone: customer.phone,
  alternatePhone: customer.alternate_phone,
  email: customer.email,
  address: {
    street: customer.address?.street || '',
    area: customer.address?.area || '',
    city: customer.address?.city || '',
    state: customer.address?.state || '',
    pincode: customer.address?.pincode || '',
    landmark: customer.address?.landmark,
    visible_address: customer.visible_address || customer.address?.visible_address || ''
  },
  location: {
    latitude: customer.location?.latitude || 0,
    longitude: customer.location?.longitude || 0,
    formattedAddress: customer.location?.formatted_address || customer.location?.formattedAddress || '',
    googlePlaceId: customer.location?.google_place_id,
    googleLocation: customer.location?.googleLocation || null
  } as any,
  serviceType: customer.service_type,
  brand: customer.brand,
  model: customer.model,
  installationDate: customer.installation_date,
  warrantyExpiry: customer.warranty_expiry,
  status: customer.status,
  customerSince: customer.customer_since,
  lastServiceDate: customer.last_service_date,
  notes: customer.notes,
  preferredTimeSlot: customer.preferred_time_slot,
  customTime: (customer as any).custom_time || null,
  preferredLanguage: customer.preferred_language,
  serviceCost: customer.service_cost,
  costAgreed: customer.cost_agreed,
  has_prefilter: customer.has_prefilter ?? null,
  createdAt: customer.created_at,
  updatedAt: customer.updated_at
});

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  dbBrands: string[];
  dbModels: string[];
  onCustomerUpdated: (updatedCustomer: Customer) => void;
  onLoadBrandsAndModels: () => Promise<void>;
  onCustomerDeleted?: (customerId: string) => void;
}

const EditCustomerDialog: React.FC<EditCustomerDialogProps> = ({
  open,
  onOpenChange,
  customer,
  dbBrands,
  dbModels,
  onCustomerUpdated,
  onLoadBrandsAndModels,
  onCustomerDeleted
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    alternate_phone: '',
    email: '',
    service_types: [] as string[],
    equipment: {} as {[serviceType: string]: {brand: string, model: string}},
    behavior: '',
    native_language: '',
    status: '',
    notes: '',
    google_location: '',
    visible_address: '',
    custom_time: '',
    has_prefilter: null as boolean | null,
    address: {
      street: '',
      area: '',
      city: '',
      state: '',
      pincode: ''
    },
    location: {
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    },
    service_cost: 0,
    cost_agreed: false
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [visibleAddressSuggestions, setVisibleAddressSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const locationManuallyEditedRef = useRef(false);
  const lastSavedFormDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);

  const filteredAddressSuggestions = useMemo(() => {
    if (!editFormData?.visible_address || editFormData.visible_address.trim().length === 0) {
      return [];
    }
    const searchTerm = editFormData.visible_address.toLowerCase();
    const uniqueAreas = [...new Set(bangaloreAreas)];
    return uniqueAreas.filter(area => 
      area.toLowerCase().includes(searchTerm)
    ).slice(0, 12);
  }, [editFormData?.visible_address]);

  // Initialize form when customer changes - fetch fresh data from database
  useEffect(() => {
    if (customer && open) {
      // Fetch fresh customer data from database to ensure we have latest prefilter status
      const fetchFreshCustomerData = async () => {
        try {
          const { data: freshCustomer, error } = await db.customers.getById(customer.id);
          if (error) {
            console.warn('Failed to fetch fresh customer data, using prop data:', error);
          }
          
          // Use fresh customer data if available, otherwise fall back to prop
          const customerToUse = freshCustomer || customer;
          
          const serviceTypes = parseDbServiceType(customerToUse.service_type || '');
          const equipment: {[serviceType: string]: {brand: string, model: string}} = {};
          
          if (serviceTypes.length > 0) {
            const brands = (customerToUse.brand || '').split(',').map((s: string) => s.trim());
            const models = (customerToUse.model || '').split(',').map((s: string) => s.trim());
            
            serviceTypes.forEach((serviceType: string, index: number) => {
              const brandValue = brands[index] || '';
              const modelValue = models[index] || '';
              equipment[serviceType] = {
                brand: brandValue === 'Not specified' || brandValue.toLowerCase() === 'not specified' ? '' : brandValue,
                model: modelValue === 'Not specified' || modelValue.toLowerCase() === 'not specified' ? '' : modelValue
              };
            });
          }
          
          setEditFormData({
            full_name: customerToUse.full_name || customerToUse.fullName || '',
            phone: customerToUse.phone || '',
            alternate_phone: customerToUse.alternate_phone || customerToUse.alternatePhone || '',
            email: customerToUse.email || '',
            service_types: serviceTypes,
            equipment: equipment,
            behavior: customerToUse.behavior || '',
            native_language: customerToUse.preferredLanguage || '',
            status: customerToUse.status || '',
            notes: customerToUse.notes || '',
            has_prefilter: (customerToUse as any).has_prefilter ?? null,
        google_location: (() => {
          if ((customerToUse.location as any)?.googleLocation) {
            const googleLoc = (customerToUse.location as any).googleLocation;
            if (googleLoc && typeof googleLoc === 'string' && 
                (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
                !googleLoc.includes('localhost') && 
                !googleLoc.includes('127.0.0.1')) {
              return googleLoc;
            }
          }
          if (customerToUse.location?.latitude && customerToUse.location?.longitude && 
              customerToUse.location.latitude !== 0 && customerToUse.location.longitude !== 0) {
            return `https://www.google.com/maps/place/${customerToUse.location.latitude},${customerToUse.location.longitude}`;
          }
          if (customerToUse.location?.formattedAddress && 
              typeof customerToUse.location.formattedAddress === 'string' &&
              (customerToUse.location.formattedAddress.includes('google.com/maps') || customerToUse.location.formattedAddress.includes('maps.app.goo.gl')) &&
              !customerToUse.location.formattedAddress.includes('localhost') &&
              !customerToUse.location.formattedAddress.includes('127.0.0.1')) {
            return customerToUse.location.formattedAddress;
          }
          return '';
        })(),
        visible_address: (customerToUse as any).visible_address || (customerToUse.address as any)?.visible_address || '',
        custom_time: customerToUse.customTime || (customerToUse as any).custom_time || '',
        address: {
          street: (() => {
            const existingStreet = customerToUse.address?.street || '';
            if (existingStreet.includes(',') || existingStreet.length > 30) {
              return existingStreet;
            }
            const joined = [
              customerToUse.address?.street,
              customerToUse.address?.area,
              customerToUse.address?.city,
              customerToUse.address?.state,
              customerToUse.address?.pincode
            ].filter(Boolean).join(', ');
            return joined || existingStreet || '';
          })(),
          area: customerToUse.address?.area || '',
          city: customerToUse.address?.city || '',
          state: customerToUse.address?.state || '',
          pincode: customerToUse.address?.pincode || ''
        },
        location: {
          latitude: customerToUse.location?.latitude || 0,
          longitude: customerToUse.location?.longitude || 0,
          formattedAddress: customerToUse.location?.formattedAddress || ''
        },
        service_cost: customerToUse.serviceCost || 0,
        cost_agreed: customerToUse.costAgreed || false
      });
      
      lastSavedFormDataRef.current = JSON.stringify({
        full_name: customerToUse.full_name || customerToUse.fullName || '',
        phone: customerToUse.phone || '',
        alternate_phone: customerToUse.alternate_phone || customerToUse.alternatePhone || '',
        email: customerToUse.email || '',
        service_types: serviceTypes,
        equipment: equipment,
        behavior: customerToUse.behavior || '',
        native_language: customerToUse.preferredLanguage || '',
        status: customerToUse.status || '',
        notes: customerToUse.notes || '',
        google_location: (() => {
          if ((customerToUse.location as any)?.googleLocation) {
            const googleLoc = (customerToUse.location as any).googleLocation;
            if (googleLoc && typeof googleLoc === 'string' && 
                (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl')) &&
                !googleLoc.includes('localhost')) {
              return googleLoc;
            }
          }
          return '';
        })(),
        visible_address: (customerToUse as any).visible_address || (customerToUse.address as any)?.visible_address || '',
        custom_time: customerToUse.customTime || (customerToUse as any).custom_time || ''
      });
        } catch (error) {
          console.error('Error fetching fresh customer data:', error);
          // Fall back to using prop data if fetch fails
        }
      };
      
      fetchFreshCustomerData();
      hasUnsavedChangesRef.current = false;
      locationManuallyEditedRef.current = false;
    }
  }, [customer, open]);


  const handleEditFormChange = (field: string, value: string | string[] | boolean | null) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddressFieldChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value
      }
    }));
  };

  const handleFetchLocationFromAddress = () => {
    const address = editFormData?.address?.street || '';
    const currentAddress = address.trim();
    const currentLocation = editFormData?.visible_address || '';
    
    if (!currentAddress || currentAddress.length === 0) {
      toast.error('Please enter a complete address first');
      return;
    }
    
    if (currentLocation && currentLocation.trim().length > 0) {
      toast.info('Location already set. Clear it first if you want to fetch a new one.');
      return;
    }
    
    const extracted = extractLocationFromAddressString(currentAddress);
    if (extracted) {
      handleEditFormChange('visible_address', extracted);
      locationManuallyEditedRef.current = false;
      toast.success(`Location extracted: ${extracted}`);
    } else {
      toast.warning('Could not extract location from address. Please enter manually.');
    }
  };

  const handleEditServiceTypeToggle = (serviceType: string) => {
    setEditFormData(prev => {
      const newServiceTypes = prev.service_types.includes(serviceType)
        ? prev.service_types.filter(type => type !== serviceType)
        : [...prev.service_types, serviceType];
      
      const newEquipment = { ...prev.equipment };
      if (!prev.service_types.includes(serviceType)) {
        newEquipment[serviceType] = { brand: '', model: '' };
      } else {
        delete newEquipment[serviceType];
      }
      
      return {
        ...prev,
        service_types: newServiceTypes,
        equipment: newEquipment
      };
    });
  };

  const handleEditEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string, showSuggestions: boolean = true) => {
    setEditFormData(prev => {
      const updatedEquipment = {
        ...prev.equipment,
        [serviceType]: {
          ...(prev.equipment[serviceType] || { brand: '', model: '' }),
          [field]: value
        }
      };
      return {
        ...prev,
        equipment: updatedEquipment
      };
    });
    
    if (showSuggestions) {
      if (field === 'brand') {
        handleEditBrandInput(serviceType, value);
      } else if (field === 'model') {
        handleEditModelInput(serviceType, value);
      }
    }
  };

  const handleEditBrandInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowBrandSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const allLocalBrands: string[] = [];
    Object.values(brandData).forEach(brands => {
      allLocalBrands.push(...brands);
    });
    
    const allBrands = [...new Set([...allLocalBrands, ...dbBrands])];
    const filtered = allBrands.filter(brand => 
      brand.toLowerCase().includes(searchTerm) && 
      brand.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  const handleEditModelInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowModelSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const brand = editFormData.equipment[serviceType]?.brand || '';
    
    const localModels: string[] = [];
    if (serviceType && brand && modelData[serviceType as keyof typeof modelData]) {
      const brandKey = Object.keys(modelData[serviceType as keyof typeof modelData]).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && modelData[serviceType as keyof typeof modelData][brandKey as keyof typeof modelData[typeof serviceType]]) {
        localModels.push(...(modelData[serviceType as keyof typeof modelData][brandKey as keyof typeof modelData[typeof serviceType]] || []));
      }
    }
    
    const allModels = [...new Set([...localModels, ...dbModels])];
    const filtered = allModels.filter(model => 
      model.toLowerCase().includes(searchTerm) && 
      model.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  const selectEditBrand = (serviceType: string, brand: string) => {
    if (brand === 'Not specified' || brand.toLowerCase() === 'not specified') {
      handleEditEquipmentChange(serviceType, 'brand', '', false);
    } else {
      handleEditEquipmentChange(serviceType, 'brand', brand, false);
    }
    setShowBrandSuggestions(false);
  };

  const selectEditModel = (serviceType: string, model: string) => {
    if (model === 'Not specified' || model.toLowerCase() === 'not specified') {
      handleEditEquipmentChange(serviceType, 'model', '', false);
    } else {
      handleEditEquipmentChange(serviceType, 'model', model, false);
    }
    setShowModelSuggestions(false);
  };

  // Extract coordinates from Google Maps link
  const extractCoordinatesFromGoogleMapsLink = (url: string): { latitude: number; longitude: number } | null => {
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      
      const preciseMatch = url.match(/!3d([0-9.-]+)!4d([0-9.-]+)/);
      if (preciseMatch) {
        lat = parseFloat(preciseMatch[1]);
        lng = parseFloat(preciseMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      const placeMatch = url.match(/\/place\/([0-9.-]+),([0-9.-]+)/);
      if (placeMatch) {
        lat = parseFloat(placeMatch[1]);
        lng = parseFloat(placeMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      const atMatch = url.match(/@([0-9.-]+),([0-9.-]+)/);
      if (atMatch) {
        lat = parseFloat(atMatch[1]);
        lng = parseFloat(atMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  // Load Google Maps script
  const loadGoogleMapsScript = (): Promise<void> => {
    return new Promise((resolve) => {
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        resolve();
        return;
      }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        resolve();
        return;
      }

      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        const checkInterval = setInterval(() => {
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 10000);
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        let attempts = 0;
        const maxAttempts = 50;
        const checkInterval = setInterval(() => {
          attempts++;
          if (window.google && window.google.maps && window.google.maps.Geocoder) {
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      };
      
      script.onerror = () => {
        resolve();
      };
      
      document.head.appendChild(script);
    });
  };

  // Reverse geocode
  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        return new Promise((resolve) => {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            { location: { lat, lng } },
            (results, status) => {
              if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
                resolve(results[0].formatted_address);
              } else {
                resolve(reverseGeocodeOpenStreetMap(lat, lng));
              }
            }
          );
        });
      } else {
        return reverseGeocodeOpenStreetMap(lat, lng);
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return reverseGeocodeOpenStreetMap(lat, lng);
    }
  };

  // Fallback: Reverse geocode using OpenStreetMap
  const reverseGeocodeOpenStreetMap = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'RO-Service-Management-App'
          }
        }
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data && data.display_name) {
        return data.display_name;
      }
      return null;
    } catch (error) {
      console.error('OpenStreetMap reverse geocoding error:', error);
      return null;
    }
  };

  const fetchAddressFromGoogleLocation = async () => {
    const googleLocation = editFormData?.google_location || '';
    
    if (!googleLocation.trim()) {
      toast.error('Please enter a Google Maps link first');
      return;
    }

    if (!googleLocation.includes('google.com/maps') && !googleLocation.includes('maps.app.goo.gl') && !googleLocation.includes('goo.gl/maps')) {
      toast.error('Please enter a valid Google Maps link');
      return;
    }

    const coords = extractCoordinatesFromGoogleMapsLink(googleLocation);
    if (!coords) {
      toast.error('Could not extract coordinates from this link. Short links may not work.');
      return;
    }

    try {
      const loadingToast = toast.loading('Fetching address from Google Maps...');

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
        await loadGoogleMapsScript();
      }

      const address = await reverseGeocode(coords.latitude, coords.longitude);
      
      // Automatically extract location from address using pre-built data (no API call)
      // Try extracting from the reverse geocoded address first, then fall back to existing address.street
      let extractedLocation = null;
      if (address) {
        extractedLocation = extractLocationFromAddressString(address);
      }
      // If no location found from reverse geocoded address, try extracting from existing address.street
      if (!extractedLocation && editFormData.address.street) {
        extractedLocation = extractLocationFromAddressString(editFormData.address.street);
      }
      
      setEditFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: coords.latitude,
          longitude: coords.longitude,
          formattedAddress: address || prev.location.formattedAddress || ''
        },
        address: {
          street: address || prev.address.street || '',
          area: '',
          city: '',
          state: '',
          pincode: ''
        },
        // Always extract and set location automatically (since it uses pre-built data, no API cost)
        visible_address: extractedLocation 
          ? extractedLocation.substring(0, 20) 
          : prev.visible_address
      }));
      
      // Reset the manual edit flag since we're auto-extracting location
      if (extractedLocation) {
        locationManuallyEditedRef.current = false;
      }
      
      toast.dismiss(loadingToast);
      
      if (address) {
        toast.success(`Address fetched: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`);
        if (extractedLocation) {
          toast.info(`Location automatically identified: ${extractedLocation}`);
        }
      } else {
        toast.success(`Coordinates extracted: ${coords.latitude}, ${coords.longitude}`);
        toast.warning('Could not fetch address. Coordinates saved.');
        if (extractedLocation) {
          toast.info(`Location extracted from existing address: ${extractedLocation}`);
        }
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      toast.error('Failed to fetch address. Please try again.');
    }
  };

  const handleGoogleMapsLinkChange = async (value: string) => {
    // Only update the google_location field - do NOT extract coordinates or geocode automatically
    setEditFormData(prev => ({
      ...prev,
      google_location: value
    }));

    if (!value.trim()) {
      // Clear location data when link is removed
      setEditFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: 0,
          longitude: 0,
          formattedAddress: ''
        }
      }));
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customer) return;

    setIsDeleting(true);
    try {
      console.log('Attempting to delete customer:', {
        id: customer.id,
        customer_id: (customer as any)?.customer_id || customer.customerId,
        name: (customer as any)?.full_name || customer.fullName
      });

      const { error, data } = await db.customers.delete(customer.id);

      console.log('Delete response:', { error, data });

      if (error) {
        console.error('Delete customer error details:', {
          error,
          errorObject: JSON.stringify(error, null, 2),
          customerId: customer.id,
          customer_id: (customer as any)?.customer_id || customer.customerId,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint
        });
        
        // Check if it's an RLS policy error
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
          throw new Error(`Permission denied (Error Code: ${error.code}). The DELETE policy exists but you may not be authenticated. Please check your login status.`);
        }
        
        // Check for foreign key constraint errors
        if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('constraint')) {
          throw new Error(`Cannot delete customer: ${error.message}. There may be related records preventing deletion.`);
        }
        
        throw new Error(`Delete failed: ${error.message || 'Unknown error'} (Code: ${error.code || 'N/A'})`);
      }

      // Verify deletion succeeded
      // If delete returned data (deleted row), deletion was successful
      // No need to verify by querying - the 406 error happens because row doesn't exist (expected)
      if (data && Array.isArray(data) && data.length > 0) {
        console.log('Customer successfully deleted:', data[0]);
      } else {
        console.log('Customer deletion completed (no data returned, which is normal)');
      }
      toast.success(`Customer ${(customer as any)?.customer_id || customer.customerId} deleted successfully`);
      
      if (onCustomerDeleted) {
        onCustomerDeleted(customer.id);
      }
      
      setDeleteDialogOpen(false);
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error deleting customer:', error);
      toast.error(`Failed to delete customer: ${errorMessage}`, { duration: 10000 });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateCustomer = async () => {
    if (!customer) return;

    setIsUpdating(true);
    try {
      const updatedAddress = {
        street: editFormData.address.street,
        area: editFormData.address.area,
        city: editFormData.address.city,
        state: editFormData.address.state,
        pincode: editFormData.address.pincode
      };

      const updatedLocation: any = {
        latitude: editFormData.location.latitude || 0,
        longitude: editFormData.location.longitude || 0,
        formattedAddress: editFormData.address.street || editFormData.location.formattedAddress || '',
      };
      
      if (editFormData.google_location && editFormData.google_location.trim()) {
        updatedLocation.googleLocation = editFormData.google_location;
      } else if ((editFormData.location as any)?.googleLocation) {
        updatedLocation.googleLocation = (editFormData.location as any).googleLocation;
      }

      const brands: string[] = [];
      const models: string[] = [];
      
      editFormData.service_types.forEach((serviceType: string) => {
        const equipment = editFormData.equipment[serviceType];
        if (equipment) {
          brands.push(equipment.brand?.trim() || '');
          models.push(equipment.model?.trim() || '');
        } else {
          brands.push('');
          models.push('');
        }
      });

      const updateData = {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        alternate_phone: editFormData.alternate_phone,
        email: editFormData.email,
        service_type: mapServiceTypesToDbValue(editFormData.service_types),
        brand: brands.join(', '),
        model: models.join(', '),
        preferred_language: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        preferred_time_slot: (customer as any).preferred_time_slot || customer.preferredTimeSlot || 'MORNING',
        status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: editFormData.notes,
        visible_address: editFormData.visible_address ? editFormData.visible_address.trim() : '',
        custom_time: editFormData.custom_time || null,
        has_prefilter: editFormData.has_prefilter,
        address: updatedAddress,
        location: updatedLocation
      };

      const { data: updatedCustomerFromDb, error } = await db.customers.update(customer.id, updateData);

      if (error) {
        throw new Error(error.message);
      }

      if (updatedCustomerFromDb) {
        const transformedCustomer = transformCustomerData(updatedCustomerFromDb);
        onCustomerUpdated(transformedCustomer);
      }

      await onLoadBrandsAndModels();
      
      lastSavedFormDataRef.current = JSON.stringify(editFormData);
      hasUnsavedChangesRef.current = false;
      
      toast.success('Customer updated successfully!');
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error updating customer:', error);
      toast.error(`Failed to update customer: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Track changes in form data
  useEffect(() => {
    if (!customer || !open) return;
    
    const currentFormDataString = JSON.stringify(editFormData);
    const hasChanges = currentFormDataString !== lastSavedFormDataRef.current;
    hasUnsavedChangesRef.current = hasChanges;
  }, [editFormData, customer, open]);

  // Function to auto-save customer (called on dialog close)
  const autoSaveCustomer = async () => {
    if (!customer || isUpdating || !hasUnsavedChangesRef.current) return;

    try {
      const updatedAddress = {
        street: editFormData.address.street,
        area: editFormData.address.area,
        city: editFormData.address.city,
        state: editFormData.address.state,
        pincode: editFormData.address.pincode
      };

      const updatedLocation: any = {
        latitude: editFormData.location.latitude || 0,
        longitude: editFormData.location.longitude || 0,
        formattedAddress: editFormData.address.street || editFormData.location.formattedAddress || '',
      };
      
      if (editFormData.google_location && editFormData.google_location.trim()) {
        updatedLocation.googleLocation = editFormData.google_location;
      } else if ((editFormData.location as any)?.googleLocation) {
        updatedLocation.googleLocation = (editFormData.location as any).googleLocation;
      }

      const brands: string[] = [];
      const models: string[] = [];
      
      editFormData.service_types.forEach((serviceType: string) => {
        const equipment = editFormData.equipment[serviceType];
        if (equipment) {
          brands.push(equipment.brand?.trim() || '');
          models.push(equipment.model?.trim() || '');
        } else {
          brands.push('');
          models.push('');
        }
      });

      const { data: updatedCustomerFromDb, error } = await db.customers.update(customer.id, {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        alternate_phone: editFormData.alternate_phone,
        email: editFormData.email,
        service_type: mapServiceTypesToDbValue(editFormData.service_types),
        brand: brands.join(', '),
        model: models.join(', '),
        preferred_language: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        preferred_time_slot: (customer as any).preferred_time_slot || customer.preferredTimeSlot || 'MORNING',
        status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: editFormData.notes,
        visible_address: editFormData.visible_address ? editFormData.visible_address.trim() : '',
        custom_time: editFormData.custom_time || null,
        has_prefilter: editFormData.has_prefilter,
        address: updatedAddress,
        location: updatedLocation
      });

      if (error) {
        throw new Error(error.message);
      }

      if (updatedCustomerFromDb) {
        const transformedCustomer = transformCustomerData(updatedCustomerFromDb);
        onCustomerUpdated(transformedCustomer);
      }

      lastSavedFormDataRef.current = JSON.stringify(editFormData);
      hasUnsavedChangesRef.current = false;
      
      toast.success('Customer auto-saved successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error auto-saving customer:', error);
      toast.error(`Auto-save failed: ${errorMessage}`);
    }
  };

  const handleDialogOpenChange = async (isOpen: boolean) => {
    // If closing and there are unsaved changes, save first
    if (!isOpen && customer && hasUnsavedChangesRef.current) {
      await autoSaveCustomer();
    }
    // Then proceed with the normal close
    onOpenChange(isOpen);
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription>
            Update customer information for {customer?.customerId || (customer as any)?.customer_id || 'Customer'} - {customer?.fullName || (customer as any)?.full_name || ''}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Full Name</Label>
                <Input
                  id="edit_full_name"
                  value={editFormData?.full_name ?? ''}
                  onChange={(e) => handleEditFormChange('full_name', e.target.value)}
                  placeholder="Enter full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_phone">Primary Phone</Label>
                <Input
                  id="edit_phone"
                  value={editFormData?.phone ?? ''}
                  onChange={(e) => handleEditFormChange('phone', e.target.value)}
                  placeholder="Enter primary phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_alternate_phone">Alternate Phone</Label>
                <Input
                  id="edit_alternate_phone"
                  value={editFormData?.alternate_phone ?? ''}
                  onChange={(e) => handleEditFormChange('alternate_phone', e.target.value)}
                  placeholder="Enter alternate phone number (optional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editFormData?.email ?? ''}
                  onChange={(e) => handleEditFormChange('email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Address Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_visible_address">Location</Label>
                <div className="relative">
                  <Input
                    id="edit_visible_address"
                    value={editFormData?.visible_address ?? ''}
                    onChange={(e) => {
                      locationManuallyEditedRef.current = true;
                      handleEditFormChange('visible_address', e.target.value);
                      setVisibleAddressSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setVisibleAddressSuggestions((editFormData?.visible_address || '').length > 0)}
                    onBlur={() => {
                      setTimeout(() => setVisibleAddressSuggestions(false), 200);
                    }}
                    placeholder="e.g., Bansawadi, Koramangala, Whitefield, etc."
                    maxLength={20}
                    className="text-sm"
                  />
                  {visibleAddressSuggestions && filteredAddressSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredAddressSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            locationManuallyEditedRef.current = true;
                            handleEditFormChange('visible_address', suggestion);
                            setVisibleAddressSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">Enter a one-word location identifier for quick recognition. Start typing to see suggestions.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit_full_address">Complete Address</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFetchLocationFromAddress}
                    className="whitespace-nowrap"
                    title={editFormData?.visible_address && editFormData.visible_address.trim().length > 0 
                      ? "Location already set. Clear it first to fetch a new one."
                      : "Extract location from complete address"}
                    disabled={!editFormData?.address?.street || editFormData.address.street.trim().length === 0 || (editFormData?.visible_address && editFormData.visible_address.trim().length > 0)}
                  >
                    <MapPin className="w-3 h-3 mr-1" />
                    Fetch Location
                  </Button>
                </div>
                <Textarea
                  id="edit_full_address"
                  value={editFormData?.address?.street ?? ''}
                  onChange={(e) => handleAddressFieldChange('street', e.target.value)}
                  placeholder="Enter complete address (e.g., 123 MG Road, Koramangala, Bangalore, Karnataka, 560034)"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Google Maps Location Section */}
            <div className="space-y-2">
              <Label htmlFor="edit_google_location" className="text-sm font-medium text-gray-900">
                Google Maps Location
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit_google_location"
                  value={editFormData?.google_location ?? ''}
                  onChange={(e) => handleGoogleMapsLinkChange(e.target.value)}
                  placeholder="Paste Google Maps share link here..."
                  className="text-sm flex-1"
                />
                {editFormData?.google_location && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchAddressFromGoogleLocation}
                      className="whitespace-nowrap"
                      title="Fetch address from Google Maps link"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Fetch Address
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.open(editFormData.google_location, '_blank', 'noopener,noreferrer');
                      }}
                      className="whitespace-nowrap"
                      title="Open in Google Maps"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Test
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Service Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
            
            <div className="space-y-3">
              <Label>Service Types</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: 'RO', label: 'RO (Reverse Osmosis)' },
                  { value: 'SOFTENER', label: 'Water Softener' }
                ].map((service) => (
                  <div
                    key={service.value}
                    onClick={() => handleEditServiceTypeToggle(service.value)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      editFormData?.service_types?.includes(service.value)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{service.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Equipment Fields */}
            {editFormData?.service_types?.length > 0 && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">Equipment Details</Label>
                {editFormData?.service_types?.map((serviceType) => {
                  const serviceInfo = [
                    { value: 'RO', label: 'RO (Reverse Osmosis)' },
                    { value: 'SOFTENER', label: 'Water Softener' }
                  ].find(s => s.value === serviceType);
                  
                  const equipment = editFormData?.equipment?.[serviceType] || { brand: '', model: '' };
                  
                  return (
                    <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2 relative">
                          <Label htmlFor={`edit_brand_${serviceType}`}>Brand</Label>
                          <Input
                            id={`edit_brand_${serviceType}`}
                            value={equipment.brand}
                            onChange={(e) => handleEditEquipmentChange(serviceType, 'brand', e.target.value)}
                            placeholder={`Enter ${serviceType} brand`}
                            onBlur={() => {
                              setTimeout(() => setShowBrandSuggestions(false), 200);
                            }}
                          />
                          {showBrandSuggestions && brandSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {brandSuggestions.map((brand, index) => (
                                <div
                                  key={index}
                                  className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                  onClick={() => selectEditBrand(serviceType, brand)}
                                >
                                  {brand}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 relative">
                          <Label htmlFor={`edit_model_${serviceType}`}>Model</Label>
                          <Input
                            id={`edit_model_${serviceType}`}
                            value={equipment.model}
                            onChange={(e) => handleEditEquipmentChange(serviceType, 'model', e.target.value)}
                            placeholder={`Enter ${serviceType} model`}
                            onBlur={() => {
                              setTimeout(() => setShowModelSuggestions(false), 200);
                            }}
                          />
                          {showModelSuggestions && modelSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                              {modelSuggestions.map((model, index) => (
                                <div
                                  key={index}
                                  className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
                                  onClick={() => selectEditModel(serviceType, model)}
                                >
                                  {model}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Additional Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Does the customer have a prefilter?</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-prefilter-yes"
                      name="edit-prefilter"
                      checked={editFormData.has_prefilter === true}
                      onChange={() => handleEditFormChange('has_prefilter', true)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-prefilter-yes" className="cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-prefilter-no"
                      name="edit-prefilter"
                      checked={editFormData.has_prefilter === false}
                      onChange={() => handleEditFormChange('has_prefilter', false)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-prefilter-no" className="cursor-pointer">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-prefilter-unknown"
                      name="edit-prefilter"
                      checked={editFormData.has_prefilter === null}
                      onChange={() => handleEditFormChange('has_prefilter', null)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-prefilter-unknown" className="cursor-pointer">Not Set</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button 
            variant="destructive" 
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isUpdating || isDeleting}
            className="w-full sm:w-auto"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Customer
          </Button>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isUpdating || isDeleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              variant="default"
              onClick={handleUpdateCustomer}
              disabled={isUpdating || isDeleting}
              className="w-full sm:w-auto"
            >
              {isUpdating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Updating...
                </div>
              ) : (
                'Update Customer'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Delete Customer Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete customer <strong>{(customer as any)?.customer_id || customer?.customerId}</strong> - <strong>{(customer as any)?.full_name || customer?.fullName}</strong>?
              <br />
              <br />
              This action cannot be undone and will permanently remove the customer and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCustomer}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Deleting...
                </div>
              ) : (
                'Delete Customer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default EditCustomerDialog;
