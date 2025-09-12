import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Phone, MessageCircle, MapPin, User, Clock, ChevronLeft, ChevronRight, Check, Settings, Filter, Upload, Camera } from 'lucide-react';

const BookingSection = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceType, setServiceType] = useState('');
  const [formData, setFormData] = useState({
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      alert('Geolocation is not supported by this browser. Please enter your address manually.');
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
        const { latitude, longitude } = position.coords;
        
        // Use a simple reverse geocoding service (you can replace with Google Geocoding API)
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
          .then(response => response.json())
          .then(data => {
            const address = `${data.locality || 'Unknown City'}, ${data.principalSubdivision || 'Unknown State'}, ${data.countryName || 'Unknown Country'}`;
            setFormData(prev => ({ 
              ...prev, 
              address: address
            }));
            
            // Reset button
            if (button) {
              button.disabled = false;
              button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>Use Current Location';
            }
          })
          .catch(() => {
            // Fallback to coordinates if reverse geocoding fails
            setFormData(prev => ({ 
              ...prev, 
              address: `Current Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}` 
            }));
            
            // Reset button
            if (button) {
              button.disabled = false;
              button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>Use Current Location';
            }
          });
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
        
        alert(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Booking submitted:', formData);
    // Handle final submission
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
                      <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-4">
                        <p className="text-sm text-gray-800 dark:text-gray-200">
                          <strong>Note:</strong> We don't ask you to create an account. Email is only for sending confirmation and service updates.
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
                            placeholder="+91-9876543210"
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
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="Enter complete address with landmarks for easy navigation by technician"
                      className="force-visible-border focus:border-primary focus:ring-2 focus:ring-primary p-3 shadow-sm mx-1"
                      required
                      rows={3}
                    />
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
                        <Label>Upload Images (Optional)</Label>
                        <div className="space-y-4 mt-2">
                          {/* Problem Photos Section */}
                          <div className="border-2 border-dashed border-red-200 dark:border-red-800 rounded-lg p-4">
                            <div className="text-center space-y-3">
                              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mx-auto">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">Problem Photos</p>
                                <p className="text-xs text-muted-foreground">Show the issue, damage, or area needing service</p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                                <Button type="button" variant="outline" size="sm" className="flex items-center gap-2">
                                  <Upload className="w-4 h-4" />
                                  Upload Problem Photos
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="flex items-center gap-2">
                                  <Camera className="w-4 h-4" />
                                  Take Problem Photo
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Model Photos Section */}
                          <div className="border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="text-center space-y-3">
                              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">Model Photos</p>
                                <p className="text-xs text-muted-foreground">Show device model, brand label, or serial number</p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                                <Button type="button" variant="outline" size="sm" className="flex items-center gap-2">
                                  <Upload className="w-4 h-4" />
                                  Upload Model Photos
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="flex items-center gap-2">
                                  <Camera className="w-4 h-4" />
                                  Take Model Photo
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
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
                          <SelectItem value="morning">Morning (9AM - 12PM)</SelectItem>
                          <SelectItem value="afternoon">Afternoon (12PM - 5PM)</SelectItem>
                          <SelectItem value="evening">Evening (5PM - 8PM)</SelectItem>
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
                        disabled={!isStepValid(currentStep)}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                        Confirm & Book Service
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