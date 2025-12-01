import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Customer } from '@/types';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';
import { generateJobNumber, extractLocationFromAddressString } from '@/lib/adminUtils';

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onCustomerCreated: () => Promise<void>;
  onExistingCustomerFound?: (customer: Customer) => void;
}

const AddCustomerDialog: React.FC<AddCustomerDialogProps> = ({
  open,
  onOpenChange,
  customers,
  onCustomerCreated,
  onExistingCustomerFound
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [shouldCreateJob, setShouldCreateJob] = useState(false);
  const [addFormData, setAddFormData] = useState({
    full_name: '',
    phone: '',
    alternate_phone: '',
    email: '',
    service_types: [] as string[],
    equipment: {} as {[serviceType: string]: {brand: string, model: string}},
    behavior: '',
    native_language: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
    notes: '',
    address: '',
    google_location: '',
    service_cost: 0,
    cost_agreed: false
  });
  const [step5JobData, setStep5JobData] = useState({
    service_type: 'RO' as 'RO' | 'SOFTENER',
    service_sub_type: 'Installation',
    service_sub_type_custom: '',
    scheduled_date: '',
    scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
    scheduled_time_custom: '',
    description: '',
    lead_source: '',
    lead_source_custom: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  });

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

  const nextStep = () => {
    if (validateStep(currentStep)) {
      if (currentStep === 1) {
        const existing = checkExistingCustomer(addFormData.phone, addFormData.email);
        if (existing && onExistingCustomerFound) {
          onExistingCustomerFound(existing);
          return;
        }
      }
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
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

  const handleServiceTypeToggle = (serviceType: string) => {
    setAddFormData(prev => {
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
    
    if (formErrors.service_types) {
      setFormErrors(prev => ({
        ...prev,
        service_types: ''
      }));
    }
  };

  const handleEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string) => {
    setAddFormData(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [serviceType]: {
          ...prev.equipment[serviceType],
          [field]: value
        }
      }
    }));
    
    const errorKey = `equipment.${serviceType}.${field}`;
    if (formErrors[errorKey]) {
      setFormErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const handleGoogleMapsNavigation = () => {
    // Only open link from Google Maps Location field - don't use address field
    if (addFormData.google_location && addFormData.google_location.trim()) {
      const googleLocation = addFormData.google_location.trim();
      // Check if it's already a Google Maps URL
      if (googleLocation.includes('google.com/maps') || googleLocation.includes('maps.app.goo.gl')) {
        window.open(googleLocation, '_blank', 'noopener,noreferrer');
        return;
      }
      // If it looks like coordinates (lat,lng format)
      const coordMatch = googleLocation.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
      if (coordMatch) {
        const lat = coordMatch[1];
        const lng = coordMatch[2];
        const googleMapsUrl = `https://www.google.com/maps/place/${lat},${lng}`;
        window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }
    
    // If no valid Google Maps location, show error
    toast.error('Please enter a Google Maps link or coordinates in the "Google Maps Location" field');
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
        
        if (!step5JobData.lead_source || step5JobData.lead_source.trim() === '') {
          toast.error('Please select a lead source');
          return;
        }
        
        if (step5JobData.lead_source === 'Other' && (!step5JobData.lead_source_custom || step5JobData.lead_source_custom.trim() === '')) {
          toast.error('Please enter a custom lead source');
          return;
        }

        if (step5JobData.service_sub_type === 'Custom' && (!step5JobData.service_sub_type_custom || step5JobData.service_sub_type_custom.trim() === '')) {
          toast.error('Please enter a custom service sub type');
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
        visible_address: extractedLocation ? extractedLocation.substring(0, 20) : '',
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
      toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);

      await onCustomerCreated();

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
          
          const jobData = {
            job_number: jobNumber,
            customer_id: newCustomer.id,
            service_type: step5JobData.service_type,
            service_sub_type: step5JobData.service_sub_type === 'Custom' ? step5JobData.service_sub_type_custom : step5JobData.service_sub_type,
            brand: newCustomer.brand || '',
            model: newCustomer.model || '',
            scheduled_date: step5JobData.scheduled_date,
            scheduled_time_slot: scheduledTimeSlot,
            service_address: newCustomer.address,
            service_location: newCustomer.location,
            status: 'PENDING' as const,
            priority: step5JobData.priority,
            description: step5JobData.description.trim() || '',
            requirements: [{ 
              lead_source: step5JobData.lead_source === 'Other' ? (step5JobData.lead_source_custom || 'Other') : step5JobData.lead_source,
              custom_time: customTimeInRequirements
            }],
            estimated_cost: 0,
            payment_status: 'PENDING' as const,
          };

          const { data: newJob, error: jobError } = await db.jobs.create(jobData);
          
          if (jobError) {
            console.error('Failed to create job:', jobError);
            toast.error('Customer created but failed to create job');
          } else {
            toast.success(`Job ${newJob.job_number} created successfully!`);
            await onCustomerCreated();
          }
        } catch (error) {
          console.error('Error creating job:', error);
          toast.error('Customer created but failed to create job');
        }
      }

      // Reset form
      setAddFormData({
        full_name: '',
        phone: '',
        alternate_phone: '',
        email: '',
        service_types: [],
        equipment: {},
        behavior: '',
        native_language: '',
        status: 'ACTIVE',
        notes: '',
        address: '',
        google_location: '',
        service_cost: 0,
        cost_agreed: false
      });
      setCurrentStep(1);
      setFormErrors({});
      setShouldCreateJob(false);
      setStep5JobData({
        service_type: 'RO' as 'RO' | 'SOFTENER',
        service_sub_type: 'Installation',
        service_sub_type_custom: '',
        scheduled_date: '',
        scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
        scheduled_time_custom: '',
        description: '',
        lead_source: '',
        lead_source_custom: '',
        priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
      });

      onOpenChange(false);
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
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Enter 10-digit phone number"
                    className={`text-sm ${formErrors.phone ? 'border-red-500' : ''}`}
                    required
                  />
                  {formErrors?.phone && (
                    <p className="text-xs text-red-500">{formErrors.phone}</p>
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
                  onChange={(e) => handleAddFormChange('email', e.target.value)}
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
                <Label htmlFor="add_address">Complete Address</Label>
                <Textarea
                  id="add_address"
                  value={addFormData.address}
                  onChange={(e) => handleAddFormChange('address', e.target.value)}
                  placeholder="Enter complete address (street, area, city, state, pincode)"
                  rows={3}
                  className={formErrors.address ? 'border-red-500' : ''}
                />
                {formErrors?.address && (
                  <p className="text-sm text-red-500">{formErrors.address}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add_google_location">Google Maps Location (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="add_google_location"
                    value={addFormData.google_location}
                    onChange={(e) => handleAddFormChange('google_location', e.target.value)}
                    placeholder="Enter Google Maps link or coordinates"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleMapsNavigation}
                    disabled={!addFormData.google_location.trim()}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <MapPin className="w-4 h-4" />
                    Open in Maps
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Paste a Google Maps link or coordinates (e.g., 12.9716,77.5946), then click "Open in Maps" to navigate
                </p>
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
                    { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                    { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                    { value: 'AC', label: 'AC Services', icon: '❄️' },
                    { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
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
                        <span className="text-lg">{service.icon}</span>
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
                      { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                      { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                      { value: 'AC', label: 'AC Services', icon: '❄️' },
                      { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = addFormData.equipment[serviceType] || { brand: '', model: '' };
                    
                    return (
                      <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{serviceInfo?.icon}</span>
                          <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor={`brand_${serviceType}`}>Brand</Label>
                            <Input
                              id={`brand_${serviceType}`}
                              value={equipment.brand}
                              onChange={(e) => handleEquipmentChange(serviceType, 'brand', e.target.value)}
                              placeholder={`Enter ${serviceType} brand`}
                              className={formErrors[`equipment.${serviceType}.brand`] ? 'border-red-500' : ''}
                            />
                            {formErrors?.[`equipment.${serviceType}.brand`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.brand`]}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`model_${serviceType}`}>Model</Label>
                            <Input
                              id={`model_${serviceType}`}
                              value={equipment.model}
                              onChange={(e) => handleEquipmentChange(serviceType, 'model', e.target.value)}
                              placeholder={`Enter ${serviceType} model`}
                              className={formErrors[`equipment.${serviceType}.model`] ? 'border-red-500' : ''}
                            />
                            {formErrors?.[`equipment.${serviceType}.model`] && (
                              <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.model`]}</p>
                            )}
                          </div>
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
                    <span className="font-medium text-gray-600">Address:</span>
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
                          { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                          { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                          { value: 'AC', label: 'AC Services', icon: '❄️' },
                          { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                        ].find(s => s.value === serviceType);
                        
                        const equipment = addFormData.equipment[serviceType];
                        
                        return (
                          <div key={serviceType} className="flex items-center gap-2 text-sm">
                            <span>{serviceInfo?.icon}</span>
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
                  <label className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer transition-all hover:border-blue-300">
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
                      <Label htmlFor="step5_service_sub_type">Service Sub Type</Label>
                      <Select
                        value={step5JobData.service_sub_type}
                        onValueChange={(value) => setStep5JobData(prev => ({ 
                          ...prev, 
                          service_sub_type: value === 'Custom' ? 'Custom' : value,
                          service_sub_type_custom: value === 'Custom' ? prev.service_sub_type_custom : ''
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Installation">Installation</SelectItem>
                          <SelectItem value="Reinstallation">Reinstallation</SelectItem>
                          <SelectItem value="Service">Service</SelectItem>
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
                        value={step5JobData.lead_source || ''}
                        onValueChange={(value) => setStep5JobData(prev => ({ 
                          ...prev, 
                          lead_source: value === 'Other' ? 'Other' : value,
                          lead_source_custom: value === 'Other' ? prev.lead_source_custom : ''
                        }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select lead source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Website">Website</SelectItem>
                          <SelectItem value="Direct call">Direct call</SelectItem>
                          <SelectItem value="RO care india">RO care india</SelectItem>
                          <SelectItem value="Home Triangle">Home Triangle</SelectItem>
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
                      <Label htmlFor="step5_description">Description (Optional)</Label>
                      <Textarea
                        id="step5_description"
                        value={step5JobData.description}
                        onChange={(e) => setStep5JobData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter job description"
                        rows={3}
                      />
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
                disabled={isCreating || (shouldCreateJob && (!step5JobData.scheduled_date || !step5JobData.lead_source || (step5JobData.lead_source === 'Other' && !step5JobData.lead_source_custom) || (step5JobData.service_sub_type === 'Custom' && !step5JobData.service_sub_type_custom) || (step5JobData.scheduled_time_slot === 'CUSTOM' && !step5JobData.scheduled_time_custom)))}
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

