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
import { Calendar, Phone, MessageCircle, MapPin, User, Clock, ChevronLeft, ChevronRight, Check, Settings, Filter, Upload, Camera, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { db, generateJobNumber } from '@/lib/supabase';
import { emailService } from '@/lib/email';
import { BookingFormData } from '@/types';
import AltchaWidget from '@/components/AltchaWidget';

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
    googleLocation: z.string().optional(),
  }),
  
  // Service Details
  serviceType: z.enum(['RO', 'SOFTENER']),
  serviceSubType: z.enum(['Installation', 'Un-Installation', 'Repair', 'Maintenance', 'Inspection', 'AMC']),
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
  const [showCallOptions, setShowCallOptions] = useState(false);
  const [showSuccessLoader, setShowSuccessLoader] = useState(false);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);

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

  const handleCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
    setShowCallOptions(false);
  };

  const handleWhatsApp = () => {
    window.open('https://wa.me/918884944288', '_blank', 'noopener,noreferrer');
  };

  const handleEmail = () => {
    window.open('mailto:mail@hydrogenro.com', '_self');
  };

  const handleNext = async () => {
    if (currentStep === 5) {
      // Step 5 (Review) - submit the form
      const isValid = await trigger();
      if (isValid) {
        handleSubmit(handleAutoSubmit)();
      }
    } else {
      const isValid = await trigger();
      if (isValid && currentStep < 5) {
        setCurrentStep(currentStep + 1);
      }
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
          setValue('location.googleLocation', `https://www.google.com/maps/place/${latitude},${longitude}`);
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
    // Check if CAPTCHA is verified before proceeding
    if (!isCaptchaVerified) {
      toast.error('Please complete the security check before submitting your booking.');
      return;
    }
    
    await handleAutoSubmit(data);
  };

  const handleAutoSubmit = async (data: BookingFormValues) => {
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
        customer_since: new Date().toISOString(),
        preferred_time_slot: data.preferredTimeSlot,
        preferred_language: data.preferredLanguage,
      };

      const { data: customer, error: customerError } = await db.customers.create(customerData);
      
      if (customerError) {
        throw new Error(customerError.message);
      }

      // Create job record
      const jobData = {
        job_number: generateJobNumber(data.serviceType),
        customer_id: customer.id,
        service_type: data.serviceType,
        service_sub_type: data.serviceSubType,
        brand: data.brand,
        model: data.model,
        scheduled_date: data.preferredDate,
        scheduled_time_slot: data.preferredTimeSlot,
        estimated_duration: 120, // 2 hours default
        service_address: data.address,
        service_location: data.location,
        status: 'PENDING' as const,
        priority: data.urgency,
        description: data.description,
        requirements: [{ lead_source: 'Website' }],
        estimated_cost: 0, // Will be updated by admin
        payment_status: 'PENDING' as const,
      };

      const { data: job, error: jobError } = await db.jobs.create(jobData);
      
      if (jobError) {
        throw new Error(jobError.message);
      }

      // Send confirmation email (non-blocking for faster response)
      sendConfirmationEmail(customer, job).catch(error => {
        console.error('Email sending failed:', error);
      });

      setBookingId(job.jobNumber);
      setShowSuccessLoader(true);
      
      // Show toast notification immediately
      toast.success('Booking confirmed successfully!', {
        description: 'You will receive a confirmation email shortly. Please check your spam folder if you don\'t see it.',
        duration: 6000,
      });
      
      // Show success loader for 2 seconds before showing success page
      setTimeout(() => {
        setShowSuccessLoader(false);
        setBookingSuccess(true);
      }, 2000);
      
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendConfirmationEmail = async (customer: any, job: any) => {
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

    emailService.sendBookingConfirmation(emailData).catch(error => {
      console.error('Failed to send confirmation email:', error);
    });
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
      case 6:
        return isCaptchaVerified;
      default:
        return false;
    }
  };

  // Full screen success loader
  if (showSuccessLoader) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6">
            <div className="flex justify-center space-x-1">
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce"></div>
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mb-3">Booking...</p>
          <p className="text-lg text-muted-foreground mb-4">Processing your request</p>
        </div>
      </div>
    );
  }

  if (bookingSuccess) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-white rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4">Booking Confirmed! 🎉</h2>
          <p className="text-muted-foreground mb-6">
            Your service has been scheduled successfully
          </p>
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <p className="font-semibold text-foreground">Booking ID: {bookingId}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Please keep this ID for your reference
            </p>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground mb-6">
            <div className="text-left">
              <h3 className="font-semibold text-foreground mb-3">What's Next?</h3>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <div>
                    <p className="font-medium text-foreground">Confirmation Email</p>
                    <p className="text-muted-foreground">You'll receive a confirmation email with all the details shortly. Please check your spam folder if you don't see it.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <div>
                    <p className="font-medium text-foreground">Technician Contact</p>
                    <p className="text-muted-foreground">Our technician will contact you before the scheduled service time.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <div>
                    <p className="font-medium text-foreground">Service Day</p>
                    <p className="text-muted-foreground">Our technician will arrive at your location on the scheduled date and time.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Contact Options */}
          <div className="mt-6">
            <h3 className="font-semibold text-foreground mb-4 text-center">Need Help?</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">If you have any questions or need to make changes to your booking, please contact us:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Call Button */}
            <div>
              {!showCallOptions ? (
                <Button 
                  onClick={() => setShowCallOptions(true)}
                  className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button 
                    onClick={() => handleCall('+918884944288')}
                    className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                  >
                    Call: +91-8884944288
                  </Button>
                  <Button 
                    onClick={() => handleCall('+919448944288')}
                    className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                  >
                    Call: +91-9448944288
                  </Button>
                  <Button 
                    onClick={() => setShowCallOptions(false)}
                    variant="outline"
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* WhatsApp Button */}
            <Button 
              onClick={handleWhatsApp}
              className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
              </svg>
              WhatsApp
            </Button>

            {/* Email Button */}
            <Button 
              onClick={handleEmail}
              className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
            >
              <Mail className="w-4 h-4 mr-2" />
              Email
            </Button>
            </div>
            
            {/* Go to Homepage Button */}
            <div className="mt-6">
              <Button 
                onClick={() => window.location.href = '/'}
                variant="outline"
                className="w-full"
              >
                Go to Homepage
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto relative">
      {/* Loading Overlay - Enhanced for Step 5 */}
      {isSubmitting && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="relative">
              <div className="flex justify-center space-x-2 mb-4">
                <div className="w-4 h-4 bg-primary rounded-full animate-bounce"></div>
                <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-4 h-4 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground mb-2">Processing Your Booking...</p>
            <p className="text-sm text-muted-foreground">Please wait while we create your service request</p>
            <div className="mt-4 flex justify-center space-x-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
        </div>
      )}
      
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Book RO Service
        </CardTitle>
        
        {/* Progress Steps */}
        <>
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
              <span>Review</span>
            </div>
          </>
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
                      <SelectItem value="Un-Installation">Un-Installation</SelectItem>
                      <SelectItem value="Repair">Repair</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Inspection">Inspection</SelectItem>
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
                    <div className="flex space-x-1 mr-2">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
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
                        <SelectItem value="MORNING">Morning (9 AM - 12 PM)</SelectItem>
                        <SelectItem value="AFTERNOON">Afternoon (12 PM - 5 PM)</SelectItem>
                        <SelectItem value="EVENING">Evening (5 PM - 8 PM)</SelectItem>
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
                
                {/* Contact Options */}
                <div className="mt-6">
                  <h4 className="font-semibold text-foreground mb-4 text-center">Need Help? Contact Us</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Call Button */}
                    <div>
                      {!showCallOptions ? (
                        <Button 
                          onClick={() => setShowCallOptions(true)}
                          className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                        >
                          <Phone className="w-4 h-4 mr-2" />
                          Call
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <Button 
                            onClick={() => handleCall('+918884944288')}
                            className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                          >
                            Call: +91-8884944288
                          </Button>
                          <Button 
                            onClick={() => handleCall('+919448944288')}
                            className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                          >
                            Call: +91-9448944288
                          </Button>
                          <Button 
                            onClick={() => setShowCallOptions(false)}
                            variant="outline"
                            className="w-full"
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* WhatsApp Button */}
                    <Button 
                      onClick={handleWhatsApp}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                      </svg>
                      WhatsApp
                    </Button>

                    {/* Email Button */}
                    <Button 
                      onClick={handleEmail}
                      className="w-full bg-black dark:bg-white hover:scale-105 transition-transform duration-200 text-white dark:text-black"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden ALTCHA widget - runs verification in background */}
            <div className="hidden">
              <AltchaWidget 
                onVerify={setIsCaptchaVerified}
                autoStart={true}
                hidden={true}
              />
            </div>
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
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting || !isCaptchaVerified}
                  className="flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black hover:scale-105 transition-transform duration-300"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Submit Booking
                    </>
                  )}
                </Button>
              )}
            </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default EnhancedBookingForm;
