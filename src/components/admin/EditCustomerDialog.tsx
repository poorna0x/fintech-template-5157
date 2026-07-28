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
import { customerNameClassName } from '@/lib/customerDisplay';
import { MapPin, Download, ExternalLink, Trash2, Lock } from 'lucide-react';
import { useAdminRole } from '@/lib/useAdminRole';
import { mapServiceTypesToDbValue, extractLocationFromAddressString, bangaloreAreas, resolveVisibleAddressFromGeocode, reverseGeocodeLatLng, VISIBLE_ADDRESS_MAX_LEN } from '@/lib/adminUtils';
import { normalizeIndianMobileInput } from '@/lib/utils';
import PhoneSwapButton from '@/components/admin/PhoneSwapButton';
import { hasAlternateLocation, getAlternateAddress, getAlternateLocation, getJobServiceSite } from '@/lib/customer-locations';
import { VISIT_ORDER_STATUSES } from '@/lib/adminVisitOrder';
import {
  getCustomerGstNumber,
  mapCustomerGstFields,
  normalizeCustomerGstNumber,
} from '@/lib/customerGst';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  extractCoordinatesFromGoogleMapsLink,
  extractMapsUrlFromText,
  isGoogleMapsShortLink,
  isGoogleMapsUrl,
  resolveGoogleMapsInputToCoords,
  sanitizeGoogleMapsInput,
} from '@/lib/googleMapsLink';
import { removePlusCode } from '@/lib/maps';
import { beginWebClipboardRead, readClipboardText } from '@/lib/nativeClipboard';

/** Persist a coords URL so assign/distance never depends on short-link expand again. */
function mapsLinkFromCoords(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/place/${latitude},${longitude}`;
}
import {
  EQUIPMENT_BRAND_DATA as brandData,
  EQUIPMENT_MODEL_DATA as modelData,
} from '@/lib/equipment-suggestions';

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
  alternateAddress: customer.alternate_address ?? undefined,
  alternate_address: customer.alternate_address ?? undefined,
  alternateLocation: customer.alternate_location
    ? {
        latitude: customer.alternate_location?.latitude || 0,
        longitude: customer.alternate_location?.longitude || 0,
        formattedAddress:
          customer.alternate_location?.formatted_address ||
          customer.alternate_location?.formattedAddress ||
          '',
        googlePlaceId: customer.alternate_location?.google_place_id,
        googleLocation:
          customer.alternate_location?.googleLocation ||
          customer.alternate_location?.google_location ||
          null,
      }
    : undefined,
  alternate_location: customer.alternate_location ?? undefined,
  alternateVisibleAddress: customer.alternate_visible_address ?? undefined,
  alternate_visible_address: customer.alternate_visible_address ?? undefined,
  alternateBrand: customer.alternate_brand ?? undefined,
  alternate_brand: customer.alternate_brand ?? undefined,
  alternateModel: customer.alternate_model ?? undefined,
  alternate_model: customer.alternate_model ?? undefined,
  alternateServiceType: customer.alternate_service_type ?? undefined,
  alternate_service_type: customer.alternate_service_type ?? undefined,
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
  has_google_review: (customer as any).has_google_review ?? null,
  customer_tier: (customer as any).customer_tier ?? null,
  raw_water_tds: (customer as any).raw_water_tds ?? 0,
  ...mapCustomerGstFields(customer),
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
  const { isManager } = useAdminRole();
  const managerRestrictedTitle = 'Restricted for Manager role';
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
    has_google_review: null as boolean | null,
    customer_tier: null as 'PREMIUM' | 'WORST' | null,
    raw_water_tds: 0 as number,
    has_gst: false,
    gst_number: '',
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
    has_alternate_location: false,
    alternate_visible_address: '',
    alternate_google_location: '',
    alternate_address: {
      street: '',
      area: '',
      city: '',
      state: '',
      pincode: ''
    },
    alternate_location: {
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    },
    alternate_service_type: 'RO' as 'RO' | 'SOFTENER',
    alternate_brand: '',
    alternate_model: '',
    service_cost: 0,
    cost_agreed: false
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [visibleAddressSuggestions, setVisibleAddressSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const locationManuallyEditedRef = useRef(false);
  const alternateLocationManuallyEditedRef = useRef(false);
  const lastSavedFormDataRef = useRef<string>('');
  /** Ignore stale getById responses; only hydrate on open / customer id change (not every parent re-render). */
  const hydrateGenerationRef = useRef(0);
  /** Latest form snapshot for Save (avoids stale closure after Fetch Address). */
  const editFormDataRef = useRef(editFormData);
  editFormDataRef.current = editFormData;
  /** Full Maps share text from clipboard — used when short-link expand fails. */
  const mapsShareTextRef = useRef('');

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

  const buildGoogleLocationFromCustomer = (customerToUse: any, prefix: 'primary' | 'secondary') => {
    const loc = prefix === 'primary' ? customerToUse.location : customerToUse.alternate_location;
    if (loc?.googleLocation) {
      const googleLoc = loc.googleLocation;
      if (
        googleLoc &&
        typeof googleLoc === 'string' &&
        (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
        !googleLoc.includes('localhost') &&
        !googleLoc.includes('127.0.0.1')
      ) {
        return googleLoc;
      }
    }
    if (loc?.latitude && loc?.longitude && loc.latitude !== 0 && loc.longitude !== 0) {
      return `https://www.google.com/maps/place/${loc.latitude},${loc.longitude}`;
    }
    if (
      loc?.formattedAddress &&
      typeof loc.formattedAddress === 'string' &&
      (loc.formattedAddress.includes('google.com/maps') || loc.formattedAddress.includes('maps.app.goo.gl')) &&
      !loc.formattedAddress.includes('localhost') &&
      !loc.formattedAddress.includes('127.0.0.1')
    ) {
      return loc.formattedAddress;
    }
    return '';
  };

  const buildAddressStreetFromCustomer = (customerToUse: any, prefix: 'primary' | 'secondary') => {
    const address = prefix === 'primary' ? customerToUse.address : customerToUse.alternate_address;
    const existingStreet = address?.street || '';
    if (existingStreet.includes(',') || existingStreet.length > 30) {
      return existingStreet;
    }
    const joined = [
      address?.street,
      address?.area,
      address?.city,
      address?.state,
      address?.pincode
    ].filter(Boolean).join(', ');
    return joined || existingStreet || '';
  };

  // Hydrate once per open / customer id — not on every new `customer` object from parent re-renders
  // (those wipe Fetch Address coords on mobile before Save).
  useEffect(() => {
    if (!open || !customer) {
      if (!open) hydrateGenerationRef.current += 1;
      return;
    }

    const generation = ++hydrateGenerationRef.current;
    const customerId = customer.id;

    const fetchFreshCustomerData = async () => {
        try {
          const { data: freshCustomer, error } = await db.customers.getById(customerId);
          if (generation !== hydrateGenerationRef.current) return;
          if (error) {
            console.warn('Failed to fetch fresh customer data, using prop data:', error);
          }
          
          // Use fresh customer data if available, otherwise fall back to prop
          const customerToUse = freshCustomer || customer;
          if (generation !== hydrateGenerationRef.current) return;
          
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
            has_google_review: (customerToUse as any).has_google_review ?? null,
            customer_tier: ((t: unknown) => {
              if (t === 'PREMIUM' || t === 'WORST') return t;
              return null;
            })((customerToUse as any).customer_tier),
            raw_water_tds: ((customerToUse as any).raw_water_tds != null && Number((customerToUse as any).raw_water_tds) > 0) ? (customerToUse as any).raw_water_tds : 0,
            has_gst: Boolean(getCustomerGstNumber(customerToUse)),
            gst_number: getCustomerGstNumber(customerToUse),
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
        has_alternate_location: hasAlternateLocation(customerToUse),
        alternate_visible_address: customerToUse.alternate_visible_address || '',
        alternate_google_location: buildGoogleLocationFromCustomer(customerToUse, 'secondary'),
        alternate_address: {
          street: buildAddressStreetFromCustomer(customerToUse, 'secondary'),
          area: customerToUse.alternate_address?.area || '',
          city: customerToUse.alternate_address?.city || '',
          state: customerToUse.alternate_address?.state || '',
          pincode: customerToUse.alternate_address?.pincode || ''
        },
        alternate_location: {
          latitude: customerToUse.alternate_location?.latitude || 0,
          longitude: customerToUse.alternate_location?.longitude || 0,
          formattedAddress: customerToUse.alternate_location?.formattedAddress || ''
        },
        alternate_service_type: (() => {
          const t = (customerToUse as any).alternate_service_type || (customerToUse as any).alternateServiceType;
          return t === 'SOFTENER' ? 'SOFTENER' : 'RO';
        })(),
        alternate_brand: (customerToUse as any).alternate_brand || (customerToUse as any).alternateBrand || '',
        alternate_model: (customerToUse as any).alternate_model || (customerToUse as any).alternateModel || '',
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
      
      void fetchFreshCustomerData();
      locationManuallyEditedRef.current = false;
      alternateLocationManuallyEditedRef.current = false;
  }, [customer?.id, open]);


  const handleEditFormChange = (
    field: string,
    value: string | string[] | boolean | number | null | 'PREMIUM' | 'WORST'
  ) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditPhoneFieldChange = (field: 'phone' | 'alternate_phone', value: string) => {
    handleEditFormChange(field, normalizeIndianMobileInput(value));
  };

  const canSwapPhones =
    Boolean(editFormData.phone?.trim()) && Boolean(editFormData.alternate_phone?.trim());

  const handleSwapPhones = () => {
    if (!canSwapPhones) return;
    setEditFormData((prev) => ({
      ...prev,
      phone: prev.alternate_phone,
      alternate_phone: prev.phone,
    }));
  };

  const canSwapLocations =
    editFormData.has_alternate_location &&
    Boolean(editFormData.visible_address?.trim() || editFormData.address?.street?.trim()) &&
    Boolean(editFormData.alternate_visible_address?.trim() || editFormData.alternate_address?.street?.trim());

  const handleSwapLocations = () => {
    if (!canSwapLocations) return;
    setEditFormData((prev) => {
      const primaryRo = prev.equipment['RO'] || { brand: '', model: '' };
      const secondaryBrand = prev.alternate_brand || '';
      const secondaryModel = prev.alternate_model || '';
      const secondaryType = prev.alternate_service_type || 'RO';
      const primaryHasRo = prev.service_types.includes('RO');
      const newEquipment = { ...prev.equipment };
      if (primaryHasRo) {
        newEquipment['RO'] = { brand: secondaryBrand, model: secondaryModel };
      }
      let newServiceTypes = [...prev.service_types];
      if (secondaryType === 'RO' && !newServiceTypes.includes('RO')) {
        newServiceTypes = ['RO', ...newServiceTypes];
      }
      const swappedPrimaryBrand = primaryHasRo ? primaryRo.brand : prev.alternate_brand;
      const swappedPrimaryModel = primaryHasRo ? primaryRo.model : prev.alternate_model;
      return {
        ...prev,
        visible_address: prev.alternate_visible_address,
        google_location: prev.alternate_google_location,
        address: { ...prev.alternate_address },
        location: { ...prev.alternate_location },
        alternate_visible_address: prev.visible_address,
        alternate_google_location: prev.google_location,
        alternate_address: { ...prev.address },
        alternate_location: { ...prev.location },
        service_types: newServiceTypes,
        equipment: newEquipment,
        alternate_service_type: primaryHasRo ? 'RO' : secondaryType,
        alternate_brand: swappedPrimaryBrand,
        alternate_model: swappedPrimaryModel,
      };
    });
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

  const handleFetchLocationFromAddress = (slot: 'primary' | 'secondary' = 'primary') => {
    if (slot === 'secondary') {
      toast.info('Pick a site label below (Office, Shop, etc.). Use Complete Address for the full address.');
      return;
    }

    const address = editFormData?.address?.street || '';
    const currentLocation = editFormData?.visible_address || '';

    if (!address.trim()) {
      toast.error('Please enter a complete address first');
      return;
    }

    if (currentLocation.trim()) {
      toast.info('Location already set. Clear it first if you want to fetch a new one.');
      return;
    }

    const extracted = extractLocationFromAddressString(address);
    if (extracted) {
      handleEditFormChange('visible_address', extracted);
      locationManuallyEditedRef.current = false;
      toast.success(`Location extracted: ${extracted}`);
    } else {
      toast.warning('Could not extract location from address. Please enter manually.');
    }
  };

  const handleAlternateAddressFieldChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      alternate_address: {
        ...prev.alternate_address,
        [field]: value
      }
    }));
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

  // Reverse geocode — uses shared helper (formatted address + components, one Google call)
  const reverseGeocode = async (lat: number, lng: number) => reverseGeocodeLatLng(lat, lng);

  const readMapsLinkFromClipboard = async (
    earlyWebRead?: Promise<string> | null
  ): Promise<string | null> => {
    let text = '';
    try {
      if (earlyWebRead) {
        try {
          text = await earlyWebRead;
        } catch {
          text = await readClipboardText();
        }
      } else {
        text = await readClipboardText();
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'clipboard_unavailable') {
        toast.error(
          'Clipboard is not available here. Paste the link into the field, then click Fetch Address.'
        );
      } else {
        toast.error(
          'Clipboard access was denied. Paste the link into the field, then click Fetch Address.'
        );
      }
      return null;
    }
    if (!text || !text.trim()) {
      toast.error('Clipboard is empty. Copy a Google Maps share link first.');
      return null;
    }
    mapsShareTextRef.current = text;
    const link = extractMapsUrlFromText(text);
    if (!link) {
      toast.error("Clipboard doesn't contain a Google Maps link.");
      return null;
    }
    return link;
  };

  const fetchAddressFromGoogleLocation = async (slot: 'primary' | 'secondary' = 'primary') => {
    if (isFetchingAddress) return;

    const isPrimary = slot === 'primary';
    const fieldKey = isPrimary ? 'google_location' : 'alternate_google_location';
    const fieldNowRaw = isPrimary
      ? editFormDataRef.current?.google_location || ''
      : editFormDataRef.current?.alternate_google_location || '';
    const fieldNow =
      extractMapsUrlFromText(fieldNowRaw) || sanitizeGoogleMapsInput(fieldNowRaw);
    // Desktop: start clipboard read in the same tick as the click. No-op on admin APK.
    const earlyWebClipboard = !fieldNow ? beginWebClipboardRead() : null;

    setIsFetchingAddress(true);
    let loadingToast: string | number | undefined;

    try {
      let googleLocationField = fieldNowRaw;
      let googleLocation = fieldNow;

      if (!googleLocation) {
        const clipboardLink = await readMapsLinkFromClipboard(earlyWebClipboard);
        if (!clipboardLink) return;

        const latestRaw = isPrimary
          ? editFormDataRef.current?.google_location || ''
          : editFormDataRef.current?.alternate_google_location || '';
        const latestTyped =
          extractMapsUrlFromText(latestRaw) || sanitizeGoogleMapsInput(latestRaw);
        if (latestTyped) {
          googleLocationField = latestRaw;
          googleLocation = latestTyped;
        } else {
          googleLocationField = mapsShareTextRef.current || clipboardLink;
          googleLocation = clipboardLink;
          setEditFormData((prev) => {
            const next = { ...prev, [fieldKey]: clipboardLink };
            editFormDataRef.current = next;
            return next;
          });
          toast.info('Pasted link from clipboard');
        }
      } else {
        mapsShareTextRef.current = googleLocationField;
      }

      if (!isGoogleMapsUrl(googleLocation)) {
        toast.error('Please enter a valid Google Maps link');
        return;
      }

      const token = await resolveSupabaseAccessTokenForApi();
      if (isGoogleMapsShortLink(googleLocation)) {
        loadingToast = toast.loading('Resolving short link...');
      }

      const resolved = await resolveGoogleMapsInputToCoords(googleLocation, {
        shareText: mapsShareTextRef.current || googleLocationField,
        addressHint: isPrimary
          ? editFormDataRef.current?.address?.street || ''
          : editFormDataRef.current?.alternate_address?.street || '',
        accessToken: token,
      });

      if (loadingToast !== undefined) {
        toast.dismiss(loadingToast);
        loadingToast = undefined;
      }

      if (!resolved.ok) {
        toast.error(resolved.error, { duration: 8000 });
        return;
      }

      const { coords, didExpandShortLink, placeHintUsed } = resolved;
      // Always persist a coords URL — short/place links without lat/lng in the string
      // made assign-by-distance resolve again even after a successful Fetch.
      const stableMapsLink = mapsLinkFromCoords(coords.latitude, coords.longitude);

      // Cancel any in-flight open-hydrate so a late getById cannot wipe these coords.
      hydrateGenerationRef.current += 1;

      setEditFormData((prev) => {
        const next = {
          ...prev,
          ...(isPrimary
            ? {
                google_location: stableMapsLink,
                location: {
                  ...prev.location,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                },
              }
            : {
                alternate_google_location: stableMapsLink,
                alternate_location: {
                  ...prev.alternate_location,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                },
              }),
        };
        editFormDataRef.current = next;
        return next;
      });

      if (didExpandShortLink) {
        toast.info('Short link expanded');
      }
      if (placeHintUsed) {
        toast.info(`Found location from place name: ${placeHintUsed}`);
      }

      loadingToast = toast.loading('Fetching address from Google Maps...');

      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
          await loadGoogleMapsScript();
        }
      } catch (mapsLoadError) {
        console.warn('Google Maps script load failed; keeping coordinates:', mapsLoadError);
      }

      const geocodeResult = await reverseGeocode(coords.latitude, coords.longitude);
      // Keep raw Google line (may include Plus Code) for short-location extraction.
      const rawFormatted = geocodeResult?.formattedAddress ?? null;
      // Full Address never keeps Plus Codes like "VM99+4P".
      const address = rawFormatted
        ? removePlusCode(rawFormatted).replace(/\s+/g, ' ').trim() || null
        : null;
      
      const streetHint = isPrimary
        ? editFormDataRef.current.address.street
        : editFormDataRef.current.alternate_address.street;
      // List/DB match first, then Google place components from the same Fetch (no extra API call)
      const extractedLocation = resolveVisibleAddressFromGeocode({
        formattedAddress: rawFormatted,
        addressComponents: geocodeResult?.addressComponents,
        addressHints: [streetHint],
      });
      
      setEditFormData(prev => {
        const next = {
          ...prev,
          ...(isPrimary
            ? {
                google_location: stableMapsLink,
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
                visible_address: extractedLocation
                  ? extractedLocation
                  : prev.visible_address
              }
            : {
                alternate_google_location: stableMapsLink,
                alternate_location: {
                  ...prev.alternate_location,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  formattedAddress: address || prev.alternate_location.formattedAddress || ''
                },
                alternate_address: {
                  street: address || prev.alternate_address.street || '',
                  area: '',
                  city: '',
                  state: '',
                  pincode: ''
                },
                alternate_visible_address: extractedLocation
                  ? extractedLocation
                  : prev.alternate_visible_address,
              }),
        };
        editFormDataRef.current = next;
        return next;
      });
      
      if (extractedLocation && isPrimary) {
        locationManuallyEditedRef.current = false;
      }
      if (extractedLocation && !isPrimary) {
        alternateLocationManuallyEditedRef.current = false;
      }
      
      if (address) {
        toast.success(`Address fetched: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`);
        if (extractedLocation && isPrimary) {
          toast.info(`Location automatically identified: ${extractedLocation}`);
        }
      } else {
        toast.success(`Coordinates extracted: ${coords.latitude}, ${coords.longitude}`);
        toast.warning('Could not fetch address. Coordinates saved — tap Update to keep them.');
        if (extractedLocation && isPrimary) {
          toast.info(`Location extracted from existing address: ${extractedLocation}`);
        }
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      toast.error('Failed to fetch address. Please try again.');
    } finally {
      if (loadingToast !== undefined) toast.dismiss(loadingToast);
      setIsFetchingAddress(false);
    }
  };

  const handleGoogleMapsLinkChange = async (value: string, slot: 'primary' | 'secondary' = 'primary') => {
    const isPrimary = slot === 'primary';
    const extracted = value.trim() ? extractCoordinatesFromGoogleMapsLink(value.trim()) : null;

    setEditFormData((prev) => ({
      ...prev,
      ...(isPrimary ? { google_location: value } : { alternate_google_location: value }),
      // Link change must drop previous pin — otherwise save keeps old lat/lng while the
      // pasted link looks correct in admin Maps.
      ...(isPrimary
        ? {
            location: {
              ...prev.location,
              latitude: extracted?.latitude ?? 0,
              longitude: extracted?.longitude ?? 0,
              googleLocation: value.trim() || null,
            },
          }
        : {
            alternate_location: {
              ...prev.alternate_location,
              latitude: extracted?.latitude ?? 0,
              longitude: extracted?.longitude ?? 0,
              googleLocation: value.trim() || null,
            },
          }),
    }));
  };

  const handleDeleteCustomer = async () => {
    if (!customer) return;
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }

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

    const form = editFormDataRef.current;

    if (form.has_gst && !normalizeCustomerGstNumber(form.gst_number)) {
      toast.error('Enter the customer GST number, or select No if they do not have GST');
      return;
    }

    setIsUpdating(true);
    try {
      const updatedAddress = {
        street: form.address.street,
        area: form.address.area,
        city: form.address.city,
        state: form.address.state,
        pincode: form.address.pincode
      };

      let latitude = Number(form.location.latitude) || 0;
      let longitude = Number(form.location.longitude) || 0;
      let googleLocation =
        (form.google_location && form.google_location.trim()) ||
        ((form.location as any)?.googleLocation as string | undefined) ||
        '';

      // Prefer coords embedded in the current Maps URL over stale form lat/lng.
      if (googleLocation) {
        const extracted = extractCoordinatesFromGoogleMapsLink(googleLocation);
        if (extracted) {
          latitude = extracted.latitude;
          longitude = extracted.longitude;
        }
      }

      if (latitude !== 0 && longitude !== 0) {
        // Prefer a coords URL so later assign/distance never re-expands short links.
        if (!googleLocation || isGoogleMapsShortLink(googleLocation) || !extractCoordinatesFromGoogleMapsLink(googleLocation)) {
          googleLocation = mapsLinkFromCoords(latitude, longitude);
        }
      }

      const updatedLocation: any = {
        latitude,
        longitude,
        formattedAddress: form.address.street || form.location.formattedAddress || '',
      };
      
      if (googleLocation) {
        updatedLocation.googleLocation = googleLocation;
      }

      const brands: string[] = [];
      const models: string[] = [];
      
      form.service_types.forEach((serviceType: string) => {
        const equipment = form.equipment[serviceType];
        if (equipment) {
          brands.push(equipment.brand?.trim() || '');
          models.push(equipment.model?.trim() || '');
        } else {
          brands.push('');
          models.push('');
        }
      });

      const updateData = {
        full_name: form.full_name,
        phone: form.phone,
        alternate_phone: form.alternate_phone,
        email: form.email,
        service_type: mapServiceTypesToDbValue(form.service_types),
        brand: brands.join(', '),
        model: models.join(', '),
        preferred_language: (form.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        preferred_time_slot: (customer as any).preferred_time_slot || customer.preferredTimeSlot || 'MORNING',
        status: form.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: form.notes,
        visible_address: form.visible_address ? form.visible_address.trim() : '',
        custom_time: form.custom_time || null,
        has_prefilter: form.has_prefilter,
        has_google_review: form.has_google_review,
        customer_tier: form.customer_tier,
        raw_water_tds: Math.max(0, parseInt(String(form.raw_water_tds), 10) || 0),
        gst_number: form.has_gst
          ? normalizeCustomerGstNumber(form.gst_number) || null
          : null,
        address: updatedAddress,
        location: updatedLocation,
        ...(form.has_alternate_location
          ? {
              alternate_visible_address: form.alternate_visible_address
                ? form.alternate_visible_address.trim()
                : '',
              alternate_address: {
                street: form.alternate_address.street,
                area: form.alternate_address.area,
                city: form.alternate_address.city,
                state: form.alternate_address.state,
                pincode: form.alternate_address.pincode,
              },
              alternate_location: (() => {
                let altLat = Number(form.alternate_location.latitude) || 0;
                let altLng = Number(form.alternate_location.longitude) || 0;
                let altGoogle =
                  form.alternate_google_location?.trim() || '';
                if ((altLat === 0 || altLng === 0) && altGoogle) {
                  const extracted = extractCoordinatesFromGoogleMapsLink(altGoogle);
                  if (extracted) {
                    altLat = extracted.latitude;
                    altLng = extracted.longitude;
                  }
                }
                if (altLat !== 0 && altLng !== 0) {
                  if (
                    !altGoogle ||
                    isGoogleMapsShortLink(altGoogle) ||
                    !extractCoordinatesFromGoogleMapsLink(altGoogle)
                  ) {
                    altGoogle = mapsLinkFromCoords(altLat, altLng);
                  }
                }
                const altLocation: any = {
                  latitude: altLat,
                  longitude: altLng,
                  formattedAddress:
                    form.alternate_address.street ||
                    form.alternate_location.formattedAddress ||
                    '',
                };
                if (altGoogle) {
                  altLocation.googleLocation = altGoogle;
                }
                return altLocation;
              })(),
              alternate_service_type: form.alternate_service_type || 'RO',
              alternate_brand: form.alternate_brand?.trim() || '',
              alternate_model: form.alternate_model?.trim() || '',
            }
          : {
              alternate_visible_address: null,
              alternate_address: null,
              alternate_location: null,
              alternate_service_type: null,
              alternate_brand: null,
              alternate_model: null,
            }),
      };

      const { data: updatedCustomerFromDb, error } = await db.customers.update(customer.id, updateData);

      if (error) {
        throw new Error(error.message);
      }

      // Keep open jobs in sync with the customer (address + map) so tech matches admin.
      try {
        const prevAddr = customer.address || {};
        const prevVis = String((customer as any).visible_address || prevAddr.visible_address || '').trim();
        const newVis = String(form.visible_address || '').trim();
        const primaryAddressChanged =
          prevVis !== newVis ||
          String(prevAddr.street || '').trim() !== String(updatedAddress.street || '').trim() ||
          String(prevAddr.area || '').trim() !== String(updatedAddress.area || '').trim() ||
          String(prevAddr.city || '').trim() !== String(updatedAddress.city || '').trim() ||
          String(prevAddr.state || '').trim() !== String(updatedAddress.state || '').trim() ||
          String(prevAddr.pincode || '').trim() !== String(updatedAddress.pincode || '').trim();

        const prevLoc = customer.location as any;
        const locationChanged =
          Number(prevLoc?.latitude) !== latitude ||
          Number(prevLoc?.longitude) !== longitude ||
          String(prevLoc?.googleLocation || prevLoc?.google_location || '') !==
            String(updatedLocation.googleLocation || '');

        const prevAltAddr = getAlternateAddress(customer) || {};
        const prevAltVis = String((customer as any).alternate_visible_address || '').trim();
        const newAltVis = String(form.alternate_visible_address || '').trim();
        const newAltAddr = form.has_alternate_location ? form.alternate_address : null;
        const prevAltLoc = getAlternateLocation(customer);
        const newAltLoc = form.has_alternate_location
          ? (updateData as { alternate_location?: { latitude?: number; longitude?: number; googleLocation?: string } })
              .alternate_location
          : null;

        const alternateAddressChanged =
          form.has_alternate_location &&
          (prevAltVis !== newAltVis ||
            String(prevAltAddr.street || '').trim() !== String(newAltAddr?.street || '').trim() ||
            String(prevAltAddr.area || '').trim() !== String(newAltAddr?.area || '').trim() ||
            String(prevAltAddr.city || '').trim() !== String(newAltAddr?.city || '').trim() ||
            String(prevAltAddr.state || '').trim() !== String(newAltAddr?.state || '').trim() ||
            String(prevAltAddr.pincode || '').trim() !== String(newAltAddr?.pincode || '').trim());

        const alternateLocationChanged =
          form.has_alternate_location &&
          Boolean(newAltLoc) &&
          (Number(prevAltLoc?.latitude) !== Number(newAltLoc?.latitude) ||
            Number(prevAltLoc?.longitude) !== Number(newAltLoc?.longitude) ||
            String(prevAltLoc?.googleLocation || '') !== String(newAltLoc?.googleLocation || ''));

        const shouldSyncOpenJobs =
          locationChanged ||
          primaryAddressChanged ||
          alternateAddressChanged ||
          alternateLocationChanged;

        if (shouldSyncOpenJobs) {
          const primaryServiceAddress = {
            ...updatedAddress,
            visible_address: newVis || undefined,
          };
          const { data: customerJobs, error: jobsError } = await db.jobs.getByCustomerId(customer.id);
          if (!jobsError && customerJobs?.length) {
            const openJobs = customerJobs.filter((job: any) => {
              const st = String(job.status || '').toUpperCase();
              return (
                VISIT_ORDER_STATUSES.has(st) ||
                st === 'FOLLOW_UP' ||
                st === 'RESCHEDULED'
              );
            });
            await Promise.all(
              openJobs.map(async (job: any) => {
                const site = getJobServiceSite(job);
                if (site === 'secondary' && form.has_alternate_location) {
                  const alt = (updateData as any).alternate_location;
                  const altAddrRaw = (updateData as any).alternate_address;
                  if (!alt && !alternateAddressChanged) return;
                  const altServiceAddress = altAddrRaw
                    ? {
                        ...altAddrRaw,
                        visible_address: newAltVis || undefined,
                      }
                    : job.service_address;
                  return db.jobs.update(job.id, {
                    service_location: alt || job.service_location,
                    service_address: altServiceAddress,
                  } as any);
                }
                if (site === 'secondary') return;
                return db.jobs.update(job.id, {
                  service_location: updatedLocation,
                  service_address: primaryServiceAddress,
                } as any);
              })
            );
          }
        }
      } catch (syncErr) {
        console.warn('[EditCustomer] open-job location sync skipped:', syncErr);
      }

      // Check if brand or model changed for RO service type
      const roServiceIndex = form.service_types.indexOf('RO');
      let roBrandChanged = false;
      let roModelChanged = false;
      
      if (roServiceIndex >= 0) {
        const roEquipment = form.equipment['RO'];
        const newBrand = roEquipment?.brand?.trim() || '';
        const newModel = roEquipment?.model?.trim() || '';
        
        // Parse original customer brand/model (comma-separated)
        const originalBrands = (customer.brand || '').split(',').map((s: string) => s.trim());
        const originalModels = (customer.model || '').split(',').map((s: string) => s.trim());
        const originalRoBrand = originalBrands[roServiceIndex] || '';
        const originalRoModel = originalModels[roServiceIndex] || '';
        
        roBrandChanged = newBrand !== originalRoBrand;
        roModelChanged = newModel !== originalRoModel;
      }

      // Update all jobs for this customer if RO brand or model changed
      if ((roBrandChanged || roModelChanged) && roServiceIndex >= 0) {
        const roEquipment = form.equipment['RO'];
        const newBrand = roEquipment?.brand?.trim() || '';
        const newModel = roEquipment?.model?.trim() || '';

        try {
          // Get all jobs for this customer
          const { data: customerJobs, error: jobsError } = await db.jobs.getByCustomerId(customer.id);
          
          if (!jobsError && customerJobs && customerJobs.length > 0) {
            // Update all RO jobs for this customer
            const roJobs = customerJobs.filter((job: any) => job.service_type === 'RO');
            
            if (roJobs.length > 0) {
              const updatePromises = roJobs.map(async (job: any) => {
                return db.jobs.update(job.id, {
                  brand: newBrand,
                  model: newModel
                });
              });

              await Promise.all(updatePromises);
              console.log(`Updated ${updatePromises.length} RO job(s) with new brand/model`);
            }
          }
        } catch (jobsUpdateError) {
          console.error('Error updating jobs:', jobsUpdateError);
          // Don't fail the customer update if job update fails, but log it
          toast.warning('Customer updated, but some jobs may not have been updated');
        }
      }

      if (updatedCustomerFromDb) {
        const transformedCustomer = transformCustomerData(updatedCustomerFromDb);
        onCustomerUpdated(transformedCustomer);
      }

      await onLoadBrandsAndModels();
      
      lastSavedFormDataRef.current = JSON.stringify(form);
      
      // Show success message
      if ((roBrandChanged || roModelChanged) && roServiceIndex >= 0) {
        // Get job count for message
        try {
          const { data: customerJobs } = await db.jobs.getByCustomerId(customer.id);
          const roJobsCount = customerJobs?.filter((job: any) => job.service_type === 'RO').length || 0;
          if (roJobsCount > 0) {
            toast.success(`Customer and ${roJobsCount} job(s) updated successfully!`);
          } else {
            toast.success('Customer updated successfully!');
          }
        } catch {
          toast.success('Customer updated successfully!');
        }
      } else {
        toast.success('Customer updated successfully!');
      }
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error updating customer:', error);
      toast.error(`Failed to update customer: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDialogOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const renderPrimarySiteEquipment = () => (
    <div className="space-y-3 pt-2 border-t border-border">
      <Label className="text-sm font-medium text-foreground">Device at this site</Label>
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Service types</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { value: 'RO', label: 'RO (Reverse Osmosis)' },
            { value: 'SOFTENER', label: 'Water Softener' },
          ].map((service) => (
            <div
              key={service.value}
              onClick={() => handleEditServiceTypeToggle(service.value)}
              className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                editFormData?.service_types?.includes(service.value)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-border hover:border-border'
              }`}
            >
              <span className="text-sm font-medium">{service.label}</span>
            </div>
          ))}
        </div>
      </div>
      {editFormData?.service_types?.length > 0 && (
        <div className="space-y-3">
          {editFormData.service_types.map((serviceType) => {
            const serviceInfo = [
              { value: 'RO', label: 'RO' },
              { value: 'SOFTENER', label: 'Water Softener' },
            ].find((s) => s.value === serviceType);
            const equipment = editFormData?.equipment?.[serviceType] || { brand: '', model: '' };
            return (
              <div key={serviceType} className="bg-muted/40 p-3 rounded-lg space-y-3">
                <span className="text-sm font-medium text-foreground">{serviceInfo?.label}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2 relative">
                    <Label htmlFor={`edit_brand_${serviceType}`}>Brand</Label>
                    <Input
                      id={`edit_brand_${serviceType}`}
                      value={equipment.brand}
                      onChange={(e) => handleEditEquipmentChange(serviceType, 'brand', e.target.value)}
                      placeholder={`Enter ${serviceType} brand`}
                      onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 200)}
                    />
                    {showBrandSuggestions && brandSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {brandSuggestions.map((brand, index) => (
                          <div
                            key={index}
                            className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
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
                      onBlur={() => setTimeout(() => setShowModelSuggestions(false), 200)}
                    />
                    {showModelSuggestions && modelSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {modelSuggestions.map((model, index) => (
                          <div
                            key={index}
                            className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
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
  );

  const renderSecondarySiteEquipment = () => (
    <div className="space-y-3 pt-2 border-t border-border">
      <Label className="text-sm font-medium text-foreground">Device at this site</Label>
      <div className="space-y-2">
        <Label htmlFor="edit_alternate_service_type" className="text-xs text-muted-foreground">
          Service type
        </Label>
        <select
          id="edit_alternate_service_type"
          value={editFormData.alternate_service_type || 'RO'}
          onChange={(e) =>
            handleEditFormChange('alternate_service_type', e.target.value as 'RO' | 'SOFTENER')
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="RO">RO Water Purifier</option>
          <option value="SOFTENER">Water Softener</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="edit_alternate_brand">Brand</Label>
          <Input
            id="edit_alternate_brand"
            value={editFormData.alternate_brand}
            onChange={(e) => handleEditFormChange('alternate_brand', e.target.value)}
            placeholder="e.g. Aquaguard"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit_alternate_model">Model</Label>
          <Input
            id="edit_alternate_model"
            value={editFormData.alternate_model}
            onChange={(e) => handleEditFormChange('alternate_model', e.target.value)}
            placeholder="Model name"
          />
        </div>
      </div>
    </div>
  );

  const renderLocationFields = (slot: 'primary' | 'secondary') => {
    const isPrimary = slot === 'primary';
    const visibleAddress = isPrimary
      ? editFormData?.visible_address ?? ''
      : editFormData?.alternate_visible_address ?? '';
    const street = isPrimary
      ? editFormData?.address?.street ?? ''
      : editFormData?.alternate_address?.street ?? '';
    const googleLoc = isPrimary
      ? editFormData?.google_location ?? ''
      : editFormData?.alternate_google_location ?? '';
    const locationId = isPrimary ? 'edit_visible_address' : 'edit_alternate_visible_address';
    const addressId = isPrimary ? 'edit_full_address' : 'edit_alternate_full_address';
    const mapsId = isPrimary ? 'edit_google_location' : 'edit_alternate_google_location';
    const locationLabel = isPrimary ? 'Location' : 'Location Label';

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={locationId}>{locationLabel}</Label>
          {isPrimary ? (
            <>
              <div className="relative">
                <Input
                  id={locationId}
                  value={visibleAddress}
                  onChange={(e) => {
                    locationManuallyEditedRef.current = true;
                    handleEditFormChange('visible_address', e.target.value);
                    setVisibleAddressSuggestions(e.target.value.length > 0);
                  }}
                  onFocus={() => {
                    if (visibleAddress.length > 0) setVisibleAddressSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setVisibleAddressSuggestions(false), 200);
                  }}
                  placeholder="e.g., Bansawadi, Koramangala, Whitefield, etc."
                  maxLength={VISIBLE_ADDRESS_MAX_LEN}
                  className="text-sm"
                />
                {visibleAddressSuggestions && filteredAddressSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
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
              <p className="text-xs text-muted-foreground">
                Enter a one-word area name for quick recognition. Start typing to see suggestions.
              </p>
            </>
          ) : (
            <>
              <Input
                id={locationId}
                value={visibleAddress}
                onChange={(e) => {
                  alternateLocationManuallyEditedRef.current = true;
                  handleEditFormChange('alternate_visible_address', e.target.value);
                }}
                placeholder="e.g. Office, Shop, Restaurant"
                maxLength={VISIBLE_ADDRESS_MAX_LEN}
                className="text-sm"
              />
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={addressId}>Complete Address</Label>
            {isPrimary && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleFetchLocationFromAddress('primary')}
                className="whitespace-nowrap"
                title={
                  visibleAddress.trim()
                    ? 'Location already set. Clear it first to fetch a new one.'
                    : 'Extract location from complete address'
                }
                disabled={!street.trim() || Boolean(visibleAddress.trim())}
              >
                <MapPin className="w-3 h-3 mr-1" />
                Fetch Location
              </Button>
            )}
          </div>
          <Textarea
            id={addressId}
            value={street}
            onChange={(e) =>
              isPrimary
                ? handleAddressFieldChange('street', e.target.value)
                : handleAlternateAddressFieldChange('street', e.target.value)
            }
            placeholder="Enter complete address (e.g., 123 MG Road, Koramangala, Bangalore, Karnataka, 560034)"
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={mapsId} className="text-sm font-medium text-foreground">
            Google Maps Location
          </Label>
          <Input
            id={mapsId}
            value={googleLoc}
            onChange={(e) => handleGoogleMapsLinkChange(e.target.value, slot)}
            placeholder="Paste Google Maps share link here..."
            className="w-full text-sm"
          />
          {googleLoc && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchAddressFromGoogleLocation(slot)}
                disabled={isFetchingAddress}
                className="w-full whitespace-nowrap"
                title="Fetch address from Google Maps link or clipboard"
              >
                <Download className="w-3 h-3 mr-1" />
                {isFetchingAddress ? 'Fetching…' : 'Fetch Address'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const link =
                    extractMapsUrlFromText(googleLoc) ||
                    sanitizeGoogleMapsInput(googleLoc);
                  window.open(link, '_blank', 'noopener,noreferrer');
                }}
                className="w-full whitespace-nowrap"
                title="Open in Google Maps"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Test
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        // Prevent Radix from auto-focusing arbitrary elements on open.
        // We explicitly focus the Full Name field only when the dialog is opened via Edit.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
          <DialogDescription asChild>
            <span>
              Update customer information for {customer?.customerId || (customer as any)?.customer_id || 'Customer'} -{' '}
              <span className={customerNameClassName(customer as any)}>
                {customer?.fullName || (customer as any)?.full_name || ''}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
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
                <Label htmlFor="edit_email">Email</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editFormData?.email ?? ''}
                  onChange={(e) => handleEditFormChange('email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-1.5">
                  <div className="flex-1 space-y-2 min-w-0">
                    <Label htmlFor="edit_phone">Primary Phone</Label>
                    <Input
                      id="edit_phone"
                      value={editFormData?.phone ?? ''}
                      onChange={(e) => handleEditPhoneFieldChange('phone', e.target.value)}
                      placeholder="Enter 10-digit phone number"
                      inputMode="numeric"
                    />
                  </div>

                  {canSwapPhones && (
                    <div className="flex justify-center sm:pb-2 shrink-0">
                      <PhoneSwapButton onSwap={handleSwapPhones} />
                    </div>
                  )}

                  <div className="flex-1 space-y-2 min-w-0">
                    <Label htmlFor="edit_alternate_phone">Alternate Phone</Label>
                    <Input
                      id="edit_alternate_phone"
                      value={editFormData?.alternate_phone ?? ''}
                      onChange={(e) => handleEditPhoneFieldChange('alternate_phone', e.target.value)}
                      placeholder="Enter 10-digit phone number (optional)"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Address / sites */}
          <div className="space-y-4">
            {editFormData.has_alternate_location ? (
              <h3 className="text-lg font-semibold text-foreground">Primary site</h3>
            ) : (
              <h3 className="text-lg font-semibold text-foreground">Address Information</h3>
            )}
            <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
              {renderLocationFields('primary')}
              {renderPrimarySiteEquipment()}
            </div>

            <div className="flex items-center gap-2">
              {editFormData.has_alternate_location && canSwapLocations && (
                <PhoneSwapButton onSwap={handleSwapLocations} />
              )}
              <input
                type="checkbox"
                id="edit_has_alternate_location"
                checked={editFormData.has_alternate_location}
                onChange={(e) => handleEditFormChange('has_alternate_location', e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="edit_has_alternate_location" className="text-sm font-normal cursor-pointer">
                Enable second site
              </Label>
            </div>

            {editFormData.has_alternate_location && (
              <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
                <h3 className="text-base font-semibold text-foreground">Second site</h3>
                {renderLocationFields('secondary')}
                {renderSecondarySiteEquipment()}
              </div>
            )}
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Additional Information</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Does the customer have GST?</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-gst-no"
                      name="edit-customer-gst"
                      checked={!editFormData.has_gst}
                      onChange={() => {
                        setEditFormData((prev) => ({
                          ...prev,
                          has_gst: false,
                          gst_number: '',
                        }));
                      }}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-gst-no" className="cursor-pointer">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-gst-yes"
                      name="edit-customer-gst"
                      checked={editFormData.has_gst}
                      onChange={() => handleEditFormChange('has_gst', true)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-gst-yes" className="cursor-pointer">Yes</Label>
                  </div>
                </div>
                {editFormData.has_gst && (
                  <div className="space-y-2">
                    <Label htmlFor="edit-gst-number">GST Number (GSTIN)</Label>
                    <Input
                      id="edit-gst-number"
                      value={editFormData.gst_number}
                      onChange={(e) =>
                        handleEditFormChange(
                          'gst_number',
                          normalizeCustomerGstNumber(e.target.value)
                        )
                      }
                      placeholder="e.g. 29AAAAA0000A1Z5"
                      maxLength={15}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="max-w-sm font-mono tracking-wide uppercase"
                    />
                  </div>
                )}
              </div>
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
              <div className="space-y-2">
                <Label>Has the customer left a Google review?</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-google-review-yes"
                      name="edit-google-review"
                      checked={editFormData.has_google_review === true}
                      onChange={() => handleEditFormChange('has_google_review', true)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-google-review-yes" className="cursor-pointer">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-google-review-no"
                      name="edit-google-review"
                      checked={editFormData.has_google_review === false}
                      onChange={() => handleEditFormChange('has_google_review', false)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-google-review-no" className="cursor-pointer">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-google-review-unknown"
                      name="edit-google-review"
                      checked={editFormData.has_google_review === null}
                      onChange={() => handleEditFormChange('has_google_review', null)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-google-review-unknown" className="cursor-pointer">Not Set</Label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Customer highlight (name color in lists)</Label>
                <p className="text-xs text-muted-foreground">Premium = gold name. Worst = red name for difficult/problem customers.</p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-customer-tier-none"
                      name="edit-customer-tier"
                      checked={editFormData.customer_tier === null}
                      onChange={() => handleEditFormChange('customer_tier', null)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-customer-tier-none" className="cursor-pointer">Normal</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-customer-tier-premium"
                      name="edit-customer-tier"
                      checked={editFormData.customer_tier === 'PREMIUM'}
                      onChange={() => handleEditFormChange('customer_tier', 'PREMIUM')}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-customer-tier-premium" className="cursor-pointer text-amber-600 font-medium">Premium (gold)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="edit-customer-tier-worst"
                      name="edit-customer-tier"
                      checked={editFormData.customer_tier === 'WORST'}
                      onChange={() => handleEditFormChange('customer_tier', 'WORST')}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="edit-customer-tier-worst" className="cursor-pointer text-red-600 font-medium">Worst (red)</Label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-raw-water-tds">Raw water TDS (ppm)</Label>
                <Input
                  id="edit-raw-water-tds"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 500"
                  value={editFormData.raw_water_tds > 0 ? String(editFormData.raw_water_tds) : ''}
                  onChange={(e) => handleEditFormChange('raw_water_tds', Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
                  className="max-w-[140px]"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button 
            variant="destructive" 
            onClick={() => {
              if (isManager) {
                toast.error(managerRestrictedTitle);
                return;
              }
              setDeleteDialogOpen(true);
            }}
            disabled={isUpdating || isDeleting || isManager}
            title={isManager ? managerRestrictedTitle : undefined}
            className="w-full sm:w-auto"
          >
            {isManager ? <Lock className="w-4 h-4 mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {isManager ? 'Restricted' : 'Delete Customer'}
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
