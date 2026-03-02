import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Customer } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { MapPin, Download, ExternalLink } from 'lucide-react';
import { generateJobNumber, extractLocationFromAddressString, bangaloreAreas } from '@/lib/adminUtils';
import ImageUpload from '@/components/ImageUpload';

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

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  /** Called after customer (and optional job) created. Pass the created customer so the parent can append to list (e.g. when no job created). */
  onCustomerCreated: (newCustomer?: any) => Promise<void>;
  onExistingCustomerFound?: (customer: Customer) => void;
  /** When provided, runs before allowing Next from step 1; only proceed if no duplicate. Call runs on blur (phone/email) and on Next. */
  onCheckExistingCustomer?: (phone: string, email?: string) => Promise<Customer | null>;
}

const AddCustomerDialog: React.FC<AddCustomerDialogProps> = ({
  open,
  onOpenChange,
  customers,
  onCustomerCreated,
  onExistingCustomerFound,
  onCheckExistingCustomer
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [shouldCreateJob, setShouldCreateJob] = useState(true); // Default to true
  const [addFormData, setAddFormData] = useState({
    full_name: '',
    phone: '',
    alternate_phone: '',
    email: '',
    service_types: [] as string[],
    equipment: {} as {[serviceType: string]: {brand: string, model: string}},
    photos: {} as {[serviceType: string]: string[]}, // Photos for each service type
    behavior: '',
    native_language: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
    notes: '',
    address: '',
    visible_address: '',
    google_location: '',
    service_cost: 0,
    cost_agreed: false
  });
  const [visibleAddressSuggestions, setVisibleAddressSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [duplicateFoundOnBlur, setDuplicateFoundOnBlur] = useState<Customer | null>(null);
  const locationManuallyEditedRef = useRef(false);
  const [step5JobData, setStep5JobData] = useState({
    service_type: 'RO' as 'RO' | 'SOFTENER',
    service_sub_type: '', // Not selected by default; compulsory
    service_sub_type_custom: '',
    scheduled_date: '',
    scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
    scheduled_time_custom: '',
    description: '',
    lead_source: '', // Not selected by default; compulsory
    lead_source_custom: '',
    lead_cost: '0',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    assigned_technician_id: '', // Add technician assignment field
    require_otp: false
  });

  // Load technicians for assignment
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);

  useEffect(() => {
    if (open) setDuplicateFoundOnBlur(null);
  }, [open]);

  useEffect(() => {
    const loadTechnicians = async () => {
      if (open && shouldCreateJob) {
        setLoadingTechnicians(true);
        try {
          // OPTIMIZATION: Limit technicians fetch
          const { data, error } = await db.technicians.getList(100);
          if (error) {
            console.error('Error loading technicians:', error);
          } else {
            setTechnicians(data || []);
          }
        } catch (error) {
          console.error('Error loading technicians:', error);
        } finally {
          setLoadingTechnicians(false);
        }
      }
    };
    loadTechnicians();
  }, [open, shouldCreateJob]);

  // Initialize scheduled_date when dialog opens and shouldCreateJob is true
  useEffect(() => {
    if (open && shouldCreateJob && !step5JobData.scheduled_date) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayDateString = `${year}-${month}-${day}`;
      setStep5JobData(prev => ({
        ...prev,
        scheduled_date: todayDateString,
        service_type: addFormData.service_types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO'
      }));
    }
  }, [open, shouldCreateJob, step5JobData.scheduled_date, addFormData.service_types]);

  const cleanPhoneNumber = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };

  const formatPhoneNumber = (phone: string): string => {
    const cleaned = cleanPhoneNumber(phone);
    
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned.substring(2);
    }
    
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return cleaned.substring(1);
    }
    
    return cleaned;
  };

  const validatePhoneNumber = (phone: string): { isValid: boolean; error?: string; formatted?: string } => {
    const cleaned = cleanPhoneNumber(phone);
    
    if (!cleaned) {
      return { isValid: true };
    }
    
    if (cleaned.length !== 10) {
      return { 
        isValid: false, 
        error: 'Phone number must be exactly 10 digits (e.g., 6361631253)' 
      };
    }
    
    if (!/^[6-9]/.test(cleaned)) {
      return { 
        isValid: false, 
        error: 'Phone number must start with 6, 7, 8, or 9' 
      };
    }
    
    return { isValid: true, formatted: cleaned };
  };

  const checkExistingCustomer = (phone: string, email?: string): Customer | null => {
    const existingByPhone = customers.find(customer =>
      customer.phone === phone ||
      customer.alternate_phone === phone
    );
    if (existingByPhone) return existingByPhone;
    if (email && email.trim()) {
      const existingByEmail = customers.find(customer =>
        customer.email?.toLowerCase() === email.toLowerCase()
      );
      if (existingByEmail) return existingByEmail;
    }
    return null;
  };

  const validateStep = (step: number): boolean => {
    const errors: {[key: string]: string} = {};
    
    switch (step) {
      case 1:
        // Phone number is required
        if (!addFormData.phone || !addFormData.phone.trim()) {
          errors.phone = 'Phone number is required';
        } else {
          const phoneValidation = validatePhoneNumber(addFormData.phone);
          if (!phoneValidation.isValid) {
            errors.phone = phoneValidation.error || 'Invalid phone number';
          }
        }
        
        // Alternate phone is optional but must be valid if provided
        if (addFormData.alternate_phone && addFormData.alternate_phone.trim()) {
          const alternatePhoneValidation = validatePhoneNumber(addFormData.alternate_phone);
          if (!alternatePhoneValidation.isValid) {
            errors.alternate_phone = alternatePhoneValidation.error || 'Invalid alternate phone number';
          }
        }
        
        if (addFormData.email && addFormData.email.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(addFormData.email)) {
            errors.email = 'Please enter a valid email address';
          }
        }
        break;
      case 2:
        break;
      case 3:
        break;
      case 4:
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = async () => {
    if (!validateStep(currentStep)) return;
    if (currentStep === 1) {
      if (onCheckExistingCustomer) {
        const existing = await onCheckExistingCustomer(addFormData.phone, addFormData.email);
        if (existing) {
          onExistingCustomerFound?.(existing);
          return;
        }
      } else {
        const existing = checkExistingCustomer(addFormData.phone, addFormData.email);
        if (existing && onExistingCustomerFound) {
          onExistingCustomerFound(existing);
          return;
        }
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleAddFormChange = (field: string, value: string | string[]) => {
    setAddFormData(prev => ({
      ...prev,
      [field]: value
    }));

    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      phone: limited
    }));

    if (formErrors.phone) {
      setFormErrors(prev => ({
        ...prev,
        phone: ''
      }));
    }
  };

  const handleAlternatePhoneChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      alternate_phone: limited
    }));

    if (formErrors.alternate_phone) {
      setFormErrors(prev => ({
        ...prev,
        alternate_phone: ''
      }));
    }
  };

  const filteredAddressSuggestions = useMemo(() => {
    if (!addFormData.visible_address || addFormData.visible_address.trim().length === 0) {
      return [];
    }
    const searchTerm = addFormData.visible_address.toLowerCase();
    const uniqueAreas = [...new Set(bangaloreAreas)];
    return uniqueAreas.filter(area => 
      area.toLowerCase().includes(searchTerm)
    ).slice(0, 12);
  }, [addFormData.visible_address]);

  const handleFetchLocationFromAddress = () => {
    const address = addFormData.address || '';
    const currentAddress = address.trim();
    const currentLocation = addFormData.visible_address || '';
    
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
      handleAddFormChange('visible_address', extracted);
      locationManuallyEditedRef.current = false;
      toast.success(`Location extracted: ${extracted}`);
    } else {
      toast.warning('Could not extract location from address. Please enter manually.');
    }
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
      
      return null;
    } catch (error) {
      console.error('Error extracting coordinates:', error);
      return null;
    }
  };

  const loadGoogleMapsScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    });
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      if (!window.google || !window.google.maps || !window.google.maps.Geocoder) {
        await loadGoogleMapsScript();
      }
      
      const geocoder = new window.google.maps.Geocoder();
      return new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            resolve(results[0].formatted_address);
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  };

  const fetchAddressFromGoogleLocation = async () => {
    const googleLocation = addFormData.google_location || '';
    
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
      
      let extractedLocation = null;
      if (address) {
        extractedLocation = extractLocationFromAddressString(address);
      }
      if (!extractedLocation && addFormData.address) {
        extractedLocation = extractLocationFromAddressString(addFormData.address);
      }
      
      setAddFormData(prev => ({
        ...prev,
        address: address || prev.address,
        visible_address: extractedLocation 
          ? extractedLocation.substring(0, 20) 
          : prev.visible_address
      }));
      
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

  const handleBrandInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowBrandSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const allLocalBrands: string[] = [];
    Object.values(brandData).forEach(brands => {
      allLocalBrands.push(...brands);
    });
    
    const filtered = allLocalBrands.filter(brand => 
      brand.toLowerCase().includes(searchTerm) && 
      brand.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  const handleModelInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowModelSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const brand = addFormData.equipment[serviceType]?.brand || '';
    
    const localModels: string[] = [];
    if (serviceType && brand && modelData[serviceType as keyof typeof modelData]) {
      const serviceModels = modelData[serviceType as keyof typeof modelData] as Record<string, string[]>;
      const brandKey = Object.keys(serviceModels).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && serviceModels[brandKey]) {
        localModels.push(...(serviceModels[brandKey] || []));
      }
    }
    
    const filtered = localModels.filter(model => 
      model.toLowerCase().includes(searchTerm) && 
      model.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  const selectBrand = (serviceType: string, brand: string) => {
    handleEquipmentChange(serviceType, 'brand', brand);
    setShowBrandSuggestions(false);
  };

  const selectModel = (serviceType: string, model: string) => {
    handleEquipmentChange(serviceType, 'model', model);
    setShowModelSuggestions(false);
  };

  const handleServiceTypeToggle = (serviceType: string) => {
    setAddFormData(prev => {
      const newServiceTypes = prev.service_types.includes(serviceType)
        ? prev.service_types.filter(type => type !== serviceType)
        : [...prev.service_types, serviceType];
      
      const newEquipment = { ...prev.equipment };
      const newPhotos = { ...prev.photos };
      if (!prev.service_types.includes(serviceType)) {
        newEquipment[serviceType] = { brand: '', model: '' };
        newPhotos[serviceType] = [];
      } else {
        delete newEquipment[serviceType];
        delete newPhotos[serviceType];
      }
      
      return {
        ...prev,
        service_types: newServiceTypes,
        equipment: newEquipment,
        photos: newPhotos
      };
    });
    
    if (formErrors.service_types) {
      setFormErrors(prev => ({
        ...prev,
        service_types: ''
      }));
    }
  };

  const handlePhotosChange = (serviceType: string, photoUrls: string[]) => {
    setAddFormData(prev => ({
      ...prev,
      photos: {
        ...prev.photos,
        [serviceType]: photoUrls
      }
    }));
  };

  const handleEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string) => {
    setAddFormData(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [serviceType]: {
          ...(prev.equipment[serviceType] || { brand: '', model: '' }),
          [field]: value
        }
      }
    }));
    
    if (field === 'brand') {
      handleBrandInput(serviceType, value);
    } else if (field === 'model') {
      handleModelInput(serviceType, value);
    }
    
    const errorKey = `equipment.${serviceType}.${field}`;
    if (formErrors[errorKey]) {
      setFormErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const handleCreateCustomer = async () => {
    if (currentStep === 4) {
      setCurrentStep(5);
      return;
    }
    
    if (currentStep === 5) {
      if (shouldCreateJob) {
        if (!step5JobData.scheduled_date) {
          toast.error('Please select a scheduled date');
          return;
        }
        
        if (!step5JobData.service_sub_type || step5JobData.service_sub_type.trim() === '') {
          toast.error('Please select a service sub type');
          return;
        }

        if (step5JobData.service_sub_type === 'Custom' && (!step5JobData.service_sub_type_custom || step5JobData.service_sub_type_custom.trim() === '')) {
          toast.error('Please enter a custom service sub type');
          return;
        }

        if (!step5JobData.lead_source || step5JobData.lead_source.trim() === '') {
          toast.error('Please select a lead source');
          return;
        }
        
        if (step5JobData.lead_source === 'Other' && (!step5JobData.lead_source_custom || step5JobData.lead_source_custom.trim() === '')) {
          toast.error('Please enter a custom lead source');
          return;
        }

        if (!step5JobData.lead_cost || step5JobData.lead_cost.trim() === '') {
          toast.error('Please enter lead cost');
          return;
        }

        const leadCostNum = parseFloat(step5JobData.lead_cost);
        if (isNaN(leadCostNum) || leadCostNum < 0) {
          toast.error('Lead cost must be a valid number');
          return;
        }

        if (step5JobData.scheduled_time_slot === 'CUSTOM' && (!step5JobData.scheduled_time_custom || step5JobData.scheduled_time_custom.trim() === '')) {
          toast.error('Please enter a custom time');
          return;
        }
      }
      
      await createCustomer();
    }
  };

  const createCustomer = async () => {
    setIsCreating(true);
    try {
      const extractedLocation = extractLocationFromAddressString(addFormData.address);
      
      // Extract coordinates from Google Maps link if provided
      let latitude = 0;
      let longitude = 0;
      let googleLocation: string | null = null;
      let coordinatesExtracted = false;
      
      if (addFormData.google_location && addFormData.google_location.trim()) {
        const googleLocationInput = addFormData.google_location.trim();
        
        // Check if it's already a Google Maps URL
        if (googleLocationInput.includes('google.com/maps') || googleLocationInput.includes('maps.app.goo.gl')) {
          googleLocation = googleLocationInput;
          
          // Try to extract coordinates from the URL
          // Format 1: https://www.google.com/maps/place/12.9716,77.5946
          const placeMatch = googleLocationInput.match(/\/place\/([0-9.-]+),([0-9.-]+)/);
          if (placeMatch) {
            latitude = parseFloat(placeMatch[1]);
            longitude = parseFloat(placeMatch[2]);
            coordinatesExtracted = true;
          } else {
            // Format 2: https://www.google.com/maps/@12.9716,77.5946,15z
            const atMatch = googleLocationInput.match(/@([0-9.-]+),([0-9.-]+)/);
            if (atMatch) {
              latitude = parseFloat(atMatch[1]);
              longitude = parseFloat(atMatch[2]);
              coordinatesExtracted = true;
            } else {
              // Format 3: https://maps.google.com/maps?q=12.9716,77.5946
              const queryMatch = googleLocationInput.match(/[?&]q=([0-9.-]+),([0-9.-]+)/);
              if (queryMatch) {
                latitude = parseFloat(queryMatch[1]);
                longitude = parseFloat(queryMatch[2]);
                coordinatesExtracted = true;
              }
            }
          }
        } else {
          // If it looks like coordinates (lat,lng format)
          const coordMatch = googleLocationInput.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
          if (coordMatch) {
            latitude = parseFloat(coordMatch[1]);
            longitude = parseFloat(coordMatch[2]);
            coordinatesExtracted = true;
            googleLocation = `https://www.google.com/maps/place/${latitude},${longitude}`;
          }
        }
      }
      
      // If we extracted coordinates but don't have a Google Maps link, generate one
      if (coordinatesExtracted && !googleLocation && latitude !== 0 && longitude !== 0) {
        googleLocation = `https://www.google.com/maps/place/${latitude},${longitude}`;
      }
      
      // Collect all photos from all service types
      const allPhotos: string[] = [];
      Object.values(addFormData.photos).forEach(photoArray => {
        allPhotos.push(...photoArray);
      });

      const customerData = {
        customer_id: '',
        full_name: addFormData.full_name,
        phone: addFormData.phone ? formatPhoneNumber(addFormData.phone) : '',
        alternate_phone: addFormData.alternate_phone ? formatPhoneNumber(addFormData.alternate_phone) : '',
        email: addFormData.email,
        address: {
          street: addFormData.address,
          area: '',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: ''
        },
        location: {
          latitude: latitude,
          longitude: longitude,
          formattedAddress: addFormData.address,
          googleLocation: googleLocation
        },
        visible_address: addFormData.visible_address ? addFormData.visible_address.trim().substring(0, 20) : (extractedLocation ? extractedLocation.substring(0, 20) : ''),
        service_type: (() => {
          const selectedTypes = addFormData.service_types;
          const validTypes = ['RO', 'SOFTENER'];
          const validSelectedTypes = selectedTypes.filter(type => validTypes.includes(type));
          if (validSelectedTypes.length === 0) return 'RO';
          if (validSelectedTypes.length === 1) return validSelectedTypes[0];
          return validSelectedTypes[0];
        })() as 'RO' | 'SOFTENER',
        brand: Object.values(addFormData.equipment).map(eq => eq.brand).join(', '),
        model: Object.values(addFormData.equipment).map(eq => eq.model).join(', '),
        preferred_language: (addFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        status: addFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: addFormData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING'
      };

      const { data: newCustomer, error } = await db.customers.create(customerData);
      if (error) {
        throw new Error(error.message);
      }

      let newJob = null;
      let jobError = null;

      // Create job if requested
      if (shouldCreateJob && newCustomer) {
        try {
          let scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' = 'MORNING';
          let customTimeInRequirements = null;
          
          if (step5JobData.scheduled_time_slot === 'CUSTOM' && step5JobData.scheduled_time_custom) {
            customTimeInRequirements = step5JobData.scheduled_time_custom;
            const [hours] = step5JobData.scheduled_time_custom.split(':').map(Number);
            if (hours < 13) {
              scheduledTimeSlot = 'MORNING';
            } else if (hours < 18) {
              scheduledTimeSlot = 'AFTERNOON';
            } else {
              scheduledTimeSlot = 'EVENING';
            }
          } else {
            scheduledTimeSlot = step5JobData.scheduled_time_slot as 'MORNING' | 'AFTERNOON' | 'EVENING';
          }
          
          const jobNumber = generateJobNumber(step5JobData.service_type);
          
          // Generate 4-digit OTP if require_otp is true
          let otpCode: string | null = null;
          if (step5JobData.require_otp) {
            otpCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
          }

          const requirements: any[] = [{ 
            lead_source: step5JobData.lead_source === 'Other' ? (step5JobData.lead_source_custom || 'Other') : step5JobData.lead_source,
            custom_time: customTimeInRequirements
          }];

          // Add OTP requirement if enabled
          if (step5JobData.require_otp && otpCode) {
            requirements.push({
              require_otp: true,
              otp_code: otpCode,
              otp_verified: false
            });
          }

          const leadCostNum = parseFloat(step5JobData.lead_cost) || 0;

          // Use the same address/location we sent for the customer (don't rely on API return for JSONB)
          const serviceAddress = customerData.address || {};
          const serviceLocation = customerData.location || {};

          const jobData = {
            job_number: jobNumber,
            customer_id: newCustomer.id,
            service_type: step5JobData.service_type,
            service_sub_type: step5JobData.service_sub_type === 'Custom' ? step5JobData.service_sub_type_custom : step5JobData.service_sub_type,
            brand: newCustomer.brand || customerData.brand || '',
            model: newCustomer.model || customerData.model || '',
            scheduled_date: step5JobData.scheduled_date,
            scheduled_time_slot: scheduledTimeSlot,
            service_address: serviceAddress,
            service_location: serviceLocation,
            status: step5JobData.assigned_technician_id ? 'ASSIGNED' as const : 'PENDING' as const,
            priority: step5JobData.priority,
            description: step5JobData.description.trim() || '',
            requirements: requirements,
            estimated_cost: 0,
            lead_cost: leadCostNum,
            payment_status: 'PENDING' as const,
            before_photos: allPhotos.length > 0 ? allPhotos : [], // Add photos from Step 3 to job's before_photos
            assigned_technician_id: step5JobData.assigned_technician_id || null,
            assigned_date: step5JobData.assigned_technician_id ? new Date().toISOString() : null
          };

          // Debug: Log the job data being created
          console.log('📋 Creating job with data:', {
            job_number: jobData.job_number,
            lead_source: jobData.requirements[0]?.lead_source,
            requirements: jobData.requirements,
            assigned_technician_id: jobData.assigned_technician_id
          });

          const jobResult = await db.jobs.create(jobData as any);
          newJob = jobResult.data;
          jobError = jobResult.error;
          
          if (jobError) {
            console.error('Failed to create job:', jobError);
            console.error('Job insert error details:', (jobError as { message?: string; code?: string; details?: string })?.message, (jobError as { details?: string })?.details);
          } else if (newJob) {
            console.log('✅ Job created successfully:', {
              job_id: (newJob as any).id,
              job_number: (newJob as any).job_number,
              requirements: (newJob as any).requirements
            });
            
            if (step5JobData.assigned_technician_id) {
              // Send notification to assigned technician
              try {
                const { sendNotification, createJobAssignedNotification } = await import('@/lib/notifications');
                const notification = createJobAssignedNotification(newJob as any, technicians.find(t => t.id === step5JobData.assigned_technician_id));
                if (notification) {
                  await sendNotification(notification);
                }
              } catch (notifError) {
                console.error('Error sending notification:', notifError);
                // Don't fail the job creation if notification fails
              }
            }
          }
        } catch (error) {
          console.error('Error creating job:', error);
          jobError = error as any;
        }
      }

      // Close dialog immediately to prevent empty flash
      onOpenChange(false);

      // Show combined toast message
      if (shouldCreateJob && newJob) {
        const jobNumber = (newJob as any).job_number || (newJob as any).jobNumber || 'N/A';
        const assignedTech = step5JobData.assigned_technician_id 
          ? technicians.find(t => t.id === step5JobData.assigned_technician_id)
          : null;
        const techName = assignedTech ? ` and assigned to ${assignedTech.full_name}` : '';
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} and Job ${jobNumber} created${techName}!`);
      } else if (shouldCreateJob && jobError) {
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
        toast.error('Failed to create job. Please create it manually.');
      } else {
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
      }

      // Reset form after dialog is closed
      setAddFormData({
        full_name: '',
        phone: '',
        alternate_phone: '',
        email: '',
        service_types: [],
        equipment: {},
        photos: {},
        behavior: '',
        native_language: '',
        status: 'ACTIVE',
        notes: '',
        address: '',
        visible_address: '',
        google_location: '',
        service_cost: 0,
        cost_agreed: false
      });
      setCurrentStep(1);
      setFormErrors({});
      setDuplicateFoundOnBlur(null);
      setShouldCreateJob(true); // Reset to true (default)
      setStep5JobData({
        service_type: 'RO' as 'RO' | 'SOFTENER',
        service_sub_type: '', // Not selected by default
        service_sub_type_custom: '',
        scheduled_date: '',
        scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
        scheduled_time_custom: '',
        description: '',
        lead_source: '', // Not selected by default
        lead_source_custom: '',
        lead_cost: '0',
        priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
        assigned_technician_id: '', // Reset technician assignment
        require_otp: false
      });

      // Call onCustomerCreated with the new customer so parent can append to list (e.g. when no job created)
      await onCustomerCreated(newCustomer ?? undefined);
    } catch (error) {
      toast.error('Failed to create customer');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs sm:text-sm">
                {currentStep}
              </div>
              <span className="text-sm sm:text-base">Add New Customer</span>
            </div>
            <div className="flex gap-1 ml-auto">
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                    step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {currentStep === 1 && "Enter customer's personal information"}
            {currentStep === 2 && "Enter customer's address details"}
            {currentStep === 3 && "Select services and equipment details"}
            {currentStep === 4 && "Review and confirm customer information"}
            {currentStep === 5 && "Create a new job for this customer?"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6 px-2 sm:px-4 flex-1 overflow-y-auto">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add_full_name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="add_full_name"
                  value={addFormData.full_name}
                  onChange={(e) => handleAddFormChange('full_name', e.target.value)}
                  placeholder="Enter full name"
                  className={`text-sm ${formErrors.full_name ? 'border-red-500' : ''}`}
                />
                {formErrors?.full_name && (
                  <p className="text-xs text-red-500">{formErrors.full_name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add_phone" className="text-sm font-medium">Primary Phone *</Label>
                  <Input
                    id="add_phone"
                    value={addFormData.phone}
                    onChange={(e) => { handlePhoneChange(e.target.value); setDuplicateFoundOnBlur(null); }}
                    onBlur={async () => {
                      if (onCheckExistingCustomer && (addFormData.phone?.trim() || addFormData.email?.trim())) {
                        const existing = await onCheckExistingCustomer(addFormData.phone, addFormData.email);
                        setDuplicateFoundOnBlur(existing ?? null);
                      } else {
                        setDuplicateFoundOnBlur(null);
                      }
                    }}
                    placeholder="Enter 10-digit phone number"
                    className={`text-sm ${formErrors.phone ? 'border-red-500' : ''}`}
                    required
                  />
                  {formErrors?.phone && (
                    <p className="text-xs text-red-500">{formErrors.phone}</p>
                  )}
                  {duplicateFoundOnBlur && (
                    <p className="text-xs text-amber-600">A customer with this number or email already exists.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add_alternate_phone" className="text-sm font-medium">Alternate Phone</Label>
                  <Input
                    id="add_alternate_phone"
                    value={addFormData.alternate_phone}
                    onChange={(e) => handleAlternatePhoneChange(e.target.value)}
                    placeholder="Enter 10-digit phone number (optional)"
                    className={`text-sm ${formErrors.alternate_phone ? 'border-red-500' : ''}`}
                  />
                  {formErrors?.alternate_phone && (
                    <p className="text-xs text-red-500">{formErrors.alternate_phone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add_email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="add_email"
                  type="email"
                  value={addFormData.email}
                  onChange={(e) => { handleAddFormChange('email', e.target.value); setDuplicateFoundOnBlur(null); }}
                  onBlur={async () => {
                    if (onCheckExistingCustomer && (addFormData.phone?.trim() || addFormData.email?.trim())) {
                      const existing = await onCheckExistingCustomer(addFormData.phone, addFormData.email);
                      setDuplicateFoundOnBlur(existing ?? null);
                    } else {
                      setDuplicateFoundOnBlur(null);
                    }
                  }}
                  placeholder="Enter email address"
                  className={`text-sm ${formErrors.email ? 'border-red-500' : ''}`}
                />
                {formErrors?.email && (
                  <p className="text-xs text-red-500">{formErrors.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Address Information */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add_visible_address">Location</Label>
                <div className="relative">
                  <Input
                    id="add_visible_address"
                    value={addFormData.visible_address}
                    onChange={(e) => {
                      locationManuallyEditedRef.current = true;
                      handleAddFormChange('visible_address', e.target.value);
                      setVisibleAddressSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => setVisibleAddressSuggestions((addFormData.visible_address || '').length > 0)}
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
                            handleAddFormChange('visible_address', suggestion);
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
                <Label htmlFor="add_address">Complete Address</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFetchLocationFromAddress}
                    className="whitespace-nowrap"
                    title={addFormData.visible_address && addFormData.visible_address.trim().length > 0 
                      ? "Location already set. Clear it first to fetch a new one."
                      : "Extract location from complete address"}
                    disabled={!addFormData.address || addFormData.address.trim().length === 0 || (addFormData.visible_address && addFormData.visible_address.trim().length > 0)}
                  >
                    <MapPin className="w-3 h-3 mr-1" />
                    Fetch Location
                  </Button>
                </div>
                <Textarea
                  id="add_address"
                  value={addFormData.address}
                  onChange={(e) => handleAddFormChange('address', e.target.value)}
                  placeholder="Enter complete address (e.g., 123 MG Road, Koramangala, Bangalore, Karnataka, 560034)"
                  rows={3}
                  className={`resize-none ${formErrors.address ? 'border-red-500' : ''}`}
                />
                {formErrors?.address && (
                  <p className="text-sm text-red-500">{formErrors.address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add_google_location" className="text-sm font-medium text-gray-900">
                  Google Maps Location
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="add_google_location"
                    value={addFormData.google_location}
                    onChange={(e) => handleAddFormChange('google_location', e.target.value)}
                    placeholder="Paste Google Maps share link here..."
                    className="text-sm flex-1"
                  />
                  {addFormData.google_location && (
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
                          window.open(addFormData.google_location, '_blank', 'noopener,noreferrer');
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
          )}

          {/* Step 3: Service Information */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Service Types</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'RO', label: 'RO (Reverse Osmosis)' },
                    { value: 'SOFTENER', label: 'Water Softener' }
                  ].map((service) => (
                    <div
                      key={service.value}
                      onClick={() => handleServiceTypeToggle(service.value)}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        addFormData.service_types.includes(service.value)
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
                {formErrors?.service_types && (
                  <p className="text-sm text-red-500">{formErrors.service_types}</p>
                )}
              </div>

              {addFormData.service_types.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Equipment Details</Label>
                  {addFormData.service_types.map((serviceType) => {
                    const serviceInfo = [
                      { value: 'RO', label: 'RO (Reverse Osmosis)' },
                      { value: 'SOFTENER', label: 'Water Softener' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = addFormData.equipment[serviceType] || { brand: '', model: '' };
                    const photos = addFormData.photos[serviceType] || [];
                    
                    return (
                      <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2 relative">
                            <Label htmlFor={`brand_${serviceType}`}>Brand</Label>
                            <Input
                              id={`brand_${serviceType}`}
                              value={equipment.brand}
                              onChange={(e) => handleEquipmentChange(serviceType, 'brand', e.target.value)}
                              placeholder={`Enter ${serviceType} brand`}
                              className={formErrors[`equipment.${serviceType}.brand`] ? 'border-red-500' : ''}
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
                                    onClick={() => selectBrand(serviceType, brand)}
                                  >
                                    {brand}
                                  </div>
                                ))}
                              </div>
                            )}
                            {formErrors?.[`equipment.${serviceType}.brand`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.brand`]}</p>
                            )}
                          </div>

                          <div className="space-y-2 relative">
                            <Label htmlFor={`model_${serviceType}`}>Model</Label>
                            <Input
                              id={`model_${serviceType}`}
                              value={equipment.model}
                              onChange={(e) => handleEquipmentChange(serviceType, 'model', e.target.value)}
                              placeholder={`Enter ${serviceType} model`}
                              className={formErrors[`equipment.${serviceType}.model`] ? 'border-red-500' : ''}
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
                                    onClick={() => selectModel(serviceType, model)}
                                  >
                                    {model}
                                  </div>
                                ))}
                              </div>
                            )}
                            {formErrors?.[`equipment.${serviceType}.model`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.model`]}</p>
                            )}
                          </div>
                        </div>

                        {/* Photo Upload Section */}
                        <div className="space-y-2 mt-4">
                          <Label>Add Photo</Label>
                          <ImageUpload
                            onImagesChange={(photoUrls) => handlePhotosChange(serviceType, photoUrls)}
                            maxImages={5}
                            folder="customer-equipment"
                            title={`${serviceInfo?.label} Photo`}
                            description={`Upload photo of ${serviceInfo?.label} equipment`}
                            initialImages={photos}
                            maxWidth={1280}
                            quality={0.7}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review & Notes */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <h3 className="font-semibold text-gray-900">Customer Information Summary</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-600">Name:</span>
                    <p className="text-gray-900">{addFormData.full_name || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Phone:</span>
                    <p className="text-gray-900">{addFormData.phone || 'Not provided'}</p>
                  </div>
                  {addFormData.alternate_phone && (
                    <div>
                      <span className="font-medium text-gray-600">Alternate Phone:</span>
                      <p className="text-gray-900">{addFormData.alternate_phone}</p>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-600">Email:</span>
                    <p className="text-gray-900">{addFormData.email || 'Not provided'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-600">Location:</span>
                    <p className="text-gray-900">{addFormData.visible_address || 'Not provided'}</p>
                    <span className="font-medium text-gray-600">Complete Address:</span>
                    <p className="text-gray-900">{addFormData.address || 'Not provided'}</p>
                    {addFormData.google_location && (
                      <div className="mt-1">
                        <span className="font-medium text-gray-600">Google Maps:</span>
                        <p className="text-blue-600 text-sm break-all">{addFormData.google_location}</p>
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-600">Services & Equipment:</span>
                    <div className="mt-1 space-y-2">
                      {addFormData.service_types.map((serviceType) => {
                        const serviceInfo = [
                          { value: 'RO', label: 'RO (Reverse Osmosis)' },
                          { value: 'SOFTENER', label: 'Water Softener' }
                        ].find(s => s.value === serviceType);
                        
                        const equipment = addFormData.equipment[serviceType];
                        
                        return (
                          <div key={serviceType} className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{serviceInfo?.label}:</span>
                            <span className="text-gray-700">
                              {equipment?.brand} - {equipment?.model}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Create Job Option */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Create a New Job?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Would you like to create a new job for this customer right away?
                </p>
                
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-blue-500 cursor-pointer transition-all hover:border-blue-300">
                    <input
                      type="radio"
                      name="createJob"
                      checked={shouldCreateJob === true}
                      onChange={() => {
                        setShouldCreateJob(true);
                        // Get today's date in local timezone
                        const today = new Date();
                        const year = today.getFullYear();
                        const month = String(today.getMonth() + 1).padStart(2, '0');
                        const day = String(today.getDate()).padStart(2, '0');
                        const todayDateString = `${year}-${month}-${day}`;
                        setStep5JobData(prev => ({
                          ...prev,
                          scheduled_date: todayDateString,
                          service_type: addFormData.service_types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO'
                        }));
                      }}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-gray-900">Yes, create a new job</span>
                      <p className="text-xs text-gray-500 mt-1">Fill in the job details below</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer transition-all hover:border-blue-300">
                    <input
                      type="radio"
                      name="createJob"
                      checked={shouldCreateJob === false}
                      onChange={() => setShouldCreateJob(false)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-gray-900">No, just create the customer</span>
                      <p className="text-xs text-gray-500 mt-1">You can create a job later from the customer's profile</p>
                    </div>
                  </label>
                </div>
              </div>

              {shouldCreateJob && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-gray-900">Job Information</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="step5_service_type">Service Type</Label>
                      <Select
                        value={step5JobData.service_type}
                        onValueChange={(value) => setStep5JobData(prev => ({ ...prev, service_type: value as 'RO' | 'SOFTENER' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RO">RO</SelectItem>
                          <SelectItem value="SOFTENER">Softener</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="step5_service_sub_type">Service Sub Type *</Label>
                      <Select
                        value={step5JobData.service_sub_type || undefined}
                        onValueChange={(value) => setStep5JobData(prev => ({ 
                          ...prev, 
                          service_sub_type: value === 'Custom' ? 'Custom' : value,
                          service_sub_type_custom: value === 'Custom' ? prev.service_sub_type_custom : ''
                        }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select service sub type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Service">Service</SelectItem>
                          <SelectItem value="Installation">Installation</SelectItem>
                          <SelectItem value="Reinstallation">Reinstallation</SelectItem>
                          <SelectItem value="Un-Installation">Un-Installation</SelectItem>
                          <SelectItem value="Repair">Repair</SelectItem>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Replacement">Replacement</SelectItem>
                          <SelectItem value="Inspection">Inspection</SelectItem>
                          <SelectItem value="Return Complaint">Return Complaint</SelectItem>
                          <SelectItem value="AMC Service">AMC Service</SelectItem>
                          <SelectItem value="Custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {step5JobData.service_sub_type === 'Custom' && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="step5_service_sub_type_custom">Custom Service Sub Type</Label>
                        <Input
                          id="step5_service_sub_type_custom"
                          value={step5JobData.service_sub_type_custom}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, service_sub_type_custom: e.target.value }))}
                          placeholder="Enter custom service sub type"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="step5_scheduled_date">Scheduled Date</Label>
                      <Input
                        id="step5_scheduled_date"
                        type="date"
                        value={step5JobData.scheduled_date}
                        onChange={(e) => setStep5JobData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="step5_scheduled_time_slot">Time Slot</Label>
                      <Select
                        value={step5JobData.scheduled_time_slot}
                        onValueChange={(value) => setStep5JobData(prev => ({ 
                          ...prev, 
                          scheduled_time_slot: value as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM'
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MORNING">Morning (9 AM - 1 PM)</SelectItem>
                          <SelectItem value="AFTERNOON">Afternoon (1 PM - 6 PM)</SelectItem>
                          <SelectItem value="EVENING">Evening (6 PM - 9 PM)</SelectItem>
                          <SelectItem value="CUSTOM">Custom Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {step5JobData.scheduled_time_slot === 'CUSTOM' && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="step5_scheduled_time_custom">Custom Time (HH:MM)</Label>
                        <Input
                          id="step5_scheduled_time_custom"
                          type="time"
                          value={step5JobData.scheduled_time_custom}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, scheduled_time_custom: e.target.value }))}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="step5_lead_source">Lead Source *</Label>
                      <Select
                        value={step5JobData.lead_source || undefined}
                        onValueChange={(value) => {
                          const selectedLeadSource = value === 'Other' ? 'Other' : value;
                          // Get default lead cost
                          const getDefaultLeadCost = (leadSource: string): string => {
                            switch (leadSource) {
                              case 'Home Triangle': return '200';
                              case 'Home Triangle-Srujan': return '200';
                              case 'Direct call': return '0';
                              case 'RO care india': return '400';
                              case 'Local Ramu': return '500';
                              case 'Google-Leads': return '0';
                              case 'Website': return '0';
                              default: return '0';
                            }
                          };
                          setStep5JobData(prev => {
                            const updated = {
                              ...prev,
                              lead_source: selectedLeadSource,
                              lead_source_custom: value === 'Other' ? prev.lead_source_custom : '',
                              lead_cost: getDefaultLeadCost(selectedLeadSource)
                            };
                            // Auto-enable OTP if lead source is "Home Triangle" or "Home Triangle-Srujan"
                            if (selectedLeadSource === 'Home Triangle' || selectedLeadSource === 'Home Triangle-Srujan') {
                              updated.require_otp = true;
                            }
                            return updated;
                          });
                        }}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lead source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Website">Website</SelectItem>
                          <SelectItem value="Direct call">Direct call</SelectItem>
                          <SelectItem value="Google-Leads">Google-Leads</SelectItem>
                          <SelectItem value="RO care india">RO care india</SelectItem>
                          <SelectItem value="Home Triangle">Home Triangle</SelectItem>
                          <SelectItem value="Home Triangle-Srujan">Home Triangle-Srujan</SelectItem>
                          <SelectItem value="Local Ramu">Local Ramu</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {step5JobData.lead_source === 'Other' && (
                      <div className="space-y-2">
                        <Label htmlFor="step5_lead_source_custom">Custom Lead Source</Label>
                        <Input
                          id="step5_lead_source_custom"
                          value={step5JobData.lead_source_custom}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, lead_source_custom: e.target.value }))}
                          placeholder="Enter custom lead source"
                        />
                      </div>
                    )}

                    {/* Lead Cost - Required when lead source is selected */}
                    {step5JobData.lead_source && (
                      <div className="space-y-2">
                        <Label htmlFor="step5_lead_cost">Lead Cost (₹) *</Label>
                        <Input
                          id="step5_lead_cost"
                          type="number"
                          min="0"
                          step="0.01"
                          value={step5JobData.lead_cost || '0'}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, lead_cost: e.target.value }))}
                          placeholder="Enter lead cost"
                          required
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="step5_priority">Priority</Label>
                      <Select
                        value={step5JobData.priority}
                        onValueChange={(value) => setStep5JobData(prev => ({ ...prev, priority: value as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="URGENT">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="step5_technician">Assign to Technician (Optional)</Label>
                      <Select
                        value={step5JobData.assigned_technician_id || 'none'}
                        onValueChange={(value) => setStep5JobData(prev => ({ ...prev, assigned_technician_id: value === 'none' ? '' : value }))}
                        disabled={loadingTechnicians}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingTechnicians ? "Loading technicians..." : "Select technician (optional)"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Assign later)</SelectItem>
                          {technicians
                            .filter((tech) => tech && tech.id && tech.full_name)
                            .map((tech) => (
                              <SelectItem key={tech.id} value={tech.id || ''}>
                                {tech.full_name || 'Unknown'} {tech.employee_id ? `(${tech.employee_id})` : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {step5JobData.assigned_technician_id && (
                        <p className="text-xs text-gray-500">
                          Job will be assigned to selected technician immediately
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="step5_description">Description (Optional)</Label>
                      <Textarea
                        id="step5_description"
                        value={step5JobData.description}
                        onChange={(e) => setStep5JobData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter job description"
                        rows={3}
                      />
                    </div>

                    {/* OTP Verification Toggle */}
                    <div className="space-y-2 sm:col-span-2 pt-2 border-t border-gray-200">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="step5_require_otp"
                          checked={step5JobData.require_otp}
                          onChange={(e) => setStep5JobData(prev => ({ ...prev, require_otp: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <Label htmlFor="step5_require_otp" className="cursor-pointer">
                          Require OTP Verification
                        </Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-6">
                        If enabled, technician will need to enter a 4-digit OTP to complete this job
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between pt-4 border-t">
          <div className="flex gap-2 order-2 sm:order-1">
            {currentStep > 1 && (
              <Button variant="outline" onClick={prevStep} className="flex-1 sm:flex-none text-sm">
                Previous
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
              className="flex-1 sm:flex-none text-sm"
            >
              Cancel
            </Button>
          </div>
          
          <div className="order-1 sm:order-2">
            {currentStep < 4 ? (
              <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm">
                Next Step
              </Button>
            ) : currentStep === 4 ? (
              <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm">
                Next Step
              </Button>
            ) : (
              <Button 
                onClick={handleCreateCustomer}
                disabled={isCreating || (shouldCreateJob && (!step5JobData.scheduled_date || !step5JobData.service_sub_type || (step5JobData.service_sub_type === 'Custom' && !step5JobData.service_sub_type_custom) || !step5JobData.lead_source || !step5JobData.lead_cost || (step5JobData.lead_source === 'Other' && !step5JobData.lead_source_custom) || (step5JobData.scheduled_time_slot === 'CUSTOM' && !step5JobData.scheduled_time_custom)))}
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto text-sm"
              >
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </div>
                ) : (
                  'Create Customer'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCustomerDialog;

