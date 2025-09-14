import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Phone, MessageCircle, MapPin, User, Clock, ChevronLeft, ChevronRight, Check, Settings, Filter, Upload, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, generateJobNumber } from '@/lib/supabase';
import { emailService } from '@/lib/email';
import { BookingFormData } from '@/types';

// Validation schema
const bookingSchema = z.object({
  // Customer Info
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').regex(/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number'),
  alternatePhone: z.string().optional(),
  email: z.string().email('Please enter a valid email address'),
  
  // Address
  address: z.object({
    street: z.string().min(5, 'Please enter a complete address'),
    area: z.string().min(2, 'Please enter area'),
    city: z.string().min(2, 'Please enter city'),
    state: z.string().min(2, 'Please enter state'),
    pincode: z.string().min(6, 'Pincode must be 6 digits').max(6, 'Pincode must be 6 digits').regex(/^\d{6}$/, 'Pincode must contain only numbers'),
    landmark: z.string().optional(),
  }),
  
  // Location
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    formattedAddress: z.string(),
    googlePlaceId: z.string().optional(),
  }),
  
  // Service Details
  serviceType: z.enum(['RO', 'SOFTENER']),
  serviceSubType: z.enum(['Installation', 'Repair', 'Maintenance', 'AMC']),
  brand: z.string().min(1, 'Please enter brand name'),
  model: z.string().min(1, 'Please enter model name'),
  
  // Scheduling
  preferredDate: z.string().min(1, 'Please select a date'),
  preferredTimeSlot: z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
  
  // Additional Info
  description: z.string().min(10, 'Please provide a detailed description'),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  preferredLanguage: z.enum(['ENGLISH', 'HINDI', 'KANNADA', 'TAMIL', 'TELUGU']),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const EnhancedBookingForm = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    trigger,
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      serviceType: 'RO',
      serviceSubType: 'Repair',
      urgency: 'MEDIUM',
      preferredLanguage: 'ENGLISH',
      preferredTimeSlot: 'MORNING',
      location: {
        latitude: 0,
        longitude: 0,
        formattedAddress: '',
      },
    },
  });

  const watchedValues = watch();

  const handleNext = async () => {
    const isValid = await trigger();
    if (isValid && currentStep < 5) {
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
      toast.error('Geolocation is not supported by this browser');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Use reverse geocoding to get address
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await response.json();
          
          const address = `${data.locality || 'Unknown City'}, ${data.principalSubdivision || 'Unknown State'}, ${data.countryName || 'Unknown Country'}`;
          
          setValue('location.latitude', latitude);
          setValue('location.longitude', longitude);
          setValue('location.formattedAddress', address);
          setValue('address.street', data.localityInfo?.administrative?.[0]?.name || '');
          setValue('address.area', data.localityInfo?.administrative?.[1]?.name || '');
          setValue('address.city', data.locality || '');
          setValue('address.state', data.principalSubdivision || '');
          setValue('address.pincode', data.postcode || '');
          
          toast.success('Location detected successfully');
        } catch (error) {
          console.error('Error getting location:', error);
          toast.error('Failed to get location details');
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = 'Unable to get your current location. ';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage += 'Please try again or enter your address manually.';
            break;
        }
        toast.error(errorMessage);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  const onSubmit = async (data: BookingFormValues) => {
    setIsSubmitting(true);
    
    try {
      // Create customer record
      const customerData = {
        fullName: data.fullName,
        phone: data.phone,
        alternatePhone: data.alternatePhone,
        email: data.email,
        address: data.address,
        location: data.location,
        serviceType: data.serviceType,
        brand: data.brand,
        model: data.model,
        status: 'ACTIVE' as const,
        customerSince: new Date().toISOString(),
        preferredTimeSlot: data.preferredTimeSlot,
        preferredLanguage: data.preferredLanguage,
      };

      const { data: customer, error: customerError } = await db.customers.create(customerData);
      
      if (customerError) {
        throw new Error(customerError.message);
      }

      // Create job record
      const jobData = {
        jobNumber: generateJobNumber(data.serviceType),
        customerId: customer.id,
        serviceType: data.serviceType,
        serviceSubType: data.serviceSubType,
        brand: data.brand,
        model: data.model,
        scheduledDate: data.preferredDate,
        scheduledTimeSlot: data.preferredTimeSlot,
        estimatedDuration: 120, // 2 hours default
        serviceAddress: data.address,
        serviceLocation: data.location,
        status: 'PENDING' as const,
        priority: data.urgency,
        description: data.description,
        requirements: [],
        estimatedCost: 0, // Will be updated by admin
        paymentStatus: 'PENDING' as const,
      };

      const { data: job, error: jobError } = await db.jobs.create(jobData);
      
      if (jobError) {
        throw new Error(jobError.message);
      }

      // Send confirmation email
      await sendConfirmationEmail(customer, job);

      setBookingId(job.jobNumber);
      setBookingSuccess(true);
      toast.success('Booking confirmed successfully!');
      
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendConfirmationEmail = async (customer: any, job: any) => {
    try {
      const emailData = {
        customerName: customer.fullName,
        jobNumber: job.jobNumber,
        serviceType: job.serviceType,
        serviceSubType: job.serviceSubType,
        brand: job.brand,
        model: job.model,
        scheduledDate: job.scheduledDate,
        scheduledTimeSlot: job.scheduledTimeSlot,
        serviceAddress: `${job.serviceAddress.street}, ${job.serviceAddress.area}, ${job.serviceAddress.city} - ${job.serviceAddress.pincode}`,
        phone: customer.phone,
        email: customer.email,
      };

      await emailService.sendBookingConfirmation(emailData);
      console.log('Confirmation email sent successfully');
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      // Don't throw error here as booking is already created
    }
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return watchedValues.fullName && watchedValues.phone && watchedValues.email;
      case 2:
        return watchedValues.serviceType && watchedValues.serviceSubType && watchedValues.description;
      case 3:
        return watchedValues.brand && watchedValues.model && watchedValues.address?.street;
      case 4:
        return watchedValues.preferredDate && watchedValues.preferredTimeSlot;
      case 5:
        return true;
      default:
        return false;
    }
  };

  if (bookingSuccess) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4">Booking Confirmed!</h2>
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
            <p>• Confirmation email sent to your registered email</p>
            <p>• SMS notification sent to your phone</p>
            <p>• Our technician will contact you soon</p>
          </div>
          <Button 
            onClick={() => {
              setBookingSuccess(false);
              setCurrentStep(1);
              setBookingId(null);
            }}
            className="mt-6"
          >
            Book Another Service
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Book RO Service
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="min-h-[400px] max-h-[500px] overflow-y-auto">
            
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Basic Information</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      {...register('fullName')}
                      placeholder="Enter your full name"
                      className={errors.fullName ? 'border-red-500' : ''}
                    />
                    {errors.fullName && (
                      <p className="text-sm text-red-500 mt-1">{errors.fullName.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      {...register('phone')}
                      placeholder="+91-9876543210"
                      className={errors.phone ? 'border-red-500' : ''}
                    />
                    {errors.phone && (
                      <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="alternatePhone">Alternate Phone</Label>
                    <Input
                      id="alternatePhone"
                      type="tel"
                      {...register('alternatePhone')}
                      placeholder="+91-9876543210 (Optional)"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      {...register('email')}
                      placeholder="your@email.com"
                      className={errors.email ? 'border-red-500' : ''}
                    />
                    {errors.email && (
                      <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Service Details */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Service Details</h3>
                </div>
                
                <div>
                  <Label>Service Type *</Label>
                  <Select onValueChange={(value) => setValue('serviceType', value as 'RO' | 'SOFTENER')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RO">RO Water Purifier</SelectItem>
                      <SelectItem value="SOFTENER">Water Softener</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.serviceType && (
                    <p className="text-sm text-red-500 mt-1">{errors.serviceType.message}</p>
                  )}
                </div>
                
                <div>
                  <Label>Service Required *</Label>
                  <Select onValueChange={(value) => setValue('serviceSubType', value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Installation">Installation</SelectItem>
                      <SelectItem value="Repair">Repair</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="AMC">Annual Maintenance Contract</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.serviceSubType && (
                    <p className="text-sm text-red-500 mt-1">{errors.serviceSubType.message}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="description">Problem Description *</Label>
                  <Textarea
                    id="description"
                    {...register('description')}
                    placeholder="Describe the issue or service needed..."
                    rows={4}
                    className={errors.description ? 'border-red-500' : ''}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-500 mt-1">{errors.description.message}</p>
                  )}
                </div>
                
                <div>
                  <Label>Urgency Level</Label>
                  <Select onValueChange={(value) => setValue('urgency', value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low - Can wait a few days</SelectItem>
                      <SelectItem value="MEDIUM">Medium - Within 2-3 days</SelectItem>
                      <SelectItem value="HIGH">High - Need service soon</SelectItem>
                      <SelectItem value="URGENT">Urgent - Same day service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 3: Device Details & Location */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Device Details & Location</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brand">Brand Name *</Label>
                    <Input
                      id="brand"
                      {...register('brand')}
                      placeholder="e.g., Kent, Aquaguard, Pureit"
                      className={errors.brand ? 'border-red-500' : ''}
                    />
                    {errors.brand && (
                      <p className="text-sm text-red-500 mt-1">{errors.brand.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="model">Model Name *</Label>
                    <Input
                      id="model"
                      {...register('model')}
                      placeholder="e.g., Grand Plus, Marvel, Max"
                      className={errors.model ? 'border-red-500' : ''}
                    />
                    {errors.model && (
                      <p className="text-sm text-red-500 mt-1">{errors.model.message}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="street">Complete Address *</Label>
                  <Textarea
                    id="street"
                    {...register('address.street')}
                    placeholder="Enter complete address with landmarks..."
                    rows={3}
                    className={errors.address?.street ? 'border-red-500' : ''}
                  />
                  {errors.address?.street && (
                    <p className="text-sm text-red-500 mt-1">{errors.address.street.message}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="area">Area *</Label>
                    <Input
                      id="area"
                      {...register('address.area')}
                      placeholder="Area/Locality"
                      className={errors.address?.area ? 'border-red-500' : ''}
                    />
                    {errors.address?.area && (
                      <p className="text-sm text-red-500 mt-1">{errors.address.area.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      {...register('address.city')}
                      placeholder="City"
                      className={errors.address?.city ? 'border-red-500' : ''}
                    />
                    {errors.address?.city && (
                      <p className="text-sm text-red-500 mt-1">{errors.address.city.message}</p>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      {...register('address.state')}
                      placeholder="State"
                      className={errors.address?.state ? 'border-red-500' : ''}
                    />
                    {errors.address?.state && (
                      <p className="text-sm text-red-500 mt-1">{errors.address.state.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="pincode">Pincode *</Label>
                    <Input
                      id="pincode"
                      {...register('address.pincode')}
                      placeholder="560001"
                      maxLength={6}
                      className={errors.address?.pincode ? 'border-red-500' : ''}
                    />
                    {errors.address?.pincode && (
                      <p className="text-sm text-red-500 mt-1">{errors.address.pincode.message}</p>
                    )}
                  </div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={getCurrentLocation}
                  disabled={locationLoading}
                  className="w-full"
                >
                  {locationLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4 mr-2" />
                  )}
                  {locationLoading ? 'Getting Location...' : 'Use Current Location'}
                </Button>
              </div>
            )}

            {/* Step 4: Schedule */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Schedule Service</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="preferredDate">Preferred Date *</Label>
                    <Input
                      id="preferredDate"
                      type="date"
                      {...register('preferredDate')}
                      min={new Date().toISOString().split('T')[0]}
                      className={errors.preferredDate ? 'border-red-500' : ''}
                    />
                    {errors.preferredDate && (
                      <p className="text-sm text-red-500 mt-1">{errors.preferredDate.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Preferred Time Slot *</Label>
                    <Select onValueChange={(value) => setValue('preferredTimeSlot', value as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select time slot" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MORNING">Morning (9AM - 12PM)</SelectItem>
                        <SelectItem value="AFTERNOON">Afternoon (12PM - 5PM)</SelectItem>
                        <SelectItem value="EVENING">Evening (5PM - 8PM)</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.preferredTimeSlot && (
                      <p className="text-sm text-red-500 mt-1">{errors.preferredTimeSlot.message}</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label>Preferred Language</Label>
                  <Select onValueChange={(value) => setValue('preferredLanguage', value as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENGLISH">English</SelectItem>
                      <SelectItem value="HINDI">Hindi</SelectItem>
                      <SelectItem value="KANNADA">Kannada</SelectItem>
                      <SelectItem value="TAMIL">Tamil</SelectItem>
                      <SelectItem value="TELUGU">Telugu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 5: Confirmation */}
            {currentStep === 5 && (
              <div className="space-y-6">
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
                        <p><span className="font-medium">Name:</span> {watchedValues.fullName}</p>
                        <p><span className="font-medium">Phone:</span> {watchedValues.phone}</p>
                        <p><span className="font-medium">Email:</span> {watchedValues.email}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium text-foreground mb-2">Service Details</h5>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p><span className="font-medium">Service Type:</span> {watchedValues.serviceType}</p>
                        <p><span className="font-medium">Service:</span> {watchedValues.serviceSubType}</p>
                        <p><span className="font-medium">Brand:</span> {watchedValues.brand}</p>
                        <p><span className="font-medium">Model:</span> {watchedValues.model}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium text-foreground mb-2">Schedule</h5>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p><span className="font-medium">Date:</span> {watchedValues.preferredDate}</p>
                        <p><span className="font-medium">Time:</span> {watchedValues.preferredTimeSlot}</p>
                        <p><span className="font-medium">Language:</span> {watchedValues.preferredLanguage}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="font-medium text-foreground mb-2">Location</h5>
                      <div className="text-sm text-muted-foreground">
                        <p className="break-words">{watchedValues.address?.street}</p>
                        <p>{watchedValues.address?.area}, {watchedValues.address?.city}</p>
                        <p>{watchedValues.address?.state} - {watchedValues.address?.pincode}</p>
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
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
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
  );
};

export default EnhancedBookingForm;
