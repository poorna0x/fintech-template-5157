import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Phone, MessageCircle, MapPin, User, Clock, ChevronLeft, ChevronRight, Check, Settings, Filter, Upload, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, generateJobNumber } from '@/lib/supabase';
import { emailService } from '@/lib/email';
import ImageUpload from './ImageUpload';

const BookingSection = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceType, setServiceType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    coordinates: { lat: 0, lng: 0 },
    serviceType: '',
    service: '',
    problemDescription: '',
    brandName: '',
    modelName: '',
    preferredDate: '',
    preferredTime: '',
    message: '',
    images: [] as string[]
  });

  // No Google Places initialization needed - using free services

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Handle address autocomplete
    if (field === 'address' && value.length > 2) {
      handleAddressInput(value);
    } else if (field === 'address' && value.length <= 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleAddressInput = async (input: string) => {
    setIsLoadingPlaces(true);
    
    try {
      // Use OpenStreetMap Nominatim for free address autocomplete
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&countrycodes=in&limit=5&addressdetails=1`
      );
      
      const data = await response.json();
      setIsLoadingPlaces(false);
      
      if (data && data.length > 0) {
        const suggestions = data.map((item: any) => ({
          place_id: item.place_id,
          description: item.display_name,
          structured_formatting: {
            main_text: item.display_name.split(',')[0] || item.display_name,
            secondary_text: item.display_name.split(',').slice(1).join(',').trim()
          },
          types: ['geocode'],
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          address: item.address
        }));
        
        setAddressSuggestions(suggestions);
        setShowSuggestions(true);
      } else {
        setAddressSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Error getting place predictions:', error);
      setIsLoadingPlaces(false);
      setAddressSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleAddressSelect = (suggestion: any) => {
    // Extract address components from the suggestion
    const pincode = suggestion.address?.postcode || '';
    const city = suggestion.address?.city || suggestion.address?.town || suggestion.address?.village || '';
    const state = suggestion.address?.state || '';
    const area = suggestion.address?.suburb || suggestion.address?.neighbourhood || '';
    const street = suggestion.address?.road || '';
    const houseNumber = suggestion.address?.house_number || '';

    // Update form data with complete address and coordinates
    setFormData(prev => ({
      ...prev,
      address: suggestion.description || '',
      coordinates: {
        lat: suggestion.lat || 0,
        lng: suggestion.lon || 0
      }
    }));

    setAddressSuggestions([]);
    setShowSuggestions(false);
    
    // Show detailed location information
    const locationDetails = [];
    if (houseNumber) locationDetails.push(houseNumber);
    if (street) locationDetails.push(street);
    if (area) locationDetails.push(area);
    if (city) locationDetails.push(city);
    if (state) locationDetails.push(state);
    if (pincode) locationDetails.push(pincode);
    
    const lat = (suggestion.lat || 0).toFixed(6);
    const lng = (suggestion.lon || 0).toFixed(6);
    
    toast.success(
      `📍 Exact Location Selected!\n${locationDetails.join(', ')}\nCoordinates: ${lat}, ${lng}`,
      { duration: 5000 }
    );
  };

  const handleImagesChange = (images: string[]) => {
    setFormData(prev => ({ ...prev, images }));
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser. Please enter your address manually.');
      return;
    }

    // Show loading state
    const button = document.querySelector('[data-location-button]') as HTMLButtonElement;
    if (button) {
      button.disabled = true;
      button.textContent = 'Getting location...';
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log('Location obtained:', { latitude, longitude, accuracy });
        
        // Use free reverse geocoding services
        const geocodingPromises = [
          
          // Fallback: BigDataCloud (free, good accuracy)
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
          .then(response => response.json())
          .then(data => {
              // Extract pincode from the data
              const pincode = data.postcode || '';
              const city = data.locality || data.city || '';
              const state = data.principalSubdivision || data.principalSubdivisionCode || '';
              const area = data.localityInfo?.administrative?.[0]?.name || '';
              
              // Create a more detailed address
              const addressParts = [];
              if (data.locality) addressParts.push(data.locality);
              if (data.principalSubdivision) addressParts.push(data.principalSubdivision);
              if (data.countryName) addressParts.push(data.countryName);
              if (pincode) addressParts.push(pincode);
              
              return {
                service: 'bigdatacloud',
                address: addressParts.join(', '),
                pincode,
                city,
                state,
                area,
                street: '',
                houseNumber: '',
                details: data
              };
            })
            .catch(() => null),
          
          // Fallback: OpenStreetMap Nominatim (free, good for detailed addresses)
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`)
            .then(response => response.json())
            .then(data => {
              const pincode = data.address?.postcode || '';
              const city = data.address?.city || data.address?.town || data.address?.village || '';
              const state = data.address?.state || '';
              const area = data.address?.suburb || data.address?.neighbourhood || '';
              const street = data.address?.road || '';
              const houseNumber = data.address?.house_number || '';
              
              return {
                service: 'nominatim',
                address: data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                pincode,
                city,
                state,
                area,
                street,
                houseNumber,
                details: data
              };
            })
            .catch(() => null)
        ];

        // Try the first successful geocoding result
        Promise.race(geocodingPromises.filter(p => p !== null))
          .then(result => {
            if (result) {
              console.log('Geocoding result:', result);
              
              // Update form data with complete address and coordinates
              console.log('Setting form data with address:', result.address);
            setFormData(prev => ({ 
              ...prev, 
                address: result.address,
                coordinates: {
                  lat: latitude,
                  lng: longitude
                }
              }));

              // Show detailed location information
              const locationDetails = [];
              if (result.houseNumber) locationDetails.push(result.houseNumber);
              if (result.street) locationDetails.push(result.street);
              if (result.area) locationDetails.push(result.area);
              if (result.city) locationDetails.push(result.city);
              if (result.state) locationDetails.push(result.state);
              if (result.pincode) locationDetails.push(result.pincode);
              
              const lat = latitude.toFixed(6);
              const lng = longitude.toFixed(6);
              
              toast.success(
                `📍 Current Location Detected!\n${locationDetails.join(', ')}\nCoordinates: ${lat}, ${lng}`,
                { duration: 5000 }
              );
            } else {
              // Fallback to coordinates if all geocoding fails
              const coordinateAddress = `Current Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
              setFormData(prev => ({ 
                ...prev, 
                address: coordinateAddress,
                coordinates: {
                  lat: latitude,
                  lng: longitude
                }
              }));
              toast.warning('Location detected but address lookup failed. Please verify the coordinates.');
            }
          })
          .catch(() => {
            // Fallback to coordinates if all geocoding fails
            const coordinateAddress = `Current Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setFormData(prev => ({ 
              ...prev, 
              address: coordinateAddress,
              coordinates: {
                lat: latitude,
                lng: longitude
              }
            }));
            toast.warning('Location detected but address lookup failed. Please verify the coordinates.');
          })
            
            // Reset button
            if (button) {
              button.disabled = false;
              button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>Use Current Location';
            }
      },
      (error) => {
        console.error('Error getting location:', error);
        
        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>Use Current Location';
        }
        
        // Better error messages
        let errorMessage = 'Unable to get your current location. ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please allow location access in your browser settings or enter your address manually.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable. Please enter your address manually.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again or enter your address manually.';
            break;
          default:
            errorMessage += 'Please enter your address manually.';
            break;
        }
        
        toast.error(errorMessage);
      },
      {
        enableHighAccuracy: true,  // Use GPS for better accuracy
        timeout: 15000,           // 15 second timeout for better accuracy
        maximumAge: 60000         // Cache location for 1 minute only
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Parse address into components (simple parsing)
      const addressParts = formData.address.split(',');
      const pincodeMatch = formData.address.match(/\b\d{6}\b/);
      const pincode = pincodeMatch ? pincodeMatch[0] : '560001';
      
      // Create customer record
      const customerData = {
        full_name: formData.name,
        phone: formData.phone,
        email: formData.email,
        address: {
          street: formData.address,
          area: addressParts[1]?.trim() || '',
          city: addressParts[2]?.trim() || 'Bangalore',
          state: 'Karnataka',
          pincode: pincode,
        },
        location: {
          latitude: formData.coordinates.lat,
          longitude: formData.coordinates.lng,
          formattedAddress: formData.address,
          googleLocation: formData.coordinates.lat !== 0 && formData.coordinates.lng !== 0 
            ? `https://www.google.com/maps/place/${formData.coordinates.lat},${formData.coordinates.lng}`
            : null
        },
        service_type: formData.serviceType.toUpperCase() as 'RO' | 'SOFTENER',
        brand: formData.brandName,
        model: formData.modelName,
        status: 'ACTIVE' as const,
        customer_since: new Date().toISOString(),
        preferred_time_slot: formData.preferredTime.toUpperCase() as 'MORNING' | 'AFTERNOON' | 'EVENING',
        preferred_language: 'ENGLISH' as const,
      };

      const { data: customer, error: customerError } = await db.customers.create(customerData);
      
      if (customerError) {
        throw new Error(customerError.message);
      }

      // Create job record
      const jobData = {
        job_number: generateJobNumber(formData.serviceType.toUpperCase()),
        customer_id: customer.id,
        service_type: formData.serviceType.toUpperCase() as 'RO' | 'SOFTENER',
        service_sub_type: formData.service,
        brand: formData.brandName,
        model: formData.modelName,
        scheduled_date: formData.preferredDate,
        scheduled_time_slot: formData.preferredTime.toUpperCase() as 'MORNING' | 'AFTERNOON' | 'EVENING',
        estimated_duration: 120,
        service_address: customerData.address,
        service_location: customerData.location,
        status: 'PENDING' as const,
        priority: 'MEDIUM' as const,
        description: formData.problemDescription,
        requirements: [],
        estimated_cost: 0,
        payment_status: 'PENDING' as const,
        before_photos: formData.images,
      };

      const { data: job, error: jobError } = await db.jobs.create(jobData);
      
      if (jobError) {
        throw new Error(jobError.message);
      }

      // Send confirmation email (non-blocking for faster response)
      emailService.sendBookingConfirmation({
        customerName: customer.full_name,
        jobNumber: job.job_number,
        serviceType: job.service_type,
        serviceSubType: job.service_sub_type,
        brand: job.brand,
        model: job.model,
        scheduledDate: job.scheduled_date,
        scheduledTimeSlot: job.scheduled_time_slot,
        serviceAddress: formData.address,
        phone: customer.phone,
        email: customer.email,
      }).catch(error => {
        console.error('Email sending failed:', error);
      });

      setBookingId(job.job_number);
      setBookingSuccess(true);
      toast.success('Booking confirmed successfully!', {
        description: 'Confirmation email sent. Please check your spam folder if you don\'t see it.',
        duration: 6000,
      });
      
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roServices = [
    { value: "ro-installation", label: "RO Installation" },
    { value: "ro-repair", label: "RO Repair" },
    { value: "ro-maintenance", label: "RO Maintenance" },
    { value: "filter-replacement", label: "Filter Replacement" },
    { value: "ro-troubleshooting", label: "RO Troubleshooting" }
  ];

  const softenerServices = [
    { value: "softener-installation", label: "Water Softener Installation" },
    { value: "softener-repair", label: "Water Softener Repair" },
    { value: "softener-maintenance", label: "Softener Maintenance" },
    { value: "salt-refill", label: "Salt Refill Service" },
    { value: "softener-calibration", label: "System Calibration" }
  ];

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return formData.name && formData.phone && formData.email;
      case 2:
        return formData.serviceType && formData.service && formData.problemDescription;
      case 3:
        return formData.address && formData.brandName && formData.modelName;
      case 4:
        return formData.preferredDate && formData.preferredTime;
      case 5:
        return true; // Confirmation step is always valid
      default:
        return false;
    }
  };

  if (bookingSuccess) {
    return (
      <section id="booking" className="py-16 px-2 md:px-12 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              Booking Confirmed!
            </h2>
            <p className="text-lg text-muted-foreground">
              Your service request has been submitted successfully
            </p>
          </div>
          
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-4">Booking Confirmed!</h3>
              <p className="text-muted-foreground mb-6">
                Your service request has been submitted successfully. We'll contact you within 30 minutes to confirm your appointment.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <p className="font-semibold text-foreground">Booking ID: {bookingId}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please keep this ID for your reference
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Confirmation email sent to your registered email (check spam folder)</p>
                <p>• SMS notification sent to your phone</p>
                <p>• Our technician will contact you soon</p>
              </div>
              <Button 
                onClick={() => {
                  setBookingSuccess(false);
                  setCurrentStep(1);
                  setBookingId(null);
                  setFormData({
                    name: '',
                    phone: '',
                    email: '',
                    address: '',
                    serviceType: '',
                    service: '',
                    problemDescription: '',
                    brandName: '',
                    modelName: '',
                    preferredDate: '',
                    preferredTime: '',
                    message: '',
                    images: []
                  });
                }}
                className="mt-6"
              >
                Book Another Service
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="py-16 px-2 md:px-12 bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
            Book RO Service in Bengaluru
          </h2>
          <p className="text-lg text-muted-foreground">
            Schedule your RO water purifier service with our certified technicians across Bangalore, Karnataka
          </p>
        </div>
        
        <div className="w-full max-w-2xl mx-auto px-0 md:px-0">
          {/* 3-Step Booking Form */}
          <div className="p-0 md:p-4">
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Book Service
                </CardTitle>
                
                {/* Progress Steps */}
                <div className="flex items-center justify-between mt-4">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div key={step} className="flex items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        step <= currentStep 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {step < currentStep ? <Check className="w-3 h-3" /> : step}
                      </div>
                      {step < 5 && (
                        <div className={`w-6 h-1 mx-1 ${
                          step < currentStep ? 'bg-primary' : 'bg-muted'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Basic</span>
                  <span>Service</span>
                  <span>Device</span>
                  <span>Schedule</span>
                  <span>Confirm</span>
                </div>
              </CardHeader>
              
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="min-h-[400px] max-h-[500px] overflow-y-auto">
                  {/* Step 1: Basic Information */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="bg-muted border border-border rounded-lg p-4 mb-4">
                        <p className="text-sm text-foreground">
                          <strong>Note:</strong> We won't ask you to create an account. Email is only for sending confirmation and service updates.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          <strong>*</strong> means compulsory fields. Other fields you can skip, but we recommend providing all information for faster service.
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <User className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Basic Information</h3>
                      </div>
                      
                      <div className="space-y-4 px-2 md:px-2">
                    <div>
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Enter your full name"
                            className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                        required
                      />
                    </div>
                        
                    <div>
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                            placeholder="+91-8884944288"
                            className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                        required
                      />
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="your@email.com"
                            className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Service Type Selection */}
                  {currentStep === 2 && (
                    <div className="space-y-6 px-2 md:px-2">
                      <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Select Service Type</h3>
                      </div>
                      
                      <div>
                        <Label>What type of service do you need? *</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div 
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                              formData.serviceType === 'ro' 
                                ? 'border-primary bg-primary/10' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, serviceType: 'ro', service: '' }));
                            }}
                          >
                            <div className="text-center">
                              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                                <Filter className="w-6 h-6 text-primary" />
                              </div>
                              <h4 className="font-semibold text-foreground">RO Water Purifier</h4>
                              <p className="text-sm text-muted-foreground mt-1">Installation, repair, maintenance</p>
                            </div>
                          </div>
                          
                          <div 
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                              formData.serviceType === 'softener' 
                                ? 'border-primary bg-primary/10' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, serviceType: 'softener', service: '' }));
                            }}
                          >
                            <div className="text-center">
                              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                                <Settings className="w-6 h-6 text-primary" />
                              </div>
                              <h4 className="font-semibold text-foreground">Water Softener</h4>
                              <p className="text-sm text-muted-foreground mt-1">Installation, repair, maintenance</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
               {formData.serviceType && (
                 <div className="space-y-4">
                   <div>
                     <Label>Select Specific Service *</Label>
                     <Select onValueChange={(value) => handleInputChange('service', value)}>
                       <SelectTrigger className="border-2 border-gray-400 dark:border-gray-500 focus:border-primary focus:ring-2 focus:ring-primary p-3">
                         <SelectValue placeholder="Choose specific service" />
                       </SelectTrigger>
                       <SelectContent>
                         {(formData.serviceType === 'ro' ? roServices : softenerServices).map((service) => (
                           <SelectItem key={service.value} value={service.value}>
                             {service.label}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   
                   <div>
                     <Label>Briefly Describe Your Problem *</Label>
                     <Textarea
                       value={formData.problemDescription || ''}
                       onChange={(e) => handleInputChange('problemDescription', e.target.value)}
                       placeholder="e.g., Water taste is bad, Low water pressure, Leaking, Not working, Installation needed..."
                       rows={3}
                       className="resize-none border-2 border-gray-400 dark:border-gray-500 focus:border-primary focus:ring-2 focus:ring-primary p-3"
                     />
                     <p className="text-xs text-muted-foreground mt-1">
                       Help our technician understand the issue better
                     </p>
                   </div>
                 </div>
               )}
                    </div>
                  )}

                  {/* Step 3: Device Details & Location */}
                  {currentStep === 3 && (
                    <div className="space-y-6 px-2 md:px-2">
                      <div className="flex items-center gap-2 mb-4">
                        <MapPin className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Device Details & Location</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="brandName">Brand Name *</Label>
                          <Input
                            id="brandName"
                            value={formData.brandName}
                            onChange={(e) => handleInputChange('brandName', e.target.value)}
                            placeholder="e.g., Kent, Aquaguard, Pureit"
                            className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="modelName">Model Name *</Label>
                          <Input
                            id="modelName"
                            value={formData.modelName}
                            onChange={(e) => handleInputChange('modelName', e.target.value)}
                            placeholder="e.g., Grand Plus, Marvel, Max"
                            className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                      required
                    />
                        </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="address">Service Address *</Label>
                        <div className="space-y-2">
                    <div className="relative">
                    <Textarea
                        ref={addressInputRef}
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                        placeholder="Type exact address... (e.g., '123 MG Road, Koramangala, Bangalore 560034')"
                      className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                      required
                      rows={3}
                        onFocus={() => {
                          if (addressSuggestions.length > 0) {
                            setShowSuggestions(true);
                          }
                        }}
                        onBlur={() => {
                          // Delay hiding suggestions to allow clicking on them
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                      />
                      
                      {/* Address Suggestions Dropdown */}
                      {showSuggestions && addressSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {isLoadingPlaces && (
                            <div className="p-3 text-center text-muted-foreground">
                              <div className="flex justify-center space-x-1 mb-2">
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                              </div>
                              Finding locations...
                            </div>
                          )}
                          {addressSuggestions.map((suggestion, index) => (
                            <div
                              key={suggestion.place_id}
                              className="p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer border-b border-border last:border-b-0 text-foreground"
                              onClick={() => handleAddressSelect(suggestion)}
                            >
                              <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="font-medium text-foreground">
                                    {suggestion.structured_formatting?.main_text || suggestion.description}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {suggestion.structured_formatting?.secondary_text || ''}
                                  </div>
                                  {suggestion.types && (
                                    <div className="text-xs text-primary mt-1">
                                      {suggestion.types.includes('street_address') && '🏠 Exact Address'}
                                      {suggestion.types.includes('route') && '🛣️ Street/Road'}
                                      {suggestion.types.includes('establishment') && '🏢 Business/Landmark'}
                                      {suggestion.types.includes('sublocality') && '🏘️ Area/Locality'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={getCurrentLocation}
                            className="w-full"
                          >
                            <MapPin className="w-4 h-4 mr-2" />
                            Use Current Location
                          </Button>
                        </div>
                  </div>
                  
                  <div>
                    <ImageUpload
                      onImagesChange={handleImagesChange}
                      maxImages={5}
                      folder="ro-service-booking"
                      title="Upload Images (Optional)"
                      description="Upload photos of the problem, device model, or any relevant details to help our technician understand your service needs better"
                    />
                      </div>
                    </div>
                  )}

                  {/* Step 4: Schedule */}
                  {currentStep === 4 && (
                    <div className="space-y-6 px-2 md:px-2">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Schedule Service</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                          <Label htmlFor="date">Preferred Date *</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.preferredDate}
                        onChange={(e) => handleInputChange('preferredDate', e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                        required
                      />
                    </div>
                    <div>
                          <Label htmlFor="time">Preferred Time *</Label>
                      <Select onValueChange={(value) => handleInputChange('preferredTime', value)}>
                        <SelectTrigger className="border-2 border-gray-400 dark:border-gray-500 focus:border-primary focus:ring-2 focus:ring-primary p-3">
                          <SelectValue placeholder="Select time slot" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="morning">Morning (9 AM - 12 PM)</SelectItem>
                          <SelectItem value="afternoon">Afternoon (12 PM - 5 PM)</SelectItem>
                          <SelectItem value="evening">Evening (5 PM - 8 PM)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                        <Label htmlFor="message">Additional Details (Optional)</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => handleInputChange('message', e.target.value)}
                      placeholder="Any specific requirements or issues..."
                      rows={3}
                      className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                    />
                  </div>
                    </div>
                  )}

                  {/* Step 5: Confirmation */}
                  {currentStep === 5 && (
                    <div className="space-y-6 px-2 md:px-2">
                      <div className="flex items-center gap-2 mb-4">
                        <Check className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Confirm Your Booking</h3>
                      </div>
                      
                      <div className="bg-muted/30 rounded-lg p-6 space-y-4">
                        <h4 className="font-semibold text-foreground border-b border-border pb-2">Booking Summary</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h5 className="font-medium text-foreground mb-2">Personal Information</h5>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p><span className="font-medium">Name:</span> {formData.name}</p>
                              <p><span className="font-medium">Phone:</span> {formData.phone}</p>
                              <p><span className="font-medium">Email:</span> {formData.email}</p>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-foreground mb-2">Service Details</h5>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p><span className="font-medium">Service Type:</span> {formData.serviceType === 'ro' ? 'RO Water Purifier' : 'Water Softener'}</p>
                              <p><span className="font-medium">Service:</span> {formData.service}</p>
                              <p><span className="font-medium">Brand:</span> {formData.brandName}</p>
                              <p><span className="font-medium">Model:</span> {formData.modelName}</p>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-foreground mb-2">Problem Description</h5>
                            <div className="text-sm text-muted-foreground">
                              <p className="break-words">{formData.problemDescription}</p>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-foreground mb-2">Location</h5>
                            <div className="text-sm text-muted-foreground">
                              <p className="break-words">{formData.address}</p>
                            </div>
                          </div>
                          
                          <div>
                            <h5 className="font-medium text-foreground mb-2">Schedule</h5>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p><span className="font-medium">Date:</span> {formData.preferredDate}</p>
                              <p><span className="font-medium">Time:</span> {formData.preferredTime}</p>
                              {formData.message && (
                                <p><span className="font-medium">Notes:</span> {formData.message}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-primary/10 rounded-lg p-4 mt-4">
                          <h5 className="font-medium text-foreground mb-2">What happens next?</h5>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Our technician will contact you within 30 minutes</li>
                            <li>• We'll confirm your appointment time</li>
                            <li>• You'll receive a confirmation SMS and email</li>
                            <li>• Our expert will arrive at your scheduled time</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrevious}
                      disabled={currentStep === 1}
                      className="flex items-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    
                    {currentStep < 5 ? (
                      <Button
                        type="button"
                        onClick={handleNext}
                        disabled={!isStepValid(currentStep)}
                        className="flex items-center gap-2"
                      >
                        {currentStep === 4 ? 'Review & Confirm' : 'Next'}
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={!isStepValid(currentStep) || isSubmitting}
                        className="flex items-center gap-2 bg-green-600 hover:scale-105 transition-transform duration-300"
                      >
                        {isSubmitting ? (
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          </div>
                        ) : (
                        <Check className="w-4 h-4" />
                        )}
                        {isSubmitting ? 'Creating Booking...' : 'Confirm & Book Service'}
                  </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </div>
    </section>
  );
};

export default BookingSection;